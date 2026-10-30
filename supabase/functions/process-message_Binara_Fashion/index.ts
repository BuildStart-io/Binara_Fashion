import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { transcribeAudio } from "./transcribe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: Deno.env.get("DB_SCHEMA") || "Binara_fashion" },
  });

  let triggerSource = "cron";
  let triggerCorrelationId = "";
  try {
    const body = await req.json();
    triggerSource = body?.trigger || "cron";
    triggerCorrelationId = body?.correlationId || "";
  } catch { /* empty body from cron is fine */ }

  console.log(`[process-message] Triggered by: ${triggerSource}${triggerCorrelationId ? ` (corr: ${triggerCorrelationId})` : ""}`);

  // Step 1: Recover stale messages stuck in 'processing' for >2 minutes (crashed workers)
  const { data: staleRecovered } = await supabase
    .from("message_queue")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .select("id");

  if (staleRecovered && staleRecovered.length > 0) {
    console.log(`[process-message] Recovered ${staleRecovered.length} stale messages`);
  }

  // Step 2: Process messages in debounced batches per phone number
  let processedCount = 0;
  const maxIterations = 10; // Safety cap per invocation

  for (let i = 0; i < maxIterations; i++) {
    // Find phone numbers currently processing
    const { data: busyPhones } = await supabase
      .from("message_queue")
      .select("phone_number")
      .eq("status", "processing");

    const busyPhoneNumbers = new Set((busyPhones || []).map((u: any) => u.phone_number));

    // Find next pending message from a non-busy phone number
    const { data: candidates, error: fetchError } = await supabase
      .from("message_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(30);

    if (fetchError) {
      console.error("[process-message] Queue fetch error:", fetchError);
      break;
    }

    if (!candidates || candidates.length === 0) {
      break; // No more work
    }

    const candidate = candidates.find((c: any) => !busyPhoneNumbers.has(c.phone_number));
    if (!candidate) {
      break; // All pending messages belong to currently processing phones
    }

    const targetPhone = candidate.phone_number;

    // Debounce / Inactivity window (3-5 seconds):
    // Wait until at least 3.5 seconds of inactivity has passed since the latest message from this customer
    const { data: latestPending } = await supabase
      .from("message_queue")
      .select("created_at")
      .eq("phone_number", targetPhone)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestPending) {
      const elapsed = Date.now() - new Date(latestPending.created_at).getTime();
      const DEBOUNCE_MS = 3500;
      if (elapsed < DEBOUNCE_MS) {
        const waitMs = Math.max(500, DEBOUNCE_MS - elapsed);
        console.log(`[Debounce] Waiting ${waitMs}ms for ${targetPhone} messages to settle...`);
        await new Promise(r => setTimeout(r, waitMs));

        // Re-check after waiting in case another forwarded message arrived
        const { data: latestAgain } = await supabase
          .from("message_queue")
          .select("created_at")
          .eq("phone_number", targetPhone)
          .in("status", ["pending", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestAgain) {
          const newElapsed = Date.now() - new Date(latestAgain.created_at).getTime();
          if (newElapsed < DEBOUNCE_MS) {
            await new Promise(r => setTimeout(r, Math.max(500, DEBOUNCE_MS - newElapsed)));
          }
        }
      }
    }

    // Fetch ALL pending messages for this customer to aggregate them
    const { data: batchMessages, error: batchError } = await supabase
      .from("message_queue")
      .select("*")
      .eq("phone_number", targetPhone)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true });

    if (batchError || !batchMessages || batchMessages.length === 0) {
      continue;
    }

    const batchIds = batchMessages.map((m: any) => m.id);
    const corrId = batchMessages[0].correlation_id || triggerCorrelationId || batchMessages[0].id.substring(0, 8);
    const timings: Record<string, number> = {};
    const mark = (label: string) => { timings[label] = Date.now(); };

    // Claim the entire batch atomically
    mark("claim_start");
    const { data: claimedBatch, error: claimError } = await supabase
      .from("message_queue")
      .update({
        status: "processing",
        attempts: batchMessages[0].attempts + 1,
        updated_at: new Date().toISOString()
      })
      .in("id", batchIds)
      .in("status", ["pending", "failed"])
      .select();
    mark("claim_end");

    if (claimError || !claimedBatch || claimedBatch.length === 0) {
      console.log(`[${corrId}] Batch for ${targetPhone} already claimed by another worker, skipping`);
      continue;
    }

    try {
      await processBatch(supabase, supabaseUrl, supabaseServiceKey, claimedBatch, corrId, timings, mark);

      // Mark entire batch as done
      mark("done_start");
      await supabase
        .from("message_queue")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in("id", batchIds);
      mark("done_end");

      processedCount += claimedBatch.length;
      console.log(`[${corrId}] ✅ Batch of ${claimedBatch.length} messages processed for ${targetPhone}`);
    } catch (error: any) {
      const newStatus = batchMessages[0].attempts + 1 >= batchMessages[0].max_attempts ? "dead" : "failed";
      console.error(`[${corrId}] ❌ Batch processing failed for ${targetPhone} (attempt ${batchMessages[0].attempts + 1}/${batchMessages[0].max_attempts} → ${newStatus}):`, error.message);
      await supabase
        .from("message_queue")
        .update({
          status: newStatus,
          error_message: error.message || String(error),
          updated_at: new Date().toISOString(),
        })
        .in("id", batchIds);
    }
  }

  console.log(`[process-message] Done. Processed ${processedCount} messages.`);

  return new Response(JSON.stringify({ processed: processedCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function isLikelyBankSlip(
  supabase: any,
  userId: string,
  phoneNumber: string,
  conversationHistory: any[]
): Promise<boolean> {
  try {
    const rawDigits = phoneNumber.replace(/\D/g, "");
    const localPhone = rawDigits.startsWith("94") && rawDigits.length === 11
      ? "0" + rawDigits.slice(2)
      : rawDigits;
    const intlPhone = localPhone.startsWith("0") && localPhone.length === 10
      ? "94" + localPhone.slice(1)
      : rawDigits;

    // 1. Check if customer has a recent order within 48 hours
    const { data: recentOrder } = await supabase
      .from("orders")
      .select("status, payment_method, created_at")
      .eq("user_id", userId)
      .or(`whatsapp_phone.eq.${phoneNumber},customer_phone.eq.${phoneNumber},customer_phone.eq.${localPhone},customer_phone.eq.${intlPhone}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentOrder) {
      const orderAgeHours = (Date.now() - new Date(recentOrder.created_at).getTime()) / (1000 * 60 * 60);
      const isPendingStatus = ["pending", "waiting_for_slip_verification", "pending_verification"].includes(recentOrder.status);
      const isBankPayment = recentOrder.payment_method === "bank_transfer" || recentOrder.payment_method === "yet to decide";
      if (orderAgeHours < 48 && (isPendingStatus || isBankPayment)) {
        return true;
      }
    }

    // 2. Check conversation history (last 10 messages) for bank transfer keywords
    const recentMsgs = (conversationHistory || [])
      .slice(-10)
      .map((m: any) => String(m.message || "").toLowerCase())
      .join(" ");

    const bankSlipKeywords = [
      "commercial bank", "8001234567", "bank transfer", "slip", "receipt", "deposit",
      "account", "බැංකු", "තැන්පතු", "ස්ලිප්", "ට්‍රාන්ස්ෆර්", "සල්ලි දැම්මා", "ගෙව්වා", "ඇකවුන්ට්"
    ];

    if (bankSlipKeywords.some(kw => recentMsgs.includes(kw))) {
      return true;
    }
  } catch (err) {
    console.warn("isLikelyBankSlip check error:", err);
  }
  return false;
}

async function processBatch(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  batch: any[],
  corrId: string,
  timings: Record<string, number>,
  mark: (label: string) => void
) {
  const firstMsg = batch[0];
  const userId = firstMsg.user_id;
  const phoneNumber = firstMsg.phone_number;
  const senderName = firstMsg.sender_name || "Unknown";
  const sessionApiKey = firstMsg.session_api_key;

  // 1. Store each incoming message in conversations & transcribe voice if any
  mark("store_inbound_start");
  let transcribedVoiceTexts: string[] = [];
  let userTextMessages: string[] = [];
  let imageCount = 0;
  let voiceNoteFailed = false;

  for (const msg of batch) {
    const msgType = msg.message_type;
    const body = msg.raw_payload;
    const mime = String(body?.payload?.media?.mimetype || body?.media?.mimetype || "").toLowerCase();
    const mediaUrl = String(body?.payload?.media?.url || body?.media?.url || "").toLowerCase();
    const isVoice = msgType === "ptt" || msgType === "audio" || mime.startsWith("audio/") || /\.(oga|ogg|mp3|wav|m4a|aac|opus)($|\?)/i.test(mediaUrl);
    const isImage = (msgType === "image" || mime.startsWith("image/")) && !isVoice;
    let text = (msg.message_text || "").trim();

    if (isVoice) {
      console.log(`[${corrId}] Detected voice message in batch, transcribing...`);
      const mediaUrl = body?.payload?.media?.url || body?.media?.url;
      const mediaMime = body?.payload?.media?.mimetype || body?.media?.mimetype || "audio/ogg";
      const transcription = await transcribeAudio(sessionApiKey, msg.wsender_message_id, mediaUrl, mediaMime);

      if (transcription) {
        text = transcription;
        transcribedVoiceTexts.push(transcription);
        await supabase.from("conversations").insert({
          phone_number: phoneNumber,
          message: transcription,
          direction: "inbound",
          message_type: "text",
          metadata: { senderName, event: body?.event, raw: body, correlationId: corrId, is_voice: true },
          user_id: userId,
        });
      } else {
        voiceNoteFailed = true;
        await supabase.from("conversations").insert({
          phone_number: phoneNumber,
          message: "🎤 [Voice Note: Transcribe failed]",
          direction: "inbound",
          message_type: "text",
          metadata: { senderName, event: body?.event, raw: body, correlationId: corrId, is_voice: true },
          user_id: userId,
        });
      }
    } else if (isImage) {
      imageCount++;
      if (text) userTextMessages.push(text);
      await supabase.from("conversations").insert({
        phone_number: phoneNumber,
        message: text ? `📷 [Image: ${text}]` : "📷 [Image]",
        direction: "inbound",
        message_type: "image",
        metadata: { senderName, event: body?.event, raw: body, correlationId: corrId },
        user_id: userId,
      });
    } else {
      if (text) userTextMessages.push(text);
      await supabase.from("conversations").insert({
        phone_number: phoneNumber,
        message: text,
        direction: "inbound",
        message_type: msgType,
        metadata: { senderName, event: body?.event, raw: body, correlationId: corrId },
        user_id: userId,
      });
    }
  }
  mark("store_inbound_end");

  // If voice note failed and no other text or images were provided, send polite apology in Sinhala
  if (voiceNoteFailed && transcribedVoiceTexts.length === 0 && userTextMessages.length === 0 && imageCount === 0) {
    const apologyText = "මට ඔබේ හඬ පණිවිඩය පැහැදිලිව ඇසුණේ නැත. කරුණාකර එය නැවත එවන්න හෝ message එකක් ලෙස ටයිප් කර එවන්න පුළුවන්ද? 😊";
    await supabase.from("conversations").insert({
      phone_number: phoneNumber,
      message: apologyText,
      direction: "outbound",
      message_type: "text",
      user_id: userId,
    });
    await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, apologyText, null, sessionApiKey);
    return;
  }

  // 1b. Contact billing
  const contactCheck = await registerContact(supabase, userId, phoneNumber, corrId);
  if (contactCheck.blocked) {
    console.log(`[${corrId}] New-contact limit reached for user ${userId}, not serving ${phoneNumber}`);
    return;
  }

  // 1c. Qualified lead check
  await maybeNotifyQualifiedLead(
    supabase, supabaseUrl, supabaseServiceKey, userId, phoneNumber, senderName, sessionApiKey, corrId
  );

  // 2. Check if auto-responses are enabled
  mark("settings_start");
  const { data: settingsData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "auto_responses")
    .eq("user_id", userId)
    .single();
  mark("settings_end");

  const autoResponsesEnabled = settingsData?.value?.enabled ?? true;
  if (!autoResponsesEnabled) {
    console.log(`[${corrId}] Auto responses disabled, skipping AI processing`);
    return;
  }

  // 3. Check if chat is taken over
  const { data: takeoverData } = await supabase
    .from("chat_takeovers")
    .select("is_taken_over")
    .eq("user_id", userId)
    .eq("phone_number", phoneNumber)
    .eq("is_taken_over", true)
    .maybeSingle();

  if (takeoverData) {
    console.log(`[${corrId}] Chat with ${phoneNumber} is taken over, skipping AI`);
    return;
  }

  // 4. Fetch conversation history
  mark("history_start");
  const { data: conversationHistory } = await supabase
    .from("conversations")
    .select("message, direction, created_at")
    .eq("phone_number", phoneNumber)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);
  mark("history_end");

  // 5. Construct aggregated prompt for the LLM
  const combinedTexts = [...transcribedVoiceTexts, ...userTextMessages].join("\n").trim();
  let aggregatedMessage = combinedTexts;

  if (imageCount > 0) {
    const isSlip = await isLikelyBankSlip(supabase, userId, phoneNumber, conversationHistory || []);
    if (isSlip) {
      aggregatedMessage = `[System: User uploaded an image. Treat this as a payment slip receipt. Thank them and state staff will call to confirm.]${combinedTexts ? ` Customer message: ${combinedTexts}` : ""}`;
    } else {
      if (combinedTexts) {
        aggregatedMessage = `[System: Customer sent ${imageCount} product photo(s). Customer text: "${combinedTexts}"]`;
      } else {
        aggregatedMessage = `[System: Customer sent ${imageCount} product photo(s). Greet them warmly in Sinhala and ask which shorts package or colors they would like to order.]`;
      }
    }
  }

  if (!aggregatedMessage) {
    aggregatedMessage = "Hello";
  }

  // 6. Check if first message (for welcome message flow)
  const { count: convoCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", phoneNumber)
    .eq("user_id", userId);

  const isFirstMessage = (convoCount || 0) <= batch.length;
  const isNumericSelection = ["1", "2", "1.", "2.", "option 1", "option 2", "එක", "දෙක"].includes(aggregatedMessage.trim().toLowerCase());
  if (isFirstMessage && imageCount === 0 && !isNumericSelection) {
    const sent = await handleWelcomeMessage(
      supabase, supabaseUrl, supabaseServiceKey, userId, phoneNumber, aggregatedMessage, sessionApiKey, corrId, timings, mark
    );
    if (sent) return;
  }

  // 7. Call AI chat with timeout
  mark("ai_start");
  const controller = new AbortController();
  const aiTimeout = setTimeout(() => controller.abort(), 55_000);

  let aiResponse: Response;
  try {
    aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat_Binara_Fashion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: aggregatedMessage,
        phoneNumber,
        senderName,
        conversationHistory: (conversationHistory || []).slice().reverse(),
        userId,
        sessionApiKey,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(aiTimeout);
    mark("ai_end");
    if (err.name === "AbortError") {
      throw new Error("AI call timed out after 55s");
    }
    throw err;
  }
  clearTimeout(aiTimeout);
  mark("ai_end");

  const aiData = await aiResponse.json();

  if (!aiResponse.ok) {
    if ((aiResponse.status === 429 || aiResponse.status === 403) && aiData.response) {
      console.log(`[${corrId}] AI limit/paused (${aiResponse.status}), sending fallback`);
      await supabase.from("conversations").insert({
        phone_number: phoneNumber,
        message: aiData.response,
        direction: "outbound",
        message_type: "text",
        user_id: userId,
      });

      mark("send_start");
      await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, aiData.response, null, sessionApiKey);
      mark("send_end");
      return;
    }

    console.error(`[${corrId}] AI chat error:`, JSON.stringify(aiData));
    throw new Error("AI processing failed");
  }

  const replyMessage = aiData.response;
  const replyImageUrls: string[] = Array.isArray(aiData.imageUrls) ? aiData.imageUrls : (aiData.imageUrl ? [aiData.imageUrl] : []);
  const replyVideoUrl = aiData.videoUrl || null;
  const followupMessage = aiData.followupMessage || null;
  const faqMedia: string[] = Array.isArray(aiData.faqMedia) ? aiData.faqMedia : [];

  console.log(`[${corrId}] AI reply: ${replyMessage?.substring(0, 100)}${replyImageUrls.length > 0 ? ` (with ${replyImageUrls.length} images)` : ""}${replyVideoUrl ? " (with video)" : ""}${followupMessage ? " (with followup)" : ""}`);

  // 8. Store outgoing message
  mark("store_outbound_start");
  await supabase.from("conversations").insert({
    phone_number: phoneNumber,
    message: replyMessage,
    direction: "outbound",
    message_type: replyImageUrls.length > 0 ? "image" : "text",
    metadata: { correlationId: corrId, ...(faqMedia.length > 0 ? { faqMedia } : {}), imageUrls: replyImageUrls },
    user_id: userId,
  });
  mark("store_outbound_end");

  // 9. Send reply via WhatsApp: video first, then images, then FAQ media, then text
  mark("send_start");

  if (replyVideoUrl) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, replyVideoUrl, sessionApiKey);
  }

  for (const url of replyImageUrls) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, url, sessionApiKey);
    if (replyImageUrls.length > 1) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  for (const url of faqMedia) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, url, sessionApiKey);
  }

  await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, replyMessage, null, sessionApiKey);

  if (followupMessage) {
    console.log(`[${corrId}] Sending order follow-up message`);
    await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, followupMessage, null, sessionApiKey);
    await supabase.from("conversations").insert({
      phone_number: phoneNumber,
      message: followupMessage,
      direction: "outbound",
      message_type: "text",
      metadata: { type: "order_followup", correlationId: corrId },
      user_id: userId,
    });
  }

  mark("send_end");
}

async function handleWelcomeMessage(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
  phoneNumber: string,
  messageText: string,
  sessionApiKey: string,
  corrId: string,
  timings: Record<string, number>,
  mark: (label: string) => void
): Promise<boolean> {
  const { data: welcomeSettings } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "welcome_message")
    .eq("user_id", userId)
    .single();

  // Check bypass triggers
  const bypassTriggers: string[] = welcomeSettings?.value?.bypass_triggers || [];
  const msgLower = messageText.toLowerCase().trim();
  const isNumeric = ["1", "2", "1.", "2.", "option 1", "option 2", "එක", "දෙක"].includes(msgLower);
  const shouldBypass = isNumeric || (bypassTriggers.length > 0 && bypassTriggers.some((t: string) => msgLower.includes(t)));

  if (shouldBypass) {
    console.log(`[${corrId}] Bypass trigger matched (numeric or keyword), skipping welcome`);
    return false;
  }

  const welcomeText: string = welcomeSettings?.value?.text || "";
  const welcomeMediaUrls: string[] = welcomeSettings?.value?.media_urls || [];
  const singleMedia = welcomeSettings?.value?.media_url;
  if (singleMedia && !welcomeMediaUrls.includes(singleMedia)) {
    welcomeMediaUrls.unshift(singleMedia);
  }

  const welcomeSequence: Array<{ type: string; url?: string; text?: string }> = welcomeSettings?.value?.welcome_sequence || [];

  mark("send_start");
  let sentTexts: string[] = [];

  if (welcomeSequence.length > 0) {
    for (const seqItem of welcomeSequence) {
      if (seqItem.type === "text") {
        const textToSend = seqItem.text || welcomeText;
        if (textToSend.trim()) {
          console.log(`[${corrId}] Sending welcome text (sequence)`);
          await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, textToSend, null, sessionApiKey);
          sentTexts.push(textToSend.trim());
        }
      } else if (seqItem.type === "media" && seqItem.url) {
        console.log(`[${corrId}] Sending welcome media (sequence): ${seqItem.url.substring(0, 80)}`);
        await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, seqItem.url, sessionApiKey);
      }
    }
  } else {
    if (welcomeText.trim()) {
      await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, welcomeText, null, sessionApiKey);
      sentTexts.push(welcomeText.trim());
    }
    for (const mediaUrl of welcomeMediaUrls) {
      await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, mediaUrl, sessionApiKey);
    }
  }
  mark("send_end");

  if (sentTexts.length > 0) {
    const historyInserts = sentTexts.map(text => ({
      phone_number: phoneNumber,
      message: text,
      direction: "outbound",
      message_type: "text",
      metadata: { type: "welcome_message", correlationId: corrId },
      user_id: userId,
    }));
    await supabase.from("conversations").insert(historyInserts);
    console.log(`[${corrId}] Stored ${sentTexts.length} welcome message(s) in conversation history`);
  }

  console.log(`[${corrId}] Welcome message sent, skipping AI for first message`);
  return true;
}

async function sendWhatsApp(
  supabaseUrl: string,
  supabaseServiceKey: string,
  to: string,
  message: string,
  imageUrl: string | null,
  sessionApiKey: string
) {
  const body: any = { to, message, sessionApiKey };
  if (imageUrl) body.imageUrl = imageUrl;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp_Binara_Fashion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Send WhatsApp error:", errText);
    throw new Error(`Send WhatsApp failed: ${errText.substring(0, 200)}`);
  } else {
    console.log("Reply sent successfully");
  }
}

async function sendWhatsAppMedia(
  supabaseUrl: string,
  supabaseServiceKey: string,
  to: string,
  mediaUrl: string,
  sessionApiKey: string
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp_Binara_Fashion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, mediaUrl, sessionApiKey }),
  });

  if (!res.ok) {
    console.error("Send media error:", await res.text());
  } else {
    console.log("Media sent:", mediaUrl.substring(0, 80));
  }
}

/** Normalize a WhatsApp identifier to a stable contact key (digits only). */
export function normalizeContactKey(raw: string): string {
  return String(raw || "").split("@")[0].replace(/\D/g, "");
}

/** Start of the current billing cycle for a profile. */
export function cycleStart(billingCycleStart: string | null | undefined): string {
  if (!billingCycleStart) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const now = new Date();
  const current = new Date(billingCycleStart);
  while (true) {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    if (next > now) break;
    current.setTime(next.getTime());
  }
  return current.toISOString();
}

/**
 * Registers an inbound contact against the current billing cycle.
 * Returns blocked=true only when this is a NEW contact and the plan's
 * contact allowance is exhausted — already-counted contacts keep being served.
 */
async function registerContact(supabase: any, userId: string, phoneNumber: string, corrId: string) {
  try {
    const key = normalizeContactKey(phoneNumber);
    if (!key) return { blocked: false, isNew: false };

    const { data: profile } = await supabase
      .from("profiles")
      .select("billing_cycle_start, addon_contacts, plan_tier")
      .eq("user_id", userId)
      .single();

    const periodStart = cycleStart(profile?.billing_cycle_start);

    const { data: existing } = await supabase
      .from("contact_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("phone_number", key)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing) return { blocked: false, isNew: false };

    // New contact — enforce the allowance before counting them in.
    const { data: platformLimits } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "plan_limits")
      .single();

    const tier = profile?.plan_tier || "free";
    const tierLimits = platformLimits?.value?.[tier] || {};
    const limit = (tierLimits.contacts_per_month || 50) + (profile?.addon_contacts || 0);

    const { data: used } = await supabase.rpc("get_contact_usage", {
      _user_id: userId,
      _since: periodStart,
    });

    if ((used || 0) >= limit) {
      console.log(`[${corrId}] Contact limit ${used}/${limit} reached for user ${userId}`);
      return { blocked: true, isNew: true };
    }

    await supabase
      .from("contact_usage")
      .insert({ user_id: userId, phone_number: key, period_start: periodStart });

    console.log(`[${corrId}] New contact registered (${(used || 0) + 1}/${limit})`);
    return { blocked: false, isNew: true };
  } catch (e) {
    console.error(`[${corrId}] registerContact failed:`, e);
    return { blocked: false, isNew: false };
  }
}

/**
 * Growth-plan only: when a contact crosses the qualified-lead threshold
 * (6 inbound messages), send a plain (non-AI) WhatsApp alert to the owner
 * number configured in Settings → Chatbot → Order Notifications.
 * Fires exactly once, on the 6th inbound message.
 */
async function maybeNotifyQualifiedLead(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
  phoneNumber: string,
  senderName: string | null,
  sessionApiKey: string | null,
  corrId: string
) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.plan_tier !== "enterprise") return;

    const { count: inboundCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("phone_number", phoneNumber)
      .eq("direction", "inbound");

    if ((inboundCount || 0) !== 6) return; // only the moment they qualify

    const { data: notifSettings } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "order_notifications")
      .eq("user_id", userId)
      .maybeSingle();

    let ownerPhone = notifSettings?.value?.phone ? String(notifSettings.value.phone).replace(/\D/g, "") : null;
    if (!ownerPhone) return;
    if (ownerPhone.startsWith("0") && ownerPhone.length === 10) {
      ownerPhone = "94" + ownerPhone.substring(1);
    } else if (ownerPhone.length === 9) {
      ownerPhone = "94" + ownerPhone;
    }

    const { data: lastMsgs } = await supabase
      .from("conversations")
      .select("message, created_at")
      .eq("user_id", userId)
      .eq("phone_number", phoneNumber)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(3);

    const messages = (lastMsgs || [])
      .slice()
      .reverse()
      .map((m: any) => `• ${String(m.message || "").substring(0, 300)}`)
      .join("\n");

    const displayPhone = String(phoneNumber || "").split("@")[0];
    const message = `🌟 QUALIFIED LEAD\n👤 ${senderName || "Unknown"}\n📱 ${displayPhone}\n\n🗨️ Last 3 messages:\n${messages}`;

    let sendApiKey = sessionApiKey || null;
    if (!sendApiKey) {
      const { data: sessionData } = await supabase
        .from("user_wsender_sessions")
        .select("session_api_key")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sendApiKey = sessionData?.session_api_key || null;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp_Binara_Fashion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: ownerPhone, message, sessionApiKey: sendApiKey }),
    });
    if (!res.ok) {
      console.error(`[${corrId}] Lead notification failed:`, (await res.text()).substring(0, 200));
    } else {
      console.log(`[${corrId}] Qualified lead notification sent to ${ownerPhone}`);
    }
  } catch (e) {
    console.error(`[${corrId}] maybeNotifyQualifiedLead failed:`, (e as Error).message);
  }
}

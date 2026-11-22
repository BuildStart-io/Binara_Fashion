import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ConversationMessage {
  message: string;
  direction: string;
  created_at: string;
  message_type?: string;
  metadata?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const delegatesAi = !!(Deno.env.get("AI_GENERATE_URL") && Deno.env.get("BOT_API_KEY"));
    if (!lovableApiKey && !delegatesAi) {
      throw new Error("Neither LOVABLE_API_KEY nor AI_GENERATE_URL/BOT_API_KEY configured");
    }


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: Deno.env.get("DB_SCHEMA") || "Binara_fashion" },
    });

    const { message, phoneNumber, conversationHistory, userId, sessionApiKey, senderName } = await req.json();

    console.log(`Processing AI chat for ${phoneNumber} (user: ${userId}): ${message}`);

    // Fetch products, FAQs, settings, profile, and platform limits
    const [productsRes, faqsRes, settingsRes, profileRes, platformLimitsRes] = await Promise.all([
      supabase.from("products").select("*").eq("is_active", true).eq("user_id", userId),
      supabase.from("faqs").select("*, products(name)").eq("is_active", true).eq("user_id", userId),
      supabase.from("settings").select("key, value").eq("user_id", userId),
      supabase.from("profiles").select("plan_tier, billing_cycle_start, is_paused, addon_contacts, addon_orders").eq("user_id", userId).single(),
      supabase.from("platform_settings").select("value").eq("key", "plan_limits").single(),
    ]);

    // Check if account is paused
    if (profileRes.data?.is_paused) {
      console.log(`Account paused for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "Account paused", response: "Sorry, this business account is currently paused. Please try again later." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planTier = profileRes.data?.plan_tier || "free";
    const allLimits = platformLimitsRes.data?.value || {};
    const tierLimits = allLimits[planTier] || {};
    const contactLimit = (tierLimits.contacts_per_month || 50) + (profileRes.data?.addon_contacts || 0);

    // Use billing cycle start for monthly count
    const billingStart = profileRes.data?.billing_cycle_start;
    let monthStart: string;
    if (billingStart) {
      const start = new Date(billingStart);
      const now = new Date();
      const current = new Date(start);
      while (true) {
        const next = new Date(current);
        next.setMonth(next.getMonth() + 1);
        if (next > now) break;
        current.setMonth(current.getMonth() + 1);
      }
      monthStart = current.toISOString();
    } else {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      monthStart = d.toISOString();
    }
    // Contact-based billing: only NEW contacts are blocked once the allowance is used up.
    const contactKey = String(phoneNumber || "").split("@")[0].replace(/\D/g, "");
    const { data: alreadyCounted } = await supabase
      .from("contact_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("phone_number", contactKey)
      .gte("created_at", monthStart)
      .maybeSingle();

    const { data: contactsUsed } = await supabase.rpc("get_contact_usage", {
      _user_id: userId,
      _since: monthStart,
    });

    // Also check orders limit
    const ordersLimit = (tierLimits.max_orders_per_month || 50) + (profileRes.data?.addon_orders || 0);
    const { count: ordersCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart);

    if (!alreadyCounted && (contactsUsed || 0) >= contactLimit) {
      console.log(`Contact limit reached for user ${userId}: ${contactsUsed}/${contactLimit}`);
      return new Response(
        JSON.stringify({ error: "Monthly contact limit reached. Please upgrade your plan.", response: "Sorry, the monthly contact limit has been reached. Please contact the business owner." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const ordersLimitReached = (ordersCount || 0) >= ordersLimit;

    const products = productsRes.data || [];
    const faqs = faqsRes.data || [];
    const settings = settingsRes.data || [];

    const welcomeMessage = settings.find(s => s.key === "welcome_message")?.value?.text || "Welcome! How can I help you?";
    const paymentInfo = settings.find(s => s.key === "payment_info")?.value || {};
    const deliverySettings = settings.find(s => s.key === "delivery_settings")?.value || {};
    const freeDeliveryThreshold = deliverySettings.free_delivery_threshold || 0;
    const freeDeliveryItemThreshold = deliverySettings.free_delivery_item_threshold ?? 5;
    const standardDeliveryFee = deliverySettings.delivery_fee ?? 450;
    const deliveryPolicyDesc = deliverySettings.description || "අයිතම 5ක් හෝ ඊට වැඩි නම් නොමිලේ (Free Delivery 🚚). 5ට අඩු නම් Delivery ගාස්තුව රු. 450යි.";
    const staffNumberSetting = settings.find(s => s.key === "staff_number" || s.key === "staff_contact")?.value;
    const staffPhoneNumber = staffNumberSetting?.phone ? String(staffNumberSetting.phone).trim() : null;

    // Index products by ID and lowercase name for fast resolution
    const productById = new Map<string, any>();
    const productByName = new Map<string, any>();
    for (const p of products) {
      if (p.id) productById.set(p.id, p);
      if (p.name) productByName.set(p.name.toLowerCase(), p);
    }

    const productCatalog = products.map(p => {
      let line = `- [ID: ${p.id}] ${p.name}: Base price LKR ${p.price} (${p.product_type})`;
      if (p.product_type === "physical") {
        if (typeof p.delivery_price === "number") {
          line += ` | Delivery fee: LKR ${p.delivery_price}`;
        }
        if (typeof p.free_delivery_items === "number") {
          line += ` | Free Delivery: ${p.free_delivery_items === 0 ? "Always Free Delivery (0 items)" : `Orders of ${p.free_delivery_items}+ items`}`;
        }
      }
      if (p.description) line += ` | Description & Delivery Rules: ${p.description}`;
      if (p.video_url) {
        line += ` | Video: ${p.video_url}`;
      }
      if (p.variations && Array.isArray(p.variations) && p.variations.length > 0) {
        const varLines = p.variations.map((v: any) => {
          const opts = v.options?.map((o: any) => {
            if (typeof o !== "object") return o;
            let optStr = `${o.label}: LKR ${o.price}`;
            if (o.subVariants && Array.isArray(o.subVariants) && o.subVariants.length > 0) {
              const subLines = o.subVariants.map((sv: any) => {
                const reqTag = sv.required ? " (REQUIRED)" : " (optional)";
                const subOpts = sv.options?.map((so: any) =>
                  typeof so === "object" ? `${so.label}: +LKR ${so.price}` : so
                ).join(", ");
                return `[${sv.name}${reqTag}: ${subOpts}]`;
              }).join(" ");
              optStr += ` ${subLines}`;
            }
            return optStr;
          }).join(", ");
          return `${v.name}: ${opts}`;
        }).join("; ");
        line += ` | Variations: ${varLines}`;
      }
      return line;
    }).join("\n");

    // Build FAQ context with IDs so AI can report which ones it used
    const faqContext = faqs.map(f =>
      `[FAQ_ID:${f.id}] Q: ${f.question}\nA: ${f.answer}${f.products?.name ? ` (Related to: ${f.products.name})` : ""}`
    ).join("\n\n");

    // Get list of tracked FAQ IDs
    const trackedFaqIds = faqs.filter(f => f.is_tracked).map(f => f.id);

    const conversationContext = (Array.isArray(conversationHistory) ? conversationHistory : [])
      .map(msg => {
        const hasImages = msg.message_type === "image" || (msg.metadata?.imageUrls && Array.isArray(msg.metadata.imageUrls) && msg.metadata.imageUrls.length > 0);
        const imgTag = hasImages ? " 📷 [Product Photos Sent]" : "";
        return `${msg.direction === "inbound" ? "Customer" : "Assistant"}: ${msg.message}${imgTag}`;
      })
      .join("\n");

    const systemPrompt = `You are a WhatsApp chatbot assistant for a business.
Core tasks: 1. Answer product inquiries & FAQs 2. Take orders 3. Provide payment info.

LANGUAGE RULE:
- Always communicate ONLY in Sinhala (සිංහල). Even if the customer writes in English or Singlish, understand their request completely, but ALWAYS reply in polite Sinhala. Never switch to English.

MESSAGE FORMATTING:
- KEEP IT SHORT: For general replies, aim for 2-4 lines max. Plain text only (NO markdown asterisks *bold* or _italic_).
- EXCEPTION FOR ORDER SUMMARIES & LISTS: When presenting the full order summary (Step 6) or product lists, format them cleanly using emoji bullet points and sections (📦 භාණ්ඩ, 💰 එකතුව, 🚚 Delivery, 📍 ලිපිනය) with all necessary details, without restricting to 4 lines.

ORDERING STEPS:
* Step 1 (Welcome): Warmly greet in Sinhala and introduce available products or directly answer specific customer questions.
* Step 2 (Product & Cart Selection):
  - ALWAYS ACCEPT ANY QUANTITY: Customers can order single items (1 item), custom quantities (2, 3, 7 items), or full packages.
  - NEVER reject single items and NEVER tell the customer that items are only sold as packages.
  - Calculate custom unit price = (Package price ÷ Pack count). E.g. 1 Popcorn 16" short = 2600 ÷ 5 = LKR 520; 3 Popcorn 18" shorts = (2600 ÷ 4) × 3 = LKR 1950.
  - Multi-Product Cart: If the customer adds another product from the catalog, keep all selected items in the order.
* Step 3 (Size & Color): Collect size or waist measurement (if Free Size, treat as Free Size). Ask for preferred color numbers from photos already shown. Total quantity across colors must match the item count.
* Step 4 (Pricing & Delivery): Apply the STORE DELIVERY POLICY below.
* Step 5 (Customer Details): Collect customer name, complete delivery address, city, and contact number.
* Step 6 (Order Summary - DO NOT EMIT <ORDER_JSON> HERE):
  - Send complete summary in Sinhala (📦 භාණ්ඩ, ප්‍රමාණය, Size, පාට, Subtotal, Delivery ගාස්තුව, මුළු එකතුව, Payment Method, නම, ලිපිනය, දුරකථන අංකය).
  - Ask the customer to review the summary and confirm if all details are correct.
  - STRICT PACING: You MUST NOT append <ORDER_JSON> in Step 6! Step 6 is only for review.
* Step 7 (Order Confirmation - EMIT <ORDER_JSON> ONLY HERE):
  - When the customer explicitly confirms the order summary, send a warm thank you in Sinhala and append <ORDER_JSON> at the very END.
  - In <ORDER_JSON>, include each distinct product in the "order_items" array, and record colors in "selected_colors" per item and in root "colors".

STORE DELIVERY POLICY:
* Policy: ${deliveryPolicyDesc}
* RULE 1 - ALWAYS FREE DELIVERY (LKR 0 / නොමිලේ):
  - ANY standard catalog package deal (e.g. 2-pack, 3-pack, 4-pack, 5-pack, 10-pack) ALWAYS receives 100% FREE DELIVERY, even if the pack has fewer than 5 items!
  - Any custom quantity order where total quantity is ${freeDeliveryItemThreshold} or more items (>= ${freeDeliveryItemThreshold})${freeDeliveryThreshold > 0 ? `,\n  - Any order with subtotal >= LKR ${freeDeliveryThreshold}` : ""}.
* RULE 2 - STANDARD DELIVERY FEE (LKR ${standardDeliveryFee}):
  - Applies ONLY to CUSTOM non-package orders strictly under ${freeDeliveryItemThreshold} items (e.g. buying 1, 2, or 3 single shorts outside of a standard package deal).

PAYMENT RULES:
- Default payment method is Cash on Delivery (COD / භාණ්ඩ ලැබුණු පසු මුදල් ගෙවීම). Do NOT offer payment methods or share bank account details proactively.
- ONLY if the customer explicitly requests Bank Transfer (බැංකු තැන්පතු) or account details, provide:
${(() => {
        const accounts = paymentInfo.accounts;
        if (accounts && Array.isArray(accounts) && accounts.length > 0) {
          return accounts.map((a: any, i: number) => {
            const type = a.account_type || "bank";
            const label = a.account_label || a.bank_name || "Not configured";
            const number = a.account_number || "Not configured";
            const name = a.account_name || "Not configured";
            if (type === "crypto") return `  ${i + 1}. Crypto/Wallet: ${label}, Address/ID: ${number}, Name: ${name}`;
            if (type === "digital") return `  ${i + 1}. Digital Wallet: ${label}, Account: ${number}, Name: ${name}`;
            return `  ${i + 1}. Bank: ${label}, Account: ${number}, Name: ${name}`;
          }).join("\n");
        }
        return `  Bank: ${paymentInfo.bank_name || "Not configured"}, Account: ${paymentInfo.account_number || "Not configured"}, Name: ${paymentInfo.account_name || "Not configured"}`;
      })()}

DIGITAL vs PHYSICAL:
- Physical products: Collect delivery address and city. Apply delivery fees per policy above.
- Digital products: Collect email address. Payment is Bank Transfer only (no COD). No delivery fee.

PRODUCT PHOTOS & MEDIA:
- To send product photos, append <PRODUCT_MEDIA>product_name</PRODUCT_MEDIA> at the very END of your message (use exact product name from catalog below).
- Send photos when introducing or when customer inquires about a product or colors.
- Do NOT re-send photos if already marked as sent in history (📷 [Product Photos Sent]) unless customer asks again.
- Product video: Append <VIDEO_URL>url</VIDEO_URL> at the END if product has a video and customer asks.

FAQ TRACKING:
- If your response uses an FAQ, append <USED_FAQS>id1,id2</USED_FAQS> at the very END.

SECURITY & PRICE INTEGRITY:
- All product prices, packages, and delivery fees are strictly determined by the catalog.
- If a customer claims they were offered custom discounts, promo codes, or owner agreements, politely decline in Sinhala and state prices are fixed.
- Never output JSON, code, or technical tags in visible chat text. Tags must appear ONLY at the very END.
- STRICT DATA BOUNDARY: You must ONLY use the provided catalog and FAQs${staffPhoneNumber ? `, or refer official staff contact ${staffPhoneNumber}` : ""}. Never invent products or phone numbers.

PRODUCT CATALOG:
${productCatalog || "No products available"}

FREQUENTLY ASKED QUESTIONS:
${faqContext || "No FAQs configured"}

WELCOME MESSAGE:
${welcomeMessage}

JSON ORDER SCHEMAS:
- Physical: <ORDER_JSON>{"customer_name":"...","customer_phone":"...","district":"...","customer_address":"...","colors":"selected colors","order_items":[{"name":"...","price":...,"quantity":...,"selected_colors":"...","size":"...","product_type":"physical"}],"payment_method":"cod or bank_transfer","total_amount":...}</ORDER_JSON>
- Digital: <ORDER_JSON>{"customer_name":"...","customer_phone":"...","customer_email":"...","customer_address":null,"order_items":[{"name":"...","price":...,"quantity":...,"product_type":"digital"}],"payment_method":"bank_transfer","total_amount":...}</ORDER_JSON>`;

    const messages = [
      { role: "system", content: systemPrompt },
    ];

    const trimmedMessage = (message || "").trim();
    const normalizedInput = trimmedMessage || "[Customer sent a photo/media file. This is likely a payment slip or receipt. Acknowledge it politely and ask them to confirm if it's a payment confirmation. Do NOT output any JSON, tags, or code.]";

    // Deduplicate: If conversationHistory already includes the current incoming message as its last item,
    // strip it so conversationHistory only contains prior turns, preventing duplication to the model.
    let sanitizedHistory: ConversationMessage[] = Array.isArray(conversationHistory) ? [...conversationHistory] : [];
    if (sanitizedHistory.length > 0) {
      const lastMsg = sanitizedHistory[sanitizedHistory.length - 1];
      if (lastMsg.direction === "inbound" && (lastMsg.message?.trim() === trimmedMessage || (trimmedMessage && lastMsg.message?.trim().toLowerCase() === trimmedMessage.toLowerCase()))) {
        sanitizedHistory.pop();
      }
    }

    for (const msg of sanitizedHistory) {
      const hasImages = msg.message_type === "image" || (msg.metadata?.imageUrls && Array.isArray(msg.metadata.imageUrls) && msg.metadata.imageUrls.length > 0);
      const content = (msg.direction === "outbound" && hasImages)
        ? `${msg.message}\n📷 [Product Photos Sent]`
        : msg.message;
      messages.push({
        role: msg.direction === "inbound" ? "user" : "assistant",
        content,
      });
    }

    messages.push({ role: "user", content: normalizedInput });

    // ------------------------------------------------------------------
    // AI call.
    // If AI_GENERATE_URL + BOT_API_KEY are set (self-hosted deployment), the
    // model call is delegated to the Lovable-hosted `ai-generate` transport.
    // Otherwise we talk to the Lovable AI Gateway directly (Lovable-hosted).
    // Prompt, model and max_tokens are identical on both paths, so response
    // quality is unchanged.
    // ------------------------------------------------------------------
    const aiGenerateUrl = Deno.env.get("AI_GENERATE_URL");
    const botApiKey = Deno.env.get("BOT_API_KEY");
    const MODEL = "google/gemini-2.5-flash-lite";
    const MAX_TOKENS = 1700;

    let aiResponse: Response;
    if (aiGenerateUrl && botApiKey) {
      aiResponse = await fetch(aiGenerateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-key": botApiKey },
        body: JSON.stringify({
          messages,
          model: MODEL,
          maxTokens: MAX_TOKENS,
        }),
      });
    } else {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS }),
      });
    }

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    // `ai-generate` returns { text }, the raw gateway returns OpenAI-style choices.
    const responseText =
      aiData.text ||
      aiData.choices?.[0]?.message?.content ||
      "I'm sorry, I couldn't process your request. Please try again.";


    console.log(`AI Response: ${responseText.substring(0, 100)}...`);

    // Extract used FAQ IDs and log tracked ones
    const usedFaqsMatch = responseText.match(/<USED_FAQS>([\s\S]*?)<\/USED_FAQS>/);
    const usedFaqIds: string[] = usedFaqsMatch
      ? usedFaqsMatch[1].split(",").map((id: string) => id.trim()).filter(Boolean)
      : [];
    if (usedFaqsMatch && trackedFaqIds.length > 0) {
      const usedIds = usedFaqIds;
      const trackedUsedIds = usedIds.filter((id: string) => trackedFaqIds.includes(id));

      if (trackedUsedIds.length > 0) {
        console.log(`Tracked FAQs used: ${trackedUsedIds.join(", ")} for phone ${phoneNumber}`);
        const usageLogs = trackedUsedIds.map((faqId: string) => ({
          faq_id: faqId,
          user_id: userId,
          phone_number: phoneNumber,
          sender_name: senderName || "Unknown",
        }));
        const { error: logError } = await supabase.from("faq_usage_logs").insert(usageLogs);
        if (logError) {
          console.error("Error logging FAQ usage:", logError);
        }
      }
    }

    // Check if the AI response contains order JSON
    let orderCreated = false;
    let hallucinatedOrderDetected = false;
    const customerInboundText = [
      ...((conversationHistory as ConversationMessage[]) || [])
        .filter((m) => m.direction === "inbound")
        .map((m) => m.message || ""),
      trimmedMessage,
    ].join(" ").toLowerCase();

    const orderJsonMatches = [...responseText.matchAll(/<ORDER_JSON>([\s\S]*?)<\/ORDER_JSON>/g)];
    for (const orderJsonMatch of orderJsonMatches) {
      if (ordersLimitReached) {
        console.log(`Orders limit reached for user ${userId}: ${ordersCount}/${ordersLimit}`);
      } else {
        // Guard against premature order creation during Order Summary review step (Step 6)
        const isAwaitingVerification = /(?:මේ විස්තර හරිද|වෙනස් කරන්න ඕන|හරිද කියලා බලන්න|විස්තර බලලා|check if these details are correct|please confirm)/i.test(responseText);
        const isExplicitConfirmation = /(?:හරි|confirm|ඔව්|yes|ok|okay|හරියි|right|correct|sure|done|දාන්න|ඇණවුම දාන්න|orders?)/i.test(trimmedMessage);
        if (isAwaitingVerification && !isExplicitConfirmation) {
          console.log(`[PACING] Order summary review step detected for ${phoneNumber}. Waiting for customer confirmation before saving.`);
          continue;
        }

        try {
          const orderData = JSON.parse(orderJsonMatch[1]);
          console.log("Saving order to database:", JSON.stringify(orderData));

          const rawPm = String(orderData.payment_method || "").toLowerCase().trim();
          const cleanPaymentMethod = (rawPm.includes("bank") || rawPm.includes("transfer")) ? "bank_transfer" : "cod";
          const cleanTotal = Number(orderData.total_amount ?? orderData.total ?? orderData.subtotal ?? 0);
          const cleanAddress = orderData.customer_address || orderData.address || null;
          const cleanPhone = orderData.customer_phone || orderData.phone || phoneNumber;
          let cleanItems = orderData.order_items;

          // Extract color details from JSON or fallback to conversational context
          let rootColor = orderData.selected_colors || orderData.colors || orderData.color || orderData.colour || null;
          if (!rootColor) {
            // Fallback extraction from response text or customer inbound text
            const colorMatch = (responseText + " " + customerInboundText).match(/(?:පාට(?:\s*අංක)?|colours?|colors?)\s*(?:[:\-–]|යන)?\s*([0-9\s, සහand&]+)/i);
            if (colorMatch && colorMatch[1] && colorMatch[1].trim().length > 0) {
              rootColor = colorMatch[1].trim();
            }
          }
          const rootSize = orderData.size || null;

          if (!cleanItems || !Array.isArray(cleanItems) || cleanItems.length === 0) {
            if (orderData.product) {
              cleanItems = [{
                name: orderData.product,
                price: Number(orderData.subtotal ?? cleanTotal),
                quantity: Number(orderData.quantity || 1),
                selected_colors: rootColor,
                size: rootSize,
                variations: {
                  ...(rootColor ? { Color: rootColor } : {}),
                  ...(rootSize ? { Size: rootSize } : {}),
                },
                product_type: "physical"
              }];
            } else {
              cleanItems = [];
            }
          } else {
            cleanItems = cleanItems.map((item: any) => {
              const itemColor = item.selected_colors || item.colors || item.color || item.colour || rootColor || null;
              const itemSize = item.size || rootSize || null;
              const existingVariations = (typeof item.variations === "object" && item.variations !== null) ? item.variations : {};
              return {
                ...item,
                selected_colors: itemColor,
                size: itemSize,
                variations: {
                  ...existingVariations,
                  ...(itemColor && !existingVariations.Color && !existingVariations.color ? { Color: itemColor } : {}),
                  ...(itemSize && !existingVariations.Size && !existingVariations.size ? { Size: itemSize } : {}),
                }
              };
            });
          }

          // Guard against hallucinated orders: address must be present and grounded in chat history for physical products
          const hasPhysicalItems = cleanItems.some((it: any) => (it.product_type || "physical") === "physical") || cleanItems.length === 0;
          if (hasPhysicalItems) {
            let isAddressGrounded = false;
            if (cleanAddress && typeof cleanAddress === "string" && cleanAddress.trim().length >= 4) {
              const normAddress = cleanAddress.toLowerCase().trim();
              if (customerInboundText.includes(normAddress)) {
                isAddressGrounded = true;
              } else {
                const addressTokens = (normAddress.match(/[\p{L}\p{M}\p{N}]{3,}/gu) || [])
                  .filter((token: string) => !["road", "street", "house", "near", "post", "office", "no", "lane", "sri", "lanka"].includes(token));
                if (addressTokens.length > 0) {
                  const matchingTokens = addressTokens.filter((token: string) => customerInboundText.includes(token));
                  if (matchingTokens.length > 0) {
                    isAddressGrounded = true;
                  }
                } else {
                  const allTokens = normAddress.match(/[\p{L}\p{M}\p{N}]{3,}/gu) || [];
                  if (allTokens.some((token: string) => customerInboundText.includes(token))) {
                    isAddressGrounded = true;
                  }
                }
              }
            }

            if (!isAddressGrounded) {
              console.warn(`[SECURITY] Hallucinated order detected! Address "${cleanAddress}" was not provided by customer in chat.`);
              hallucinatedOrderDetected = true;
              continue; // Drop insertion
            }
          }

          // Deduplication: check if a similar order was created in the last 5 minutes
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentOrders } = await supabase
            .from("orders")
            .select("id")
            .eq("user_id", userId)
            .eq("customer_phone", cleanPhone)
            .eq("total_amount", cleanTotal)
            .gte("created_at", fiveMinAgo);

          if (recentOrders && recentOrders.length > 0) {
            console.log("Duplicate order detected, skipping creation. Existing:", recentOrders[0].id);
          } else {
            const instructionsList: string[] = [];
            if (orderData.customer_email) {
              instructionsList.push(`Email: ${orderData.customer_email}`);
            }
            const primaryColor = cleanItems.map((it: any) => it.selected_colors || it.variations?.Color).filter(Boolean)[0] || rootColor;
            if (primaryColor) {
              instructionsList.push(`Colours: ${primaryColor}`);
            }
            const primarySize = cleanItems.map((it: any) => it.size || it.variations?.Size).filter(Boolean)[0] || rootSize;
            if (primarySize) {
              instructionsList.push(`Size: ${primarySize}`);
            }
            if (orderData.special_instructions && typeof orderData.special_instructions === "string") {
              const extra = orderData.special_instructions.trim();
              if (extra && !instructionsList.some((s) => s.toLowerCase().includes(extra.toLowerCase()))) {
                instructionsList.push(extra);
              }
            }
            const cleanInstructions = instructionsList.length > 0 ? instructionsList.join(" | ") : null;

            const { data: orderResult, error: orderError } = await supabase
              .from("orders")
              .insert({
                customer_name: (() => {
                  const raw = orderData.customer_name || orderData.customer;
                  if (typeof raw === "object" && raw !== null) return raw.name || raw.customer_name || "Customer";
                  return String(raw || "Customer").trim();
                })(),
                customer_phone: cleanPhone,
                whatsapp_phone: phoneNumber,
                district: orderData.district || orderData.city || null,
                customer_address: cleanAddress,
                order_items: cleanItems,
                payment_method: cleanPaymentMethod,
                total_amount: cleanTotal,
                special_instructions: cleanInstructions,
                status: "pending",
                user_id: userId,
              })
              .select()
              .single();

            if (orderError) {
              console.error("Error saving order:", orderError);
            } else {
              console.log("Order saved successfully:", orderResult.id);
              orderCreated = true;

              // Send order notification to owner
              try {
                const { data: notifSettings } = await supabase
                  .from("settings")
                  .select("value")
                  .eq("key", "order_notifications")
                  .eq("user_id", userId)
                  .single();

                let ownerPhone = notifSettings?.value?.phone ? String(notifSettings.value.phone).replace(/\D/g, "") : null;
                if (ownerPhone) {
                  if (ownerPhone.startsWith("0") && ownerPhone.length === 10) {
                    ownerPhone = "94" + ownerPhone.substring(1);
                  } else if (ownerPhone.length === 9) {
                    ownerPhone = "94" + ownerPhone;
                  }
                  const items = (cleanItems || [])
                    .map((item: any) => {
                      const colorInfo = (item.selected_colors || item.variations?.Color) ? ` (Colours: ${item.selected_colors || item.variations?.Color})` : "";
                      return `${item.quantity}x ${item.name}${colorInfo}`;
                    })
                    .join(", ");
                  const notifMessage = `📦 New Order #${orderResult.id.substring(0, 8)}\n👤 ${orderData.customer_name}\n📱 ${orderData.customer_phone || phoneNumber}\n🛒 ${items}\n💰 Total: ${orderData.total_amount}\n💳 ${orderData.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer"}${orderData.district ? `\n🏘️ District: ${orderData.district}` : ""}${orderData.customer_address ? `\n📍 ${orderData.customer_address}` : ""}${cleanInstructions ? `\n📝 ${cleanInstructions}` : ""}`;

                  // Use the sessionApiKey passed from the webhook, fallback to DB lookup
                  let sendApiKey = sessionApiKey || null;
                  if (!sendApiKey) {
                    const { data: sessionData } = await supabase
                      .from("user_wsender_sessions")
                      .select("session_api_key")
                      .eq("user_id", userId)
                      .limit(1)
                      .maybeSingle();
                    sendApiKey = sessionData?.session_api_key || null;
                  }

                  const sendNotif = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp_Binara_Fashion`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${supabaseServiceKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      to: ownerPhone,
                      message: notifMessage,
                      sessionApiKey: sendApiKey,
                    }),
                  });
                  if (!sendNotif.ok) {
                    console.error("Failed to send owner notification:", await sendNotif.text());
                  } else {
                    console.log("Owner notification sent to", ownerPhone);
                  }
                }
              } catch (notifError) {
                console.error("Error sending owner notification:", notifError);
              }
            }
          }
        } catch (parseError) {
          console.error("Error parsing order JSON:", parseError);
        }
      }
    }

    // Resolve FAQ attachments: only for FAQs the AI actually used, first time per conversation,
    // max 4 attachments in one reply.
    let faqMedia: string[] = [];
    if (usedFaqIds.length > 0) {
      const candidates: string[] = [];
      for (const id of usedFaqIds) {
        const faq = faqs.find((f: any) => f.id === id);
        const urls = Array.isArray(faq?.media_urls) ? faq!.media_urls : [];
        for (const u of urls) {
          if (typeof u === "string" && u.trim() && !candidates.includes(u)) candidates.push(u);
        }
      }

      if (candidates.length > 0) {
        // Skip anything already sent to this customer before
        const { data: priorRows } = await supabase
          .from("conversations")
          .select("metadata")
          .eq("user_id", userId)
          .eq("phone_number", phoneNumber)
          .eq("direction", "outbound")
          .not("metadata", "is", null)
          .order("created_at", { ascending: false })
          .limit(200);

        const alreadySent = new Set<string>();
        for (const row of priorRows || []) {
          const sent = (row as any)?.metadata?.faqMedia;
          if (Array.isArray(sent)) sent.forEach((u: string) => alreadySent.add(u));
        }

        faqMedia = candidates.filter((u) => !alreadySent.has(u)).slice(0, 4);
        if (faqMedia.length > 0) {
          console.log(`FAQ attachments to send (${faqMedia.length}): ${faqMedia.join(", ")}`);
        }
      }
    }

    // ------------------------------------------------------------------
    // AI-DRIVEN PRODUCT MEDIA RESOLUTION
    // The AI model has full authority to decide when to introduce products
    // and show photos by appending <PRODUCT_MEDIA>product_id</PRODUCT_MEDIA>.
    // All string-based blocking heuristics and word-guessing regexes are removed.
    // ------------------------------------------------------------------
    let imageUrls: string[] = [];
    let videoUrl: string | null = null;

    const productMediaMatches = Array.from(responseText.matchAll(/<PRODUCT_MEDIA>([\s\S]*?)<\/PRODUCT_MEDIA>/gi));
    for (const m of productMediaMatches) {
      const rawContent = m[1].trim();
      const entries = rawContent.includes(",") ? rawContent.split(",") : [rawContent];
      for (const entry of entries) {
        const cleaned = entry.trim();
        if (!cleaned) continue;
        const cleanNorm = cleaned.toLowerCase().replace(/\s+/g, " ");
        let prod = productById.get(cleaned) || productByName.get(cleaned.toLowerCase());
        if (!prod) {
          // Normalize whitespace and match substring if exact lookup missed due to spacing/spelling differences
          prod = products.find(p => {
            const pNorm = (p.name || "").toLowerCase().replace(/\s+/g, " ");
            return pNorm === cleanNorm || pNorm.includes(cleanNorm) || cleanNorm.includes(pNorm);
          });
        }
        if (prod) {
          if (Array.isArray(prod.images)) {
            for (const img of prod.images) {
              if (typeof img === "string" && img.trim() && !imageUrls.includes(img.trim())) {
                imageUrls.push(img.trim());
              }
            }
          }
          if (!videoUrl && prod.video_url && typeof prod.video_url === "string" && prod.video_url.trim()) {
            videoUrl = prod.video_url.trim();
          }
        }
      }
    }

    // Support legacy/explicit <IMAGE_URL> tags if emitted
    const legacyImgMatches = Array.from(responseText.matchAll(/<IMAGE_URL>([\s\S]*?)<\/IMAGE_URL>/gi));
    for (const m of legacyImgMatches) {
      const u = m[1].trim();
      if (u && !imageUrls.includes(u)) imageUrls.push(u);
    }

    // Anti-image-spamming protection:
    // If product photos were already sent in prior turns, and the customer didn't explicitly request photos again, suppress re-sending images.
    const alreadySentPhotos = (Array.isArray(conversationHistory) ? conversationHistory : []).some(
      (m: any) => m.direction === "outbound" && (m.message_type === "image" || (m.metadata?.imageUrls && m.metadata.imageUrls.length > 0))
    );
    const explicitlyAskedForPhotos = /(?:photo|pic|image|පින්තූර|පින්තුර|photos?|pics?|images?)/i.test(trimmedMessage);

    if (alreadySentPhotos && !explicitlyAskedForPhotos) {
      console.log(`[MEDIA] Suppressing duplicate product photos for ${phoneNumber} to prevent image spamming.`);
      imageUrls = [];
    }

    const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

    // Extract video URL if present via tag
    const videoUrlMatch = responseText.match(/<VIDEO_URL>([\s\S]*?)<\/VIDEO_URL>/);
    if (videoUrlMatch && !videoUrl) {
      videoUrl = videoUrlMatch[1].trim();
    }

    // Aggressively strip any JSON or technical markup from the response
    let cleanResponse = responseText;
    // Remove complete tagged blocks WITH their content first
    cleanResponse = cleanResponse.replace(/<PRODUCT_MEDIA>[\s\S]*?<\/PRODUCT_MEDIA>/gi, "");
    cleanResponse = cleanResponse.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/g, "");
    cleanResponse = cleanResponse.replace(/<IMAGE_URL>[\s\S]*?<\/IMAGE_URL>/g, "");
    cleanResponse = cleanResponse.replace(/<VIDEO_URL>[\s\S]*?<\/VIDEO_URL>/g, "");
    cleanResponse = cleanResponse.replace(/<USED_FAQS>[\s\S]*?<\/USED_FAQS>/g, "");
    // Remove truncated/incomplete tags and everything after them
    cleanResponse = cleanResponse.replace(/<PRODUCT_MEDIA>[\s\S]*/gi, "");
    cleanResponse = cleanResponse.replace(/<ORDER_JSON>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<IMAGE_URL>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<VIDEO_URL>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<USED_FAQS>[\s\S]*/g, "");
    // Remove [ID: ...] product tags if leaked
    cleanResponse = cleanResponse.replace(/\[ID:[^\]]*\]/gi, "");
    // Remove any remaining orphan uppercase XML-like tags
    cleanResponse = cleanResponse.replace(/<\/?[A-Z_]+>/g, "");
    // Remove fenced code blocks (```json ... ``` or ``` ... ```)
    cleanResponse = cleanResponse.replace(/```[\s\S]*?```/g, "");
    // Remove any JSON object that looks like order data (greedy match for nested objects)
    cleanResponse = cleanResponse.replace(/\{[^{}]*"customer_name"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"customername"[^}]*\}/g, ""); // catch typos from model
    cleanResponse = cleanResponse.replace(/\{[^{}]*"order_items"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"payment_method"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"total_amount"[^}]*\}/g, "");
    // Remove any remaining JSON-like structures with 2+ key-value pairs
    cleanResponse = cleanResponse.replace(/\{\s*"[^"]+"\s*:[\s\S]*?\}/g, "");
    // Remove any leftover image URLs on their own line (https://...supabase... patterns)
    cleanResponse = cleanResponse.replace(/^https?:\/\/[^\s]+$/gm, "");
    // Remove standalone UUIDs that leak from FAQ IDs, Product IDs, or correlation IDs
    cleanResponse = cleanResponse.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "");
    // Remove [FAQ_ID:...] references that may leak into response
    cleanResponse = cleanResponse.replace(/\[FAQ_ID:[^\]]*\]/g, "");
    // Clean up leftover whitespace
    cleanResponse = cleanResponse.replace(/\n{3,}/g, "\n\n").trim();

    // If order details were hallucinated without customer providing address, intercept false confirmation
    if (hallucinatedOrderDetected) {
      const isEnglish = !/[\u0D80-\u0DFF]/.test(customerInboundText || trimmedMessage);
      cleanResponse = isEnglish
        ? "To complete your order, please provide your name, delivery address, and phone number. 🌸"
        : "ඇණවුම සම්පූර්ණ කිරීම සඳහා කරුණාකර ඔබගේ නම, භාණ්ඩ ලැබිය යුතු සම්පූර්ණ ලිපිනය සහ දුරකථන අංකය අපට එවන්නකෝ. 🌸";
    }

    // Log AI usage independently of conversations
    await supabase.from("ai_usage_logs").insert({
      user_id: userId,
      phone_number: contactKey || phoneNumber,
    });

    // If an order was created, check for follow-up message
    let followupMessage: string | null = null;
    if (orderCreated) {
      try {
        const { data: followupSettings } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "order_followup_message")
          .eq("user_id", userId)
          .single();

        if (followupSettings?.value?.enabled && followupSettings?.value?.text?.trim()) {
          followupMessage = followupSettings.value.text.trim();
          console.log("Order follow-up message will be sent");
        }
      } catch (e) {
        console.warn("Could not fetch order followup setting:", e);
      }
    }

    return new Response(
      JSON.stringify({ response: cleanResponse, orderCreated, imageUrl, imageUrls, videoUrl, followupMessage, faqMedia }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

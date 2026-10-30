function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function transcribeAudio(
  sessionName: string,
  wahaMessageId: string,
  mediaUrl?: string,
  mimeType?: string
): Promise<string | null> {
  const WAHA_BASE = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
  const WAHA_KEY = Deno.env.get("WAHA_API_KEY") || "";
  const AI_GENERATE_URL = Deno.env.get("AI_GENERATE_URL") || "";
  const BOT_API_KEY = Deno.env.get("BOT_API_KEY") || "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
  const MODEL = "google/gemini-3-flash-preview";

  // 1. Download WAHA Audio
  let audioBuffer: Uint8Array;
  try {
    const rawUrl = mediaUrl || `${WAHA_BASE}/api/${encodeURIComponent(sessionName)}/messages/${encodeURIComponent(wahaMessageId)}/download`;
    const wahaUrl = rawUrl.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1):3000\b/i, WAHA_BASE || "http://waha:3000");
    console.log(`Downloading audio from: ${wahaUrl}`);
    const res = await fetch(wahaUrl, {
      headers: { "X-Api-Key": WAHA_KEY, "Accept": "*/*" },
      signal: AbortSignal.timeout(15_000)
    });

    if (!res.ok) {
      console.error(`WAHA download failed (${res.status}): ${await res.text()}`);
      return null;
    }

    audioBuffer = new Uint8Array(await res.arrayBuffer());
    console.log(`Downloaded ${audioBuffer.length} bytes of audio data`);
  } catch (err) {
    console.error("Error downloading audio from WAHA:", err);
    return null;
  }

  const cleanMime = (mimeType || "audio/ogg").split(";")[0].trim() || "audio/ogg";
  const base64Audio = bytesToBase64(audioBuffer);
  const dataUrl = `data:${cleanMime};base64,${base64Audio}`;

  // 2. Primary: Same AI model used for texting (google/gemini-3-flash-preview via AI_GENERATE_URL / BOT_API_KEY)
  if (AI_GENERATE_URL && BOT_API_KEY) {
    try {
      console.log(`Transcribing audio using primary texting AI (${MODEL} via AI_GENERATE_URL)...`);
      const res = await fetch(AI_GENERATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-key": BOT_API_KEY,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are a verbatim speech-to-text transcriber for WhatsApp voice messages in Sri Lanka. The language could be Sinhala, English, Tamil, or Singlish. Transcribe the spoken audio verbatim in its native language/script (Sinhala script for Sinhala, Tamil script for Tamil, Latin script for English/Singlish). Do NOT translate. Do NOT summarize. Do NOT add preamble, quotes, markdown formatting, or commentary. Output ONLY the exact transcribed words. If the audio has no speech or is unintelligible noise, output [UNINTELLIGIBLE]."
            },
            {
              role: "user",
              content: "Transcribe this audio verbatim:\n" + dataUrl
            }
          ],
          model: MODEL,
          maxTokens: 500,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = await res.json();
        let text = (data?.text || "").trim();
        text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
        if (text && text !== "[UNINTELLIGIBLE]") {
          console.log("Primary AI transcription successful:", text);
          return text;
        } else {
          console.warn(`Primary AI returned no intelligible speech: "${text}"`);
        }
      } else {
        console.warn(`Primary AI transcription failed (${res.status}): ${await res.text()}, trying fallbacks...`);
      }
    } catch (err) {
      console.warn("Primary AI transcription error:", err);
    }
  }

  // 2b. Lovable AI Gateway direct fallback (if LOVABLE_API_KEY is configured)
  if (LOVABLE_API_KEY) {
    try {
      console.log(`Transcribing audio using Lovable AI Gateway (${MODEL})...`);
      const lgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: "You are a verbatim speech-to-text transcriber for WhatsApp voice messages in Sri Lanka. The language could be Sinhala, English, Tamil, or Singlish. Transcribe the spoken audio verbatim in its native language/script. Do NOT translate. Do NOT summarize. Output ONLY the exact transcribed words. If no speech or unintelligible noise, output [UNINTELLIGIBLE]."
            },
            {
              role: "user",
              content: "Transcribe this audio verbatim:\n" + dataUrl
            }
          ],
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (lgRes.ok) {
        const lgData = await lgRes.json();
        let text = (lgData?.choices?.[0]?.message?.content || "").trim();
        text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
        if (text && text !== "[UNINTELLIGIBLE]") {
          console.log("Lovable AI Gateway transcription successful:", text);
          return text;
        }
      }
    } catch (err) {
      console.warn("Lovable AI Gateway transcription error:", err);
    }
  }

  // 3. Fallback: OpenAI Whisper API (whisper-1) if OPENAI_API_KEY is available
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes("sk-proj-xxxxxxxx")) {
    try {
      console.log("Transcribing audio using OpenAI Whisper API (whisper-1)...");
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: cleanMime });
      formData.append("file", audioBlob, "voice_message.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "si");
      formData.append("prompt", "Binara Fashion ඇඳුම් සාප්පුව සඳහා පාරිභෝගික ඇණවුම් විමසීම");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
        signal: AbortSignal.timeout(20_000),
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        const text = whisperData?.text?.trim();
        if (text) {
          console.log("OpenAI Whisper transcription successful:", text);
          return text;
        }
      } else {
        console.warn(`OpenAI Whisper failed (${whisperRes.status}): ${await whisperRes.text()}, trying fallback...`);
      }
    } catch (whisperErr) {
      console.warn("OpenAI Whisper transcription error:", whisperErr);
    }
  }

  // 4. Fallback: OpenRouter with Gemini audio / Whisper
  if (OPENROUTER_API_KEY) {
    try {
      console.log("Sending to OpenRouter for transcription fallback...");
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Transcribe this audio verbatim in its native language/script (Sinhala, Tamil, English, or Singlish). Do NOT translate or summarize. Output ONLY the transcription."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: dataUrl
                  }
                }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(20_000)
      });

      if (orRes.ok) {
        const orData = await orRes.json();
        const transcription = orData?.choices?.[0]?.message?.content?.trim();
        if (transcription) {
          console.log("OpenRouter transcription result:", transcription);
          return transcription;
        }
      } else {
        console.error(`OpenRouter transcription failed (${orRes.status}): ${await orRes.text()}`);
      }
    } catch (err) {
      console.error("Error transcribing audio via OpenRouter:", err);
    }
  }

  return null;
}

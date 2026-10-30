function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function transcribeAudio(sessionName: string, wahaMessageId: string, mediaUrl?: string): Promise<string | null> {
  const WAHA_BASE = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
  const WAHA_KEY = Deno.env.get("WAHA_API_KEY") || "";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

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

  const base64Audio = bytesToBase64(audioBuffer);

  // 2. Primary: Google Gemini model API (gemini-2.5-flash)
  if (GEMINI_API_KEY) {
    try {
      console.log("Transcribing audio using Google Gemini model (gemini-2.5-flash)...");
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "You are an expert audio transcriber. Transcribe this audio recording verbatim in its native language/script (Sinhala, Tamil, English, or Singlish). Do NOT translate, summarize, or add extra commentary. Return ONLY the exact transcribed text."
                },
                {
                  inline_data: {
                    mime_type: "audio/ogg",
                    data: base64Audio
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1
          }
        }),
        signal: AbortSignal.timeout(25_000)
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          console.log("Google Gemini transcription successful:", text);
          return text;
        }
      } else {
        console.warn(`Google Gemini API failed (${geminiRes.status}): ${await geminiRes.text()}`);
      }
    } catch (geminiErr) {
      console.warn("Google Gemini transcription error:", geminiErr);
    }
  }

  // 3. OpenRouter with Gemini (google/gemini-2.5-flash, google/gemini-2.5-flash-lite)
  if (OPENROUTER_API_KEY) {
    try {
      console.log("Transcribing audio using OpenRouter Gemini model (google/gemini-2.5-flash)...");
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "google/gemini-flash-1.5"],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "You are an expert audio transcriber. Transcribe this audio recording verbatim in its native language/script (Sinhala, Tamil, English, or Singlish). Do NOT translate, summarize, or add extra commentary. Return ONLY the exact transcribed text."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:audio/ogg;base64,${base64Audio}`
                  }
                }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(25_000)
      });

      if (orRes.ok) {
        const orData = await orRes.json();
        const transcription = orData?.choices?.[0]?.message?.content?.trim();
        if (transcription) {
          console.log("OpenRouter Gemini transcription result:", transcription);
          return transcription;
        }
      } else {
        console.error(`OpenRouter transcription failed (${orRes.status}): ${await orRes.text()}`);
      }
    } catch (err) {
      console.error("Error transcribing audio via OpenRouter Gemini:", err);
    }
  }

  // 4. Fallback: OpenAI Whisper if configured
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes("sk-proj-xxxxxxxx")) {
    try {
      console.log("Falling back to OpenAI Whisper API (whisper-1)...");
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
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
          console.log("OpenAI Whisper fallback transcription successful:", text);
          return text;
        }
      } else {
        console.warn(`OpenAI Whisper failed (${whisperRes.status}): ${await whisperRes.text()}`);
      }
    } catch (whisperErr) {
      console.warn("OpenAI Whisper transcription error:", whisperErr);
    }
  }

  return null;
}

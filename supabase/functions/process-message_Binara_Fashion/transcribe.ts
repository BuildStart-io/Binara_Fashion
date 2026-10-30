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
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

  // 1. Download WAHA Audio
  let audioBuffer: Uint8Array;
  try {
    const wahaUrl = mediaUrl || `${WAHA_BASE}/api/${encodeURIComponent(sessionName)}/messages/${encodeURIComponent(wahaMessageId)}/download`;
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

  // 2. Try OpenAI Whisper API (whisper-1) first if OPENAI_API_KEY is available
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes("sk-proj-xxxxxxxx")) {
    try {
      console.log("Transcribing audio using OpenAI Whisper API (whisper-1)...");
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

  // 3. Fallback: OpenRouter with Gemini audio / Whisper
  if (OPENROUTER_API_KEY) {
    try {
      console.log("Sending to OpenRouter for transcription fallback...");
      const base64Audio = bytesToBase64(audioBuffer);
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
                    url: `data:audio/ogg;base64,${base64Audio}`
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

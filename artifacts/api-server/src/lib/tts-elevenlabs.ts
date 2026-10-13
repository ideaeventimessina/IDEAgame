/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Voce di Johhy con ElevenLabs ───────────────────────────────────────────
   Provider TTS alternativo a OpenAI. La chiave si legge SOLO dall'ambiente del
   server a runtime (`ELEVENLABS_API_KEY`) — mai dal client, mai hardcodata. Se
   la chiave manca o la chiamata fallisce, ritorna null e jonny-voice.ts fa
   fallback su OpenAI (e in ultimo il gioco continua senza voce).

   Config via env:
     ELEVENLABS_API_KEY   (obbligatoria per usare questo provider)
     ELEVENLABS_VOICE_ID  (default: showman caldo multilingua; override consigliato)
     ELEVENLABS_MODEL     (default: eleven_multilingual_v2 — buon italiano)
──────────────────────────────────────────────────────────────────────────── */

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
// Voce di default "Antoni" (maschile, calda) — disponibile sugli account ElevenLabs;
// sovrascrivibile con ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = "ErXwobaYiN019PkySvjV";
const DEFAULT_MODEL = "eleven_multilingual_v2";

/** true se il provider ElevenLabs è configurato (chiave presente nell'ambiente). */
export function elevenLabsEnabled(): boolean {
  return !!process.env["ELEVENLABS_API_KEY"];
}

/** Tag provider+voce+modello per invalidare la cache quando cambiano. */
export function elevenLabsVoiceTag(): string {
  const v = process.env["ELEVENLABS_VOICE_ID"] || DEFAULT_VOICE;
  const m = process.env["ELEVENLABS_MODEL"] || DEFAULT_MODEL;
  return `el:${v}:${m}`;
}

/** Genera l'MP3 della battuta con ElevenLabs. null se non configurato o errore. */
export async function elevenLabsTTS(text: string): Promise<Buffer | null> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey || !text.trim()) return null;
  const voiceId = process.env["ELEVENLABS_VOICE_ID"] || DEFAULT_VOICE;
  const modelId = process.env["ELEVENLABS_MODEL"] || DEFAULT_MODEL;
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[tts-elevenlabs] HTTP", res.status, detail.slice(0, 200));
      return null;
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return buf.length ? buf : null;
  } catch (err) {
    console.error("[tts-elevenlabs] richiesta fallita", err);
    return null;
  }
}

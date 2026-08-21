/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Tabella prezzi OpenAI usata per stimare il costo (USD) di ogni chiamata AI
 * registrata in ai_usage_log. OpenAI non espone un endpoint che restituisca
 * "quanto hai speso" o "quanto credito ti resta" per una singola API key: il
 * costo qui è SEMPRE una stima calcolata lato nostro a partire dai token/unità
 * riportati dalla risposta e dai listini pubblici di openai.com/api/pricing.
 *
 * `confidence`:
 *  - "confirmed"  → prezzo noto con buona confidenza dai listini pubblici OpenAI.
 *  - "estimated"  → prezzo desunto/assunto (modello nuovo, variante non documentata
 *                   nel dettaglio, o pricing audio/immagini con parametri non
 *                   sempre disponibili). VERIFICARE su openai.com/api/pricing prima
 *                   di fidarsi ciecamente di numeri assoluti su grandi volumi.
 *
 * Ricontrollare periodicamente: OpenAI cambia spesso i prezzi.
 */

export type PricingConfidence = "confirmed" | "estimated";

export interface TextModelPricing {
  /** USD per 1.000.000 di token di input */
  inputPerMTok: number;
  /** USD per 1.000.000 di token di output */
  outputPerMTok: number;
  confidence: PricingConfidence;
}

/* ── Modelli testo (chat.completions / responses) ─────────────────────────── */
export const TEXT_MODEL_PRICING: Record<string, TextModelPricing> = {
  // Confermati dal listino pubblico OpenAI (famiglia gpt-4o).
  "gpt-4o":       { inputPerMTok: 2.50, outputPerMTok: 10.00, confidence: "confirmed" },
  "gpt-4o-mini":  { inputPerMTok: 0.15, outputPerMTok: 0.60,  confidence: "confirmed" },

  // Famiglia gpt-5: prezzi annunciati al lancio, non ricontrollati da questa sessione.
  "gpt-5":        { inputPerMTok: 1.25, outputPerMTok: 10.00, confidence: "estimated" },
  "gpt-5-mini":   { inputPerMTok: 0.25, outputPerMTok: 2.00,  confidence: "estimated" },
  "gpt-5-nano":   { inputPerMTok: 0.05, outputPerMTok: 0.40,  confidence: "estimated" },
  // "gpt-5.1" non ha un listino separato pubblicato: assumiamo lo stesso prezzo di gpt-5.
  "gpt-5.1":      { inputPerMTok: 1.25, outputPerMTok: 10.00, confidence: "estimated" },
};

/** Fallback per modelli testo non presenti in tabella (evita di loggare costo 0 in silenzio). */
export const TEXT_MODEL_FALLBACK: TextModelPricing = {
  inputPerMTok: 1.25, outputPerMTok: 10.00, confidence: "estimated",
};

export function textCostUsd(model: string, tokensInput: number, tokensOutput: number): { costUsd: number; confidence: PricingConfidence } {
  const p = TEXT_MODEL_PRICING[model] ?? TEXT_MODEL_FALLBACK;
  const costUsd = (tokensInput / 1_000_000) * p.inputPerMTok + (tokensOutput / 1_000_000) * p.outputPerMTok;
  return { costUsd, confidence: TEXT_MODEL_PRICING[model] ? p.confidence : "estimated" };
}

/* ── Generazione immagini (images.generate / images.edit) ────────────────────
   gpt-image-1 è fatturato a token, ma OpenAI pubblica anche un prezzo "per
   immagine" indicativo per size/quality che usiamo come stima quando la
   risposta non riporta un campo `usage` dettagliato (es. chiamate via fetch
   grezzo che leggono solo b64_json/url). Quality di default: "medium", perché
   i call site di questo repo non specificano `quality` esplicitamente. */
export type ImageQuality = "low" | "medium" | "high";

const IMAGE_PRICE_TABLE: Record<string, Record<ImageQuality, Record<string, number>>> = {
  "gpt-image-1": {
    low:    { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 },
    medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 },
    high:   { "1024x1024": 0.167, "1024x1536": 0.25,  "1536x1024": 0.25 },
  },
};

const IMAGE_FALLBACK_PRICE_USD = 0.042; // medium 1024x1024 gpt-image-1

export function imageCostUsd(
  model: string,
  size: string,
  quality: ImageQuality = "medium",
  count = 1,
): { costUsd: number; confidence: PricingConfidence } {
  const perImage = IMAGE_PRICE_TABLE[model]?.[quality]?.[size] ?? IMAGE_FALLBACK_PRICE_USD;
  return { costUsd: perImage * count, confidence: "estimated" };
}

/* ── Chat audio-to-audio (chat.completions con modalities ["text","audio"]) ──
   Prezzi stimati sulla falsariga dei modelli audio-preview OpenAI: i token
   testo costano come gpt-4o, i token audio hanno una tariffa molto più alta.
   Non abbiamo un listino ufficiale confermato per "gpt-audio" al momento in
   cui questo file è stato scritto: TUTTO qui è "estimated". */
export interface AudioChatUsage {
  textTokensInput: number;
  textTokensOutput: number;
  audioTokensInput: number;
  audioTokensOutput: number;
}

const AUDIO_CHAT_PRICING = {
  textInPerMTok: 2.50,
  textOutPerMTok: 10.00,
  audioInPerMTok: 40.00,
  audioOutPerMTok: 80.00,
};

export function audioChatCostUsd(_model: string, usage: AudioChatUsage): { costUsd: number; confidence: PricingConfidence } {
  const costUsd =
    (usage.textTokensInput / 1_000_000) * AUDIO_CHAT_PRICING.textInPerMTok +
    (usage.textTokensOutput / 1_000_000) * AUDIO_CHAT_PRICING.textOutPerMTok +
    (usage.audioTokensInput / 1_000_000) * AUDIO_CHAT_PRICING.audioInPerMTok +
    (usage.audioTokensOutput / 1_000_000) * AUDIO_CHAT_PRICING.audioOutPerMTok;
  return { costUsd, confidence: "estimated" };
}

/* ── Trascrizione audio (audio.transcriptions.create) ─────────────────────── */
const TRANSCRIBE_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  // Stime: nessun listino verificato in questa sessione. Verificare su openai.com/api/pricing.
  "gpt-4o-mini-transcribe": { inputPerMTok: 3.00, outputPerMTok: 5.00 },
  "gpt-4o-transcribe":      { inputPerMTok: 6.00, outputPerMTok: 10.00 },
};

export function transcriptionCostUsd(
  model: string,
  tokensInput: number,
  tokensOutput: number,
): { costUsd: number; confidence: PricingConfidence } {
  const p = TRANSCRIBE_PRICING[model] ?? TRANSCRIBE_PRICING["gpt-4o-mini-transcribe"]!;
  const costUsd = (tokensInput / 1_000_000) * p.inputPerMTok + (tokensOutput / 1_000_000) * p.outputPerMTok;
  return { costUsd, confidence: "estimated" };
}

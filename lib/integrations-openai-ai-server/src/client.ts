/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import OpenAI from "openai";

/* Chiave diretta OpenAI: le richieste vanno a api.openai.com e le paghi a
   OpenAI. Prima passavano dal gateway AI di Replit (AI_INTEGRATIONS_OPENAI_*),
   che le rifatturava a crediti Replit. Senza baseURL l'SDK usa l'endpoint
   ufficiale. */
function resolveApiKey(): string {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY non impostata: aggiungi la tua chiave OpenAI ai Secrets dell'app.",
    );
  }
  return key;
}

let client: OpenAI | null = null;

function real(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: resolveApiKey() });
  }
  return client;
}

/** True quando la chiave diretta e' configurata (nessuna richiesta di rete). */
export function isOpenAiConfigured(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? "").trim());
}

/* Costruzione pigra: il client nasce alla prima chiamata, non all'import, cosi'
   una chiave mancante fa fallire solo le richieste AI e non l'avvio del server. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const c = real() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});

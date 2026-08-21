/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { getAiUsageContext } from "./context";
import { logAiUsage } from "./usage-log";
import { textCostUsd } from "./pricing";

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

/* Logging automatico di ogni chat.completions.create: e' l'unico metodo del
   client testo effettivamente usato in questo repo oggi. Intercettarlo qui
   (invece che in ogni call site) e' il punto con il miglior ROI: qualsiasi
   nuovo consumer di `openai.chat.completions.create` viene loggato senza
   dover ricordarsene. Le chiamate in streaming vengono comunque registrate
   (per contare l'uso) ma senza costo/token stimati, perche' la risposta in
   streaming di questo SDK non espone `usage` senza `stream_options`, che
   nessun call site attuale imposta. */
function wrapChatCompletionsCreate(c: OpenAI) {
  const original = c.chat.completions.create.bind(c.chat.completions);
  return (async (...args: Parameters<typeof original>) => {
    const params = args[0] as ChatCompletionCreateParams;
    const result = await original(...args);
    const model = params?.model ?? "unknown";
    if (params?.stream) {
      void logAiUsage({
        ...getAiUsageContext(),
        model, endpoint: "chat.completions",
        costUsd: 0,
        metadata: { streaming: true, note: "usage non disponibile per risposte in streaming senza stream_options" },
      });
    } else {
      const usage = (result as ChatCompletion).usage;
      const { costUsd, confidence } = textCostUsd(model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);
      void logAiUsage({
        ...getAiUsageContext(),
        model, endpoint: "chat.completions",
        tokensInput: usage?.prompt_tokens ?? 0,
        tokensOutput: usage?.completion_tokens ?? 0,
        costUsd,
        metadata: { costConfidence: confidence },
      });
    }
    return result;
  }) as typeof original;
}

/* Costruzione pigra: il client nasce alla prima chiamata, non all'import, cosi'
   una chiave mancante fa fallire solo le richieste AI e non l'avvio del server. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const c = real();
    if (prop === "chat") {
      return new Proxy(c.chat, {
        get(chatTarget, chatProp) {
          if (chatProp === "completions") {
            return new Proxy(chatTarget.completions, {
              get(complTarget, complProp) {
                if (complProp === "create") return wrapChatCompletionsCreate(c);
                const v = (complTarget as unknown as Record<string | symbol, unknown>)[complProp];
                return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(complTarget) : v;
              },
            });
          }
          const v = (chatTarget as unknown as Record<string | symbol, unknown>)[chatProp];
          return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(chatTarget) : v;
        },
      });
    }
    const cRec = c as unknown as Record<string | symbol, unknown>;
    const value = cRec[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});

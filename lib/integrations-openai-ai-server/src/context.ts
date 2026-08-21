/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { AsyncLocalStorage } from "node:async_hooks";

/* Contesto "chi sta facendo questa richiesta" propagato via AsyncLocalStorage
   così che i client OpenAI centralizzati (client.ts, image/client.ts,
   audio/client.ts) possano attribuire ogni chiamata AI a tenant/utente senza
   che ogni call site debba passarli esplicitamente. Il server (vedi
   artifacts/api-server/src/middlewares/auth.ts → loadUser) imposta il
   contesto una volta per richiesta, dopo aver risolto l'utente di sessione. */
export interface AiUsageContext {
  tenantId: string | null;
  userId: string | null;
}

const EMPTY_CONTEXT: AiUsageContext = { tenantId: null, userId: null };

const storage = new AsyncLocalStorage<AiUsageContext>();

export function runWithAiUsageContext<T>(ctx: AiUsageContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAiUsageContext(): AiUsageContext {
  return storage.getStore() ?? EMPTY_CONTEXT;
}

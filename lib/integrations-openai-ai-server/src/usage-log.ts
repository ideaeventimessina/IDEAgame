/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { db, aiUsageLogTable } from "@workspace/db";

export interface LogAiUsageParams {
  tenantId?: string | null;
  userId?: string | null;
  provider?: string;
  model: string;
  endpoint: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}

/**
 * Scrive una riga di utilizzo AI in ai_usage_log. Non deve MAI far fallire la
 * chiamata AI che la invoca: eventuali errori di scrittura sono loggati su
 * console.error e ingoiati. Chiamare sempre con `void logAiUsage(...)` o
 * `.catch(...)` dal call site se non si vuole rallentare la risposta.
 */
export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    await db.insert(aiUsageLogTable).values({
      tenantId: params.tenantId ?? null,
      userId: params.userId ?? null,
      provider: params.provider ?? "openai",
      model: params.model,
      endpoint: params.endpoint,
      tokensInput: Math.max(0, Math.round(params.tokensInput ?? 0)),
      tokensOutput: Math.max(0, Math.round(params.tokensOutput ?? 0)),
      costUsd: params.costUsd.toFixed(6),
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ai-usage-log] impossibile scrivere il log di utilizzo AI", err);
  }
}

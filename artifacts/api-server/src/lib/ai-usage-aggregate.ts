/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { eq, sql, desc } from "drizzle-orm";
import { db, aiUsageLogTable, tenantsTable, usersTable } from "@workspace/db";
import { isOpenAiConfigured } from "@workspace/integrations-openai-ai-server";

export type AiUsagePeriod = "day" | "week" | "month" | "year";

const PERIOD_INTERVALS: Record<AiUsagePeriod, string> = {
  day: "1 day",
  week: "7 days",
  month: "30 days",
  year: "365 days",
};

export function resolveAiUsagePeriod(raw: unknown): AiUsagePeriod {
  return raw === "day" || raw === "week" || raw === "month" || raw === "year" ? raw : "month";
}

/* Aggregazione condivisa dei log di utilizzo AI (spesa/token/chiamate), per
   periodo, a livello globale + breakdown per provider/tenant/utente.
   Usata sia dalla route admin (/api/ai-usage, sessione super_admin) sia
   dalla route machine-to-machine per Mission Control
   (/api/mission-control/ai-usage, token condiviso): la query resta unica,
   ogni route la adatta solo nella forma della risposta. */
type AggRow = { calls: number; tokensInput: number; tokensOutput: number; costUsd: number };
type ProviderRow = AggRow & { provider: string };
type TenantRow = AggRow & { tenantId: string | null; tenantName: string | null };
type UserRow = AggRow & { userId: string | null; userName: string | null; userEmail: string | null; tenantId: string | null };

export async function computeAiUsageAggregate(period: AiUsagePeriod) {
  const providers = [
    { provider: "openai", configured: isOpenAiConfigured() },
  ];
  const empty = { period, totals: { calls: 0, tokensInput: 0, tokensOutput: 0, costUsd: 0 } as AggRow,
    byProvider: [] as ProviderRow[], byTenant: [] as TenantRow[], byUser: [] as UserRow[], providers };

  try {
    const interval = PERIOD_INTERVALS[period];
    const since = sql`now() - interval '${sql.raw(interval)}'`;
    const whereClause = sql`${aiUsageLogTable.createdAt} > ${since}`;

    const AGG = {
      calls: sql<number>`count(*)::int`,
      tokensInput: sql<number>`coalesce(sum(${aiUsageLogTable.tokensInput}),0)::int`,
      tokensOutput: sql<number>`coalesce(sum(${aiUsageLogTable.tokensOutput}),0)::int`,
      costUsd: sql<number>`coalesce(sum(${aiUsageLogTable.costUsd}),0)::float8`,
    };

    const [totals = empty.totals] = await db
      .select(AGG).from(aiUsageLogTable).where(whereClause);

    const byProvider = await db
      .select({ provider: aiUsageLogTable.provider, ...AGG })
      .from(aiUsageLogTable)
      .where(whereClause)
      .groupBy(aiUsageLogTable.provider)
      .orderBy(desc(AGG.costUsd));

    const byTenant = await db
      .select({ tenantId: aiUsageLogTable.tenantId, tenantName: tenantsTable.name, ...AGG })
      .from(aiUsageLogTable)
      .leftJoin(tenantsTable, eq(aiUsageLogTable.tenantId, tenantsTable.id))
      .where(whereClause)
      .groupBy(aiUsageLogTable.tenantId, tenantsTable.name)
      .orderBy(desc(AGG.costUsd));

    const byUser = await db
      .select({
        userId: aiUsageLogTable.userId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        tenantId: usersTable.tenantId,
        ...AGG,
      })
      .from(aiUsageLogTable)
      .leftJoin(usersTable, eq(aiUsageLogTable.userId, usersTable.id))
      .where(whereClause)
      .groupBy(aiUsageLogTable.userId, usersTable.name, usersTable.email, usersTable.tenantId)
      .orderBy(desc(AGG.costUsd))
      .limit(200);

    return { period, totals, byProvider, byTenant, byUser, providers };
  } catch (err) {
    // La tabella ai_usage_log può non esistere ancora in prod (drift schema): non
    // deve far esplodere l'endpoint (Mission Control lo interroga in polling → storm
    // di 500). Degrada a zero finché la tabella non c'è.
    console.error("[ai-usage-aggregate] query fallita (tabella mancante?) → zero", err instanceof Error ? err.message : err);
    return empty;
  }
}

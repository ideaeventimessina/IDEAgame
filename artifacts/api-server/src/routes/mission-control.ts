/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Router, type IRouter } from "express";
import { computeAiUsageAggregate, resolveAiUsagePeriod } from "../lib/ai-usage-aggregate";

const router: IRouter = Router();

/* Endpoint machine-to-machine per "Mission Control" (l'aggregatore esterno
   che fa polling su più repo). NON passa dalla sessione/requireRole di
   ../middlewares/auth: è protetto solo da un token condiviso in header,
   perché chi lo chiama non è un utente loggato in IDEAgame ma un altro
   servizio server-to-server. La query di aggregazione è la stessa usata da
   /api/ai-usage (vedi ../lib/ai-usage-aggregate) — qui viene solo
   rimappata nella forma di risposta richiesta da Mission Control. */
router.get("/mission-control/ai-usage", async (req, res): Promise<void> => {
  const expected = process.env["MISSION_CONTROL_TOKEN"];
  const provided = req.header("X-Mission-Token");
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const period = resolveAiUsagePeriod(req.query["period"]);
  const aggregate = await computeAiUsageAggregate(period);

  res.json({
    project: "ideagame",
    period,
    generatedAt: new Date().toISOString(),
    totals: {
      calls: aggregate.totals.calls,
      costUsd: aggregate.totals.costUsd,
      estimated: true,
    },
    byProvider: aggregate.byProvider.map(p => ({
      provider: p.provider,
      calls: p.calls,
      costUsd: p.costUsd,
      configured: aggregate.providers.find(x => x.provider === p.provider)?.configured ?? false,
    })),
    byUser: aggregate.byUser.map(u => ({
      label: u.userName ?? u.userEmail ?? (u.tenantId ? `tenant ${u.tenantId.slice(0, 8)}…` : "sconosciuto"),
      calls: u.calls,
      costUsd: u.costUsd,
    })),
    // Nessun provider AI espone un saldo/credito residuo via API pubblica:
    // niente da mostrare qui, di proposito vuoto e non inventato.
    balances: [],
  });
});

export default router;

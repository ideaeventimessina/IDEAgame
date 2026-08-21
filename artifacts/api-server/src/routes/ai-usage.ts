/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Router, type IRouter } from "express";
import { GetAiUsageResponse } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { computeAiUsageAggregate, resolveAiUsagePeriod } from "../lib/ai-usage-aggregate";

const router: IRouter = Router();

/* Totali costo/token AI (oggi solo OpenAI), a livello globale + breakdown per
   provider/tenant/utente, filtrabili per periodo. Nessun endpoint OpenAI
   pubblico espone "credito residuo" per API key: qui mostriamo solo spesa
   calcolata da noi (vedi @workspace/integrations-openai-ai-server/pricing),
   mai un saldo. La query di aggregazione vive in ../lib/ai-usage-aggregate
   ed è condivisa con la route machine-to-machine
   /api/mission-control/ai-usage (vedi ./mission-control.ts) — stessa
   estrazione dati, forme di risposta diverse. */
router.get("/ai-usage", requireRole("super_admin"), async (req, res): Promise<void> => {
  const period = resolveAiUsagePeriod(req.query["period"]);
  const aggregate = await computeAiUsageAggregate(period);
  res.json(GetAiUsageResponse.parse(aggregate));
});

export default router;

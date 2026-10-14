/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/* Identificatore di build non sensibile: correla build↔commit lato UI/monitoraggio.
   Preso dall'ambiente (BUILD_ID o GIT_SHA se presenti), altrimenti 'dev'.
   Nessun segreto: solo uno SHA corto o un timestamp di build. */
const BUILD_ID = process.env.BUILD_ID ?? process.env.GIT_SHA ?? "dev";

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  // `build` è aggiunto fuori dallo schema generato (orval) per non alterare il contratto.
  res.json({ ...data, build: BUILD_ID });
});

export default router;

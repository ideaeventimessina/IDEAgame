/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Voce di Jonny — endpoint PUBBLICO (i device Home non hanno login, come
   /home/music-config). Serve solo testi fissi dal catalogo server (jonny-voice),
   quindi non è sfruttabile per generare audio arbitrario a pagamento. */

import { Router, type IRouter, type Request, type Response } from "express";
import { getJonnyVoiceUrl, jonnyVoiceKeys, JONNY_SCRIPTS } from "../lib/jonny-voice.js";

const router: IRouter = Router();

/** Elenco chiavi + testo (per prefetch e sottotitoli client). */
router.get("/home/voice/manifest", (_req: Request, res: Response): void => {
  res.json({ keys: jonnyVoiceKeys(), scripts: JONNY_SCRIPTS });
});

/** MP3 con la voce di Jonny per una chiave del copione (genera+cache alla prima). */
router.get("/home/voice/:key", async (req: Request, res: Response): Promise<void> => {
  const key = String(req.params["key"] ?? "");
  const url = await getJonnyVoiceUrl(key);
  if (!url) { res.status(404).json({ error: "voce non disponibile", key }); return; }
  res.json({ key, url, text: JONNY_SCRIPTS[key] ?? "" });
});

export default router;

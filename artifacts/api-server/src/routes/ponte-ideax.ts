/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Router, type IRouter } from "express";
import { chiaveIdeax, segnaContatto, prendiLavori, consegna, statoIdeax } from "../lib/ideax.js";

/**
 * Ponte ideax → IDEAgame. ideax (sul PC di Andrea) passa a prendere i lavori: nessuna porta aperta sul PC.
 *   GET  /api/ponte/ideax/lavori?attendi=25&capacita=genera,musica   header x-ideax-key
 *   POST /api/ponte/ideax/lavori/:id                                  { ok, risultato | errore, secondi }
 *   GET  /api/ponte/ideax/stato                                       acceso sì/no e cosa sa fare (stessa chiave)
 * Il percorso /ponte sta fuori dal login (loadUser è permissivo): qui l'autorizzazione è la chiave IDEAX_KEY.
 * I risultati possono essere immagini in base64: il body di questa rotta accetta fino a 60 MB (vedi app.ts).
 */

const router: IRouter = Router();

router.use("/ponte/ideax", (req, res, next) => {
  if (!process.env.IDEAX_KEY) return res.status(503).json({ error: "ponte_non_configurato", message: "Manca IDEAX_KEY nei Secrets di IDEAgame" });
  if (!chiaveIdeax(req.header("x-ideax-key"))) return res.status(401).json({ error: "chiave_non_valida" });
  return next();
});

router.get("/ponte/ideax/stato", async (_req, res) => {
  const s = await statoIdeax();
  return res.json({ acceso: s.acceso, capacita: s.contatto?.capacita ?? [], versione: s.contatto?.versione ?? null, visto: s.contatto?.visto ?? null });
});

router.get("/ponte/ideax/lavori", async (req, res) => {
  const capacita = String(req.query.capacita ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const versione = req.header("x-ideax-versione") ?? null;
  const attendi = Math.min(25, Math.max(0, Number(req.query.attendi) || 0)) * 1000;
  const fine = Date.now() + attendi;
  try {
    await segnaContatto(capacita, versione);
    for (;;) {
      const lavori = await prendiLavori(capacita, 1);
      if (lavori.length || Date.now() >= fine || req.socket.destroyed) return res.json({ lavori });
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  } catch (err) {
    console.error("ponte ideax: lettura lavori fallita", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ponte/ideax/lavori/:id", async (req, res) => {
  try {
    const ok = await consegna(String(req.params.id), req.body ?? {});
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "lavoro_non_trovato" });
  } catch (err) {
    console.error("ponte ideax: consegna fallita", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── CSRF: controllo dell'ORIGINE sulle richieste che cambiano stato ──────────
   Il login vive in un cookie (ideagame.sid, SameSite=Lax). Lax blocca già i POST
   cross-site "classici", ma non i siti dello stesso "site" (sottodomini) né i
   browser che non rispettano SameSite. Qui c'è la seconda difesa raccomandata da
   OWASP per le app con cookie e chiamate fetch/JSON: per ogni POST/PUT/PATCH/DELETE
   che porta il cookie di sessione, l'origine (Origin, o in mancanza Referer)
   deve essere quella dell'app stessa — le stesse origini ammesse dal CORS
   (stesso host, domini Replit, Secret CORS_ORIGINI).

   Chi NON porta il cookie (ponti con X-Ponte-Key, webhook, telefoni dei giocatori
   senza login) non è toccato: senza cookie non c'è sessione da rubare.
   Un client senza Origin né Referer (programma, non browser) passa, a meno che il
   browser dichiari Sec-Fetch-Site: cross-site.
──────────────────────────────────────────────────────────────────────────── */

import type { Request, Response, NextFunction } from "express";
import { decidiCsrf } from "../lib/corsOrigini";

export function csrfOrigine(req: Request, res: Response, next: NextFunction): void {
  const esito = decidiCsrf({
    method: req.method,
    cookie: req.header("Cookie"),
    origin: req.header("Origin"),
    referer: req.header("Referer"),
    secFetchSite: req.header("Sec-Fetch-Site"),
    host: req.header("X-Forwarded-Host") ?? req.header("Host"),
  });
  if (esito.ok) { next(); return; }
  res.status(403).json({ error: `Richiesta bloccata (CSRF): ${esito.motivo}.` });
}

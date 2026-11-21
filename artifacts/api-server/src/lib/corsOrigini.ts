/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import type { Request } from "express";
import type { CorsOptions } from "cors";

/**
 * CORS con credenziali SOLO per le origini dell'app stessa.
 * Prima era `origin: true`: il server rimandava indietro qualunque Origin
 * insieme a `Access-Control-Allow-Credentials: true`, cioè qualunque sito
 * poteva chiamare le API con la sessione dell'utente.
 *
 * Origini ammesse: lo stesso host della richiesta, i domini che Replit assegna
 * a questa app (REPLIT_DOMAINS, REPLIT_DEV_DOMAIN) e quelli elencati nel
 * Secret facoltativo CORS_ORIGINI (separati da virgola, es. https://ideagame.it).
 */
function origineAmmessa(origin: string, host: string | undefined): boolean {
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (host && url.host === host) return true;
  const domini = [
    ...(process.env["REPLIT_DOMAINS"] ?? "").split(","),
    process.env["REPLIT_DEV_DOMAIN"] ?? "",
  ].map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (url.protocol === "https:" && domini.includes(url.host.toLowerCase())) return true;
  const elenco = (process.env["CORS_ORIGINI"] ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  return elenco.includes(url.origin);
}

export function corsPerRichiesta(req: Request, cb: (err: Error | null, options?: CorsOptions) => void): void {
  const origin = req.header("Origin");
  const host = req.header("X-Forwarded-Host") ?? req.header("Host");
  cb(null, { credentials: true, origin: origin ? origineAmmessa(origin, host) : false });
}

export const _origineAmmessa = origineAmmessa;

/* ─── CSRF: decisione pura sull'origine (usata da middlewares/csrf.ts) ───────── */
export const COOKIE_SESSIONE = "ideagame.sid";
const METODI_SICURI = new Set(["GET", "HEAD", "OPTIONS"]);

export type RichiestaCsrf = {
  method: string;
  cookie?: string | undefined;
  origin?: string | undefined;
  referer?: string | undefined;
  secFetchSite?: string | undefined;
  host?: string | undefined;
};

export type EsitoCsrf = { ok: true } | { ok: false; motivo: string };

function haCookieSessione(cookie: string | undefined): boolean {
  if (!cookie) return false;
  return cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE_SESSIONE}=`));
}

/** Decisione pura (testabile senza server). */
export function decidiCsrf(r: RichiestaCsrf): EsitoCsrf {
  if (METODI_SICURI.has(r.method.toUpperCase())) return { ok: true };
  if (!haCookieSessione(r.cookie)) return { ok: true };
  if (r.origin) {
    if (r.origin === "null") return { ok: false, motivo: "origine opaca" };
    return origineAmmessa(r.origin, r.host) ? { ok: true } : { ok: false, motivo: "origine non ammessa" };
  }
  if (r.referer) {
    let origine: string;
    try { origine = new URL(r.referer).origin; } catch { return { ok: false, motivo: "referer non valido" }; }
    return origineAmmessa(origine, r.host) ? { ok: true } : { ok: false, motivo: "referer non ammesso" };
  }
  if ((r.secFetchSite ?? "").toLowerCase() === "cross-site") return { ok: false, motivo: "richiesta cross-site" };
  return { ok: true };
}


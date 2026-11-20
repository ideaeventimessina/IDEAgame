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

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * PONTE SUITE ⇄ CASINÒ — logica PURA (niente express, niente db).
 *
 * Tenuta qui a parte così è testabile da sola con `node --test` (niente mock del
 * database, niente server). Le tre cose che il contratto chiama "sicure" vivono
 * tutte qui: confronto chiave a tempo costante, "la base delle fiche una volta
 * sola per playerId", e lo strip del gettone dall'indirizzo del browser.
 */

import { timingSafeEqual } from "node:crypto";

/* Confronto della chiave a TEMPO COSTANTE (come il ponte IDEAeventi): non fa
 * trapelare dai tempi di risposta quanti caratteri iniziali combaciano. Lunghezze
 * diverse = diverso (timingSafeEqual pretende buffer di pari lunghezza). Qui lo
 * usiamo SOLO se un domani una rotta ricevesse la chiave da fuori: in questo ponte
 * IDEAgame è il CLIENT e la chiave la MANDA, non la riceve. */
export function chiaveCombacia(fornita: string, segreto: string): boolean {
  if (!segreto) return false;
  const a = Buffer.from(String(fornita ?? ""));
  const b = Buffer.from(segreto);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* Mappa playerId-Suite → giocatore del casinò + flag "base già concessa". Vive
 * nel config jsonb della serata (niente migrazioni). */
export type SuitePlayerLink = { casinoPlayerId: string; baseGranted: boolean };
export type SuitePlayerMap = Record<string, SuitePlayerLink>;

/** La base delle fiche si concede UNA sola volta per playerId. Ritorna true se
 *  è GIA' stata concessa (quindi NON va riaccreditata: lo stesso ospite che
 *  torna dal feed tiene il saldo che ha). */
export function baseGiaConcessa(map: SuitePlayerMap | undefined, playerId: string): boolean {
  const e = map?.[playerId];
  return !!e && e.baseGranted === true;
}

/** Il giocatore del casinò già legato a questo playerId, se c'è. */
export function giocatoreLegato(map: SuitePlayerMap | undefined, playerId: string): string | null {
  return map?.[playerId]?.casinoPlayerId ?? null;
}

/** Nickname dal nome Suite: se la festa NON passa il nome (privacy), torna null
 *  e il casinò lo chiederà da sé col flusso esistente (JoinView). */
export function nicknameDaSuite(nome: string | null | undefined): string | null {
  const n = String(nome ?? "").trim();
  return n ? n.slice(0, 30) : null;
}

/** Fiche iniziali sane: intero, non negativo, con un tetto (come il resto del casinò). */
export function fichesInizialiSane(v: unknown, fallback = 500): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100000, Math.max(0, n));
}

/** Toglie il gettone (`?g=…`) dall'indirizzo, lasciando intatto il resto: è quello
 *  che il browser deve mostrare dopo il riscatto, così il gettone non resta
 *  copiabile dalla barra. Pura: lavora su una stringa, torna una stringa. */
export function urlSenzaGettone(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete("g");
    // ricompone path?query#hash relativo quando possibile (replaceState vuole same-origin)
    return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
  } catch {
    // href relativo o malformato: taglia a mano il parametro g
    const [path, query = ""] = href.split("?");
    if (!query) return href;
    const rest = query
      .split("&")
      .filter((kv) => kv !== "g" && !kv.startsWith("g="))
      .join("&");
    return rest ? `${path}?${rest}` : (path ?? href);
  }
}

/** Mappa un errore della Suite sul nostro corpo uniforme. 401/404/410/409/429 come
 *  da contratto; tutto il resto → 502 (la Suite ha risposto male). */
export function erroreDaSuite(status: number): { status: number; errore: string } {
  switch (status) {
    case 401: return { status: 401, errore: "chiave" };
    case 404: return { status: 404, errore: "non_trovato" };
    case 410: return { status: 410, errore: "scaduto" };
    case 409: return { status: 409, errore: "gia_collegata" };
    case 429: return { status: 429, errore: "rate_limit" };
    default:  return { status: 502, errore: "suite_ko" };
  }
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Serata Home: gettone d'organizzatore e gettoni dei giocatori ─────────────
   Prima, conoscendo l'id della serata (che gira su ogni telefono), chiunque poteva
   chiuderla, cancellarla o riscrivere i punteggi di tutti. Ora:
     - chi CREA la serata riceve un gettone d'organizzatore (header x-host-token):
       solo lui chiude (/end, /champion) e cancella (DELETE);
     - ogni giocatore che entra riceve il suo gettone (header x-player-token):
       può solo AGGIUNGERE punti a sé stesso, poco alla volta;
     - l'organizzatore (la TV) può impostare i punteggi come prima.
   I gettoni sono HMAC firmati col segreto del server (SESSION_SECRET): niente da
   salvare nel DB, nessuna colonna nuova. Le serate nate prima di questa modifica
   (senza il segno `gettoni` nel loro config) restano col comportamento di prima
   fino alla loro scadenza naturale (poche ore). */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SEGNO_GETTONI = "gettoni";          // gameConfig.gettoni = 1 sulle serate nuove
export const MAX_AUMENTO_GIOCATORE = 1000;       // punti che un telefono può aggiungersi per volta
export const MAX_PUNTEGGIO = 1_000_000;

export function creaGettoni(segreto: string) {
  if (!segreto) throw new Error("segreto mancante");
  const chiave = createHmac("sha256", "ideagame-gettoni-v1").update(segreto).digest();
  const firma = (testo: string) => createHmac("sha256", chiave).update(testo).digest("base64url");
  return {
    host: (sessionId: string) => firma(`host:${sessionId}`),
    giocatore: (playerId: string) => firma(`player:${playerId}`),
  };
}

export function uguali(fornito: unknown, atteso: string): boolean {
  if (typeof fornito !== "string") return false;
  const a = Buffer.from(fornito), b = Buffer.from(atteso);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const serataConGettoni = (gameConfig: unknown): boolean =>
  !!gameConfig && typeof gameConfig === "object" && (gameConfig as Record<string, unknown>)[SEGNO_GETTONI] === 1;

export type EsitoPunteggio = { ok: true } | { ok: false; status: 400 | 401 | 403; error: string };

/** Chi può impostare `nuovo` come punteggio del giocatore `playerId`. */
export function decidiPunteggio(p: {
  conGettoni: boolean;   // serata nuova (altrimenti comportamento di prima)
  host: boolean;         // gettone d'organizzatore valido
  giocatore: boolean;    // gettone del giocatore `playerId` valido
  attuale: number;
  nuovo: number;
}): EsitoPunteggio {
  if (!Number.isFinite(p.nuovo) || p.nuovo < 0 || p.nuovo > MAX_PUNTEGGIO) return { ok: false, status: 400, error: "Punteggio non valido" };
  if (!p.conGettoni || p.host) return { ok: true };
  if (!p.giocatore) return { ok: false, status: 401, error: "Serve il gettone dell'organizzatore o del giocatore" };
  const aumento = p.nuovo - p.attuale;
  if (aumento < 0 || aumento > MAX_AUMENTO_GIOCATORE) {
    return { ok: false, status: 403, error: "Un giocatore può solo aggiungersi pochi punti alla volta" };
  }
  return { ok: true };
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Casinò: chi può fare cosa (parte pura, testata) ─────────────────────────
   Prima bastava conoscere l'id della serata (che gira in chiaro sui link della TV
   e dei giocatori) per leggere TUTTO: codice regia (masterCode), codici dei dealer,
   codici dei giocatori, i mazzi. Con un codice dealer si coniavano fiche senza
   limite. Ora:
     - le letture pubbliche (TV, telefoni) ricevono uno stato RIPULITO: nessun
       codice, nessun mazzo, nessun config grezzo;
     - le operazioni di regia sulla serata (/gestione/casino/sessions/:id/...)
       chiedono il codice regia nell'header `x-master-code`;
     - ogni accredito manuale di un dealer ha un tetto. */

import { timingSafeEqual } from "node:crypto";

/** Chiavi che non escono MAI nelle letture pubbliche, a qualunque profondità. */
export const CHIAVI_SEGRETE = new Set(["masterCode", "dealerCode", "playerCode", "shoe", "deck", "monitorKey", "eventToken", "config"]);

/** Copia profonda senza le chiavi segrete (le date diventano stringhe, come in JSON). */
export function ripulisci<T>(valore: T): T {
  const vai = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(vai);
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!CHIAVI_SEGRETE.has(k)) out[k] = vai(x);
      return out;
    }
    return v;
  };
  return vai(valore) as T;
}

export type TipoAccesso = "pubblico" | "pubblico-ripulito" | "regia";

/** Per le rotte /gestione/casino/sessions/:id[/...]: `sotto` è il pezzo dopo l'id ("/" o "/players"...). */
export function accessoRichiesto(metodo: string, sotto: string): TipoAccesso {
  const m = metodo.toUpperCase();
  const p = (sotto || "/").replace(/\/+$/, "") || "/";
  if (m === "POST" && p === "/players") return "pubblico";   // iscrizione dal QR della serata
  if (m === "GET" || m === "HEAD") return "pubblico-ripulito"; // TV, telefoni, elenco tavoli
  return "regia";                                              // setup, tavoli, dealer, fine serata…
}

export function codiceRegiaValido(fornito: unknown, masterCode: string | null | undefined): boolean {
  if (typeof fornito !== "string" || !masterCode) return false;
  const a = Buffer.from(fornito.trim().toUpperCase()), b = Buffer.from(masterCode.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tetto di un singolo accredito manuale del dealer: 4× le fiche iniziali, almeno 1000. */
export function tettoDealer(fichesIniziali: number | null | undefined): number {
  const base = Number.isFinite(fichesIniziali as number) ? Number(fichesIniziali) : 500;
  return Math.max(1000, Math.round(base * 4));
}

export function accreditoDealerAmmesso(delta: number, fichesIniziali: number | null | undefined): boolean {
  return delta <= tettoDealer(fichesIniziali);
}

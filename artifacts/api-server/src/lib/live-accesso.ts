/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Regia Live: chi può leggere e chi può comandare (parte pura, testata) ─────
   Prima: (1) il codice TV restituiva anche il codice presentatore, quindi chi
   vedeva la TV poteva comandare la serata; (2) un utente loggato di QUALUNQUE
   tenant leggeva, comandava, modificava o cancellava le sessioni Live degli altri.
   Ora:
     - staff = super_admin, oppure utente dello STESSO tenant della sessione
       (o il suo creatore, se la sessione non ha tenant);
     - codice presentatore = può comandare; codice TV = può solo guardare;
     - il codice presentatore esce solo verso staff e presentatore. */

export type SessioneLive = { tenantId: string | null; createdBy: string | null; tvCode: string; presenterCode: string };
export type UtenteLive = { id: string; role: string; tenantId: string | null } | null | undefined;
export type Ruolo = "staff" | "presenter" | "tv" | null;

export function ruoloLive(s: SessioneLive, utente: UtenteLive, codice: string | null | undefined): Ruolo {
  if (utente) {
    if (utente.role === "super_admin") return "staff";
    if (s.tenantId ? utente.tenantId === s.tenantId : s.createdBy === utente.id) return "staff";
  }
  const c = (codice ?? "").toUpperCase().trim();
  if (c && c === s.presenterCode.toUpperCase()) return "presenter";
  if (c && c === s.tvCode.toUpperCase()) return "tv";
  return null;
}

export type Livello = "lettura" | "comando" | "gestione";

/** lettura: tutti i ruoli; comando: staff o presentatore; gestione (modifica/cancella): solo staff. */
export function puo(ruolo: Ruolo, livello: Livello): boolean {
  if (!ruolo) return false;
  if (livello === "lettura") return true;
  if (livello === "comando") return ruolo === "staff" || ruolo === "presenter";
  return ruolo === "staff";
}

/** La sessione come la vede quel ruolo: la TV non riceve il codice presentatore. */
export function sessionePer<T extends { presenterCode?: string }>(s: T, ruolo: Ruolo): T {
  if (ruolo === "staff" || ruolo === "presenter") return s;
  const { presenterCode: _nascosto, ...resto } = s;
  return resto as T;
}

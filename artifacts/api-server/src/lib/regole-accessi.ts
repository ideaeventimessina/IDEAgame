/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Accessi fra tenant, Jonny Creator, ponte Suite, login (regole pure) ──────
   Testate in regole-accessi.test.ts. */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

/** Il super admin (senza tenant) vede tutto; gli altri solo le righe del proprio tenant. */
export function stessoTenant(utente: { role: string; tenantId: string | null }, tenantRiga: string | null | undefined): boolean {
  if (utente.role === "super_admin") return true;
  return !!utente.tenantId && tenantRiga === utente.tenantId;
}

/* ── Jonny Creator ──────────────────────────────────────────────────────────── */

/** Stati che si possono impostare a mano su una voce generata ("imported" lo
 *  mette solo l'import, così l'import resta l'unico a creare i set). */
export const STATI_VOCE_MODIFICABILI = ["draft", "approved", "rejected"] as const;
export const statoVoceValido = (s: unknown): boolean =>
  typeof s === "string" && (STATI_VOCE_MODIFICABILI as readonly string[]).includes(s);

/** Una voce già importata non crea un secondo set: si restituisce il primo. */
export const giaImportata = (v: { status: string; targetEntityId: string | null }): boolean =>
  v.status === "imported" && !!v.targetEntityId;

/* ── Ponte Suite del casinò ─────────────────────────────────────────────────── */

/** L'elenco feste va solo alla regia, e senza i gettoni d'ingresso degli ospiti. */
export function festeSenzaGettoni(data: unknown): unknown {
  const pulisci = (f: unknown) => {
    if (!f || typeof f !== "object") return f;
    const { eventToken: _t, token: _k, ...resto } = f as Record<string, unknown>;
    return resto;
  };
  if (Array.isArray(data)) return data.map(pulisci);
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)["feste"])) {
    return { ...(data as Record<string, unknown>), feste: ((data as Record<string, unknown>)["feste"] as unknown[]).map(pulisci) };
  }
  return data;
}

/* ── Socket: volume ─────────────────────────────────────────────────────────── */

/** Stanze a cui inoltrare il volume: solo quelle della propria serata (mai a tutti). */
export function stanzeVolume(stanze: Iterable<string>, socketId: string): string[] {
  return [...stanze].filter(r => r !== socketId && /^(event|home|live):/.test(r));
}

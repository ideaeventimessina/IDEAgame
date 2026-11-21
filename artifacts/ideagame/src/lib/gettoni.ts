/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Gettoni di chi gestisce, aggiunti da soli alle chiamate API ──────────────
   - Casinò: il codice regia (masterCode) va nell'header `x-master-code` di ogni
     chiamata /api/gestione/casino/sessions/<id>/... della serata che si gestisce.
   - Serata Home: chi ha creato la serata (la TV) ha un gettone d'organizzatore
     (`x-host-token`); ogni telefono ha il suo gettone di giocatore (`x-player-token`).
   I gettoni stanno nel localStorage del dispositivo che li ha ricevuti, e partono
   solo verso il nostro server (URL relativi o stessa origine). Così non serve
   ritoccare le decine di fetch delle pagine: le intercetta una sola funzione. */

const K_CASINO = "ideagame:regia-casino:";
const K_HOST = "ideagame:host-token:";
const K_PLAYER = "ideagame:player-token:";

function salva(chiave: string, valore: string): void {
  try { localStorage.setItem(chiave, valore); } catch { /* private mode: resta in memoria */ memoria.set(chiave, valore); }
}
const memoria = new Map<string, string>();
function leggi(chiave: string): string | null {
  try { return localStorage.getItem(chiave) ?? memoria.get(chiave) ?? null; } catch { return memoria.get(chiave) ?? null; }
}

export const ricordaRegiaCasino = (sessionId: string, masterCode: string) => salva(K_CASINO + sessionId, masterCode.toUpperCase());
/** Header della regia del casinò per le chiamate fuori da /gestione/casino/sessions (ponte Suite). */
export const headerRegiaCasino = (sessionId: string): Record<string, string> => {
  const v = leggi(K_CASINO + sessionId.toLowerCase()) ?? leggi(K_CASINO + sessionId);
  return v ? { "x-master-code": v } : {};
};
export const ricordaHostHome = (sessionId: string, token: string) => salva(K_HOST + sessionId, token);
export const ricordaPlayerHome = (sessionId: string, token: string) => salva(K_PLAYER + sessionId, token);
/** Gettone del giocatore di questa serata (va anche nel socket: home:player_register). */
export const gettonePlayerHome = (sessionId: string): string | null => leggi(K_PLAYER + sessionId);

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const RE_CASINO = new RegExp(`/api/gestione/casino/sessions/${UUID}`, "i");
const RE_HOME = new RegExp(`/api/home/sessions/${UUID}`, "i");

/** Header da aggiungere per questo URL (vuoto se nessun gettone). Esportata per i test. */
export function headerPer(url: string): Record<string, string> {
  const h: Record<string, string> = {};
  const c = RE_CASINO.exec(url);
  if (c) { const v = leggi(K_CASINO + c[1]!.toLowerCase()) ?? leggi(K_CASINO + c[1]!); if (v) h["x-master-code"] = v; }
  const m = RE_HOME.exec(url);
  if (m) {
    const id = m[1]!;
    const host = leggi(K_HOST + id); if (host) h["x-host-token"] = host;
    const pl = leggi(K_PLAYER + id); if (pl) h["x-player-token"] = pl;
  }
  return h;
}

function stessaOrigine(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try { return new URL(url, window.location.href).origin === window.location.origin; } catch { return false; }
}

let installato = false;
export function installaGettoni(): void {
  if (installato || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installato = true;
  const originale = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!stessaOrigine(url)) return originale(input, init);
    const extra = headerPer(url);
    if (Object.keys(extra).length === 0) return originale(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    for (const [k, v] of Object.entries(extra)) if (!headers.has(k)) headers.set(k, v);
    return originale(input, { ...init, headers });
  };
}

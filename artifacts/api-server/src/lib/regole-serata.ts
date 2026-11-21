/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Serata Home: regole pure (testate in regole-serata.test.ts) ──────────────
   Decisioni senza database né timer, usate da routes/home.ts e da socket.ts:
     - una serata chiusa dall'organizzatore non rinasce con una chiamata anonima;
     - /start non aggira il blocco della vetrina demo;
     - risposte, voti e conferme valgono solo per i giocatori VERI della serata;
     - il Quizzone non resta senza domande quando il banco del gruppo è finito;
     - l'energia del Ballo ha un tetto e il vincitore è chi ha ballato di più;
     - chi ha rifiutato un livello dell'Adult Only resta fuori finché il livello resta alto;
     - il Gioco delle Coppie sceglie davvero un tema allo scadere del timer;
     - chi rientra con un nome già usato non prende il posto di chi sta giocando. */

/* ── Serata chiusa ──────────────────────────────────────────────────────────── */

/** Dopo /end (status "ended") restano ammesse solo letture, la cancellazione e
 *  la ripetizione della chiusura. `sotto` è il pezzo dopo /home/sessions/:id. */
export function bloccataDopoFine(status: unknown, metodo: string, sotto: string): boolean {
  if (status !== "ended") return false;
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS" || m === "DELETE") return false;
  const p = (sotto || "/").replace(/\/+$/, "") || "/";
  return !["/end", "/champion"].includes(p);
}

/* ── Vetrina demo ───────────────────────────────────────────────────────────── */

export const GIOCHI_SOLO_FULL = ["adult-only", "karaoke-battle", "lockdown"] as const;

/** Lo stesso blocco di select-game, usato anche da /start (prima lo aggirava). */
export function bloccatoInDemo(tier: "demo" | "full", gameSlug: string, selectedGames: unknown): boolean {
  if (tier !== "demo") return false;
  const sel = Array.isArray(selectedGames) ? selectedGames : [];
  const stanzaLockdown = sel.length === 1 && sel[0] === "lockdown";
  if (gameSlug === "lockdown" && stanzaLockdown) return false;
  return (GIOCHI_SOLO_FULL as readonly string[]).includes(gameSlug);
}

/* ── Giocatori veri ─────────────────────────────────────────────────────────── */

export type EsitoGiocatore = { ok: true } | { ok: false; status: 400 | 401 | 403; error: string };

/** Un playerId vale solo se è un giocatore della serata e, sulle serate con i
 *  gettoni, se la richiesta porta il gettone di QUEL giocatore. */
export function verificaGiocatore(p: {
  playerId: unknown;
  idSerata: ReadonlyArray<string>;   // id dei giocatori della serata
  conGettoni: boolean;
  gettoneValido: boolean;            // x-player-token corrisponde a playerId
}): EsitoGiocatore {
  if (typeof p.playerId !== "string" || !p.playerId) return { ok: false, status: 400, error: "playerId mancante" };
  if (!p.idSerata.includes(p.playerId)) return { ok: false, status: 403, error: "Giocatore non presente in questa serata" };
  if (p.conGettoni && !p.gettoneValido) return { ok: false, status: 401, error: "Serve il gettone del giocatore" };
  return { ok: true };
}

/** Chi deve ancora rispondere: conta solo le risposte dei giocatori attesi. */
export function hannoRispostoTutti(attesi: ReadonlyArray<string>, risposte: Iterable<string>): { risposte: number; tutti: boolean } {
  const set = new Set(attesi);
  let n = 0;
  for (const id of risposte) if (set.has(id)) n++;
  return { risposte: n, tutti: set.size > 0 && n >= set.size };
}

/* ── Quizzone: banco del gruppo finito ──────────────────────────────────────── */

/** Prima le domande mai viste; se non bastano si completa con quelle già viste
 *  (come SaraMusica RC4b), senza doppioni. Restituisce al massimo `n` elementi. */
export function riempiConGiaViste<T>(nuove: T[], tutte: T[], n: number, chiave: (x: T) => string): T[] {
  const out: T[] = [];
  const prese = new Set<string>();
  for (const q of [...nuove, ...tutte]) {
    if (out.length >= n) break;
    const k = chiave(q);
    if (prese.has(k)) continue;
    prese.add(k); out.push(q);
  }
  return out;
}

/* ── Ballo ──────────────────────────────────────────────────────────────────── */

/** Il telefono manda 0..100 (HomeJoin: min(100, ...)). Oltre è un falso. */
export const ENERGIA_MAX = 100;
export function limitaEnergia(e: unknown): number | null {
  if (typeof e !== "number" || !Number.isFinite(e)) return null;
  return Math.max(0, Math.min(ENERGIA_MAX, Math.round(e)));
}

/** Vincitore della sfida a solo: energia più alta fra i giocatori della serata. */
export function vincitoreSolo(energie: Record<string, number>, giocatori: ReadonlyArray<string>): string | null {
  let best: string | null = null, max = 0;
  for (const id of giocatori) { const e = energie[id] ?? 0; if (e > max) { max = e; best = id; } }
  return best;
}

/** Al resume la manche in corso va richiusa a fine tempo (prima il timer spariva). */
export function scadenzaMancheDaRiprendere(rp: Record<string, unknown>): number | null {
  if (rp["mode"] !== "home-ballo" || rp["balloPhase"] !== "dancing" || !rp["danceEndsAt"]) return null;
  const t = new Date(String(rp["danceEndsAt"])).getTime();
  return Number.isFinite(t) ? t : null;
}

/* ── Adult Only: rifiuto della salita di livello ────────────────────────────── */

/** Attivi per lo spin: consenso (opt-out) MENO chi ha rifiutato un livello che è
 *  ancora in vigore (`rifiuti[pid]` = livello rifiutato). */
export function attiviAdult(
  giocatori: ReadonlyArray<string>,
  consenso: Record<string, string>,
  rifiuti: Record<string, number>,
  livello: number,
): { attivi: string[]; spettatori: string[] } {
  const attivi = giocatori.filter(id =>
    consenso[id] !== "watch" && consenso[id] !== "leave" && !(rifiuti[id] !== undefined && livello >= rifiuti[id]!));
  return { attivi, spettatori: giocatori.filter(id => !attivi.includes(id)) };
}

/** Nuova mappa dei rifiuti dopo un'escalation verso `livello`. */
export function registraRifiuti(prima: Record<string, number>, rifiutati: ReadonlyArray<string>, livello: number): Record<string, number> {
  const out = { ...prima };
  for (const id of rifiutati) out[id] = Math.min(out[id] ?? livello, livello);
  return out;
}

/* ── Gioco delle Coppie: tema allo scadere ──────────────────────────────────── */

export type SceltaTema = { tipo: "set"; id: string; nome: string } | { tipo: "testo"; testo: string } | { tipo: "casuale" };

/** Proposte dei giocatori ({id,text}) e set del banco. Prima: il timer leggeva
 *  proposedThemes[].themeId (che non esiste) e partiva senza carte. Ora: il tema
 *  proposto più spesso (a parità, il più recente, come select-theme), altrimenti
 *  il primo set del banco, altrimenti un tema casuale delle parole interne. */
export function sceltaTemaCoppie(
  proposte: ReadonlyArray<{ text?: string; themeId?: string }>,
  sets: ReadonlyArray<{ id: string; name: string }>,
): SceltaTema {
  const conta = new Map<string, { n: number; ultimo: number; testo: string }>();
  proposte.forEach((p, i) => {
    const testo = String(p.text ?? "").trim();
    const setId = p.themeId && sets.some(s => s.id === p.themeId) ? p.themeId : null;
    const k = setId ? `set:${setId}` : testo ? `txt:${testo.toLowerCase()}` : "";
    if (!k) return;
    const c = conta.get(k) ?? { n: 0, ultimo: -1, testo: setId ?? testo };
    c.n++; c.ultimo = i; conta.set(k, c);
  });
  const top = [...conta.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ultimo - a[1].ultimo)[0];
  if (top) {
    if (top[0].startsWith("set:")) { const s = sets.find(x => x.id === top[1].testo)!; return { tipo: "set", id: s.id, nome: s.name }; }
    return { tipo: "testo", testo: top[1].testo };
  }
  if (sets[0]) return { tipo: "set", id: sets[0].id, nome: sets[0].name };
  return { tipo: "casuale" };
}

/* ── Ingresso con un nome già usato ─────────────────────────────────────────── */

/** "rientra": è lo stesso giocatore (presenta il suo gettone), oppure il nome è di
 *  un giocatore DISCONNESSO (telefono cambiato o memoria persa: scelta di prodotto
 *  di Andrea, riprende il suo punteggio). "occupato": il nome è di qualcuno che sta
 *  giocando adesso e la richiesta non ha il suo gettone — prima gli si consegnavano
 *  id e gettone, e chiunque poteva giocare al suo posto. */
export function decidiRientro(p: { gettoneValido: boolean; connesso: boolean }): "rientra" | "occupato" {
  if (p.gettoneValido) return "rientra";
  return p.connesso ? "occupato" : "rientra";
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * CASINÒ — logica di SALDO/PAGAMENTO atomica e idempotente (niente express, niente db).
 *
 * Tenuta qui a parte così è testabile da sola con `node --test` (niente mock del
 * database, niente server). Il contratto è: ogni movimento di fiche è UNA chiamata
 * atomica (`FishTx.pay` = UPDATE condizionale del saldo + INSERT ledger insieme) e
 * la risoluzione di un giro/mano/corsa è IDEMPOTENTE (un retry non ripaga).
 *
 * NIENTE regole/importi/payout sono cambiati qui: solo la MECCANICA di persistenza.
 * Le quote (PAYOUT roulette, 3:2 del blackjack, 6× dell'ippodromo) e l'esito delle
 * puntate restano identici a prima: sono solo stati spostati qui per poterli testare.
 */

/* ── Roulette: numeri rossi e quote (PROFITTO per 1 fiche; accredito = amount*(mult+1)) ── */
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const PAYOUT: Record<string, number> = {
  straight: 35, split: 17, red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1,
  dozen1: 2, dozen2: 2, dozen3: 2, col1: 2, col2: 2, col3: 2,
};
export function betWins(kind: string, numbers: number[], r: number): boolean {
  switch (kind) {
    case "straight": case "split": return numbers.includes(r);
    case "red": return RED.has(r);
    case "black": return r !== 0 && !RED.has(r);
    case "even": return r !== 0 && r % 2 === 0;
    case "odd": return r % 2 === 1;
    case "low": return r >= 1 && r <= 18;
    case "high": return r >= 19 && r <= 36;
    case "dozen1": return r >= 1 && r <= 12;
    case "dozen2": return r >= 13 && r <= 24;
    case "dozen3": return r >= 25 && r <= 36;
    case "col1": return r !== 0 && r % 3 === 1;
    case "col2": return r !== 0 && r % 3 === 2;
    case "col3": return r !== 0 && r % 3 === 0;
    default: return false;
  }
}

/* ── Blackjack: esito della mano e accredito (invariati) ── */
export type BjOutcome = "win" | "lose" | "push" | "blackjack" | "bust";
/** Esito della mano del giocatore (identico alla logica originale di finishBjHand). */
export function bjOutcome(status: string, playerTotal: number, dealerTotal: number, dealerBJ: boolean): BjOutcome {
  if (status === "bust") return "bust";
  if (status === "blackjack") return dealerBJ ? "push" : "blackjack";
  if (dealerBJ) return "lose";
  if (dealerTotal > 21) return "win";
  if (playerTotal > dealerTotal) return "win";
  if (playerTotal < dealerTotal) return "lose";
  return "push";
}
/** Accredito al giocatore (puntata inclusa). bet multiplo di 10 ⇒ sempre intero. */
export function creditFor(outcome: string, bet: number): number {
  if (outcome === "win") return bet * 2;                     // puntata + profitto 1:1
  if (outcome === "blackjack") return bet + (bet * 3) / 2;   // puntata + profitto 3:2
  if (outcome === "push") return bet;                        // restituzione
  return 0;                                                   // lose | bust
}

/* ── Ippodromo ── */
export const HORSE_MULT = 6;

/* ════════════════════════════════════════════════════════════════════════════
   MECCANICA ATOMICA DEI SOLDI
   ════════════════════════════════════════════════════════════════════════════ */

/** Un singolo movimento di fiche: saldo += delta (+ riga di ledger). */
export type FishMove = {
  playerId: string;
  delta: number;                 // >0 accredito, <0 addebito
  kind: string;                  // etichetta ledger (es. "roulette_win")
  tableId?: string | null;
  dealerCode?: string;
  requireFunds?: boolean;        // per le USCITE: l'UPDATE deve fallire se scopre il saldo
};

/**
 * Astrazione MINIMA della persistenza dei soldi dentro UNA transazione.
 * In produzione la implementa un adapter sopra la transazione Drizzle (UPDATE
 * atomico `fish_balance = fish_balance + delta` + INSERT nel ledger). Nei test la
 * implementa un finto store in-memory che sa anche annullare tutto (rollback) per
 * simulare un crash a metà dei pagamenti.
 *
 * Contratto di `pay`: eseguire UPDATE saldo e INSERT ledger come un'unità; se
 * `requireFunds` e il saldo non basta (o il giocatore non esiste) NON toccare
 * nulla e ritornare `null`. Altrimenti ritornare il nuovo saldo.
 */
export interface FishTx {
  pay(move: FishMove): Promise<number | null>;
}

/**
 * Paga una lista di movimenti nell'ordine dato. Se una `pay` lancia (crash/kill),
 * l'eccezione sale e la transazione del chiamante annulla TUTTI i movimenti già
 * applicati: nessun pagamento parziale, saldo e ledger restano allineati.
 */
export async function payAll(tx: FishTx, moves: FishMove[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (const m of moves) out.push(await tx.pay(m));
  return out;
}

/** Calcola i pagamenti dei vincitori della roulette (nessun effetto: solo dati). */
export function rouletteWinMoves(
  bets: ReadonlyArray<{ playerId: string; kind: string; numbers: number[]; amount: number }>,
  r: number,
): FishMove[] {
  const moves: FishMove[] = [];
  for (const b of bets) {
    if (betWins(b.kind, b.numbers, r)) {
      const payout = b.amount * (PAYOUT[b.kind]! + 1);
      moves.push({ playerId: b.playerId, delta: payout, kind: "roulette_win", tableId: null });
    }
  }
  return moves;
}

/** Pagamenti dei vincitori dell'ippodromo (cavallo == vincitore ⇒ amount*6). */
export function horseWinMoves(
  bets: ReadonlyArray<{ playerId: string; horse: number; amount: number }>,
  winner: number,
): FishMove[] {
  const moves: FishMove[] = [];
  for (const b of bets) {
    const credit = b.horse === winner ? b.amount * HORSE_MULT : 0;
    if (credit > 0) moves.push({ playerId: b.playerId, delta: credit, kind: "horse_win", tableId: null });
  }
  return moves;
}

/* ════════════════════════════════════════════════════════════════════════════
   IDEMPOTENZA — un giro/mano/corsa si salda UNA sola volta
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * true se questa unità di gioco è GIA' stata saldata (quindi NON va ripagata).
 * `marker` è il numero del giro/mano/corsa già pagato, persistito nel tavolo (jsonb,
 * niente migrazioni); `current` è il giro/mano/corsa che si sta risolvendo adesso.
 * È lo stesso schema del token `lastToken` già usato in Corsa Siciliana.
 */
export function alreadySettled(marker: number | null | undefined, current: number): boolean {
  return marker != null && marker === current;
}

/**
 * Decisione idempotente per la roulette: si paga solo se il tavolo è ancora in
 * "betting" (sotto lock di riga della serata). Un secondo /spin sullo stesso giro
 * vede "result" e non ripaga.
 */
export function rouletteCanSpin(phase: string): boolean {
  return phase === "betting";
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFIG JSONB — scrittura mirata di UN tavolo senza sovrascrivere gli altri
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Inserisce/aggiorna UN tavolo dentro il suo bucket nel config della serata,
 * lasciando intatti tutti gli altri tavoli (e gli altri bucket). Usata SOTTO lock
 * di riga su casino_sessions: due operazioni serializzate su tavoli diversi della
 * stessa serata preservano entrambe (fix della sovrascrittura del §5 del report).
 */
export function putTable<Cfg extends Record<string, unknown>>(
  cfg: Cfg, bucket: string, table: { id: string },
): Cfg {
  const prev = (cfg[bucket] ?? {}) as Record<string, unknown>;
  return { ...cfg, [bucket]: { ...prev, [table.id]: table } };
}

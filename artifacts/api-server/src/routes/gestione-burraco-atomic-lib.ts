/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * BURRACO — invio punteggio manche, atomico e idempotente (niente express, niente db).
 *
 * Il problema (report §7a): il guard `if (a.submitted) 409` è un TOCTOU — due invii
 * concorrenti leggono entrambi `submitted=false`, passano, e sommano i punteggi DUE
 * volte; e se il processo muore fra `submitted=true` e gli `addToPair`, la manche
 * risulta inviata ma i totali NON sono incrementati → punteggi persi per sempre.
 *
 * Soluzione: una sola transazione che (1) prova a marcare `submitted` con un UPDATE
 * CONDIZIONALE `... WHERE submitted=false RETURNING` e, SOLO se ha marcato davvero
 * (prima volta), (2) applica i delta ai totali con UPDATE atomici. Se 0 righe
 * marcate → già inviato, esci senza contare nulla.
 */

/**
 * Astrazione MINIMA della persistenza del punteggio dentro UNA transazione.
 * In produzione la implementa un adapter sopra la transazione Drizzle; nei test un
 * finto store in-memory che sa annullare tutto (rollback) per simulare un crash.
 */
export interface ScoreTx {
  /**
   * UPDATE burraco_assignments SET submitted=true, scoreA, scoreB
   *   WHERE id = aid AND submitted = false  RETURNING id
   * Ritorna true se ha marcato (PRIMA volta), false se era già inviato (0 righe).
   * È il claim atomico che sostituisce il guard TOCTOU.
   */
  claim(aid: string, scoreA: number, scoreB: number): Promise<boolean>;
  /** UPDATE burraco_pairs SET total_score = total_score + delta WHERE id = pairId (atomico). */
  addToPair(pairId: string, delta: number): Promise<void>;
}

export type ScoreAssignment = { id: string; pairAId: string | null; pairBId: string | null };

/**
 * Invia il punteggio di una manche UNA sola volta. Ritorna:
 *  - "ok"      → marcato adesso e totali incrementati (nella stessa transazione);
 *  - "already" → già inviato in precedenza, nessun doppio conteggio.
 *
 * Se un `addToPair` lancia (crash), l'eccezione sale e la transazione del chiamante
 * annulla ANCHE il `claim`: la manche NON resta marcata senza punteggi applicati
 * (niente punteggi persi, il reinvio è ancora possibile).
 */
export async function submitScoreOnce(
  tx: ScoreTx, a: ScoreAssignment, scoreA: number, scoreB: number,
): Promise<"ok" | "already"> {
  const sA = Math.round(scoreA);
  const sB = Math.round(scoreB);
  const claimed = await tx.claim(a.id, sA, sB);
  if (!claimed) return "already";
  if (a.pairAId) await tx.addToPair(a.pairAId, sA);
  if (a.pairBId) await tx.addToPair(a.pairBId, sB);
  return "ok";
}

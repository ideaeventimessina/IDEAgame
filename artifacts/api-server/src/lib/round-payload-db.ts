/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Scritture concorrenti sul roundPayload della serata Home ────────────────
   Voti, proposte e conferme arrivano da più telefoni nello stesso istante. Prima
   ognuno leggeva il roundPayload, aggiungeva il suo pezzo e riscriveva TUTTO:
   l'ultimo cancellava gli altri (voti persi, proposte sparite, doppio avvio).
   Qui la riga è bloccata (SELECT ... FOR UPDATE) per tutta la decisione e si
   scrivono solo le chiavi cambiate (round_payload || patch), nella stessa
   transazione. `decidi` è pura: riceve il roundPayload attuale (null se la serata
   non esiste) e restituisce le chiavi da scrivere e il risultato per la rotta. */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type Rp = Record<string, unknown>;

export async function mutaRoundPayload<R>(
  sessionId: string,
  decidi: (rp: Rp | null) => { patch?: Rp; risultato: R },
): Promise<R> {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`SELECT round_payload FROM home_sessions WHERE id = ${sessionId} FOR UPDATE`);
    const riga = (r.rows as Array<{ round_payload: Rp | null }>)[0];
    const { patch, risultato } = decidi(riga ? (riga.round_payload ?? {}) : null);
    if (riga && patch && Object.keys(patch).length > 0) {
      await tx.execute(sql`
        UPDATE home_sessions
        SET round_payload = COALESCE(round_payload, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
        WHERE id = ${sessionId}`);
    }
    return risultato;
  });
}

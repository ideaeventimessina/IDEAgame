/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Memoria "già visto" PERSISTENTE per GRUPPO ──────────────────────────────
   Perché il gruppo e non il singolo: in Home i giocatori entrano con un nickname
   per festa, non hanno account → non c'è identità stabile tra feste diverse. È il
   GRUPPO (la famiglia / il cliente ricorrente del gestionale) che non deve mai
   rivedere lo stesso turno. La chiave di gruppo la passa chi avvia la partita
   (host o IDEAeventi con l'id del cliente/preventivo).

   Persistenza senza migrazione: riusa game_media_slots (come la cache immagini).
   gameSlug = "_usedcontent", slotKey = `${groupKey}:${game}`, value = JSON array. */

import { db, gameMediaSlotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const SLUG = "_usedcontent";
const CAP = 800; // tetto per gruppo/gioco: tante manche, ma non cresce all'infinito

function key(groupKey: string, game: string): string {
  return `${groupKey}:${game}`.slice(0, 220);
}

/** Legge le chiavi già viste da un gruppo per un gioco. [] se nessuna. */
export async function getGroupUsed(groupKey: string, game: string): Promise<string[]> {
  if (!groupKey) return [];
  try {
    const [row] = await db.select().from(gameMediaSlotsTable)
      .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, key(groupKey, game))))
      .limit(1);
    if (!row?.value) return [];
    const arr = JSON.parse(row.value) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch { return []; }
}

/** Aggiunge chiavi viste (dedup + cap) per un gruppo/gioco. No-op senza groupKey. */
export async function addGroupUsed(groupKey: string, game: string, newKeys: string[]): Promise<void> {
  if (!groupKey || newKeys.length === 0) return;
  try {
    const cur = await getGroupUsed(groupKey, game);
    const merged = Array.from(new Set([...cur, ...newKeys])).slice(-CAP);
    const value = JSON.stringify(merged);
    const slotKey = key(groupKey, game);
    const [existing] = await db.select().from(gameMediaSlotsTable)
      .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, slotKey)))
      .limit(1);
    if (existing) {
      await db.update(gameMediaSlotsTable).set({ value })
        .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, slotKey)));
    } else {
      await db.insert(gameMediaSlotsTable).values({ gameSlug: SLUG, slotKey, value, valueType: "json", label: `used ${game}` });
    }
  } catch { /* best-effort: se salta, si ricade sull'anti-ripetizione di sessione */ }
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON IL GESTIONALE IDEAEVENTI — collegamento al database.
 * La logica (chiave, validazione, idempotenza, manifest) sta in
 * ponte-ideaeventi-lib.ts; qui c'è solo l'archivio vero su home_sessions.
 * Secret: PONTE_IDEAEVENTI_KEY (header x-ponte-key).
 */

import { and, eq, ne, desc, sql } from "drizzle-orm";
import { db, eventsTable, homeSessionsTable } from "@workspace/db";
import { creaRouterPonteIdeaeventi, type ArchivioPonte } from "./ponte-ideaeventi-lib";

function codiceNuovo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const aperta = (riferimento: string) => and(
  sql`${homeSessionsTable.gameConfig}->>'groupKey' = ${riferimento}`,
  ne(homeSessionsTable.status, "ended"),
);

const archivio: ArchivioPonte = {
  async trovaAperta(riferimento) {
    const [gia] = await db.select({ id: homeSessionsTable.id, joinCode: homeSessionsTable.joinCode })
      .from(homeSessionsTable).where(aperta(riferimento))
      .orderBy(desc(homeSessionsTable.createdAt)).limit(1);
    return gia ?? null;
  },
  async crea({ festa, riferimento, maxPlayers, expiresAt }) {
    /* Codice unico nel database: se capita collisione (join_code è unique), si ritenta. */
    for (let giro = 0; giro < 6; giro++) {
      try {
        const [riga] = await db.insert(homeSessionsTable).values({
          joinCode: codiceNuovo(),
          hostName: festa,
          maxPlayers,
          status: "lobby",
          expiresAt,
          gameConfig: {
            phase: "join", gamesPlayed: [], preloadedRounds: [], selectedGames: [],
            matchDuration: "normal", tier: "full", groupKey: riferimento,
          },
        }).returning({ id: homeSessionsTable.id, joinCode: homeSessionsTable.joinCode });
        if (riga) return riga;
      } catch (e: unknown) {
        if ((e as { code?: string } | null)?.code !== "23505") throw e;
      }
    }
    return null;
  },
  async chiudi(riferimento) {
    const chiuse = await db.update(homeSessionsTable).set({ status: "ended" })
      .where(aperta(riferimento)).returning({ id: homeSessionsTable.id });
    // Compatibilità: eventuali vecchi eventi Live aperti con lo stesso riferimento.
    await db.update(eventsTable).set({ status: "ended" })
      .where(and(eq(eventsTable.venue, riferimento), eq(eventsTable.status, "live")));
    return chiuse.length;
  },
};

export default creaRouterPonteIdeaeventi({
  chiave: () => process.env["PONTE_IDEAEVENTI_KEY"] ?? "",
  archivio,
});

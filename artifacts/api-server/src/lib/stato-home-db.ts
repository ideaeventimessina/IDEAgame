/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Backend Postgres di stato-home.ts: lock di riga su home_sessions e scrittura
   della sola chiave con jsonb_set, tutto nella stessa transazione. */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { BackendStatoHome, Cfg } from "./stato-home";

export const backendStatoHomeDb: BackendStatoHome = {
  conRigaBloccata: (sessionId, fn) =>
    db.transaction(async (tx) => {
      const r = await tx.execute(sql`SELECT game_config FROM home_sessions WHERE id = ${sessionId} FOR UPDATE`);
      const riga = (r.rows as Array<{ game_config: Cfg | null }>)[0];
      return fn(riga ? (riga.game_config ?? {}) : null, async (chiave, valore) => {
        await tx.execute(sql`
          UPDATE home_sessions
          SET game_config = jsonb_set(COALESCE(game_config, '{}'::jsonb), ARRAY[${chiave}]::text[], ${JSON.stringify(valore)}::jsonb, true)
          WHERE id = ${sessionId}`);
      });
    }),
};

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Idempotenza delle scritture dei ponti (contratto Jarvis v1) ──────────────
   Una riga per ogni valore di `idempotenza` ricevuto: la stessa richiesta ripetuta
   restituisce l'esito salvato invece di rifare l'operazione (nessun secondo giro
   di roulette). Tabella NUOVA, solo aggiunta; il server la crea anche all'avvio
   (api-server/src/lib/auth-tables.ts, stesso DDL: un test li confronta). */

import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const ponteIdempotenzaTable = pgTable("ponte_idempotenza", {
  chiave: text("chiave").primaryKey(),
  status: integer("status"),
  esito: jsonb("esito"),
  creatoIl: timestamp("creato_il", { withTimezone: true }).notNull().defaultNow(),
});

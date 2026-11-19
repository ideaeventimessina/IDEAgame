/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── IDEAX — tabelle del ponte "casa" (coda lavori + contatto) ────────────────
   ATTENZIONE: queste tabelle le crea GIÀ il server a runtime con SQL grezzo
   (`create table if not exists …`) in artifacts/api-server/src/lib/ideax.ts.
   Qui le ri-dichiariamo in Drizzle IDENTICHE al DDL reale per un solo motivo:
   lo strumento di deploy (Replit) confronta lo schema con il DB di produzione e,
   NON trovando queste tabelle nello schema, a ogni publish proponeva di
   DROPparle (perdita dati). Dichiarandole qui diventano "attese" e il DROP
   sparisce. I tipi devono combaciare col DDL (in particolare timestamptz →
   { withTimezone: true } e default now()), altrimenti si genererebbero ALTER.
   La creazione a runtime resta la fonte di verità: non toccare il DDL in ideax.ts
   senza aggiornare anche qui.
──────────────────────────────────────────────────────────────────────────── */

import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const ideaxLavoriTable = pgTable("ideax_lavori", {
  id:        text("id").primaryKey(),
  tipo:      text("tipo").notNull(),
  dati:      jsonb("dati"),
  stato:     text("stato").notNull().default("attesa"),
  risultato: jsonb("risultato"),
  errore:    text("errore"),
  secondi:   integer("secondi"),
  rif:       text("rif"),
  creatoIl:  timestamp("creato_il", { withTimezone: true }).notNull().defaultNow(),
  presoIl:   timestamp("preso_il", { withTimezone: true }),
  finitoIl:  timestamp("finito_il", { withTimezone: true }),
});

export const ideaxContattoTable = pgTable("ideax_contatto", {
  id:          integer("id").primaryKey(),
  valore:      jsonb("valore").notNull(),
  aggiornatoIl: timestamp("aggiornato_il", { withTimezone: true }).notNull().defaultNow(),
});

export type IdeaxLavoro = typeof ideaxLavoriTable.$inferSelect;
export type IdeaxContatto = typeof ideaxContattoTable.$inferSelect;

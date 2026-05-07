import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { cardSetsTable } from "./card-sets";

export interface CoppieCard {
  pos: number;
  cardId: string;
  pairId: string;
  imageUrl: string;
  label: string;
  flipped: boolean;
  matched: boolean;
  matchedBy: string | null;
}

export interface CoppieTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface CoppieBoard {
  cards: CoppieCard[];
  teams: CoppieTeam[];
  mode: "teams" | "individual";
  currentTeamIdx: number;
  flipping: number[];
  locked: boolean;
  status: "playing" | "ended";
  winner: string | null;
  matchCount: number;
  totalPairs: number;
}

export const coppieBoardsTable = pgTable("coppie_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  cardSetId: uuid("card_set_id").references(() => cardSetsTable.id, {
    onDelete: "set null",
  }),
  difficulty: text("difficulty").notNull().default("medium"),
  mode: text("mode").notNull().default("teams"),
  board: jsonb("board").$type<CoppieBoard>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCoppieBoardSchema = createInsertSchema(
  coppieBoardsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoppieBoard = z.infer<typeof insertCoppieBoardSchema>;
export type CoppieBoardRow = typeof coppieBoardsTable.$inferSelect;

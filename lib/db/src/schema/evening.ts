import { pgTable, uuid, timestamp, jsonb, text } from 'drizzle-orm/pg-core';
import { eventsTable } from './events';

export interface EveningGame {
  slug: string;
  label: string;
  emoji: string;
  sessionId: string | null;
  status: 'pending' | 'running' | 'done';
}

export const eveningModesTable = pgTable('evening_modes', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => eventsTable.id, { onDelete: 'cascade' })
    .unique(),
  playlist: jsonb('playlist').notNull().$type<EveningGame[]>(),
  status: text('status').notNull().default('idle'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

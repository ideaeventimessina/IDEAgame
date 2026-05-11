import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import { ListGamesResponse, UpdateGameBody, UpdateGameResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

const DEFAULT_SETTINGS = { rounds: 0, timeLimit: 0, scoringWeight: 1 };

function normalizeGame(g: typeof gamesTable.$inferSelect) {
  return { ...g, settings: { ...DEFAULT_SETTINGS, ...(g.settings ?? {}) } };
}

router.get("/games", async (req, res): Promise<void> => {
  const showAll = req.query['all'] === 'true' || req.query['all'] === '1';
  const rows = showAll
    ? await db.select().from(gamesTable).orderBy(gamesTable.createdAt)
    : await db.select().from(gamesTable).where(eq(gamesTable.enabled, true)).orderBy(gamesTable.createdAt);
  res.json(ListGamesResponse.parse(rows.map(normalizeGame)));
});

router.patch("/games/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateGameBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const id = req.params.id as string;
  const [existing] = await db.select().from(gamesTable).where(eq(gamesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Game not found" }); return; }

  const update: Partial<typeof gamesTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.settings !== undefined) {
    update.settings = { ...existing.settings, ...parsed.data.settings } as typeof existing['settings'];
  }

  const [updated] = await db.update(gamesTable).set(update).where(eq(gamesTable.id, id)).returning();
  res.json(UpdateGameResponse.parse(normalizeGame(updated!)));
});

export default router;

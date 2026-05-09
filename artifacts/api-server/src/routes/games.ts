import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import { ListGamesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/games", async (_req, res): Promise<void> => {
  const rows = await db.select().from(gamesTable).where(eq(gamesTable.enabled, true)).orderBy(gamesTable.createdAt);
  res.json(ListGamesResponse.parse(rows));
});

export default router;

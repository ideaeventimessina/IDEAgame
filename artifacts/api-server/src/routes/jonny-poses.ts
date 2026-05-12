import { Router, type IRouter, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, jonnyPosesTable } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// GET /jonny-poses — list all poses for the authenticated user's tenant
router.get("/jonny-poses", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.json([]); return; }
  const rows = await db
    .select()
    .from(jonnyPosesTable)
    .where(eq(jonnyPosesTable.tenantId, tenantId));
  res.json(rows);
});

// PUT /jonny-poses — upsert (create or update) a pose by (gameSlug, mood)
router.put("/jonny-poses", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant associated" }); return; }

  const { gameSlug, mood, imageUrl } = req.body as { gameSlug?: string; mood?: string; imageUrl?: string };
  if (!mood || !imageUrl) { res.status(400).json({ error: "mood and imageUrl are required" }); return; }

  const slug = gameSlug ?? "global";

  // Upsert: find existing row for (tenantId, gameSlug, mood), update or insert
  const [existing] = await db
    .select()
    .from(jonnyPosesTable)
    .where(and(
      eq(jonnyPosesTable.tenantId, tenantId),
      eq(jonnyPosesTable.gameSlug, slug),
      eq(jonnyPosesTable.mood, mood),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(jonnyPosesTable)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(jonnyPosesTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [inserted] = await db
      .insert(jonnyPosesTable)
      .values({ tenantId, gameSlug: slug, mood, imageUrl })
      .returning();
    res.json(inserted);
  }
});

// DELETE /jonny-poses/:id — delete a specific pose
router.delete("/jonny-poses/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const id = String(req.params["id"]);
  if (!tenantId) { res.status(403).json({ error: "No tenant associated" }); return; }
  await db
    .delete(jonnyPosesTable)
    .where(and(eq(jonnyPosesTable.id, id), eq(jonnyPosesTable.tenantId, tenantId)));
  res.json({ ok: true });
});

export default router;

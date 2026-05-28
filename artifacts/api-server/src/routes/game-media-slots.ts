import { Router, type IRouter } from "express";
import { eq, and, isNull, or } from "drizzle-orm";
import { db, gameMediaSlotsTable } from "@workspace/db";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ── GET /game-media-slots?gameSlug= ───────────────────────────────────────────

router.get("/game-media-slots", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const gameSlug = String(req.query["gameSlug"] ?? "");
  if (!gameSlug) { res.status(400).json({ error: "gameSlug obbligatorio" }); return; }

  const tenantFilter = me.role === "super_admin"
    ? eq(gameMediaSlotsTable.gameSlug, gameSlug)
    : and(
        eq(gameMediaSlotsTable.gameSlug, gameSlug),
        or(isNull(gameMediaSlotsTable.tenantId), eq(gameMediaSlotsTable.tenantId, me.tenantId!))
      );

  const rows = await db.select().from(gameMediaSlotsTable).where(tenantFilter);
  res.json(rows);
});

// ── PUT /game-media-slots (upsert by game+slot) ───────────────────────────────

router.put("/game-media-slots", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const body = req.body as Record<string, unknown>;

  const gameSlug = String(body["gameSlug"] ?? "");
  const slotKey  = String(body["slotKey"]  ?? "");
  const value    = String(body["value"]    ?? "");
  const valueType = String(body["valueType"] ?? "youtube");
  const label    = String(body["label"]    ?? slotKey);

  if (!gameSlug || !slotKey) { res.status(400).json({ error: "gameSlug e slotKey obbligatori" }); return; }

  const tenantId = me.role === "super_admin" ? (body["tenantId"] as string | null ?? null) : me.tenantId ?? null;

  const [row] = await db.insert(gameMediaSlotsTable).values({
    tenantId, gameSlug, slotKey, value, valueType, label,
  }).onConflictDoUpdate({
    target: [gameMediaSlotsTable.tenantId, gameMediaSlotsTable.gameSlug, gameMediaSlotsTable.slotKey],
    set: { value, valueType, label, updatedAt: new Date() },
  }).returning();

  res.json(row);
});

// ── DELETE /game-media-slots/:id ──────────────────────────────────────────────

router.delete("/game-media-slots/:id", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const me = req.user!;
  const [row] = await db.select().from(gameMediaSlotsTable).where(eq(gameMediaSlotsTable.id, id));
  if (!row) { res.status(404).json({ error: "Non trovato" }); return; }
  if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }
  await db.delete(gameMediaSlotsTable).where(eq(gameMediaSlotsTable.id, id));
  res.status(204).send();
});

export default router;

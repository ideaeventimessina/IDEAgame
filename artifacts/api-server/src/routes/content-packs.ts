import { Router, type IRouter } from "express";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
import { db, gameContentPacksTable, gameContentItemsTable } from "@workspace/db";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";
import { generateContentItems } from "../lib/content-generator.js";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

// ── Tenant filter helper ───────────────────────────────────────────────────────

function packVisibility(me: NonNullable<AuthedRequest["user"]>) {
  if (me.role === "super_admin") return undefined;
  return or(
    isNull(gameContentPacksTable.tenantId),
    eq(gameContentPacksTable.tenantId, me.tenantId!)
  );
}

// ── GET /game-content-packs ───────────────────────────────────────────────────

router.get("/game-content-packs", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const { gameSlug, status, difficulty, mode, active } = req.query as Record<string, string | undefined>;

  const conditions: ReturnType<typeof eq>[] = [];
  if (gameSlug)   conditions.push(eq(gameContentPacksTable.gameSlug, gameSlug));
  if (status)     conditions.push(eq(gameContentPacksTable.status, status));
  if (difficulty) conditions.push(eq(gameContentPacksTable.difficulty, difficulty));
  if (mode)       conditions.push(eq(gameContentPacksTable.modeAvailability, mode));
  if (active !== undefined) conditions.push(eq(gameContentPacksTable.isActive, active === "true"));

  const vis = packVisibility(me);
  const where = vis ? and(vis, ...conditions) : and(...conditions);

  const rows = where
    ? await db.select().from(gameContentPacksTable).where(where).orderBy(desc(gameContentPacksTable.createdAt))
    : await db.select().from(gameContentPacksTable).orderBy(desc(gameContentPacksTable.createdAt));

  res.json(rows);
});

// ── GET /game-content-packs/:id ───────────────────────────────────────────────

router.get("/game-content-packs/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [row] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!row) { res.status(404).json({ error: "Pack non trovato" }); return; }

  if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  res.json(row);
});

// ── POST /game-content-packs ──────────────────────────────────────────────────

router.post("/game-content-packs", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const body = req.body as Record<string, unknown>;

  if (!body.gameSlug || typeof body.gameSlug !== "string") {
    res.status(400).json({ error: "gameSlug obbligatorio" }); return;
  }
  if (!body.title || typeof body.title !== "string") {
    res.status(400).json({ error: "title obbligatorio" }); return;
  }

  const [row] = await db.insert(gameContentPacksTable).values({
    gameSlug:         String(body.gameSlug),
    tenantId:         me.role === "super_admin" ? (body.tenantId as string | null ?? null) : me.tenantId,
    modeAvailability: (body.modeAvailability as string) || "both",
    title:            String(body.title),
    description:      body.description ? String(body.description) : null,
    theme:            body.theme ? String(body.theme) : null,
    difficulty:       (body.difficulty as string) || "medium",
    language:         (body.language as string) || "it",
    isActive:         body.isActive === undefined ? true : Boolean(body.isActive),
    createdBy:        (body.createdBy as string) || "admin",
    status:           (body.status as string) || "published",
    tags:             Array.isArray(body.tags) ? (body.tags as string[]) : [],
    itemCount:        0,
  }).returning();

  res.status(201).json(row);
});

// ── PATCH /game-content-packs/:id ─────────────────────────────────────────────

router.patch("/game-content-packs/:id", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [existing] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Pack non trovato" }); return; }

  if (me.role !== "super_admin" && existing.tenantId && existing.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  const body = req.body as Partial<typeof gameContentPacksTable.$inferInsert>;
  const allowed = ["title", "description", "theme", "difficulty", "modeAvailability", "isActive", "status", "tags", "language"] as const;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  const [row] = await db.update(gameContentPacksTable).set(updates).where(eq(gameContentPacksTable.id, id)).returning();
  res.json(row);
});

// ── DELETE /game-content-packs/:id ───────────────────────────────────────────

router.delete("/game-content-packs/:id", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [existing] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Pack non trovato" }); return; }

  if (me.role !== "super_admin" && existing.tenantId && existing.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  await db.delete(gameContentItemsTable).where(eq(gameContentItemsTable.packId, id));
  await db.delete(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  res.status(204).send();
});

// ── GET /game-content-packs/:id/items ────────────────────────────────────────

router.get("/game-content-packs/:id/items", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [pack] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!pack) { res.status(404).json({ error: "Pack non trovato" }); return; }

  if (me.role !== "super_admin" && pack.tenantId && pack.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  const items = await db.select().from(gameContentItemsTable)
    .where(eq(gameContentItemsTable.packId, id))
    .orderBy(gameContentItemsTable.sortOrder, gameContentItemsTable.createdAt);

  res.json(items);
});

// ── POST /game-content-packs/:id/items ───────────────────────────────────────

router.post("/game-content-packs/:id/items", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [pack] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!pack) { res.status(404).json({ error: "Pack non trovato" }); return; }

  if (me.role !== "super_admin" && pack.tenantId && pack.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  const body = req.body as Record<string, unknown>;
  const [item] = await db.insert(gameContentItemsTable).values({
    packId:      id,
    gameSlug:    pack.gameSlug,
    type:        body.type ? String(body.type) : "default",
    title:       body.title ? String(body.title) : "",
    payloadJson: body.payloadJson ?? null,
    mediaJson:   body.mediaJson ?? null,
    difficulty:  body.difficulty ? String(body.difficulty) : "medium",
    isActive:    body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder:   typeof body.sortOrder === "number" ? body.sortOrder : 0,
  }).returning();

  // Sync itemCount
  await db.update(gameContentPacksTable).set({
    itemCount: sql`(SELECT COUNT(*) FROM game_content_items WHERE pack_id = ${id})`,
    updatedAt: new Date(),
  }).where(eq(gameContentPacksTable.id, id));

  res.status(201).json(item);
});

// ── PATCH /game-content-items/:itemId ────────────────────────────────────────

router.patch("/game-content-items/:itemId", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const itemId = String(req.params["itemId"]);
  if (!isUUID(itemId)) { res.status(400).json({ error: "itemId non valido" }); return; }

  const me = req.user!;
  const [item] = await db.select().from(gameContentItemsTable).where(eq(gameContentItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item non trovato" }); return; }

  const [pack] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, item.packId));
  if (pack && me.role !== "super_admin" && pack.tenantId && pack.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  const body = req.body as Partial<typeof gameContentItemsTable.$inferInsert>;
  const allowed = ["type", "title", "payloadJson", "mediaJson", "difficulty", "isActive", "sortOrder"] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  const [updated] = await db.update(gameContentItemsTable).set(updates).where(eq(gameContentItemsTable.id, itemId)).returning();
  res.json(updated);
});

// ── DELETE /game-content-items/:itemId ───────────────────────────────────────

router.delete("/game-content-items/:itemId", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const itemId = String(req.params["itemId"]);
  if (!isUUID(itemId)) { res.status(400).json({ error: "itemId non valido" }); return; }

  const me = req.user!;
  const [item] = await db.select().from(gameContentItemsTable).where(eq(gameContentItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item non trovato" }); return; }

  const [pack] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, item.packId));
  if (pack && me.role !== "super_admin" && pack.tenantId && pack.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  await db.delete(gameContentItemsTable).where(eq(gameContentItemsTable.id, itemId));

  // Sync itemCount
  await db.update(gameContentPacksTable).set({
    itemCount: sql`(SELECT COUNT(*) FROM game_content_items WHERE pack_id = ${item.packId})`,
    updatedAt: new Date(),
  }).where(eq(gameContentPacksTable.id, item.packId));

  res.status(204).send();
});

// ── POST /game-content-packs/:id/duplicate ────────────────────────────────────

router.post("/game-content-packs/:id/duplicate", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const me = req.user!;
  const [src] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, id));
  if (!src) { res.status(404).json({ error: "Pack non trovato" }); return; }
  if (me.role !== "super_admin" && src.tenantId && src.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Accesso negato" }); return;
  }

  const [newPack] = await db.insert(gameContentPacksTable).values({
    ...src,
    id: undefined as unknown as string,
    title: `${src.title} (copia)`,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  const srcItems = await db.select().from(gameContentItemsTable).where(eq(gameContentItemsTable.packId, id));
  if (srcItems.length > 0) {
    await db.insert(gameContentItemsTable).values(
      srcItems.map(item => ({ ...item, id: undefined as unknown as string, packId: newPack!.id, createdAt: new Date() }))
    );
    await db.update(gameContentPacksTable).set({ itemCount: srcItems.length }).where(eq(gameContentPacksTable.id, newPack!.id));
  }

  res.status(201).json(newPack);
});

// ── POST /game-content-packs/generate (AI) ───────────────────────────────────

router.post("/game-content-packs/generate", requireAuth, requireRole("game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const body = req.body as Record<string, unknown>;

  const gameSlug  = String(body["gameSlug"]  ?? "");
  const themeName = String(body["themeName"] ?? "");
  const difficulty = (body["difficulty"] as "easy" | "medium" | "hard") ?? "medium";
  const count     = Math.min(30, Math.max(1, Number(body["count"] ?? 10)));

  if (!gameSlug)  { res.status(400).json({ error: "gameSlug obbligatorio" }); return; }
  if (!themeName) { res.status(400).json({ error: "themeName obbligatorio" }); return; }

  const tenantId = me.role === "super_admin" ? (body["tenantId"] as string | null ?? null) : me.tenantId ?? null;

  const [pack] = await db.insert(gameContentPacksTable).values({
    tenantId,
    gameSlug,
    title:            themeName,
    theme:            themeName,
    difficulty,
    modeAvailability: "both",
    isActive:         true,
    createdBy:        "jonny",
    status:           "published",
    itemCount:        0,
    tags:             ["ai-generated"],
  }).returning();

  let items: Awaited<ReturnType<typeof generateContentItems>>;
  try {
    items = await generateContentItems({ gameSlug, themeName, difficulty, count });
  } catch {
    items = [];
  }

  if (items.length > 0) {
    await db.insert(gameContentItemsTable).values(
      items.map(item => ({
        packId:      pack!.id,
        gameSlug,
        type:        item.type,
        title:       item.title,
        payloadJson: item.payloadJson,
        sortOrder:   item.sortOrder,
        isActive:    true,
      }))
    );
    await db.update(gameContentPacksTable).set({ itemCount: items.length }).where(eq(gameContentPacksTable.id, pack!.id));
  }

  const [updated] = await db.select().from(gameContentPacksTable).where(eq(gameContentPacksTable.id, pack!.id));
  res.status(201).json({ pack: updated, itemCount: items.length });
});

export default router;

import path from "path";
import fs from "fs";
import { Router, type IRouter, type Response, type Request } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { db, jonnyPosesTable } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ── Upload storage ───────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "jonny-poses");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype);
    cb(null, ok);
  },
});

// ── GET /jonny-poses/files/:filename — serve uploaded images (no auth) ────────
router.get("/jonny-poses/files/:filename", (req: Request, res: Response): void => {
  const filename = path.basename(String(req.params["filename"] ?? ""));
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: "Not found" }); return; }
  res.sendFile(filepath);
});

// ── POST /jonny-poses/upload — upload an image file ───────────────────────────
router.post(
  "/jonny-poses/upload",
  requireAuth,
  upload.single("image"),
  (req: Request, res: Response): void => {
    if (!req.file) { res.status(400).json({ error: "No image file provided" }); return; }
    // Return a URL the client can use to display / save
    const url = `/api/jonny-poses/files/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  },
);

// ── GET /jonny-poses — list all poses for tenant ────────────────────────────
router.get("/jonny-poses", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.json([]); return; }
  const rows = await db.select().from(jonnyPosesTable).where(eq(jonnyPosesTable.tenantId, tenantId));
  res.json(rows);
});

// ── PUT /jonny-poses — upsert (gameSlug + mood) ──────────────────────────────
router.put("/jonny-poses", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "No tenant associated" }); return; }

  const { gameSlug, mood, imageUrl } = req.body as { gameSlug?: string; mood?: string; imageUrl?: string };
  if (!mood || !imageUrl) { res.status(400).json({ error: "mood and imageUrl are required" }); return; }
  const slug = gameSlug ?? "global";

  const [existing] = await db
    .select().from(jonnyPosesTable)
    .where(and(
      eq(jonnyPosesTable.tenantId, tenantId),
      eq(jonnyPosesTable.gameSlug, slug),
      eq(jonnyPosesTable.mood, mood),
    )).limit(1);

  if (existing) {
    const [updated] = await db.update(jonnyPosesTable)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(jonnyPosesTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [inserted] = await db.insert(jonnyPosesTable)
      .values({ tenantId, gameSlug: slug, mood, imageUrl })
      .returning();
    res.json(inserted);
  }
});

// ── DELETE /jonny-poses/:id ────────────────────────────────────────────────
router.delete("/jonny-poses/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId;
  const id = String(req.params["id"]);
  if (!tenantId) { res.status(403).json({ error: "No tenant associated" }); return; }

  // Also delete the physical file if it was a local upload
  const [row] = await db.select().from(jonnyPosesTable)
    .where(and(eq(jonnyPosesTable.id, id), eq(jonnyPosesTable.tenantId, tenantId))).limit(1);

  if (row?.imageUrl?.startsWith("/api/jonny-poses/files/")) {
    const filename = path.basename(row.imageUrl);
    const filepath = path.join(UPLOAD_DIR, filename);
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
  }

  await db.delete(jonnyPosesTable)
    .where(and(eq(jonnyPosesTable.id, id), eq(jonnyPosesTable.tenantId, tenantId)));
  res.json({ ok: true });
});

export default router;

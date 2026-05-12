import path from "path";
import fs from "fs";
import { Router, type IRouter, type Response, type Request } from "express";
import multer from "multer";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "audio");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req: Request, _file, cb) => {
    const slug = String((req as Request).body?.slug ?? "global");
    const type = String((req as Request).body?.type ?? "unknown");
    const safeSlug = slug.replace(/[^a-z0-9\-]/g, "");
    const safeType = type.replace(/[^a-z0-9_]/g, "");
    cb(null, `${safeSlug}__${safeType}.mp3`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^audio\/(mpeg|mp3|mp4|ogg|wav|x-wav|x-m4a|aac)$/.test(file.mimetype)
      || file.originalname.toLowerCase().endsWith(".mp3");
    cb(null, ok);
  },
});

// ── GET /audio/files/:slug/:type — serve uploaded file (public, no auth) ─────
router.get("/audio/files/:slug/:type", (req: Request, res: Response): void => {
  const slug = path.basename(String(req.params["slug"] ?? ""));
  const type = path.basename(String(req.params["type"] ?? ""));
  const filename = `${slug}__${type}.mp3`;
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.sendFile(filepath);
});

// ── GET /audio/list — list all uploaded audio files (requires auth) ───────────
router.get("/audio/list", requireAuth, (_req: Request, res: Response): void => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith(".mp3"));
    const list = files.map(f => {
      const [slug, type] = f.replace(/\.mp3$/, "").split("__") as [string, string];
      const stat = fs.statSync(path.join(UPLOAD_DIR, f));
      return { slug, type, filename: f, size: stat.size, mtime: stat.mtimeMs };
    });
    res.json(list);
  } catch {
    res.json([]);
  }
});

// ── POST /audio/upload — upload an MP3 (requires auth) ───────────────────────
router.post(
  "/audio/upload",
  requireAuth,
  upload.single("file"),
  (req: Request, res: Response): void => {
    const ar = req as AuthedRequest;
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded or invalid file type" });
      return;
    }
    const slug = String(req.body?.slug ?? "global");
    const type = String(req.body?.type ?? "");
    if (!type) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Missing type" });
      return;
    }
    ar.log.info({ slug, type }, "audio:upload");
    res.status(201).json({ slug, type, filename: req.file.filename, size: req.file.size });
  }
);

// ── DELETE /audio/files/:slug/:type — delete an uploaded file (requires auth) ─
router.delete("/audio/files/:slug/:type", requireAuth, (req: Request, res: Response): void => {
  const slug = path.basename(String(req.params["slug"] ?? ""));
  const type = path.basename(String(req.params["type"] ?? ""));
  const filename = `${slug}__${type}.mp3`;
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  fs.unlinkSync(filepath);
  (req as AuthedRequest).log.info({ slug, type }, "audio:delete");
  res.json({ ok: true });
});

export default router;

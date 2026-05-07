import { Router, type IRouter, type Response } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, quizCategoriesTable } from "@workspace/db";
import { ListQuizCategoriesResponse, CreateQuizCategoryBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();

router.get("/quiz-categories", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(quizCategoriesTable)
    : await db.select().from(quizCategoriesTable).where(or(eq(quizCategoriesTable.tenantId, me.tenantId!), isNull(quizCategoriesTable.tenantId)));
  res.json(ListQuizCategoriesResponse.parse(rows));
});

router.post("/quiz-categories", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateQuizCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const [c] = await db.insert(quizCategoriesTable).values({
    tenantId: me.role === "super_admin" ? null : me.tenantId,
    slug: parsed.data.slug,
    name: parsed.data.name,
    color: parsed.data.color ?? "#F5B642",
  }).returning();
  await audit(req, "quiz_category.create", "quiz_category", c!.id, { slug: c!.slug });
  res.status(201).json(c);
});

router.delete("/quiz-categories/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [c] = await db.select().from(quizCategoriesTable).where(eq(quizCategoriesTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && c.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(quizCategoriesTable).where(eq(quizCategoriesTable.id, id));
  await audit(req, "quiz_category.delete", "quiz_category", id);
  res.sendStatus(204);
});

export default router;

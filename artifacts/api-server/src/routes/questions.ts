import { Router, type IRouter, type Response } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, questionsTable } from "@workspace/db";
import {
  ListQuestionsResponse, CreateQuestionBody,
  UpdateQuestionBody, UpdateQuestionResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/questions", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(questionsTable)
    : await db.select().from(questionsTable).where(or(isNull(questionsTable.tenantId), eq(questionsTable.tenantId, me.tenantId!)));
  res.json(ListQuestionsResponse.parse(rows));
});

router.post("/questions", requireRole("super_admin", "tenant_owner", "game_manager"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const [q] = await db.insert(questionsTable).values({
    tenantId: me.role === "super_admin" ? null : me.tenantId,
    category: parsed.data.category,
    difficulty: parsed.data.difficulty ?? "medium",
    timeLimit: parsed.data.timeLimit ?? 25,
    prompts: parsed.data.prompts,
    options: parsed.data.options,
    correctIndex: parsed.data.correctIndex,
  }).returning();
  res.status(201).json(q);
});

async function loadOwnedQuestion(req: AuthedRequest, id: string) {
  const [q] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!q) return { q: null as null, status: 404 as const };
  if (req.user!.role !== "super_admin" && q.tenantId !== null && q.tenantId !== req.user!.tenantId) {
    return { q: null, status: 403 as const };
  }
  // Non-super-admins cannot modify global (null-tenant) questions
  if (req.user!.role !== "super_admin" && q.tenantId === null) {
    return { q: null, status: 403 as const };
  }
  return { q, status: 200 as const };
}

router.patch("/questions/:id", requireRole("super_admin", "tenant_owner", "game_manager"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateQuestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owned = await loadOwnedQuestion(req, id);
  if (!owned.q) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  const [q] = await db.update(questionsTable).set(parsed.data).where(eq(questionsTable.id, id)).returning();
  res.json(UpdateQuestionResponse.parse(q));
});

router.delete("/questions/:id", requireRole("super_admin", "tenant_owner", "game_manager"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const owned = await loadOwnedQuestion(req, id);
  if (!owned.q) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  await db.delete(questionsTable).where(eq(questionsTable.id, id));
  res.sendStatus(204);
});

export default router;

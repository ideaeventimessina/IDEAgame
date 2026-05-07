import { Router, type IRouter, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, roundsTable, gameSessionsTable, eventsTable } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";
const router: IRouter = Router();

type CreateRoundBody = { payload?: Record<string, unknown> };
type UpdateRoundBody = { status?: "pending" | "running" | "completed"; payload?: Record<string, unknown> };

function parseCreateRound(body: unknown): { success: true; data: CreateRoundBody } | { success: false; error: string } {
  if (typeof body !== "object" || body === null) return { success: true, data: {} };
  return { success: true, data: body as CreateRoundBody };
}

function parseUpdateRound(body: unknown): { success: true; data: UpdateRoundBody } | { success: false; error: string } {
  if (typeof body !== "object" || body === null) return { success: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (b["status"] !== undefined && !["pending", "running", "completed"].includes(b["status"] as string)) {
    return { success: false, error: "Invalid status" };
  }
  return { success: true, data: b as UpdateRoundBody };
}

async function sessionEventId(req: AuthedRequest, sessionId: string): Promise<string | null> {
  const [s] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));
  if (!s) return null;
  const [e] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, s.eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId) return null;
  return s.eventId;
}

router.get("/sessions/:id/rounds", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const sessionId = String(req.params["id"]);
  const eventId = await sessionEventId(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db
    .select()
    .from(roundsTable)
    .where(eq(roundsTable.gameSessionId, sessionId));
  res.json(rows);
});

router.post("/sessions/:id/rounds", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  const eventId = await sessionEventId(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = parseCreateRound(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const existing = await db
    .select()
    .from(roundsTable)
    .where(eq(roundsTable.gameSessionId, sessionId));
  const index = existing.length + 1;

  const [round] = await db
    .insert(roundsTable)
    .values({
      gameSessionId: sessionId,
      index,
      status: "running",
      payload: parsed.data.payload ?? {},
      startedAt: new Date(),
    })
    .returning();

  // Advance currentRound on the session
  await db
    .update(gameSessionsTable)
    .set({ currentRound: index })
    .where(eq(gameSessionsTable.id, sessionId));

  emitToEvent(eventId, "round:changed", { sessionId, round, eventId });
  res.status(201).json(round);
});

router.patch("/rounds/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = parseUpdateRound(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const [existing] = await db.select().from(roundsTable).where(eq(roundsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const eventId = await sessionEventId(req, existing.gameSessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "completed") patch["endedAt"] = new Date();

  const [updated] = await db
    .update(roundsTable)
    .set(patch as Parameters<typeof db.update>[0] extends never ? never : Record<string, unknown>)
    .where(and(eq(roundsTable.id, id)))
    .returning();

  emitToEvent(eventId, "round:changed", { sessionId: existing.gameSessionId, round: updated, eventId });
  res.json(updated);
});

export default router;

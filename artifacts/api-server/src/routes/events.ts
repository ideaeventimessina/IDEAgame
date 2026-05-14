import { Router, type IRouter, type Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, eventsTable, playersTable } from "@workspace/db";
import {
  ListEventsResponse, CreateEventBody,
  UpdateEventBody, UpdateEventResponse, GetEventResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

function tenantScope(req: AuthedRequest) {
  return req.user!.role === "super_admin" ? undefined : eq(eventsTable.tenantId, req.user!.tenantId!);
}

router.get("/events", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const scope = tenantScope(req);
  const rows = scope
    ? await db.select().from(eventsTable).where(scope).orderBy(desc(eventsTable.startsAt))
    : await db.select().from(eventsTable).orderBy(desc(eventsTable.startsAt));
  res.json(ListEventsResponse.parse(rows));
});

router.get("/events/current", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const where = me.role === "super_admin"
    ? eq(eventsTable.status, "live")
    : and(eq(eventsTable.status, "live"), eq(eventsTable.tenantId, me.tenantId!));
  const [row] = await db.select().from(eventsTable).where(where).orderBy(desc(eventsTable.startsAt)).limit(1);
  res.json(row ?? null);
});

router.get("/events/public/current", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(eventsTable)
    .where(eq(eventsTable.status, "live"))
    .orderBy(desc(eventsTable.startsAt))
    .limit(1);
  res.json(row ?? null);
});

async function loadOwnedEvent(req: AuthedRequest, id: string) {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!e) return { e: null as null, status: 404 as const };
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId) {
    return { e: null, status: 403 as const };
  }
  return { e, status: 200 as const };
}

router.get("/events/public/live-state", async (_req, res): Promise<void> => {
  const [event] = await db.select().from(eventsTable)
    .where(eq(eventsTable.status, "live"))
    .orderBy(desc(eventsTable.startsAt))
    .limit(1);

  if (!event) {
    res.json({ event: null, players: [] });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.eventId, event.id));
  res.json({ event, players });
});

router.get("/events/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { e, status } = await loadOwnedEvent(req, id);
  if (!e) { res.status(status).json({ error: status === 404 ? "Not found" : "Forbidden" }); return; }
  res.json(GetEventResponse.parse(e));
});

router.post("/events", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const tenantId = me.role === "super_admin" ? (parsed.data.tenantId ?? me.tenantId) : me.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Seleziona un tenant per l'evento" }); return; }
  const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const [e] = await db.insert(eventsTable).values({
    tenantId,
    name: parsed.data.name,
    venue: parsed.data.venue ?? "",
    startsAt: parsed.data.startsAt ?? new Date(),
    brandColor: parsed.data.brandColor ?? "#F5B642",
    expectedPlayers: parsed.data.expectedPlayers ?? 20,
    enabledGames: parsed.data.enabledGames ?? [],
    joinCode,
  }).returning();
  res.status(201).json(e);
});

router.patch("/events/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owned = await loadOwnedEvent(req, id);
  if (!owned.e) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  const [e] = await db.update(eventsTable).set(parsed.data).where(eq(eventsTable.id, id)).returning();
  if (parsed.data.status === "ended") {
    emitToEvent(id, "event:ended", { eventId: id });
  }
  res.json(UpdateEventResponse.parse(e));
});

router.delete("/events/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const owned = await loadOwnedEvent(req, id);
  if (!owned.e) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  emitToEvent(id, "event:ended", { eventId: id });
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.sendStatus(204);
});

export default router;

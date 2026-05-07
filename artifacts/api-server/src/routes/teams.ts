import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, teamsTable, eventsTable } from "@workspace/db";
import {
  ListTeamsResponse, CreateTeamBody,
  UpdateTeamBody, UpdateTeamResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function eventOwned(req: AuthedRequest, eventId: string): Promise<boolean> {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return false;
  return req.user!.role === "super_admin" || e.tenantId === req.user!.tenantId;
}

async function teamOwned(req: AuthedRequest, teamId: string) {
  const [t] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!t) return { t: null as null, status: 404 as const };
  if (!(await eventOwned(req, t.eventId))) return { t: null, status: 403 as const };
  return { t, status: 200 as const };
}

router.get("/events/:id/teams", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(teamsTable).where(eq(teamsTable.eventId, eventId));
  res.json(ListTeamsResponse.parse(rows));
});

router.post("/events/:id/teams", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [t] = await db.insert(teamsTable).values({ ...parsed.data, eventId }).returning();
  res.status(201).json(t);
});

router.patch("/teams/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owned = await teamOwned(req, id);
  if (!owned.t) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  const [t] = await db.update(teamsTable).set(parsed.data).where(eq(teamsTable.id, id)).returning();
  res.json(UpdateTeamResponse.parse(t));
});

router.delete("/teams/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const owned = await teamOwned(req, id);
  if (!owned.t) { res.status(owned.status).json({ error: owned.status === 404 ? "Not found" : "Forbidden" }); return; }
  await db.delete(teamsTable).where(eq(teamsTable.id, id));
  res.sendStatus(204);
});

export default router;

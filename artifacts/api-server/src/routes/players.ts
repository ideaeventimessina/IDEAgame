import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import {
  ListPlayersResponse, JoinPlayerBody,
} from "@workspace/api-zod";
import { type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/events/:id/players", async (req, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const rows = await db.select().from(playersTable).where(eq(playersTable.eventId, eventId));
  res.json(ListPlayersResponse.parse(rows));
});

// Public — players join by event id without auth
router.post("/events/:id/players", async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
  const parsed = JoinPlayerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [p] = await db.insert(playersTable).values({
    eventId,
    nickname: parsed.data.nickname,
    avatarColor: parsed.data.avatarColor ?? "#F5B642",
    teamId: parsed.data.teamId ?? null,
  }).returning();
  res.status(201).json(p);
});

router.delete("/players/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [p] = await db.delete(playersTable).where(eq(playersTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;

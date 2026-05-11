import { Router, type IRouter, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, playersTable, eventsTable, teamsTable } from "@workspace/db";
import { ListPlayersResponse, JoinPlayerBody, UpdatePlayerBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";
import { playerJoinLimiter } from "../middlewares/rateLimit";

const MAX_PLAYERS = 20;
const router: IRouter = Router();

async function eventOwned(req: AuthedRequest, eventId: string): Promise<boolean> {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return false;
  return req.user!.role === "super_admin" || e.tenantId === req.user!.tenantId;
}

router.get("/events/:id/players", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(playersTable).where(eq(playersTable.eventId, eventId));
  res.json(ListPlayersResponse.parse(rows));
});

// Public — players join by event id. Rate limited, max 20, unique nickname.
router.post("/events/:id/players", playerJoinLimiter, async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!event) { res.status(404).json({ error: "Evento non trovato" }); return; }
  if (event.status !== "live") { res.status(409).json({ error: "L'evento non è live", status: event.status }); return; }

  const parsed = JoinPlayerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const nickname = parsed.data.nickname.trim();
  if (!nickname || nickname.length < 2 || nickname.length > 24) {
    res.status(422).json({ error: "Il nickname deve essere tra 2 e 24 caratteri" });
    return;
  }

  // Check nickname uniqueness within this event
  const [existing] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.eventId, eventId), eq(playersTable.nickname, nickname)));
  if (existing) {
    // Allow rejoin when the player disconnected (page refresh, network drop, etc.)
    if (!existing.isConnected) {
      const [rejoined] = await db
        .update(playersTable)
        .set({ isConnected: true, teamId: parsed.data.teamId ?? existing.teamId })
        .where(eq(playersTable.id, existing.id))
        .returning();
      emitToEvent(eventId, "player:joined", rejoined);
      res.status(200).json(rejoined!);
      return;
    }
    res.status(409).json({ error: "Nickname già in uso in questo evento" });
    return;
  }

  // Check max players
  const all = await db.select().from(playersTable).where(eq(playersTable.eventId, eventId));
  if (all.length >= MAX_PLAYERS) {
    res.status(409).json({ error: `Massimo ${MAX_PLAYERS} giocatori per evento raggiunto` });
    return;
  }

  const COLORS = ["#F5B642", "#E84A8E", "#5BC0EB", "#9B5DE5", "#00F5A0", "#FF1F6D", "#FF6B35", "#C44DFF"];
  const avatarColor = parsed.data.avatarColor ?? COLORS[all.length % COLORS.length] ?? "#F5B642";

  // Modalità individuale: se non viene fornito un teamId, crea un team personale
  let resolvedTeamId = parsed.data.teamId ?? null;
  if (!resolvedTeamId) {
    const [personalTeam] = await db
      .insert(teamsTable)
      .values({ eventId, name: nickname, color: avatarColor })
      .returning();
    resolvedTeamId = personalTeam!.id;
    emitToEvent(eventId, "team:updated", personalTeam);
  }

  const [p] = await db
    .insert(playersTable)
    .values({ eventId, nickname, avatarColor, teamId: resolvedTeamId })
    .returning();

  // Emit realtime event
  emitToEvent(eventId, "player:joined", p);

  res.status(201).json(p);
});

router.patch("/players/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [existing] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await eventOwned(req, existing.eventId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdatePlayerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const patch: Partial<{ nickname: string; teamId: string | null }> = {};
  if (parsed.data.nickname !== undefined) {
    const nick = parsed.data.nickname.trim();
    if (nick.length < 2 || nick.length > 24) { res.status(422).json({ error: "Nickname tra 2 e 24 caratteri" }); return; }
    patch.nickname = nick;
  }
  if (parsed.data.teamId !== undefined) patch.teamId = parsed.data.teamId;

  if (Object.keys(patch).length === 0) { res.json(existing); return; }

  const [updated] = await db.update(playersTable).set(patch).where(eq(playersTable.id, id)).returning();
  emitToEvent(existing.eventId, "player:joined", updated);
  res.json(updated);
});

router.delete("/players/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [existing] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await eventOwned(req, existing.eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(playersTable).where(eq(playersTable.id, id));
  emitToEvent(existing.eventId, "player:left", { id, eventId: existing.eventId });
  res.sendStatus(204);
});

export default router;

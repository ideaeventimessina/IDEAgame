import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { db, playersTable, homeSessionsTable, homePlayersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

let _io: SocketServer | null = null;

/**
 * socketId → { playerId, eventId }
 * Populated via the "player:register" client event.
 * Used to set isConnected=false and emit player:left on disconnect.
 */
const playerSockets = new Map<string, { playerId: string; eventId: string }>();

// ── Home Mode: per-session/player peak Ballo energy (in-memory, ephemeral) ────
// Keyed by sessionId; tracks which round the map belongs to so stale energy
// from a previous round is ignored automatically.
const balloEnergyMap = new Map<string, { round: number; players: Map<string, number> }>();

export function getBalloEnergies(sessionId: string): Record<string, number> {
  const entry = balloEnergyMap.get(sessionId);
  if (!entry) return {};
  return Object.fromEntries(entry.players.entries());
}

export function clearBalloEnergies(sessionId: string): void {
  balloEnergyMap.delete(sessionId);
}

/**
 * Attach Socket.IO to the raw HTTP server.
 * After this call io.engine is set and socket.io handles /socket.io requests.
 */
export function initSocket(server: HttpServer): SocketServer {
  _io = new SocketServer(server, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    transports: ["websocket", "polling"],
  });

  _io.on("connection", (socket) => {
    logger.info({ sid: socket.id }, "ws:connect");

    // Join a named event room (used by both staff and players)
    socket.on("join:event", (eventId: string) => {
      if (typeof eventId === "string" && eventId.length > 0) {
        void socket.join(`event:${eventId}`);
        logger.info({ sid: socket.id, eventId }, "ws:join");
      }
    });

    socket.on("leave:event", (eventId: string) => {
      void socket.leave(`event:${eventId}`);
    });

    /**
     * Players call this after a successful POST /events/:id/players.
     * Links this socketId to a playerId so we can track connect/disconnect.
     * Also re-registers on socket reconnect.
     */
    socket.on("player:register", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const playerId = d["playerId"];
      const eventId = d["eventId"];
      if (typeof playerId !== "string" || typeof eventId !== "string") return;

      playerSockets.set(socket.id, { playerId, eventId });
      // Ensure in event room (covers reconnect case)
      void socket.join(`event:${eventId}`);

      db.update(playersTable)
        .set({ isConnected: true })
        .where(eq(playersTable.id, playerId))
        .catch((err) => logger.error({ err }, "player:register db update failed"));

      logger.info({ sid: socket.id, playerId, eventId }, "player:registered");
    });

    // Volume relay: any client can set master volume for the whole show
    socket.on("volume:set", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      if (typeof d["volume"] === "number") {
        const vol = Math.max(0, Math.min(1, d["volume"]));
        _io!.emit("volume:set", { volume: vol });
        logger.info({ volume: vol }, "audio:volume:set");
      }
    });

    socket.on("disconnect", (reason) => {
      const reg = playerSockets.get(socket.id);
      if (reg) {
        playerSockets.delete(socket.id);
        db.update(playersTable)
          .set({ isConnected: false })
          .where(eq(playersTable.id, reg.playerId))
          .then(() => {
            emitToEvent(reg.eventId, "player:left", {
              id: reg.playerId,
              eventId: reg.eventId,
            });
            logger.info({ sid: socket.id, playerId: reg.playerId }, "player:disconnected");
          })
          .catch((err) => logger.error({ err }, "player disconnect db update failed"));
      }
      logger.info({ sid: socket.id, reason }, "ws:disconnect");
    });
  });

  logger.info("Socket.IO initialized and attached to HTTP server");
  return _io;
}

export function getIo(): SocketServer {
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
}

export function emitToEvent(eventId: string, event: string, data: unknown): void {
  _io?.to(`event:${eventId}`).emit(event, data);
}

export function emitToRoom(room: string, event: string, data: unknown): void {
  _io?.to(room).emit(event, data);
}

// Socket join for HOME sessions
export function initHomeSocketHandlers(io: SocketServer): void {
  io.on("connection", (socket) => {
    socket.on("join:home", (sessionId: string) => {
      if (typeof sessionId !== "string" || sessionId.length === 0) return;
      void socket.join(`home:${sessionId}`);
      logger.info({ sid: socket.id, sessionId }, "ws:join:home");

      // Immediately push current state to this socket so it is in sync
      // even if it missed the broadcastState emitted during HTTP join
      db.select().from(homeSessionsTable).where(eq(homeSessionsTable.id, sessionId))
        .then(async ([session]) => {
          if (!session) return;
          const players = await db.select().from(homePlayersTable)
            .where(eq(homePlayersTable.sessionId, sessionId));
          socket.emit("home:state", { session, players });
        })
        .catch((err) => logger.error({ err, sessionId }, "join:home state push failed"));
    });

    socket.on("leave:home", (sessionId: string) => {
      void socket.leave(`home:${sessionId}`);
    });

    socket.on("home:ballo_energy", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = d["sessionId"];
      const playerId = d["playerId"];
      const energy = d["energy"];
      const round = typeof d["round"] === "number" ? d["round"] : -1;
      if (typeof sessionId !== "string" || typeof playerId !== "string" || typeof energy !== "number") return;

      logger.info({ sessionId, playerId, energy: Math.round(energy), round }, "[BalloTrace:server] received home:ballo_energy");

      // Initialize entry for this round; reset if round changed (new ballo round)
      const existing = balloEnergyMap.get(sessionId);
      if (!existing || existing.round !== round) {
        if (existing && existing.round !== round) {
          logger.info({ sessionId, oldRound: existing.round, newRound: round }, "[BalloTrace:server] round changed — resetting energy map");
        }
        balloEnergyMap.set(sessionId, { round, players: new Map() });
      }
      const entry = balloEnergyMap.get(sessionId)!;
      const current = entry.players.get(playerId) ?? 0;
      const newPeak = Math.max(current, Math.round(energy));
      entry.players.set(playerId, newPeak);
      logger.info({ sessionId, playerId, prev: current, newPeak, round }, "[BalloTrace:server] stored peak");

      emitToRoom(`home:${sessionId}`, "home:ballo_live", {
        energies: Object.fromEntries(entry.players.entries()),
        round,
      });
      logger.info({ sessionId, playerCount: entry.players.size }, "[BalloTrace:server] emitted home:ballo_live");
    });
  });
}

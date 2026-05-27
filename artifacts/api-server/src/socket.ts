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
// players = peak energies (used by autoScoreBallo), current = latest live energy per player
const balloEnergyMap = new Map<string, { round: number; players: Map<string, number>; current: Map<string, number> }>();

// ── Home Mode: spectator votes for Ballo dancers (in-memory, ephemeral) ────────
// Key = `${sessionId}:${round}` → Map<voterId → Map<dancerId → stars (1-5)>>
const balloVoteMap = new Map<string, Map<string, Map<string, number>>>();

// ── Home Mode: Messaggi Segreti — in-memory chat state (ephemeral) ───────────
export interface ChatMessage {
  id: string;
  sessionId: string;
  senderPlayerId: string;
  senderNickname: string;
  receiverPlayerId: string | null;
  receiverNickname: string | null;
  text: string;
  isAnonymous: boolean;
  destination: "private" | "tv";
  createdAt: number;
  readAt: number | null;
  reactions: Array<{ playerId: string; emoji: string; createdAt: number }>;
}

// sessionId → all messages (private + tv)
const chatMessages = new Map<string, ChatMessage[]>();
// sessionId → TV queue (unseen TV messages)
const chatTvQueue = new Map<string, ChatMessage[]>();
// `${sessionId}:${playerId}` → DND enabled
const chatDnd = new Map<string, boolean>();
// Reverse lookup: home playerId → current socketId (maintained alongside homePlayerSockets)
const homePlayerToSocket = new Map<string, string>();

export function getBalloEnergies(sessionId: string): Record<string, number> {
  const entry = balloEnergyMap.get(sessionId);
  if (!entry) return {};
  return Object.fromEntries(entry.players.entries()); // returns peak energies for scoring
}

export function clearBalloEnergies(sessionId: string): void {
  balloEnergyMap.delete(sessionId);
}

/**
 * socketId → { sessionId, playerId }
 * Populated via "home:player_register" so we can remove booked players on
 * disconnect during the pre-game flow booking phase.
 */
const homePlayerSockets = new Map<string, { sessionId: string; playerId: string }>();

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
      // ── Live-mode player disconnect ──────────────────────────────────────────
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

      // ── Home-mode player disconnect: purge from flow booking if applicable ──
      const homeReg = homePlayerSockets.get(socket.id);
      if (homeReg) {
        homePlayerSockets.delete(socket.id);
        homePlayerToSocket.delete(homeReg.playerId);
        db.update(homePlayersTable)
          .set({ isConnected: false })
          .where(eq(homePlayersTable.id, homeReg.playerId))
          .then(async () => {
            const [session] = await db
              .select()
              .from(homeSessionsTable)
              .where(eq(homeSessionsTable.id, homeReg.sessionId));
            if (!session) return;
            const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
            if (rp["mode"] !== "home-flow" || rp["gameFlowPhase"] !== "booking") return;
            const booked = (rp["bookedPlayers"] as Array<{ id: string }>) ?? [];
            const filtered = booked.filter((b) => b.id !== homeReg.playerId);
            if (filtered.length === booked.length) return; // wasn't booked
            const updatedRp = { ...rp, bookedPlayers: filtered };
            await db
              .update(homeSessionsTable)
              .set({ roundPayload: updatedRp })
              .where(eq(homeSessionsTable.id, homeReg.sessionId));
            const players = await db
              .select()
              .from(homePlayersTable)
              .where(eq(homePlayersTable.sessionId, homeReg.sessionId));
            emitToRoom(`home:${homeReg.sessionId}`, "home:state", {
              session: { ...session, roundPayload: updatedRp },
              players,
            });
            emitToRoom(`home:${homeReg.sessionId}`, "home:player_booked", {
              bookedPlayers: filtered,
            });
            logger.info(
              { playerId: homeReg.playerId, sessionId: homeReg.sessionId },
              "home:flow:booking purged on disconnect",
            );
          })
          .catch((err) => logger.error({ err }, "home flow disconnect cleanup failed"));
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

    /**
     * Home players call this after joining so we can track their socket for
     * flow-booking disconnect cleanup. Also marks the player as connected.
     */
    socket.on("home:player_register", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const playerId = typeof d["playerId"] === "string" ? d["playerId"] : null;
      if (!sessionId || !playerId) return;
      homePlayerSockets.set(socket.id, { sessionId, playerId });
      homePlayerToSocket.set(playerId, socket.id);
      db.update(homePlayersTable)
        .set({ isConnected: true })
        .where(eq(homePlayersTable.id, playerId))
        .catch((err) => logger.error({ err }, "home:player_register db update failed"));
      logger.info({ sid: socket.id, sessionId, playerId }, "home:player:registered");
    });

    socket.on("leave:home", (sessionId: string) => {
      homePlayerSockets.delete(socket.id);
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
        balloEnergyMap.set(sessionId, { round, players: new Map(), current: new Map() });
      }
      const entry = balloEnergyMap.get(sessionId)!;
      const currEnergy = Math.round(energy);
      const prevPeak = entry.players.get(playerId) ?? 0;
      const newPeak = Math.max(prevPeak, currEnergy);
      entry.players.set(playerId, newPeak);    // peak — used by autoScoreBallo
      entry.current.set(playerId, currEnergy); // current — used for live TV bar
      logger.info({ sessionId, playerId, currEnergy, prevPeak, newPeak, round }, "[BalloTrace:server] stored energy");

      emitToRoom(`home:${sessionId}`, "home:ballo_live", {
        currentEnergies: Object.fromEntries(entry.current.entries()),
        peakEnergies:    Object.fromEntries(entry.players.entries()),
        round,
      });
      logger.info({ sessionId, playerCount: entry.players.size }, "[BalloTrace:server] emitted home:ballo_live");
    });

    // ── Sensor readiness broadcast ────────────────────────────────────────────
    // Phone emits home:player_sensor_ready after booking → server rebroadcasts to room
    // TV host uses this to show ⚠️ badge for players whose sensors are not available.
    socket.on("home:player_sensor_ready", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const playerId = typeof d["playerId"] === "string" ? d["playerId"] : null;
      const sensorReady = typeof d["sensorReady"] === "boolean" ? d["sensorReady"] : false;
      if (!sessionId || !playerId) return;
      logger.info({ sessionId, playerId, sensorReady }, "[SensorReady] broadcasting to room");
      emitToRoom(`home:${sessionId}`, "home:player_sensor_ready", { sessionId, playerId, sensorReady });
    });

    // ── Ballo admin sensitivity broadcast ────────────────────────────────────
    // TV host emits home:set_ballo_sensitivity → server rebroadcasts to all room clients
    socket.on("home:set_ballo_sensitivity", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const sensitivity = typeof d["sensitivity"] === "number" ? d["sensitivity"] : 1.0;
      if (!sessionId) return;
      const clamped = Math.min(5.0, Math.max(0.5, sensitivity));
      logger.info({ sessionId, sensitivity: clamped }, "[BalloSensitivity] broadcasting to room");
      emitToRoom(`home:${sessionId}`, "home:ballo_sensitivity", { sensitivity: clamped });
    });

    // ── Ballo spectator voting ────────────────────────────────────────────────
    // Spectators (players not in bookedPlayers) cast star votes for each dancer.
    // Votes are aggregated in-memory and broadcast as home:ballo_vote_update.
    socket.on("home:ballo_vote", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const round     = typeof d["round"]     === "number" ? d["round"]     : -1;
      const voterId   = typeof d["voterId"]   === "string" ? d["voterId"]   : null;
      const dancerId  = typeof d["dancerId"]  === "string" ? d["dancerId"]  : null;
      const stars     = typeof d["stars"]     === "number" ? Math.max(1, Math.min(5, Math.round(d["stars"]))) : 3;
      if (!sessionId || !voterId || !dancerId || round < 0) return;

      const key = `${sessionId}:${round}`;
      if (!balloVoteMap.has(key)) balloVoteMap.set(key, new Map());
      const roundVotes = balloVoteMap.get(key)!;
      if (!roundVotes.has(voterId)) roundVotes.set(voterId, new Map());
      roundVotes.get(voterId)!.set(dancerId, stars);

      // Aggregate: total stars + count per dancer
      const totals: Record<string, { total: number; count: number }> = {};
      for (const [, voterVotes] of roundVotes) {
        for (const [did, s] of voterVotes) {
          if (!totals[did]) totals[did] = { total: 0, count: 0 };
          totals[did].total += s;
          totals[did].count += 1;
        }
      }

      emitToRoom(`home:${sessionId}`, "home:ballo_vote_update", { round, totals });
      logger.info({ sessionId, voterId, dancerId, stars, round }, "[BalloVote] vote cast and broadcast");
    });

    // ── Parola alle Spalle — Taboo alarm ─────────────────────────────────────
    socket.on("home:wordback_taboo_alarm", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      if (!sessionId) return;
      const alarm = {
        playerId: typeof d["playerId"] === "string" ? d["playerId"] : "",
        nickname: typeof d["nickname"] === "string" ? d["nickname"] : "",
        round: typeof d["round"] === "number" ? d["round"] : 0,
        timestamp: Date.now(),
      };
      logger.info({ sessionId, playerId: alarm.playerId, nickname: alarm.nickname }, "[TabooAlarm] broadcasting to room");
      emitToRoom(`home:${sessionId}`, "home:wordback_taboo_alarm", alarm);
    });

    // home:wordback_correct is now fully handled server-side via
    // POST /home/sessions/:id/wordback-correct — no socket relay needed.

    // ── Messaggi Segreti ─────────────────────────────────────────────────────

    socket.on("home:chat_send", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId        = typeof d["sessionId"]        === "string" ? d["sessionId"]        : null;
      const senderPlayerId   = typeof d["senderPlayerId"]   === "string" ? d["senderPlayerId"]   : null;
      const senderNickname   = typeof d["senderNickname"]   === "string" ? d["senderNickname"]   : null;
      const receiverPlayerId = typeof d["receiverPlayerId"] === "string" ? d["receiverPlayerId"] : null;
      const receiverNickname = typeof d["receiverNickname"] === "string" ? d["receiverNickname"] : null;
      const rawText          = typeof d["text"]             === "string" ? d["text"].trim()       : "";
      const isAnonymous      = d["isAnonymous"] === true;
      const destination      = d["destination"] === "tv" ? "tv" : "private";

      if (!sessionId || !senderPlayerId || !senderNickname || !rawText) return;
      const text = rawText.slice(0, 160);
      if (!text) return;

      // Private requires a receiver
      if (destination === "private" && !receiverPlayerId) {
        socket.emit("home:chat_error", { error: "Seleziona un destinatario." });
        return;
      }

      const allMsgs = chatMessages.get(sessionId) ?? [];

      // Block duplicate consecutive same text from same sender to same target
      const lastSame = [...allMsgs].reverse().find(
        (m) => m.senderPlayerId === senderPlayerId && m.receiverPlayerId === receiverPlayerId && m.destination === destination
      );
      if (lastSame?.text === text) {
        socket.emit("home:chat_error", { error: "Messaggio duplicato." });
        return;
      }

      // Block: private receiver has ≥3 unread from same sender
      if (destination === "private" && receiverPlayerId) {
        const unread = allMsgs.filter(
          (m) => m.senderPlayerId === senderPlayerId && m.receiverPlayerId === receiverPlayerId && m.readAt === null
        ).length;
        if (unread >= 3) {
          socket.emit("home:chat_error", { error: "L'utente ha già messaggi in attesa." });
          return;
        }
      }

      const receiverDnd = receiverPlayerId ? (chatDnd.get(`${sessionId}:${receiverPlayerId}`) ?? false) : false;

      const msg: ChatMessage = {
        id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        senderPlayerId,
        senderNickname,
        receiverPlayerId,
        receiverNickname,
        text,
        isAnonymous,
        destination,
        createdAt: Date.now(),
        readAt: null,
        reactions: [],
      };

      if (!chatMessages.has(sessionId)) chatMessages.set(sessionId, []);
      chatMessages.get(sessionId)!.push(msg);

      if (destination === "tv") {
        if (!chatTvQueue.has(sessionId)) chatTvQueue.set(sessionId, []);
        chatTvQueue.get(sessionId)!.push(msg);
        emitToRoom(`home:${sessionId}`, "home:chat_tv_queue_update", {
          queue: chatTvQueue.get(sessionId)!,
        });
        logger.info({ sessionId, msgId: msg.id, isAnonymous }, "[SecretMessages] tv queued");
      } else {
        const receiverSocketId = receiverPlayerId ? homePlayerToSocket.get(receiverPlayerId) : null;
        if (receiverSocketId) {
          if (!receiverDnd) {
            // Live popup + inbox update
            _io?.to(receiverSocketId).emit("home:chat_receive", { message: msg });
            logger.info({ sessionId, msgId: msg.id, receiverPlayerId }, "[SecretMessages] receive");
          } else {
            // DND: silent inbox update only
            const inbox = chatMessages.get(sessionId)!.filter((m) => m.receiverPlayerId === receiverPlayerId);
            _io?.to(receiverSocketId).emit("home:chat_inbox_update", { inbox });
            logger.info({ sessionId, msgId: msg.id, receiverPlayerId }, "[SecretMessages] dnd — silent inbox");
          }
        }
        logger.info({ sessionId, msgId: msg.id, receiverPlayerId, isAnonymous }, "[SecretMessages] send");
      }

      socket.emit("home:chat_sent", { messageId: msg.id });
    });

    socket.on("home:chat_reaction", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId  = typeof d["sessionId"]  === "string" ? d["sessionId"]  : null;
      const messageId  = typeof d["messageId"]  === "string" ? d["messageId"]  : null;
      const playerId   = typeof d["playerId"]   === "string" ? d["playerId"]   : null;
      const emoji      = typeof d["emoji"]      === "string" ? d["emoji"]      : null;
      const textReply  = typeof d["textReply"]  === "string" ? d["textReply"].trim().slice(0, 160) : null;
      if (!sessionId || !messageId || !playerId || !emoji) return;

      const msgs = chatMessages.get(sessionId);
      if (!msgs) return;
      const msg = msgs.find((m) => m.id === messageId);
      if (!msg) return;

      // One reaction per player per message — replace if already reacted
      msg.reactions = msg.reactions.filter((r) => r.playerId !== playerId);
      msg.reactions.push({ playerId, emoji, createdAt: Date.now() });

      logger.info({ sessionId, messageId, playerId, emoji, hasReply: !!textReply }, "[SecretMessages] reaction");

      // Notify sender and receiver of the reaction
      const senderSocketId   = homePlayerToSocket.get(msg.senderPlayerId);
      const receiverSocketId = msg.receiverPlayerId ? homePlayerToSocket.get(msg.receiverPlayerId) : null;
      if (senderSocketId)   _io?.to(senderSocketId).emit("home:chat_inbox_update", { updatedMessage: msg });
      if (receiverSocketId && receiverSocketId !== senderSocketId)
        _io?.to(receiverSocketId).emit("home:chat_inbox_update", { updatedMessage: msg });

      // If the reactor included a text reply → create a NEW message back to the original sender
      if (textReply) {
        // The reactor was the original receiver — use their nickname accordingly
        const replyMsg: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sessionId,
          senderPlayerId: playerId,
          senderNickname: msg.receiverNickname ?? "Giocatore",
          receiverPlayerId: msg.senderPlayerId,
          receiverNickname: msg.senderNickname,
          text: textReply,
          isAnonymous: false,
          destination: "private",
          reactions: [],
          createdAt: Date.now(),
          readAt: null,
        };
        if (!msgs) return;
        msgs.push(replyMsg);
        logger.info({ sessionId, from: playerId, to: msg.senderPlayerId, text: textReply }, "[SecretMessages] text-reply delivered");
        // Deliver to original sender's inbox
        if (senderSocketId) {
          _io?.to(senderSocketId).emit("home:chat_receive", { message: replyMsg });
          const senderInbox = msgs.filter((m) => m.receiverPlayerId === msg.senderPlayerId);
          _io?.to(senderSocketId).emit("home:chat_inbox_update", { inbox: senderInbox });
        }
        // Confirm to reactor (so their sent list updates)
        const reactorSocketId = homePlayerToSocket.get(playerId);
        if (reactorSocketId) {
          _io?.to(reactorSocketId).emit("home:chat_receive", { message: replyMsg });
        }
      }
    });

    socket.on("home:chat_mark_read", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const playerId  = typeof d["playerId"]  === "string" ? d["playerId"]  : null;
      const messageId = typeof d["messageId"] === "string" ? d["messageId"] : null;
      if (!sessionId || !playerId || !messageId) return;

      const msgs = chatMessages.get(sessionId);
      if (!msgs) return;
      const msg = msgs.find((m) => m.id === messageId && m.receiverPlayerId === playerId);
      if (!msg || msg.readAt) return;
      msg.readAt = Date.now();

      const inbox = msgs.filter((m) => m.receiverPlayerId === playerId);
      socket.emit("home:chat_inbox_update", { inbox });
    });

    socket.on("home:chat_toggle_dnd", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const playerId  = typeof d["playerId"]  === "string" ? d["playerId"]  : null;
      const dnd       = d["dnd"] === true;
      if (!sessionId || !playerId) return;

      chatDnd.set(`${sessionId}:${playerId}`, dnd);
      socket.emit("home:chat_dnd_updated", { playerId, dnd });
      logger.info({ sessionId, playerId, dnd }, "[SecretMessages] dnd");
    });

    socket.on("home:chat_tv_batch_shown", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId  = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const messageIds = Array.isArray(d["messageIds"])
        ? (d["messageIds"] as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      if (!sessionId || messageIds.length === 0) return;

      const queue = chatTvQueue.get(sessionId) ?? [];
      chatTvQueue.set(sessionId, queue.filter((m) => !messageIds.includes(m.id)));
      logger.info({ sessionId, shownCount: messageIds.length, remaining: chatTvQueue.get(sessionId)!.length }, "[SecretMessages] tv batch shown");
    });

    socket.on("home:chat_get_inbox", (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const d = data as Record<string, unknown>;
      const sessionId = typeof d["sessionId"] === "string" ? d["sessionId"] : null;
      const playerId  = typeof d["playerId"]  === "string" ? d["playerId"]  : null;
      if (!sessionId || !playerId) return;

      const msgs = chatMessages.get(sessionId) ?? [];
      const inbox = msgs.filter((m) => m.receiverPlayerId === playerId);
      socket.emit("home:chat_inbox_update", { inbox });
    });
  });
}

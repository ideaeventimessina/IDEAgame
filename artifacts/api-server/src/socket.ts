import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { logger } from "./lib/logger";

let _io: SocketServer | null = null;

/**
 * Attach Socket.IO to the raw HTTP server.
 * socket.io registers its own "request" listener on the server (for polling)
 * and its "upgrade" listener (for WebSocket). After this call, io.engine is set.
 *
 * The caller must also add its own "request" listener that passes
 * non-socket.io requests to Express (see index.ts).
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

    socket.on("join:event", (eventId: string) => {
      if (typeof eventId === "string" && eventId.length > 0) {
        socket.join(`event:${eventId}`);
        logger.info({ sid: socket.id, eventId }, "ws:join");
      }
    });

    socket.on("leave:event", (eventId: string) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on("disconnect", (reason) => {
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

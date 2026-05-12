import { createServer } from "node:http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import { db, playersTable, tenantsTable, usersTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// On startup, ensure critical users exist (idempotent — safe to run every boot)
async function ensureUsers(): Promise<void> {
  try {
    const existing = await db.select().from(usersTable)
      .where(eq(usersTable.email, "ideaeventime@gmail.com")).limit(1);
    if (existing.length > 0) return;

    // Create tenant
    const [tenant] = await db.insert(tenantsTable).values({
      slug: "ideaeventime", name: "IDEAeventime", plan: "pro",
      brandColor: "#F5B642", locale: "it", mrr: 0,
    }).returning();

    // Create user
    const pwd = await bcrypt.hash("ideagame", 10);
    await db.insert(usersTable).values({
      email: "ideaeventime@gmail.com", name: "IDEAeventime Owner",
      role: "tenant_owner", locale: "it", passwordHash: pwd, tenantId: tenant!.id,
    });

    // Create demo event
    await db.insert(eventsTable).values({
      tenantId: tenant!.id, name: "Demo IDEAeventime", venue: "Demo Venue",
      startsAt: new Date(), status: "live", brandColor: "#F5B642",
      expectedPlayers: 20,
      enabledGames: ["percorso-a-risate", "gioco-delle-coppie", "quizzone"],
      joinCode: "IDEA01",
    });

    logger.info("startup: created ideaeventime tenant + user");
  } catch (err) {
    logger.error({ err }, "startup: ensureUsers failed (non-fatal)");
  }
}

// On startup, mark all players as disconnected.
// Any player whose phone is still open will re-emit player:register via Socket.IO
// and be flipped back to isConnected=true within seconds.
// This prevents ghost "connected" players from a previous server session.
async function resetStaleConnections(): Promise<void> {
  try {
    const result = await db
      .update(playersTable)
      .set({ isConnected: false });
    logger.info({ rowCount: (result as unknown as { rowCount?: number }).rowCount ?? "?" }, "startup: reset stale player connections");
  } catch (err) {
    logger.error({ err }, "startup: failed to reset stale player connections (non-fatal)");
  }
}

// Create the raw HTTP server WITHOUT a request handler.
// socket.io will register its own "request" + "upgrade" listeners via attach().
// We then add a separate "request" listener that routes non-socket.io traffic to Express.
// This avoids Express's synchronous 404 handler racing with socket.io's async response.
const server = createServer();

// socket.io attaches itself (sets io.engine, registers request + upgrade listeners)
initSocket(server);

// Forward non-socket.io HTTP requests to Express
server.on("request", (req, res) => {
  if (!req.url?.startsWith("/socket.io")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any)(req, res);
  }
  // /socket.io/* requests are already handled by socket.io's listener (registered above)
});

// Ensure critical users exist, reset stale connections, then start listening
ensureUsers().then(() => resetStaleConnections()).finally(() => {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});

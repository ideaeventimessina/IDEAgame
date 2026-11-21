/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { createServer } from "node:http";
import app from "./app";
import { initSocket, initHomeSocketHandlers } from "./socket";
import { logger } from "./lib/logger";
import { db, pool, playersTable, tenantsTable, usersTable, eventsTable } from "@workspace/db";
import { ensureAuthTables } from "./lib/auth-tables";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// Keep the process alive on unhandled errors — log and continue rather than crash
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — server kept alive");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection — server kept alive");
});

// Graceful shutdown: release port immediately on SIGTERM/SIGINT so that a
// rapid restart (e.g. Replit workflow restart) never hits EADDRINUSE.
function shutdown(signal: string) {
  logger.info({ signal }, "shutdown signal received — closing server");
  server.close(() => {
    logger.info("server closed cleanly");
    process.exit(0);
  });
  // Force-exit after 3 s if connections are still draining
  setTimeout(() => process.exit(1), 3000).unref();
}

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

// All'avvio: l'account proprietario esiste, e la sua password NON sta nel codice.
// La password viene dal Secret IDEAGAME_OWNER_PASSWORD. Se l'account usa ancora la
// vecchia password di fabbrica (che era scritta in questo repo pubblico), viene
// sostituita con quella del Secret; senza Secret l'avviso finisce nel log.
const OWNER_EMAIL = "ideaeventime@gmail.com";
const PASSWORD_DI_FABBRICA = "ideagame"; // già pubblica: serve solo a riconoscerla

// Ogni account che usa ancora la password di fabbrica (pubblicata su GitHub, anche
// negli utenti di demo creati da seed.ts) viene chiuso: il proprietario passa alla
// password del Secret, gli altri ricevono una password casuale che nessuno conosce
// (per riaprirli serve impostare loro una password nuova).
async function chiudiPasswordDiFabbrica(ownerPassword: string | undefined): Promise<void> {
  const utenti = await db.select({ id: usersTable.id, email: usersTable.email, passwordHash: usersTable.passwordHash })
    .from(usersTable).limit(500);
  for (const u of utenti) {
    if (!u.passwordHash || !(await bcrypt.compare(PASSWORD_DI_FABBRICA, u.passwordHash))) continue;
    if (u.email === OWNER_EMAIL) {
      if (ownerPassword && ownerPassword.length >= 12) {
        await db.update(usersTable).set({ passwordHash: await bcrypt.hash(ownerPassword, 12) })
          .where(eq(usersTable.id, u.id));
        logger.warn("startup: password di fabbrica del proprietario sostituita con IDEAGAME_OWNER_PASSWORD");
      } else {
        logger.error("startup: il proprietario usa ancora la password di fabbrica, pubblicata su GitHub. Metti il Secret IDEAGAME_OWNER_PASSWORD (almeno 12 caratteri) e ripubblica.");
      }
      continue;
    }
    await db.update(usersTable)
      .set({ passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) })
      .where(eq(usersTable.id, u.id));
    logger.warn({ email: u.email }, "startup: account con password di fabbrica bloccato");
  }
}

async function ensureUsers(): Promise<void> {
  try {
    const ownerPassword = process.env["IDEAGAME_OWNER_PASSWORD"];
    const existing = await db.select().from(usersTable)
      .where(eq(usersTable.email, OWNER_EMAIL)).limit(1);

    await chiudiPasswordDiFabbrica(ownerPassword);
    if (existing.length > 0) {
      return;
    }

    if (!ownerPassword || ownerPassword.length < 12) {
      logger.error("startup: proprietario non creato — manca il Secret IDEAGAME_OWNER_PASSWORD (almeno 12 caratteri)");
      return;
    }

    // Create tenant
    const [tenant] = await db.insert(tenantsTable).values({
      slug: "ideaeventime", name: "IDEAeventime", plan: "pro",
      brandColor: "#F5B642", locale: "it", mrr: 0,
    }).returning();

    // Create user
    const pwd = await bcrypt.hash(ownerPassword, 12);
    await db.insert(usersTable).values({
      email: OWNER_EMAIL, name: "IDEAeventime Owner",
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

// Register graceful-shutdown handlers now that `server` is in scope
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// socket.io attaches itself (sets io.engine, registers request + upgrade listeners)
const io = initSocket(server);
// Register home-session socket handlers (join:home, leave:home, home:player_register)
initHomeSocketHandlers(io);

// Forward non-socket.io HTTP requests to Express
server.on("request", (req, res) => {
  if (!req.url?.startsWith("/socket.io")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any)(req, res);
  }
  // /socket.io/* requests are already handled by socket.io's listener (registered above)
});

// Ensure critical users exist, reset stale connections, then start listening
// Prima di tutto le tabelle dell'accesso (sessioni + reset password): migrazione
// idempotente, solo CREATE IF NOT EXISTS. Se fallisce lo si scrive nel log e si
// parte lo stesso (le tabelle probabilmente esistono già).
ensureAuthTables(pool)
  .catch((err) => logger.error({ err }, "startup: ensureAuthTables failed (non-fatal)"))
  .then(() => ensureUsers())
  .then(() => resetStaleConnections())
  .finally(() => {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});

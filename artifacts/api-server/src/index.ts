import { createServer } from "node:http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";

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

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

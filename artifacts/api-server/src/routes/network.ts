import { Router, type IRouter } from "express";
import os from "node:os";

const router: IRouter = Router();

/**
 * GET /network/info  — public, no auth required
 * Returns the server's local IPv4 addresses so the client can build
 * a local-network QR URL for offline/LAN party play.
 */
router.get("/network/info", (_req, res): void => {
  const nets = os.networkInterfaces();
  const localIps: string[] = [];

  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      // Only private IPv4, not loopback
      if (
        iface.family === "IPv4" &&
        !iface.internal &&
        (iface.address.startsWith("192.168.") ||
          iface.address.startsWith("10.") ||
          iface.address.startsWith("172."))
      ) {
        localIps.push(iface.address);
      }
    }
  }

  res.json({
    localIps,
    hostname: os.hostname(),
    port: process.env["PORT"] ?? "8080",
  });
});

export default router;

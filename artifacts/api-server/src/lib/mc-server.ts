/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

// Mission Control — middleware di CARICO lato server.
// Segnala OGNI richiesta alla plancia (req/min, latenza p95, errori 5xx). Cattura
// tutto il traffico (utenti, API, bot, stress test), non solo i browser con JS.
// Fire-and-forget: non blocca né rompe mai l'app.

import type { Request, Response, NextFunction, RequestHandler } from "express";

interface Hit {
  path: string;
  status: number;
  ms: number;
  ts: number;
}

export function missionControlLoad(opts: { project: string; endpoint?: string; flushEveryMs?: number; batchMax?: number }): RequestHandler {
  const project = opts.project;
  const endpoint = (opts.endpoint || process.env.MISSION_CONTROL_ENDPOINT || "https://lastanza.replit.app").replace(/\/+$/, "");
  const flushEveryMs = opts.flushEveryMs ?? 5000;
  const batchMax = opts.batchMax ?? 50;
  const url = endpoint + "/api/ingest";

  let buffer: Hit[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const token = process.env.MISSION_CONTROL_TOKEN || "";
    if (!buffer.length || !token) {
      buffer = [];
      return;
    }
    const hits = buffer;
    buffer = [];
    try {
      const f = (globalThis as { fetch?: typeof fetch }).fetch;
      if (!f) return;
      await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mission-Token": token },
        body: JSON.stringify({ p: project, hits }),
      });
    } catch {
      // il monitoraggio non deve mai rompere l'app
    }
  }

  return function missionControlLoadMiddleware(req: Request, res: Response, next: NextFunction): void {
    const t0 = Date.now();
    res.on("finish", () => {
      buffer.push({
        path: String(req.path || req.url || "").slice(0, 120),
        status: res.statusCode,
        ms: Date.now() - t0,
        ts: Date.now(),
      });
      if (buffer.length >= batchMax) void flush();
      else if (!timer) timer = setTimeout(() => void flush(), flushEveryMs);
    });
    next();
  };
}

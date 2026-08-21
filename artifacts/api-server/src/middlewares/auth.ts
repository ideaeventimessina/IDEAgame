/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import type { Request, Response, NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runWithAiUsageContext } from "@workspace/integrations-openai-ai-server";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedRequest extends Request {
  user?: User;
}

/* Oltre a risolvere req.user dalla sessione, propaga tenantId/userId nel
   contesto AsyncLocalStorage letto dai client OpenAI centralizzati (vedi
   @workspace/integrations-openai-ai-server/context) cosi' ogni chiamata AI
   fatta durante questa richiesta viene loggata gia' attribuita a tenant/utente,
   senza che ogni route debba passarli esplicitamente. */
export async function loadUser(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const uid = req.session?.userId;
  if (!uid) {
    runWithAiUsageContext({ tenantId: null, userId: null }, next);
    return;
  }
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (u) req.user = u;
  runWithAiUsageContext({ tenantId: u?.tenantId ?? null, userId: u?.id ?? null }, next);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role === "super_admin") { next(); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

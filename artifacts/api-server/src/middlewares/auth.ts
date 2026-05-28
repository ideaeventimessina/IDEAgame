import type { Request, Response, NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedRequest extends Request {
  user?: User;
}

export async function loadUser(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const uid = req.session?.userId;
  if (!uid) return next();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (u) req.user = u;
  next();
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

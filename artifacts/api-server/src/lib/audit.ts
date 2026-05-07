import { db, auditLogTable } from "@workspace/db";
import type { AuthedRequest } from "../middlewares/auth";

export async function audit(
  req: AuthedRequest,
  action: string,
  targetType: string,
  targetId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      tenantId: req.user?.tenantId ?? null,
      userId: req.user?.id ?? null,
      action,
      targetType,
      targetId,
      payload,
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "audit_log_failed");
  }
}

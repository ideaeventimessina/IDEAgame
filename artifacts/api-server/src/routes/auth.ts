/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Router, type IRouter, type Response } from "express";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, usersTable, tenantsTable, passwordResetTokensTable, userSessionsTable } from "@workspace/db";
import { emailConfigured, sendEmail } from "../lib/email";
import {
  DURATA_TOKEN_MS, nuovoToken, hashToken, tokenBenFormato, controllaNuovaPassword,
  statoToken, linkReset, emailResetHtml,
} from "../lib/password-reset";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function meFor(userId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return null;
  let tenantName: string | null = null;
  if (u.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, u.tenantId));
    tenantName = t?.name ?? null;
  }
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale,
    tenantId: u.tenantId, tenantName,
  };
}

router.post("/auth/login", async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }

  req.session.userId = user.id;
  const me = await meFor(user.id);
  res.json(LoginResponse.parse(me));
});

router.post("/auth/logout", (req: AuthedRequest, res: Response): void => {
  req.session.destroy(() => {
    res.clearCookie("ideagame.sid");
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const me = await meFor(req.user!.id);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(GetMeResponse.parse(me));
});

/* ── Password dimenticata ─────────────────────────────────────────────────────
   1) POST /auth/password/forgot { email } → se l'account esiste parte un'email
      con un link monouso (30 min). Risposta SEMPRE identica: non rivela chi è iscritto.
   2) POST /auth/password/reset { token, password } → nuova password, token bruciato,
      tutte le sessioni aperte di quell'utente chiuse.
   Senza RESEND_API_KEY l'email non può partire: in quel caso la password la
   reimposta il super_admin (PATCH /api/users/:id { password }). */
const RISPOSTA_FORGOT = { ok: true, messaggio: "Se l'indirizzo è registrato, riceverai un'email con il link per reimpostare la password." };

function baseUrlPubblico(req: AuthedRequest): string {
  const fisso = (process.env["IDEAGAME_PUBLIC_URL"] ?? "").trim();
  if (fisso) return fisso;
  return `${req.protocol}://${req.get("host") ?? "ideagame.it"}`;
}

router.post("/auth/password/forgot", async (req: AuthedRequest, res: Response): Promise<void> => {
  const email = String((req.body as Record<string, unknown> | undefined)?.["email"] ?? "").trim().toLowerCase().slice(0, 254);
  if (!email || !email.includes("@")) { res.status(400).json({ error: "Email non valida." }); return; }
  if (!emailConfigured()) {
    req.log.warn("password forgot: RESEND_API_KEY assente, nessuna email inviata");
    res.json(RISPOSTA_FORGOT);
    return;
  }
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.email, email));
  if (user) {
    const token = nuovoToken();
    await db.insert(passwordResetTokensTable).values({
      userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + DURATA_TOKEN_MS),
    });
    const inviata = await sendEmail(user.email, "Reimposta la password — IDEAgame", emailResetHtml(linkReset(baseUrlPubblico(req), token)));
    if (!inviata) req.log.error("password forgot: invio email fallito");
  }
  res.json(RISPOSTA_FORGOT);
});

router.post("/auth/password/reset", async (req: AuthedRequest, res: Response): Promise<void> => {
  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const token = corpo["token"];
  if (!tokenBenFormato(token)) { res.status(400).json({ error: "Link non valido o scaduto." }); return; }
  const errPwd = controllaNuovaPassword(corpo["password"]);
  if (errPwd) { res.status(400).json({ error: errPwd }); return; }
  const tokenHash = hashToken(token);
  const [riga] = await db.select().from(passwordResetTokensTable).where(eq(passwordResetTokensTable.tokenHash, tokenHash));
  if (statoToken(riga, new Date()) !== "valido") { res.status(400).json({ error: "Link non valido o scaduto." }); return; }
  const passwordHash = await bcrypt.hash(String(corpo["password"]), 12);
  const fatto = await db.transaction(async (tx) => {
    // Brucia il token in modo atomico: due invii contemporanei, uno solo vince.
    const bruciato = await tx.update(passwordResetTokensTable).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokensTable.id, riga!.id), isNull(passwordResetTokensTable.usedAt)))
      .returning({ id: passwordResetTokensTable.id });
    if (!bruciato.length) return false;
    await tx.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, riga!.userId));
    // Chi aveva rubato la sessione resta fuori: si chiudono tutte le sessioni dell'utente.
    await tx.delete(userSessionsTable).where(sql`${userSessionsTable.sess}->>'userId' = ${riga!.userId}`);
    return true;
  });
  if (!fatto) { res.status(400).json({ error: "Link non valido o scaduto." }); return; }
  res.json({ ok: true });
});

export default router;

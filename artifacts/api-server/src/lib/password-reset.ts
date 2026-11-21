/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Reset password via email: parti pure (testabili senza DB) ────────────────
   Il token viaggia solo nell'email; nel DB c'è il suo SHA-256. Vale 30 minuti,
   una volta sola. La richiesta risponde sempre uguale (che l'email esista o no):
   così non si scopre chi è registrato.
──────────────────────────────────────────────────────────────────────────── */

import { createHash, randomBytes } from "node:crypto";

export const DURATA_TOKEN_MS = 30 * 60 * 1000;
export const PASSWORD_MIN = 10;

export function nuovoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Forma del token (43 caratteri base64url): scarta subito spazzatura e input enormi. */
export function tokenBenFormato(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function controllaNuovaPassword(p: unknown): string | null {
  if (typeof p !== "string") return "Password mancante.";
  if (p.length < PASSWORD_MIN) return `La password deve avere almeno ${PASSWORD_MIN} caratteri.`;
  if (p.length > 200) return "Password troppo lunga.";
  return null;
}

export type RigaToken = { expiresAt: Date; usedAt: Date | null };

export function statoToken(riga: RigaToken | undefined, adesso: Date): "valido" | "inesistente" | "usato" | "scaduto" {
  if (!riga) return "inesistente";
  if (riga.usedAt) return "usato";
  if (riga.expiresAt.getTime() <= adesso.getTime()) return "scaduto";
  return "valido";
}

export function linkReset(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function emailResetHtml(link: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="color:#7c3aed">Reimposta la password di IDEAgame</h2>
      <p>Qualcuno (speriamo tu) ha chiesto di cambiare la password del tuo account.</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Scegli una nuova password</a></p>
      <p style="color:#555">Il link vale 30 minuti e funziona una volta sola. Se non sei stato tu, ignora questa email: la password resta quella di prima.</p>
    </div>`;
}

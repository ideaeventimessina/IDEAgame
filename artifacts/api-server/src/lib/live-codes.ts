/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Codici serata Live ──────────────────────────────────────────────────────
   Dopo un pagamento Stripe riuscito si genera un CODICE monouso che sblocca una
   serata in modalità FULL (Live). Nessuna registrazione: il cliente inserisce il
   codice quando crea la stanza. Il registro vive nella tabella esistente
   game_media_slots (gameSlug "_livecodes"), nessuna migrazione.
   - riga `code:<CODICE>`  → JSON { exp, used, source }   (stato del codice)
   - riga `cs:<stripeId>`  → il CODICE emesso per quel checkout (idempotenza)
──────────────────────────────────────────────────────────────────────────── */

import { db, gameMediaSlotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

const SLUG = "_livecodes";
const VALIDITY_MS = 48 * 60 * 60 * 1000; // il codice vale 48h per giocare la serata

interface CodeState { exp: number; used: boolean; source?: string }

async function readSlot(slotKey: string): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(gameMediaSlotsTable)
      .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, slotKey)))
      .limit(1);
    return row?.value ?? undefined;
  } catch { return undefined; }
}

async function writeSlot(slotKey: string, value: string, label: string): Promise<void> {
  // tenantId è null qui → l'unique (tenantId,gameSlug,slotKey) non "vede" i null come
  // conflitto, quindi facciamo read-then-insert/update a mano (come image-cache).
  const [existing] = await db.select({ id: gameMediaSlotsTable.id }).from(gameMediaSlotsTable)
    .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, slotKey))).limit(1);
  if (existing) {
    await db.update(gameMediaSlotsTable).set({ value }).where(eq(gameMediaSlotsTable.id, existing.id));
  } else {
    await db.insert(gameMediaSlotsTable).values({ gameSlug: SLUG, slotKey, value, valueType: "livecode", label: label.slice(0, 120) });
  }
}

function newCode(): string {
  // 8 caratteri leggibili (no 0/O/1/I), formato LIVE-XXXX-XXXX
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += A[b[i]! % A.length];
  return `LIVE-${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * Genera (o ri-restituisce, idempotente) il codice serata per un checkout Stripe.
 * Da chiamare SOLO dopo aver verificato che il pagamento è andato a buon fine.
 */
export async function issueLiveCodeForCheckout(stripeSessionId: string): Promise<string> {
  const existing = await readSlot(`cs:${stripeSessionId}`);
  if (existing) return existing; // già emesso per questo pagamento
  const code = newCode();
  const state: CodeState = { exp: Date.now() + VALIDITY_MS, used: false, source: "stripe" };
  await writeSlot(`code:${code}`, JSON.stringify(state), "codice serata Live");
  await writeSlot(`cs:${stripeSessionId}`, code, "checkout→codice");
  return code;
}

/** Il codice è valido e non ancora usato/scaduto? (non lo consuma). */
export async function checkLiveCode(code: string): Promise<boolean> {
  const raw = await readSlot(`code:${normalize(code)}`);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw) as CodeState;
    return !s.used && Date.now() < s.exp;
  } catch { return false; }
}

/** Consuma il codice (monouso). true se era valido e ora è marcato usato. */
export async function consumeLiveCode(code: string): Promise<boolean> {
  const key = `code:${normalize(code)}`;
  const raw = await readSlot(key);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw) as CodeState;
    if (s.used || Date.now() >= s.exp) return false;
    s.used = true;
    await writeSlot(key, JSON.stringify(s), "codice serata Live (usato)");
    return true;
  } catch { return false; }
}

function normalize(code: string): string {
  return String(code).toUpperCase().trim();
}

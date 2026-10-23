// Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M
/* ─── QA: genera codici serata LIVE di TEST ───────────────────────────────────
   Inserisce N codici "QATEST01..QATESTnn" nel registro live (game_media_slots,
   slug "_livecodes") così il collaudo può creare serate in modalità FULL senza
   pagare. Stesso formato di lib/live-codes.ts: code:<CODICE> → { exp, used, source }.
   MONOUSO: ogni codice sblocca UNA serata; ri-lanciare lo script li RESETTA (used:false).

   NON è un endpoint pubblico (nessun buco: va eseguito a mano sulla shell del server).
   Uso (su Replit, dove DATABASE_URL è impostata):
     node scripts/qa-mint-live-codes.mjs 30      # crea/azzera 30 codici di test
     node scripts/qa-mint-live-codes.mjs --clear # cancella tutti i QATEST
──────────────────────────────────────────────────────────────────────────── */
import { db, gameMediaSlotsTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";

const SLUG = "_livecodes";
const VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni, per comodità di collaudo

async function writeSlot(slotKey, value) {
  const [existing] = await db.select({ id: gameMediaSlotsTable.id }).from(gameMediaSlotsTable)
    .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), eq(gameMediaSlotsTable.slotKey, slotKey))).limit(1);
  if (existing) await db.update(gameMediaSlotsTable).set({ value }).where(eq(gameMediaSlotsTable.id, existing.id));
  else await db.insert(gameMediaSlotsTable).values({ gameSlug: SLUG, slotKey, value, valueType: "livecode", label: "QA test live code" });
}

const arg = process.argv[2] ?? "30";
if (arg === "--clear") {
  const rows = await db.select().from(gameMediaSlotsTable)
    .where(and(eq(gameMediaSlotsTable.gameSlug, SLUG), like(gameMediaSlotsTable.slotKey, "code:QATEST%")));
  for (const r of rows) await db.delete(gameMediaSlotsTable).where(eq(gameMediaSlotsTable.id, r.id));
  console.log(`🧹 rimossi ${rows.length} codici QATEST`);
  process.exit(0);
}

const n = Math.min(100, Math.max(1, parseInt(arg, 10) || 30));
const codes = [];
for (let i = 1; i <= n; i++) {
  const code = `QATEST${String(i).padStart(2, "0")}`;
  const state = { exp: Date.now() + VALIDITY_MS, used: false, source: "qa" };
  await writeSlot(`code:${code}`, JSON.stringify(state));
  codes.push(code);
}
console.log(`✅ ${n} codici LIVE di test pronti (validi 30gg, monouso, ri-lancia per azzerarli):`);
console.log(codes.join(", "));
console.log("\nUsali nella creazione serata come campo liveCode (es. liveCode:\"QATEST01\").");
process.exit(0);

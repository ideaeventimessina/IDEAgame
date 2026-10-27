// Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M
/* ─── QA: genera codici serata LIVE di TEST ───────────────────────────────────
   Inserisce codici "QATEST01..QATESTnn" nel registro live (game_media_slots,
   slug "_livecodes") così il collaudo può creare serate in modalità FULL senza
   pagare. Stesso formato di lib/live-codes.ts: code:<CODICE> → { exp, used, source }.
   MONOUSO: ogni codice sblocca UNA serata; ri-lanciare lo script li RESETTA (freschi).

   Usa `pg` DIRETTO (niente import di @workspace/db, che è TypeScript non eseguibile da
   node puro). Richiede DATABASE_URL (presente su Replit / nei Secrets).

   Uso (su Replit, repo root):
     node scripts/qa-mint-live-codes.mjs 30      # crea/azzera 30 codici di test
     node scripts/qa-mint-live-codes.mjs --clear # cancella tutti i QATEST
──────────────────────────────────────────────────────────────────────────── */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
// pg vive nei node_modules dei workspace (pnpm non hoista in root): lo risolvo da api-server.
let pg;
for (const base of ["artifacts/api-server/package.json", "lib/db/package.json", "package.json"]) {
  try { pg = createRequire(join(root, base))("pg"); break; } catch { /* prova il prossimo */ }
}
if (!pg) { console.error("❌ Modulo 'pg' non trovato. Lancia dopo `pnpm install`."); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("❌ DATABASE_URL assente (serve sul server/Replit)."); process.exit(1); }

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SLUG = "_livecodes";
const VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

async function main() {
  const arg = process.argv[2] ?? "30";
  // Pulisce sempre i QATEST esistenti (reset); se --clear, si ferma qui.
  const del = await pool.query("DELETE FROM game_media_slots WHERE game_slug=$1 AND slot_key LIKE 'code:QATEST%'", [SLUG]);
  if (arg === "--clear") { console.log(`🧹 rimossi ${del.rowCount} codici QATEST`); return; }

  const n = Math.min(100, Math.max(1, parseInt(arg, 10) || 30));
  const codes = [];
  for (let i = 1; i <= n; i++) {
    const code = `QATEST${String(i).padStart(2, "0")}`;
    const state = JSON.stringify({ exp: Date.now() + VALIDITY_MS, used: false, source: "qa" });
    await pool.query(
      "INSERT INTO game_media_slots (game_slug, slot_key, value, value_type, label) VALUES ($1,$2,$3,'livecode','QA test live code')",
      [SLUG, `code:${code}`, state],
    );
    codes.push(code);
  }
  console.log(`✅ ${n} codici LIVE di test pronti (validi 30gg, monouso, ri-lancia per azzerarli):`);
  console.log(codes.join(", "));
  console.log('\nUsali come campo liveCode nella creazione serata (es. liveCode:"QATEST01").');
}

main().then(() => pool.end()).then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });

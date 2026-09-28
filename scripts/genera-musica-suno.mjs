/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Genera la colonna sonora di Jonny's World con Suno e scarica gli MP3 a tema.
 *
 * PERCHÉ ESISTE: dalla sessione Claude non si possono fare chiamate HTTP con la
 * chiave (blocco anti-exfiltration dell'harness). Questo script lo lanci TU in
 * locale, dove la chiave c'è (`~/.ideagame-secrets.env` → SUNO_API_KEY) e non
 * c'è alcun blocco. Genera una traccia strumentale in loop per ogni scena del
 * gioco e la salva in `artifacts/ideagame/public/audio/jonny-world/<slug>/<type>.mp3`.
 *
 * USO:
 *   set -a; . ~/.ideagame-secrets.env; set +a
 *   node scripts/genera-musica-suno.mjs --probe        # verifica provider + crediti (NON genera)
 *   node scripts/genera-musica-suno.mjs                 # genera TUTTE le scene
 *   node scripts/genera-musica-suno.mjs hub quizzone    # genera solo alcune scene
 *
 * PROVIDER: default api.sunoapi.org (il wrapper più diffuso per una SUNO_API_KEY).
 * Se usi un altro provider, passa l'endpoint:  SUNO_BASE=https://api.tuo-provider.com
 *
 * NB: consuma crediti Suno veri. `--probe` prima, sempre.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const OUT_ROOT = join(REPO, 'artifacts/ideagame/public/audio/jonny-world');

const KEY = process.env.SUNO_API_KEY;
const BASE = (process.env.SUNO_BASE || 'https://api.sunoapi.org').replace(/\/+$/, '');
const MODEL = process.env.SUNO_MODEL || 'V4';

if (!KEY) {
  console.error('❌ SUNO_API_KEY non trovata. Fai:  set -a; . ~/.ideagame-secrets.env; set +a');
  process.exit(1);
}

/**
 * Una traccia per scena. `type` = slot dell'AudioManager (lobby_loop = attesa,
 * round_loop = durante il gioco). Prompt = STILE, mood, strumenti. Instrumental
 * = niente voce (la voce è di Jonny, non della base). ~2-3 min, loopabile.
 */
const SCENES = [
  { slug: 'hub',                type: 'lobby_loop', title: "Jonny's World — Lobby",      style: 'upbeat playful game-show funk, bright synths, claps, warm bass, welcoming, loopable, no vocals' },
  { slug: 'quizzone',           type: 'round_loop', title: 'Quizzone',                   style: 'tense quiz game-show underscore, ticking pulse, suspense strings, driving, loopable, no vocals' },
  { slug: 'sfida-ballo',        type: 'lobby_loop', title: 'Sfida Ballo',                style: 'high energy dance pop, four-on-the-floor, euphoric synths, festival, loopable, no vocals' },
  { slug: 'gioco-coppie',       type: 'lobby_loop', title: 'Gioco delle Coppie',         style: 'warm romantic lounge, soft rhodes, gentle groove, tender, loopable, no vocals' },
  { slug: 'percorso-a-risate',  type: 'lobby_loop', title: 'Percorso a Risate',          style: 'bouncy comedic cartoon, pizzicato, tuba, playful whistles, silly fun, loopable, no vocals' },
  { slug: 'adult-only',         type: 'lobby_loop', title: 'Adult',                      style: 'slow sultry after-dark groove, deep bass, smoky sax pad, sensual, tasteful, loopable, no vocals' },
  { slug: 'karaoke-battle',     type: 'lobby_loop', title: 'Karaoke Battle',             style: 'glossy stage pop backing, spotlight energy, punchy drums, anthemic, loopable, no vocals' },
  { slug: 'saramusica',         type: 'lobby_loop', title: 'SaraMusica',                 style: 'jazzy musical quiz swing, brushed drums, upright bass, vibraphone, classy, loopable, no vocals' },
  { slug: 'parola-alle-spalle', type: 'lobby_loop', title: 'Parola alle Spalle',         style: 'quirky curious detective groove, muted guitar, marimba, cheeky, loopable, no vocals' },
  { slug: 'freestyle-battle',   type: 'lobby_loop', title: 'Freestyle Battle',           style: 'boom-bap hip hop instrumental, fat 808 bass, vinyl crackle, headnod groove, loopable, no vocals' },
];

const H = () => ({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe() {
  console.log(`🔎 Provider: ${BASE}`);
  const urls = [`${BASE}/api/v1/generate/credit`, `${BASE}/api/v1/get-credits`];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: H() });
      const t = (await r.text()).slice(0, 300);
      console.log(`   ${u} → HTTP ${r.status}  ${t.replace(/\s+/g, ' ')}`);
      if (r.ok) return true;
    } catch (e) { console.log(`   ${u} → ERR ${e.message}`); }
  }
  console.log('⚠️  Nessun endpoint crediti ha risposto 200. Controlla SUNO_BASE / la chiave.');
  return false;
}

async function generateOne(scene) {
  // sunoapi.org: POST /api/v1/generate (customMode+instrumental), poi polling record-info
  const body = {
    prompt: scene.style,
    style: scene.style,
    title: scene.title,
    customMode: true,
    instrumental: true,
    model: MODEL,
    // sunoapi.org ESIGE un callBackUrl anche se poi facciamo polling (record-info).
    // Placeholder valido: non deve ricevere nulla, ci basta il polling.
    callBackUrl: process.env.SUNO_CALLBACK || 'https://ideagame.it/api/suno-callback',
  };
  const r = await fetch(`${BASE}/api/v1/generate`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const taskId = j?.data?.taskId || j?.data?.task_id || j?.taskId;
  if (!r.ok || !taskId) throw new Error(`generate fallita HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  console.log(`   task ${taskId} — attendo…`);

  // Polling fino a SUCCESS (max ~5 min)
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pr = await fetch(`${BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, { headers: H() });
    const pj = await pr.json().catch(() => ({}));
    const st = pj?.data?.status || pj?.status;
    const items = pj?.data?.response?.sunoData || pj?.data?.data || pj?.data?.items || [];
    const audioUrl = items?.[0]?.audioUrl || items?.[0]?.audio_url;
    if (st && /SUCCESS|complete|SUCCEEDED/i.test(String(st)) && audioUrl) return audioUrl;
    if (st && /FAIL|ERROR/i.test(String(st))) throw new Error(`generazione fallita: ${st}`);
    process.stdout.write('.');
  }
  throw new Error('timeout polling (5 min)');
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--probe')) { await probe(); return; }

  const only = args.filter((a) => !a.startsWith('--'));
  const todo = only.length ? SCENES.filter((s) => only.includes(s.slug)) : SCENES;
  console.log(`🎼 Genero ${todo.length} tracce su ${BASE}\n`);

  const results = [];
  for (const s of todo) {
    console.log(`▶︎ ${s.slug} (${s.type}) — "${s.title}"`);
    try {
      const url = await generateOne(s);
      const dest = join(OUT_ROOT, s.slug, `${s.type}.mp3`);
      const bytes = await download(url, dest);
      console.log(`\n   ✅ salvato ${dest} (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`);
      results.push({ slug: s.slug, ok: true });
    } catch (e) {
      console.log(`\n   ❌ ${s.slug}: ${e.message}\n`);
      results.push({ slug: s.slug, ok: false, err: e.message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== FATTO: ${ok}/${results.length} tracce ===`);
  console.log('I file statici sono già serviti da AudioManager (fallback loop). Committa la cartella public/audio/jonny-world e ridistribuisci.');
}

main().catch((e) => { console.error(e); process.exit(1); });

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── QA FACCE — il volto giusto al posto giusto, su OGNI tavolo e OGNI dealer ────
   Nasce dal feedback della prima serata (festa di Marcantonio Cucè): "le facce
   comparivano solo alla roulette, non sugli dealer né agli altri tavoli".
   Questo collaudo lo smonta in modo misurabile contro un backend VIVO:
     · crea una serata segnapunti con 4 tavoli (roulette, blackjack, 7½, sprint);
     · fa entrare 4 ospiti, OGNUNO con un selfie DIVERSO (PNG 1×1 di colore unico);
     · verifica che la GALLERIA di ogni dealer mostri tutte le facce con l'avatar
       corretto (il dealer assegna i punti riconoscendo la faccia);
     · siede un ospite a ciascun tavolo e verifica che il MONITOR 80" mostri il
       volto giusto nel posto giusto (roulette, blackjack, 7½, sprint).
   A fine prova chiude la serata (cleanup).  Uso:
     node artifacts/api-server/scripts/qa-faces.mjs            # prod (ideagame.it)
     BASE=http://localhost:3000 node .../qa-faces.mjs          # locale
*/

import zlib from "node:zlib";

const BASE = (process.env.BASE || "https://ideagame.it").replace(/\/$/, "");
const API = BASE + "/api";
const T = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

async function api(path, body, method = "POST") {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    signal: T(12000),
  });
  let b = null; try { b = await r.json(); } catch { /* no body */ }
  return { status: r.status, body: b };
}

// ── genera un PNG 1×1 VALIDO e UNICO per colore (così ogni ospite ha un volto distinto) ──
function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; // 1×1, 8-bit, truecolor
  const idat = zlib.deflateSync(Buffer.from([0, r, g, b]));
  return "data:image/png;base64," + Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

let PASS = 0, FAIL = 0;
const ok = (m) => { PASS++; console.log("  ✅", m); };
const bad = (m) => { FAIL++; console.log("  ❌", m); };

async function main() {
  console.log(`\n═══ QA FACCE — un volto per ogni tavolo ═══  BASE=${BASE}\n`);

  const sess = await api("/gestione/casino/sessions", { name: "QA FACCE", dealers: 0, startFish: 500 });
  const sid = sess.body?.session?.id ?? sess.body?.id;
  if (!sid) { bad(`serata non creata (status ${sess.status})`); return fin(); }
  ok(`serata ${sid}`);

  const tg = [
    { kind: "roulette", path: "game-tables", bind: "game-tables", body: { name: "Roulette QA" } },
    { kind: "blackjack", path: "bj-tables", bind: "bj-tables", body: { name: "Blackjack QA", seats: 7 } },
    { kind: "settemezzo", path: "sm-tables", bind: "sm-tables", body: { name: "7½ QA", seats: 6 } },
    { kind: "sprint", path: "sprint-tables", bind: "sprint-tables", body: { name: "Sprint QA" } },
  ];
  const tables = [];
  for (const g of tg) {
    const res = await api(`/gestione/casino/sessions/${sid}/${g.path}`, g.body);
    const id = res.body?.table?.id ?? res.body?.id;
    const code = res.body?.table?.displayCode ?? res.body?.displayCode ?? res.body?.code;
    if (!id) { bad(`tavolo ${g.kind} non creato (status ${res.status})`); continue; }
    const d = await api(`/gestione/casino/sessions/${sid}/${g.bind}/${id}/dealer`, { assign: true });
    tables.push({ ...g, id, code, dealerCode: d.body?.dealerCode });
    ok(`${g.kind}: tavolo ${code} · dealer ${d.body?.dealerCode ?? "—"}`);
  }

  // 4 ospiti, ognuno con selfie DISTINTO
  const colors = [[220, 40, 40], [40, 160, 220], [40, 200, 120], [230, 180, 40]];
  const players = [];
  for (let i = 0; i < tables.length; i++) {
    const selfie = png(...colors[i]);
    const res = await api(`/gestione/casino/sessions/${sid}/players`, { nickname: `Faccia${i + 1}`, photo: selfie });
    const id = res.body?.id, code = res.body?.playerCode;
    if (!id) { bad(`ospite ${i + 1} non creato (status ${res.status})`); continue; }
    players.push({ id, code, selfie, nickname: `Faccia${i + 1}`, kind: tables[i].kind });
    ok(`ospite Faccia${i + 1} creato con selfie unico`);
  }

  // DEALER: ogni galleria mostra tutte le facce, col volto corretto
  for (const t of tables) {
    if (!t.dealerCode) continue;
    const r = await api(`/gestione/casino/dealer-roster/${t.dealerCode}`, null, "GET");
    const list = r.body?.players ?? [];
    const withFace = list.filter((p) => p.avatarUrl && p.avatarUrl.startsWith("data:image/"));
    (withFace.length >= players.length ? ok : bad)(`dealer ${t.kind}: galleria ${list.length} facce, ${withFace.length} con avatar (atteso ≥${players.length})`);
    for (const p of players) { const row = list.find((x) => x.id === p.id); if (row && row.avatarUrl !== p.selfie) bad(`dealer ${t.kind}: avatar di ${p.nickname} NON combacia`); }
  }

  // MONITOR per tavolo: volto giusto, posto giusto
  const rt = tables.find((t) => t.kind === "roulette"), rp = players.find((p) => p.kind === "roulette");
  if (rt && rp) {
    const tv = await api(`/gestione/casino/table/${rt.code}`, null, "GET");
    const seatCodes = Object.values(tv.body?.table?.seats ?? {}).map((s) => s.code).filter(Boolean);
    let seated = false;
    for (const sc of seatCodes) { const j = await api("/gestione/casino/table/seat", { seatCode: sc, playerCode: rp.code }); if (j.status === 200) { seated = true; break; } }
    const mv = await api(`/gestione/casino/table/${rt.code}`, null, "GET");
    const occ = Object.values(mv.body?.table?.seats ?? {}).find((s) => s.playerId === rp.id);
    (occ && occ.avatarUrl === rp.selfie ? ok : bad)(`roulette MONITOR: ${rp.nickname} seduto con volto corretto (seated=${seated})`);
  }

  const bj = tables.find((t) => t.kind === "blackjack"), bp = players.find((p) => p.kind === "blackjack");
  if (bj && bp) {
    const j = await api("/gestione/casino/bj/join", { displayCode: bj.code, seatNo: 1, playerCode: bp.code });
    const mv = await api(`/gestione/casino/bj/${bj.code}`, null, "GET");
    const occ = Object.values(mv.body?.seats ?? mv.body?.table?.seats ?? {}).find((s) => s.playerId === bp.id);
    (occ && occ.avatarUrl === bp.selfie ? ok : bad)(`blackjack MONITOR: ${bp.nickname} seduto con volto corretto (join ${j.status})`);
  }

  const sm = tables.find((t) => t.kind === "settemezzo"), sp = players.find((p) => p.kind === "settemezzo");
  if (sm && sp) {
    const j = await api("/gestione/casino/sm/join", { displayCode: sm.code, seatNo: 1, playerCode: sp.code });
    const mv = await api(`/gestione/casino/sm/${sm.code}`, null, "GET");
    const occ = Object.values(mv.body?.seats ?? mv.body?.table?.seats ?? {}).find((s) => s.playerId === sp.id);
    (occ && occ.avatarUrl === sp.selfie ? ok : bad)(`7½ MONITOR: ${sp.nickname} seduto con volto corretto (join ${j.status})`);
  }

  const spr = tables.find((t) => t.kind === "sprint"), pp = players.find((p) => p.kind === "sprint");
  if (spr && pp) {
    const j = await api("/gestione/casino/sprint/join", { displayCode: spr.code, playerCode: pp.code, horseId: 1 });
    const mv = await api(`/gestione/casino/sprint/${spr.code}`, null, "GET");
    const seats = mv.body?.table?.seats ?? mv.body?.seats ?? [];
    const occ = (Array.isArray(seats) ? seats : Object.values(seats)).find((s) => s.playerId === pp.id);
    (occ && occ.avatarUrl === pp.selfie ? ok : bad)(`sprint MONITOR: ${pp.nickname} in pista con volto corretto (join ${j.status})`);
  }

  const end = await api(`/gestione/casino/sessions/${sid}/end`, {});
  (end.status === 200 ? ok : bad)(`serata QA chiusa (cleanup) status ${end.status}`);
  fin();
}

function fin() { console.log(`\n── ${PASS} PASS · ${FAIL} FAIL ──\n`); process.exit(FAIL ? 1 : 0); }
main().catch((e) => { console.error("FATAL", e); process.exit(2); });

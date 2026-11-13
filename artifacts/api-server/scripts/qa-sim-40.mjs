/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── QA — Simulazione serata: 40 ospiti · 5 tavoli · 5 dealer ───────────────────
   Collaudo end-to-end del casinò-SEGNAPUNTI contro un backend VIVO (prod o locale):
   crea la serata, 5 tavoli (roulette, blackjack, 7½, corsa siciliana, biliardo),
   lega 5 dealer, fa entrare 40 ospiti col selfie OBBLIGATORIO, li distribuisce ai
   tavoli, i dealer assegnano/tolgono PUNTI a mano (galleria facce), e prova la
   modalità IBRIDA (carte fisiche: puntata dal telefono → il mazziere segna gli
   esiti → paga). Alla fine verifica saldi + ledger e stampa un report.

   Uso:  BASE=https://ideagame.it node artifacts/api-server/scripts/qa-sim-40.mjs
   (BASE default = https://ideagame.it). Richiede Node ≥ 18 (fetch globale).
   NB: la connessione a IDEAphotoSuite è in fondo, dietro --suite (serve la festa
   Suite collegata e la chiave del ponte, presenti solo in prod). */

const BASE = (process.env.BASE || 'https://ideagame.it').replace(/\/$/, '');
const API = BASE + '/api';
const DO_SUITE = process.argv.includes('--suite');
// selfie minimo valido (1×1 png) — il backend pretende un data:image/*
const SELFIE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let PASS = 0, FAIL = 0;
const log = (...a) => console.log(...a);
const ok = (m) => { PASS++; log('  ✓', m); };
const bad = (m) => { FAIL++; log('  ✗', m); };

async function api(path, body, method = 'POST') {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}
const idOf = (res) => res.body?.table?.id ?? res.body?.id ?? res.body?.session?.id ?? null;
const codeOf = (res) => res.body?.table?.displayCode ?? res.body?.displayCode ?? null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const NAMES = ['Marco', 'Giulia', 'Luca', 'Sara', 'Anna', 'Paolo', 'Elena', 'Davide', 'Chiara', 'Matteo', 'Francesca', 'Andrea', 'Valentina', 'Simone', 'Martina', 'Alessio', 'Federica', 'Giorgio', 'Alice', 'Roberto', 'Silvia', 'Antonio', 'Laura', 'Nicola', 'Beatrice', 'Stefano', 'Ilaria', 'Giuseppe', 'Noemi', 'Fabio', 'Camilla', 'Riccardo', 'Giada', 'Michele', 'Serena', 'Enrico', 'Veronica', 'Claudio', 'Arianna', 'Daniele'];

async function main() {
  log(`\n════════ QA — 40 ospiti · 5 tavoli · 5 dealer ════════\nBASE = ${BASE}\n`);

  // 1) Serata
  const sess = await api('/gestione/casino/sessions', { name: 'QA 40 ospiti', dealers: 0, startFish: 500 });
  const sessionId = sess.body?.session?.id ?? sess.body?.id;
  if (!sessionId) { bad(`creazione serata fallita (status ${sess.status})`); return finish(); }
  ok(`serata creata ${sessionId} · master ${sess.body?.session?.masterCode ?? sess.body?.masterCode ?? '?'}`);

  // 2) 5 tavoli
  const tgames = [
    { kind: 'roulette', path: 'game-tables', bind: 'game-tables', body: { name: 'Roulette QA' } },
    { kind: 'blackjack', path: 'bj-tables', bind: 'bj-tables', body: { name: 'Blackjack QA', seats: 7 } },
    { kind: 'settemezzo', path: 'sm-tables', bind: 'sm-tables', body: { name: '7½ QA', seats: 6 } },
    { kind: 'sicilia', path: 'sicilia-tables', bind: 'sicilia-tables', body: { name: 'Corsa Siciliana QA' } },
    { kind: 'pool', path: 'pool-tables', bind: 'pool-tables', body: { name: 'Biliardo QA' } },
  ];
  const tables = [];
  for (const g of tgames) {
    const res = await api(`/gestione/casino/sessions/${sessionId}/${g.path}`, g.body);
    const id = idOf(res), code = codeOf(res);
    if (!id) { bad(`tavolo ${g.kind} non creato (status ${res.status})`); continue; }
    // lega un dealer
    const d = await api(`/gestione/casino/sessions/${sessionId}/${g.bind}/${id}/dealer`, { assign: true });
    const dealerCode = d.body?.dealerCode;
    if (!dealerCode) bad(`dealer non legato a ${g.kind} (status ${d.status})`);
    tables.push({ ...g, id, code, dealerCode });
    ok(`${g.kind}: tavolo ${code ?? id} · dealer ${dealerCode ?? '—'}`);
  }
  if (tables.length < 5) bad(`creati solo ${tables.length}/5 tavoli`);

  // 3) 40 ospiti (selfie obbligatorio)
  const players = [];
  for (let i = 0; i < 40; i++) {
    const res = await api(`/gestione/casino/sessions/${sessionId}/players`, { nickname: NAMES[i] ?? `Ospite ${i + 1}`, photo: SELFIE });
    const id = res.body?.id, code = res.body?.playerCode;
    if (!id || !code) { bad(`ospite ${i + 1} non creato (status ${res.status}) ${JSON.stringify(res.body)}`); continue; }
    players.push({ id, code, nickname: NAMES[i], bal0: res.body?.fishBalance ?? 500 });
  }
  (players.length === 40 ? ok : bad)(`ospiti creati: ${players.length}/40`);

  // verifica che il selfie sia DAVVERO obbligatorio (senza foto → 400)
  const noPhoto = await api(`/gestione/casino/sessions/${sessionId}/players`, { nickname: 'SenzaFoto' });
  (noPhoto.status === 400 ? ok : bad)(`selfie obbligatorio applicato (senza foto → ${noPhoto.status}, atteso 400)`);

  // 4) Dealer universale: ogni dealer vede TUTTE le facce della serata
  for (const t of tables) {
    if (!t.dealerCode) continue;
    const roster = await api(`/gestione/casino/dealer-roster/${t.dealerCode}`, null, 'GET');
    const n = roster.body?.players?.length ?? 0;
    (n >= 40 ? ok : bad)(`dealer ${t.kind}: galleria serata ${n} facce (atteso ≥40)`);
  }

  // 5) Assegnazione PUNTI a mano (galleria): ogni dealer dà punti a 8 ospiti
  let moves = 0;
  for (let ti = 0; ti < tables.length; ti++) {
    const t = tables[ti]; if (!t.dealerCode) continue;
    const group = players.slice(ti * 8, ti * 8 + 8);
    for (const p of group) {
      const delta = [25, 100, -25, 100][moves % 4];
      const r = await api('/gestione/casino/dealer-tx-any', { dealerCode: t.dealerCode, playerId: p.id, delta });
      if (r.status === 200) { p.expected = (p.expected ?? p.bal0) + delta; moves++; }
      else bad(`tx ${t.kind} → ${p.nickname} (${delta}) status ${r.status} ${JSON.stringify(r.body)}`);
    }
  }
  ok(`movimenti punti applicati: ${moves}`);

  // 6) MODALITÀ IBRIDA (la partita vera è ai tavoli; il digitale è solo segnapunti)
  //    Blackjack: mazziere in carte fisiche → 2 ospiti puntano dal telefono → segna esiti → paga.
  const bj = tables.find(t => t.kind === 'blackjack');
  if (bj?.dealerCode && bj.code) {
    await api('/gestione/casino/bj/dealer-mode', { dealerCode: bj.dealerCode, mode: 'hybrid' });
    await api('/gestione/casino/bj/dealer-open', { dealerCode: bj.dealerCode });
    const pA = players[0], pB = players[1];
    const jA = await api('/gestione/casino/bj/join', { displayCode: bj.code, seatNo: 1, playerCode: pA.code });
    const jB = await api('/gestione/casino/bj/join', { displayCode: bj.code, seatNo: 2, playerCode: pB.code });
    const sA = jA.body?.seatCode, sB = jB.body?.seatCode;
    await api('/gestione/casino/bj/bet', { seatCode: sA, amount: 50, playerCode: pA.code });
    await api('/gestione/casino/bj/bet', { seatCode: sB, amount: 50, playerCode: pB.code });
    // mazziere segna: A vince (bet×2), B perde
    const settle = await api('/gestione/casino/bj/dealer-settle', { dealerCode: bj.dealerCode, outcomes: { [pA.id]: 'win', [pB.id]: 'lose' } });
    (settle.status === 200 ? ok : bad)(`blackjack ibrido: puntate + esiti segnati + pagati (status ${settle.status})`);
  } else bad('blackjack: tavolo/dealer mancante per la prova ibrida');

  //    7½: stesso schema (vince/perde)
  const sm = tables.find(t => t.kind === 'settemezzo');
  if (sm?.dealerCode && sm.code) {
    await api('/gestione/casino/sm/dealer-mode', { dealerCode: sm.dealerCode, mode: 'hybrid' });
    await api('/gestione/casino/sm/dealer-open', { dealerCode: sm.dealerCode });
    const pC = players[8], pD = players[9];
    const jC = await api('/gestione/casino/sm/join', { displayCode: sm.code, seatNo: 1, playerCode: pC.code });
    const jD = await api('/gestione/casino/sm/join', { displayCode: sm.code, seatNo: 2, playerCode: pD.code });
    await api('/gestione/casino/sm/bet', { seatCode: jC.body?.seatCode, amount: 40, playerCode: pC.code });
    await api('/gestione/casino/sm/bet', { seatCode: jD.body?.seatCode, amount: 40, playerCode: pD.code });
    const settle = await api('/gestione/casino/sm/dealer-settle', { dealerCode: sm.dealerCode, winners: [pC.id] });
    (settle.status === 200 ? ok : bad)(`7½ ibrido: puntate + vincitori segnati + pagati (status ${settle.status})`);
  } else bad('7½: tavolo/dealer mancante per la prova ibrida');

  // 7) Verifica saldi (confronto con l'atteso dei movimenti a mano)
  await sleep(500);
  let checked = 0, mism = 0;
  for (const p of players) {
    if (p.expected == null) continue;
    const r = await api(`/gestione/casino/player/${p.code}`, null, 'GET');
    const bal = r.body?.player?.fishBalance;
    checked++;
    if (bal !== p.expected) { mism++; if (mism <= 5) bad(`saldo ${p.nickname}: ${bal} ≠ atteso ${p.expected}`); }
  }
  (mism === 0 ? ok : bad)(`saldi verificati: ${checked - mism}/${checked} coerenti coi movimenti a mano`);

  // 8) Connessione a IDEAphotoSuite (solo con --suite e in prod)
  if (DO_SUITE) {
    log('\n── Ponte IDEAphotoSuite ──');
    const feste = await api('/ponte/casino/suite/feste', null, 'GET');
    if (feste.status !== 200) bad(`elenco feste Suite non disponibile (status ${feste.status}) — serve prod + chiave ponte`);
    else {
      const festa = (feste.body?.feste ?? feste.body ?? [])[0];
      if (!festa) bad('nessuna festa Suite col casinò acceso da collegare');
      else {
        const link = await api('/ponte/casino/suite/collega', { sessionId, eventoId: festa.eventoId ?? festa.id, giocoUrl: `${BASE}/gestione/casino` });
        (link.status === 200 ? ok : bad)(`serata collegata alla festa Suite "${festa.nome ?? festa.eventoId}" (status ${link.status})`);
        const cls = await api(`/ponte/casino/classifica/${sessionId}`, null, 'GET');
        (cls.status === 200 ? ok : bad)(`classifica fish esposta alla Suite (status ${cls.status}, ${cls.body?.classifica?.length ?? 0} righe)`);
      }
    }
  } else {
    log('\n(ponte Suite saltato — rilancia con --suite su prod per collegare la festa)');
  }

  finish(sessionId, sess.body);
}

function finish(sessionId, sessBody) {
  log(`\n════════ REPORT ════════`);
  log(`PASS ${PASS} · FAIL ${FAIL}`);
  if (sessionId) {
    const master = sessBody?.session?.masterCode ?? sessBody?.masterCode;
    const tv = sessBody?.session?.config?.tvCode ?? sessBody?.config?.tvCode;
    log(`\nPer guardare dal vivo:`);
    if (master) log(`  Regia Master:  ${BASE}/gestione/casino?code=${master}`);
    if (tv) log(`  TV serata:     ${BASE}/gestione/casino?code=${tv}`);
  }
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => { bad('eccezione: ' + (e?.message || e)); finish(); });

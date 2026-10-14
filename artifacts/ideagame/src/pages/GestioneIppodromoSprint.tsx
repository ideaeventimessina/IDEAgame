/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ════════════════════════════════════════════════════════════════════════════
   IPPODROMO SPRINT — modalità DISTINTA dall'ippodromo classico. 6 cavalli, partenza
   da fermo, galoppo animato, 4 ostacoli, comandi SPRINT/SALTA dai telefoni dei piloti,
   un solo AVVIA in regia. Vincitore dall'avanzamento REALE del motore server
   (projectRace), mai da un ordine predeciso. Nessuna quota/accredito economico.

   Viste (dispatch in GestioneCasino.tsx):
     monitor 80"  → ?sprint=CODE (host con &host=1)
     telefono     → ?sprintplay=CODE
     regia        → ?sprintregia=CODE

   MONITOR (metodo mockup-replica): palco FISSO 1672×941 scalato con transform:scale;
   clean-plate `stadio-pulito.png` come fondo dipinto; titolo/logo ORIGINALE dagli asset;
   RIG ANIMATO in codice su canvas (porting fedele di demo/public/horse-rig.js, pivot e
   contratto stati invariati); testi/numeri dinamici in codice (Cinzel/Lora). Le corse
   scorrono con camera laterale che segue il gruppo; ostacoli e traguardo in coordinate
   world. Il rig è grafica 2D stilizzata: NON è fotorealistico.
   ════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const ASSET = `${BASE}ippodromo-sprint/`;
const ORIGIN = (typeof window !== 'undefined' ? window.location.origin : '') + BASE;

/* Catalogo UNICO nomi/colori (allineato al motore: Fulmine rosso … Luna arancio). */
const HORSE_META: { name: string; color: string }[] = [
  { name: 'Fulmine', color: '#e74747' },
  { name: 'Stella', color: '#4597ef' },
  { name: 'Vento', color: '#39bc7f' },
  { name: 'Saetta', color: '#edc449' },
  { name: 'Tempesta', color: '#a580ec' },
  { name: 'Luna', color: '#f49045' },
];

type Seat = {
  horseId: number; name: string; color: string;
  playerId: string | null; nickname: string | null; avatarUrl: string | null;
  ready: boolean; cpu: boolean;
  position: number; speed: number; energy: number; finish: number | null;
  sprintUntil: number; jumpAt: number; lastSprint: number; lastJump: number; slowUntil: number;
  nextHurdle: number; cleared: number; hits: number; rank: number | null;
};
type ResultRow = { horse: number; name: string; pilot: string; time: number; cleared: number; hits: number; place: number; points: number };
type SprintRules = { length: number; hurdles: number[]; sprintCost: number; jumpCooldownMs: number; sprintCooldownMs: number; maxSprintPerSec: number };
type SprintTbl = {
  id: string; name: string; displayCode: string; type: 'sprint';
  status: 'lobby' | 'countdown' | 'race' | 'paused' | 'results';
  race: number; countdown: number; raceMs: number; serverTime: number; suspended: boolean;
  seats: Seat[]; results: ResultRow[] | null; history: unknown[]; rules: SprintRules;
};
type SprintState = { table: SprintTbl; sessionId: string };

const FONT_CSS = `
@font-face{font-family:"CinzelS";font-weight:400 900;src:url(${ASSET}font/Cinzel-Variable.ttf) format("truetype");font-display:swap}
@font-face{font-family:"LoraS";font-weight:400 700;src:url(${ASSET}font/Lora-Variable.ttf) format("truetype");font-display:swap}`;

const api = (path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

function useSprint(code: string, ms = 350): SprintState | null {
  const [st, setSt] = useState<SprintState | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/sprint/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {});
    load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); };
  }, [code, ms]);
  return st;
}

/* ════════════════════════════════════════════════════════════════════════════
   RIG 2D — porting fedele di demo/public/horse-rig.js. Unità locali spazio-cavallo;
   il renderer possiede la traslazione. Ombra a terra mentre il root salta; coda a
   pendolo; 4 zampe articolate; sella/fantino col colore della corsia. Pivot invariati.
   ════════════════════════════════════════════════════════════════════════════ */
function drawHorse(
  ctx: CanvasRenderingContext2D,
  { x, y, scale = 1, color = '#e74747', phase = 0, jump = 0, moving = true, id = 1 }:
    { x: number; y: number; scale?: number; color?: string; phase?: number; jump?: number; moving?: boolean; id?: number },
) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const stroke = (pts: number[][], width: number, col: string) => { ctx.strokeStyle = col; ctx.lineWidth = width; ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a!, b!) : ctx.moveTo(a!, b!)); ctx.stroke(); };
  const oval = (cx: number, cy: number, rx: number, ry: number, col: string) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  const coat = ['#855039', '#b2764c', '#704836', '#a66b40', '#69443b', '#9d6242'][id - 1]!;
  ctx.globalAlpha = .2; oval(0, 8, 43 * (1 - jump * .25), 7, '#07160e'); ctx.globalAlpha = 1; ctx.translate(0, -jump * 48);
  const p = moving ? phase : 0, bob = moving ? Math.sin(p * 2) * 1.6 : 0; ctx.translate(0, bob);
  stroke([[-34, -34], [-48, -32 + Math.sin(p) * 4], [-57, -14 + Math.sin(p + .7) * 5]], 8, '#302521');
  for (let i = 0; i < 4; i++) {
    const front = i >= 2, far = i % 2 === 0, hipX = front ? 24 : -24, hipY = -31;
    const angle = moving ? Math.sin(p + (front ? Math.PI : 0) + (far ? Math.PI : 0)) * .75 : 0;
    const thigh = jump > .1 ? (front ? -1.1 : 1.25) : angle;
    const kneeX = hipX + Math.sin(thigh) * 23, kneeY = hipY + Math.cos(thigh) * 23;
    const shin = jump > .1 ? (front ? 1.8 : -1.5) : -angle * .7;
    const footX = kneeX + Math.sin(shin) * 22, footY = kneeY + Math.cos(shin) * 22;
    stroke([[hipX, hipY], [kneeX, kneeY], [footX, footY]], far ? 7 : 8, far ? '#594032' : coat); stroke([[footX - 3, footY + 1], [footX + 5, footY + 1]], 6, '#211e20');
  }
  oval(-1, -39, 36, 18, coat); oval(29, -40, 14, 20, coat);
  stroke([[26, -44], [36, -67], [46, -72]], 18, coat); oval(47, -70, 17, 10, coat); oval(59, -67, 8, 7, coat);
  ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(39, -76); ctx.lineTo(39, -89); ctx.lineTo(47, -77); ctx.fill();
  stroke([[28, -47], [27, -62], [35, -77]], 7, '#302521'); oval(52, -73, 1.8, 1.8, '#131618');
  stroke([[37, -77], [43, -61], [61, -63]], 2, '#e8c06b'); stroke([[60, -65], [15, -49]], 1.5, '#e8c06b');
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-18, -54, 35, 29, 5); ctx.fill(); ctx.strokeStyle = '#e8c06b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff7e7'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(id), 0, -32);
  ctx.save(); ctx.translate(-2, -57); ctx.rotate(jump > 0 ? .2 : -.05 + Math.sin(p) * .04);
  stroke([[0, 0], [-5, 15], [13, 18]], 7, '#f1eee2'); stroke([[0, 0], [11, -17]], 13, color); oval(16, -29, 7, 8, '#eab485');
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(16, -33, 8, Math.PI, Math.PI * 2); ctx.fill(); stroke([[10, -18], [25, -8], [34, -7]], 5, color); stroke([[34, -7], [44, -9]], 3, '#eab485'); ctx.restore(); ctx.restore();
}

/* ── Scena pista su canvas (6 corsie, cancello, 4 ostacoli, traguardo, camera) ─── */
const STAGE_W = 1672, STAGE_H = 941;
const LANE_TOP = 506, LANE_H = 68;                 // banda corse dentro la terra battuta del clean-plate
const laneY = (i: number) => LANE_TOP + i * LANE_H + LANE_H / 2;
const PX_PER_M = 4.2, LEFT_PAD = 150, GATE_M = -6;

function SprintTrack({ t }: { t: SprintTbl }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef<{ t: SprintTbl; recv: number }>({ t, recv: performance.now() });
  useEffect(() => { stRef.current = { t, recv: performance.now() }; }, [t]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, phase = 0, lastFrame = performance.now();
    const hurdleXWorld = () => stRef.current.t.rules.hurdles;

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      const dt = Math.min(50, now - lastFrame); lastFrame = now;
      const { t: cur, recv } = stRef.current;
      const racing = cur.status === 'race';
      const elapsed = racing ? Math.min(400, now - recv) : 0;           // estrapolazione fra i poll
      const simMs = cur.raceMs + elapsed;
      ctx.clearRect(0, 0, STAGE_W, STAGE_H);
      phase += racing && !reduced ? dt / 70 : 0;

      // posizione estrapolata per corsia
      const posOf = (s: Seat) => s.finish === null ? s.position + s.speed * elapsed / 1000 : s.position;
      const lead = Math.max(0, ...cur.seats.map(posOf));
      const cam = Math.max(0, lead - 90);
      const screenX = (m: number) => LEFT_PAD + (m - cam) * PX_PER_M;

      // ombra banda corsie (molto leggera: la terra del clean-plate resta visibile)
      for (let i = 0; i < 6; i++) {
        const yc = laneY(i);
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,240,200,0.045)';
        ctx.fillRect(0, yc - LANE_H / 2, STAGE_W, LANE_H);
        ctx.strokeStyle = 'rgba(217,191,127,0.28)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yc + LANE_H / 2); ctx.lineTo(STAGE_W, yc + LANE_H / 2); ctx.stroke();
      }
      // cancello di partenza (visibile solo prima/entro i primi metri)
      const gateX = screenX(GATE_M);
      if (gateX > -40 && gateX < STAGE_W + 40 && cur.status !== 'results') {
        ctx.fillStyle = '#0d1f16cc'; ctx.fillRect(gateX - 10, LANE_TOP - 18, 20, 6 * LANE_H + 28);
        ctx.strokeStyle = '#cbb579'; ctx.lineWidth = 3;
        for (let i = 0; i <= 6; i++) { const yy = LANE_TOP + i * LANE_H; ctx.beginPath(); ctx.moveTo(gateX - 12, yy); ctx.lineTo(gateX + 12, yy); ctx.stroke(); }
      }

      for (let i = 0; i < 6; i++) {
        const yc = laneY(i), s = cur.seats[i]!;
        // ostacoli (siepe) in coordinate world
        for (const ob of hurdleXWorld()) {
          const x = screenX(ob); if (x < -70 || x > STAGE_W + 70) continue;
          ctx.fillStyle = '#1f3a1e'; ctx.beginPath(); ctx.roundRect(x - 13, yc - 2, 26, 20, 4); ctx.fill();
          ctx.fillStyle = '#2e6b2e'; ctx.beginPath(); ctx.roundRect(x - 15, yc - 18, 30, 12, 5); ctx.fill();
          ctx.strokeStyle = '#d6e9c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 15, yc + 18); ctx.lineTo(x - 15, yc - 6); ctx.moveTo(x + 15, yc + 18); ctx.lineTo(x + 15, yc - 6); ctx.stroke();
        }
        // cavallo (rig) con salto e galoppo
        const pos = posOf(s);
        const u = (simMs - s.jumpAt) / cur.rules.jumpCooldownMs; void u;
        const ju = (simMs - s.jumpAt) / 1100; const jump = ju >= 0 && ju <= 1 ? Math.sin(Math.PI * ju) : 0;
        drawHorse(ctx, { x: screenX(pos), y: yc + 10, scale: .92, color: s.color, phase: phase * (.55 + s.speed / 18) + i * .7, jump, moving: racing && s.finish === null, id: s.horseId });
      }
      // traguardo a scacchi (appare quando entra in camera)
      const finish = screenX(cur.rules.length);
      if (finish >= -30 && finish <= STAGE_W + 30) {
        const top = LANE_TOP - 24, h = 6 * LANE_H + 24;
        for (let row = 0; row < Math.ceil(h / 22); row++) for (let col = 0; col < 2; col++) { ctx.fillStyle = (row + col) % 2 ? '#101914' : '#f7eccf'; ctx.fillRect(finish + col * 11, top + row * 22, 11, 22); }
        ctx.fillStyle = '#f2cc6d'; ctx.font = '700 26px CinzelS,serif'; ctx.textAlign = 'center'; ctx.fillText('ARRIVO', finish + 11, top - 8);
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} width={STAGE_W} height={STAGE_H} style={{ position: 'absolute', inset: 0, width: STAGE_W, height: STAGE_H }} aria-label="Pista a sei corsie con cavalli animati" />;
}

/* ════════════════════════════════════════════════ MONITOR 80″ ═══════════════ */
const MON_CSS = FONT_CSS + `
.ms{position:fixed;inset:0;overflow:hidden;background:#04120c;display:flex;align-items:center;justify-content:center;font-family:"LoraS",Georgia,serif;}
.ms .st{position:relative;width:${STAGE_W}px;height:${STAGE_H}px;flex:none;transform-origin:center center;
  background:url(${ASSET}scenario/stadio-pulito.png) 0 0/${STAGE_W}px ${STAGE_H}px no-repeat;}
.ms .top{position:absolute;left:0;right:0;top:0;height:150px;background:linear-gradient(180deg,#04160ecc,#04160e00);}
.ms .logo{position:absolute;left:30px;top:22px;height:96px;width:auto;object-fit:contain;filter:drop-shadow(0 3px 8px #000a);}
.ms .title{position:absolute;left:300px;top:24px;font:800 64px/0.9 "CinzelS",serif;color:#f6e7bf;text-shadow:0 3px 10px #000;letter-spacing:.01em;}
.ms .title b{color:#f0ca68;display:block;font-size:72px;}
.ms .title small{display:block;font:600 17px/1 "CinzelS",serif;color:#cdbf86;letter-spacing:.34em;margin-top:8px}
.ms .qr{position:absolute;right:32px;top:28px;background:#fff;border-radius:12px;padding:10px;text-align:center;box-shadow:0 6px 18px #0007;}
.ms .qr b{display:block;font:800 20px/1 "CinzelS",serif;color:#123;margin-top:6px}
.ms .cards{position:absolute;left:28px;right:28px;top:168px;display:grid;grid-template-columns:repeat(6,1fr);gap:16px;}
.ms .card{border-radius:16px;border:3px solid #caa84f;overflow:hidden;background:linear-gradient(180deg,#0b2418,#07180f);box-shadow:0 8px 20px #0007;}
.ms .card .hd{height:52px;display:flex;align-items:center;gap:10px;padding:0 12px;font:800 26px/1 "CinzelS",serif;color:#fff;}
.ms .card .num{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;font:800 22px/1 "CinzelS",serif;color:#fff;box-shadow:inset 0 0 0 2px #0003;}
.ms .card .body{padding:14px;text-align:center;}
.ms .card .av{width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #caa84f;background:#0c2016;margin:0 auto;display:block;}
.ms .card .pname{font:700 20px/1.1 "CinzelS",serif;color:#f6e7bf;margin-top:10px}
.ms .card .pstate{font:italic 400 15px/1.2 "LoraS",serif;margin-top:5px}
.ms .banner{position:absolute;left:50%;top:210px;transform:translateX(-50%);text-align:center;color:#ffe3a0;z-index:6;pointer-events:none;text-shadow:0 3px 14px #000;}
.ms .cd{font:900 230px/0.9 "CinzelS",serif;color:#f6e7bf;filter:drop-shadow(0 6px 24px #000);}
.ms .cdl{font:700 30px/1 "CinzelS",serif;letter-spacing:.26em;color:#f0ca68;}
.ms .pos{position:absolute;left:28px;top:168px;width:360px;border-radius:16px;border:2px solid #caa84f88;background:#06160fd9;padding:12px 14px;z-index:6;}
.ms .pos h3{margin:0 0 8px;font:700 18px/1 "CinzelS",serif;letter-spacing:.14em;color:#f0ca68;}
.ms .pos .row{display:flex;align-items:center;gap:10px;margin:7px 0;}
.ms .pos .rk{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font:800 15px/1 "CinzelS",serif;color:#04130c;background:#f0ca68}
.ms .pos .bar{flex:1;height:14px;border-radius:7px;background:#0c2016;overflow:hidden;border:1px solid #ffffff14}
.ms .pos .bar i{display:block;height:100%;border-radius:7px}
.ms .pos .nm{width:96px;font:700 15px/1 "CinzelS",serif;color:#f6e7bf}
.ms .dist{position:absolute;right:28px;top:168px;border-radius:16px;border:2px solid #caa84f88;background:#06160fd9;padding:12px 18px;text-align:center;z-index:6}
.ms .dist b{display:block;font:800 40px/1 "CinzelS",serif;color:#f6e7bf}
.ms .dist span{font:700 14px/1 "CinzelS",serif;letter-spacing:.2em;color:#cdbf86}
.ms .win{position:absolute;inset:0;display:grid;place-items:center;background:rgba(4,18,12,.72);z-index:20}
.ms .win .box{text-align:center;padding:30px 60px;border-radius:24px;border:5px solid #e8c45f;background:radial-gradient(ellipse at 50% 20%,#0d3321,#061a10);box-shadow:0 18px 50px #000b}
.ms .win h2{margin:0;font:800 64px/1 "CinzelS",serif;color:#f0ca68}
.ms .rank{margin-top:16px;display:grid;gap:6px}
.ms .rank .r{display:flex;align-items:center;gap:12px;background:#ffffff0c;border:1px solid #caa84f55;border-radius:10px;padding:8px 14px;color:#f6e7bf;font:700 20px/1 "CinzelS",serif}
.ms .rank .r .pt{margin-left:auto;color:#f0ca68}
.ms .paused{position:absolute;inset:0;display:grid;place-items:center;background:rgba(4,18,12,.6);z-index:15;font:800 70px/1 "CinzelS",serif;color:#ffe3a0;text-shadow:0 3px 14px #000}
`;

export function IppodromoSprintMonitor({ displayCode, host = false }: { displayCode: string; host?: boolean }) {
  const st = useSprint(displayCode, 300);
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const t = st?.table;
  const scale = Math.min(dim.w / STAGE_W, dim.h / STAGE_H);
  void host;
  if (!t) return <div className="ms"><style>{MON_CSS}</style><div style={{ color: '#f0ca68', font: '400 30px CinzelS,serif' }}>Carico il tavolo…</div></div>;

  const leader = [...t.seats].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9))[0];
  const leadDist = leader ? Math.min(t.rules.length, Math.floor(leader.position)) : 0;
  const ordered = [...t.seats].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));

  return (
    <div className="ms"><style>{MON_CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})` }}>
        <SprintTrack t={t} />
        <div className="top" />
        <img className="logo" src={`${ASSET}logo/idea-eventi-negativo-originale.png`} alt="Idea Eventi — marchio originale" draggable={false} />
        <div className="title">IPPODROMO<b>SPRINT</b><small>SFIDA · VELOCITÀ · SALTI · DIVERTIMENTO</small></div>

        {t.status === 'lobby' && (
          <div className="qr"><QRCodeSVG value={`${ORIGIN}gestione/casino?sprintplay=${t.displayCode}`} size={118} /><b>{t.displayCode}</b></div>
        )}

        {/* LOBBY: 6 card cavallo + pilota (mockup 01) */}
        {t.status === 'lobby' && (
          <div className="cards">
            {t.seats.map(s => (
              <div className="card" key={s.horseId} style={{ borderColor: s.color }}>
                <div className="hd" style={{ background: `linear-gradient(180deg,${s.color},${s.color}bb)` }}>
                  <span className="num" style={{ background: '#00000033' }}>{s.horseId}</span>{s.name}
                </div>
                <div className="body">
                  {s.avatarUrl ? <img className="av" src={s.avatarUrl} alt="" /> : <div className="av" style={{ display: 'grid', placeItems: 'center', font: '700 30px CinzelS,serif', color: '#caa84f' }}>{s.cpu ? 'CPU' : '👤'}</div>}
                  <div className="pname">{s.nickname ?? (s.cpu ? 'CPU' : 'Libero')}</div>
                  <div className="pstate" style={{ color: s.ready ? '#6fe08a' : '#caa84f' }}>{s.cpu ? 'riempi-posti' : s.ready ? 'PRONTO' : 'in attesa'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* COUNTDOWN (mockup 02) */}
        {t.status === 'countdown' && (
          <div className="banner"><div className="cdl">LA CORSA PARTE TRA</div><div className="cd">{Math.max(1, t.countdown)}</div></div>
        )}

        {/* RACE: pannello posizione + distanza (mockup 03) */}
        {(t.status === 'race' || t.status === 'paused') && (
          <>
            <div className="pos">
              <h3>POSIZIONE ATTUALE</h3>
              {ordered.map(s => (
                <div className="row" key={s.horseId}>
                  <span className="rk">{s.rank}</span>
                  <span className="nm" style={{ color: s.color }}>{s.horseId} {s.name}</span>
                  <span className="bar"><i style={{ width: `${Math.min(100, s.position / t.rules.length * 100)}%`, background: s.color }} /></span>
                </div>
              ))}
            </div>
            <div className="dist"><span>DISTANZA</span><b>{leadDist}<span style={{ fontSize: 20, color: '#cdbf86' }}> / {t.rules.length} m</span></b></div>
          </>
        )}
        {t.status === 'paused' && <div className="paused">GARA IN PAUSA</div>}

        {/* RESULTS (mockup 04) */}
        {t.status === 'results' && t.results && (
          <div className="win"><div className="box">
            <h2>VINCE {t.results[0]?.name.toUpperCase()}</h2>
            <div className="rank">
              {t.results.map(r => (
                <div className="r" key={r.horse}>
                  <span style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', background: HORSE_META[r.horse - 1]?.color, color: '#fff', fontSize: 16 }}>{r.place}</span>
                  <span style={{ minWidth: 150, textAlign: 'left' }}>{r.horse} {r.name} · {r.pilot}</span>
                  <span className="pt">{r.points} punti</span>
                </div>
              ))}
            </div>
          </div></div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ TELEFONO ════════════════ */
const PHONE_CSS = FONT_CSS + `
.sp{position:fixed;inset:0;overflow:auto;color:#eafff2;font-family:"LoraS",Georgia,serif;background:radial-gradient(ellipse 150% 80% at 50% 0%,#0f3a26,#07251a 55%,#041a12 100%);display:flex;flex-direction:column;align-items:center;}
.sp .wrap{width:100%;max-width:460px;min-height:100%;display:flex;flex-direction:column;padding:16px 16px 28px;gap:12px;}
.sp .brand{text-align:center;font:800 20px/1 "CinzelS",serif;color:#f0ca68;letter-spacing:.06em}
.sp .brand small{display:block;color:#bfe6cf;font:600 11px/1 "CinzelS",serif;letter-spacing:.3em;margin-top:3px}
.sp .h1{font:800 27px/1.1 "CinzelS",serif;text-align:center;color:#f6e7bf}
.sp .h2{text-align:center;color:#bfe6cf;font-size:14px}
.sp .list{display:flex;flex-direction:column;gap:10px}
.sp .row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;border:2px solid #ffffff1e;background:#ffffff0c;color:#eafff2;cursor:pointer;text-align:left;width:100%}
.sp .row.sel{border-color:#6fe08a;box-shadow:0 0 0 2px #6fe08a,0 0 18px #6fe08a55;background:#ffffff16}
.sp .row.taken{opacity:.5}
.sp .row .num{width:38px;height:38px;flex:none;border-radius:9px;display:grid;place-items:center;font:800 20px/1 "CinzelS",serif;color:#fff}
.sp .row .nm{font:800 19px/1 "CinzelS",serif}
.sp .row .pl{font:italic 400 13px/1.2 "LoraS",serif;color:#bfe6cf;margin-top:3px}
.sp .tag{margin-left:auto;font:700 12px/1 "CinzelS",serif;padding:6px 10px;border-radius:999px}
.sp .cta{width:100%;padding:18px;border-radius:16px;border:none;font:800 22px/1 "CinzelS",serif;color:#231503;cursor:pointer;background:linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34);box-shadow:0 4px 0 #7a4d12}
.sp .cta:disabled{opacity:.5;box-shadow:0 2px 0 #7a4d12}
.sp .panel{border-radius:16px;border:2px solid #caa84f55;background:#ffffff0c;padding:16px}
.sp .big{font:800 30px/1 "CinzelS",serif;color:#f6e7bf}
.sp .ctrl{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}
.sp .ctrl button{min-height:150px;border-radius:24px;border:none;font:800 26px/1.1 "CinzelS",serif;color:#1a1200;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;touch-action:manipulation}
.sp .ctrl .sprint{background:radial-gradient(circle at 42% 30%,#ffe694,#e3a52f);box-shadow:0 6px 0 #8a5a12}
.sp .ctrl .jump{background:radial-gradient(circle at 42% 30%,#79c7f6,#2378bd);color:#fff;box-shadow:0 6px 0 #124b7a}
.sp .ctrl button:disabled{opacity:.45;box-shadow:none}
.sp .ctrl button svg{width:46px;height:46px}
.sp .energy{height:20px;border-radius:10px;background:#0c2016;overflow:hidden;border:1px solid #ffffff14;margin-top:6px}
.sp .energy i{display:block;height:100%;background:linear-gradient(90deg,#daac3b,#56d29d)}
.sp .cue{text-align:center;border-radius:14px;padding:12px;font:800 20px/1 "CinzelS",serif;margin-top:4px}
.sp .cue.now{background:linear-gradient(180deg,#39d46b,#139a3e);color:#04210e;animation:cuepulse .7s ease-in-out infinite}
.sp .cue.wait{background:#ffffff0c;color:#bfe6cf}
@keyframes cuepulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.sp .stat{display:flex;justify-content:space-between;font:700 15px/1 "CinzelS",serif;color:#bfe6cf;margin-top:8px}
`;

function BoltIcon() { return <svg viewBox="0 0 48 48" fill="none"><path d="M26 4 10 28h11l-3 16 20-26H26l4-14z" fill="#1a1200" /></svg>; }
function JumpIcon() { return <svg viewBox="0 0 48 48" fill="none"><path d="M6 36V16M42 36V16M6 20h36" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><path d="M6 36h36" stroke="#fff" strokeWidth="5" strokeLinecap="round" /></svg>; }

export function IppodromoSprintPhone({ displayCode }: { displayCode: string }) {
  const [playerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [me, setMe] = useState<{ id: string; nickname: string } | null>(null);
  const st = useSprint(displayCode, 400);
  const t = st?.table;
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const seqRef = useRef(0);
  useEffect(() => { if (!playerCode) { setMe(null); return; } fetch(`${API}/gestione/casino/player/${playerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.player) setMe({ id: d.player.id, nickname: d.player.nickname }); }).catch(() => {}); }, [playerCode]);
  useEffect(() => { setOnline(!!st); }, [st]);

  const mine = t && me ? t.seats.find(s => s.playerId === me.id) ?? null : null;
  const pick = async (horseId: number) => { setBusy(true); try { await api('/gestione/casino/sprint/join', { displayCode, playerCode, horseId }); } finally { setBusy(false); } };
  const toggleReady = async () => { setBusy(true); try { await api('/gestione/casino/sprint/ready', { displayCode, playerCode }); } finally { setBusy(false); } };
  // pointerdown immediato: feedback locale subito, server conferma (nessun auto-fire)
  const input = (action: 'sprint' | 'jump') => { const commandId = `${me?.id}-${Date.now()}-${++seqRef.current}`; api('/gestione/casino/sprint/input', { displayCode, playerCode, action, commandId }).catch(() => {}); };

  const Shell = (c: React.ReactNode) => (
    <div className="sp"><style>{PHONE_CSS}</style><div className="wrap">
      <div className="brand">IPPODROMO SPRINT<small>IDEA EVENTI</small></div>{c}
    </div></div>
  );
  if (!playerCode || !me) return Shell(<div className="panel" style={{ marginTop: 30 }}><div className="h1">Entra alla serata</div><div className="h2" style={{ marginTop: 8 }}>Scansiona il QR del casinò e accedi, poi scegli il tuo cavallo.</div></div>);
  if (!t) return Shell(<div className="h2" style={{ marginTop: 40 }}>Carico il tavolo…</div>);

  if (!online) return Shell(
    <div className="panel" style={{ marginTop: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>📶✕</div>
      <div className="h1" style={{ marginTop: 6 }}>Connessione persa</div>
      <div className="h2" style={{ marginTop: 8 }}>Il cavallo continua al passo base. Nessun comando viene recuperato in ritardo.</div>
    </div>
  );

  if (t.status === 'results' && t.results) {
    const my = mine ? t.results.find(r => r.horse === mine.horseId) : null;
    return Shell(<>
      <div className="h1">HAI CONCLUSO</div>
      {my ? <>
        <div style={{ textAlign: 'center' }}><div style={{ font: '900 70px/1 CinzelS,serif', color: '#f0ca68' }}>{my.place}°</div><div style={{ font: '700 20px/1 CinzelS,serif', color: '#f6e7bf', letterSpacing: '.2em' }}>POSTO</div></div>
        <div className="panel">
          <div className="stat"><span>⏱ Tempo</span><b style={{ color: '#f6e7bf' }}>{(my.time / 1000).toFixed(1)} s</b></div>
          <div className="stat"><span>🪵 Salti</span><b style={{ color: '#f6e7bf' }}>{my.cleared} / 4</b></div>
          <div className="stat"><span>★ Punti</span><b style={{ color: '#f0ca68' }}>{my.points}</b></div>
        </div>
      </> : <div className="panel"><div className="h2">Vince {t.results[0]?.name}. Non eri in gara questa volta.</div></div>}
      <div className="h2">🏁 Attendi la prossima gara</div>
    </>);
  }

  // Scelta cavallo (lobby, senza cavallo)
  if (!mine && (t.status === 'lobby')) {
    return Shell(<>
      <div className="h1">SCEGLI CAVALLO</div>
      <div className="h2">Seleziona il cavallo e il suo pilota</div>
      <div className="list">
        {t.seats.map(s => {
          const taken = !!s.playerId;
          return (
            <button key={s.horseId} className={`row${taken ? ' taken' : ''}`} disabled={busy || taken} onClick={() => pick(s.horseId)} style={{ borderColor: s.color + '66' }}>
              <span className="num" style={{ background: s.color }}>{s.horseId}</span>
              <span style={{ flex: 1, minWidth: 0 }}><span className="nm" style={{ color: s.color }}>{s.name}</span><span className="pl">{s.nickname ? `Pilota: ${s.nickname}` : 'Disponibile'}</span></span>
              <span className="tag" style={{ background: taken ? '#ffffff14' : '#6fe08a22', color: taken ? '#bfe6cf' : '#6fe08a' }}>{taken ? 'Occupato' : 'Disponibile'}</span>
            </button>
          );
        })}
      </div>
    </>);
  }

  // Pronto (lobby, con cavallo) — mockup 07
  if (mine && t.status === 'lobby') {
    return Shell(<>
      <div className="h1">PRONTO</div>
      <div className="h2">Controlla la tua scelta e preparati alla gara</div>
      <div className="panel" style={{ borderColor: mine.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="num" style={{ width: 44, height: 44, borderRadius: 10, background: mine.color, display: 'grid', placeItems: 'center', font: '800 24px CinzelS,serif', color: '#fff' }}>{mine.horseId}</span>
          <div><div className="big" style={{ color: mine.color }}>{mine.name}</div><div className="h2" style={{ textAlign: 'left' }}>Pilota: {me.nickname}</div></div>
        </div>
      </div>
      <div className="panel"><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ color: '#f0ca68', fontSize: 26 }}>⚡</span><div><b style={{ color: '#f0ca68' }}>SPRINT</b><div className="h2" style={{ textAlign: 'left' }}>Aumenta la velocità e consuma energia.</div></div></div></div>
      <div className="panel"><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ color: '#79c7f6', fontSize: 26 }}>⛼</span><div><b style={{ color: '#79c7f6' }}>SALTA</b><div className="h2" style={{ textAlign: 'left' }}>Evita gli ostacoli.</div></div></div></div>
      <button className="cta" disabled={busy} onClick={toggleReady} style={mine.ready ? { background: 'linear-gradient(180deg,#39d46b,#139a3e)', color: '#04210e' } : undefined}>{mine.ready ? 'Pronto ✓ — tocca per annullare' : 'Sono pronto'}</button>
      <button className="row" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => api('/gestione/casino/sprint/leave', { displayCode, playerCode })}>Cambia cavallo</button>
    </>);
  }

  // Controller live (race/countdown/paused) — mockup 08
  const r = t.rules;
  const racing = t.status === 'race';
  if (!mine) return Shell(<div className="panel" style={{ marginTop: 20 }}><div className="h1">Gara in corso</div><div className="h2" style={{ marginTop: 8 }}>Entrerai dalla prossima gara. Scegli un cavallo quando riapre la lobby.</div></div>);
  const dist = (r.hurdles[mine.nextHurdle] ?? Infinity) - mine.position;
  const near = dist > 0 && dist < 25;
  const canSprint = racing && mine.finish === null && mine.energy >= r.sprintCost;
  const canJump = racing && mine.finish === null && (t.raceMs - mine.lastJump) >= r.jumpCooldownMs;
  return Shell(<>
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <span className="num" style={{ width: 40, height: 40, borderRadius: 9, background: mine.color, display: 'grid', placeItems: 'center', font: '800 22px CinzelS,serif', color: '#fff' }}>{mine.horseId}</span>
      <div style={{ flex: 1 }}><div style={{ font: '800 20px/1 CinzelS,serif', color: mine.color }}>{mine.name}</div><div className="h2" style={{ textAlign: 'left' }}>{me.nickname}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ font: '800 24px/1 CinzelS,serif', color: '#f6e7bf' }}>{mine.rank}/6</div><div className="h2">posizione</div></div>
    </div>
    <div>
      <div className="stat"><span>Distanza percorsa</span><span style={{ color: '#f6e7bf' }}>{Math.floor(mine.position)} / {r.length} m</span></div>
      <div className="energy"><i style={{ width: `${Math.max(0, Math.min(100, mine.energy))}%` }} /></div>
      <div className="stat"><span>Energia</span><span style={{ color: '#f6e7bf' }}>{Math.floor(mine.energy)}%</span></div>
    </div>
    <div className={`cue ${near && racing ? 'now' : 'wait'}`}>
      {t.status === 'countdown' ? `Partenza fra ${Math.max(1, t.countdown)}…` : t.status === 'paused' ? 'Gara in pausa' : near ? `⬆ SALTA ORA · ostacolo fra ${Math.max(0, dist).toFixed(1)} m` : Number.isFinite(dist) ? `Prossimo ostacolo fra ${Math.max(0, Math.ceil(dist))} m` : 'Ultimo rettilineo'}
    </div>
    <div className="ctrl">
      <button className="sprint" disabled={!canSprint} onPointerDown={e => { e.preventDefault(); input('sprint'); }}><BoltIcon />SPRINT</button>
      <button className="jump" disabled={!canJump} onPointerDown={e => { e.preventDefault(); input('jump'); }}><JumpIcon />SALTA</button>
    </div>
    <div className="stat"><span>Sprint massimo {r.maxSprintPerSec} tocchi/s</span><span style={{ color: online ? '#6fe08a' : '#e77' }}>● {online ? 'Connesso' : 'Offline'}</span></div>
  </>);
}

/* ════════════════════════════════════════════════ REGIA ═══════════════════ */
export function IppodromoSprintRegia({ displayCode }: { displayCode: string }) {
  const st = useSprint(displayCode, 500);
  const t = st?.table;
  const [busy, setBusy] = useState(false);
  const call = async (path: string, body?: object) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setTimeout(() => setBusy(false), 350); } };
  if (!t) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#07251a', color: '#f0ca68', fontFamily: 'Georgia' }}><style>{FONT_CSS}</style>Carico…</div>;
  const started = t.status !== 'lobby';
  const ordered = [...t.seats].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));
  const allReady = t.seats.filter(s => s.playerId).every(s => s.ready);
  const occupied = t.seats.filter(s => s.playerId).length;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse 120% 90% at 50% 0%,#0f3a26,#041a12)', color: '#eafff2', fontFamily: '"LoraS",Georgia,serif', padding: 20, boxSizing: 'border-box' }}>
      <style>{FONT_CSS}</style>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <img src={`${ASSET}logo/idea-eventi-negativo-originale.png`} alt="Idea Eventi" style={{ height: 50 }} />
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 26px/1 CinzelS,serif', color: '#f0ca68' }}>Regia · Ippodromo Sprint</div>
            <div style={{ color: '#bfe6cf' }}>{t.name} · <b style={{ color: '#f0ca68' }}>{t.displayCode}</b> · Gara {t.race}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ padding: '6px 12px', borderRadius: 999, background: started ? '#6fe08a22' : '#ffffff12', color: started ? '#6fe08a' : '#bfe6cf', font: '700 13px CinzelS,serif' }}>PRIVATE HOST</span>
            <div style={{ marginTop: 6, font: '700 16px CinzelS,serif', color: '#f6e7bf' }}>{started ? (t.status === 'paused' ? '⏸ In pausa' : t.status === 'results' ? '🏁 Conclusa' : t.status === 'countdown' ? `Via fra ${t.countdown}` : 'In corsa') : 'In lobby'} {t.status === 'race' ? `· ${(t.raceMs / 1000).toFixed(0)}s` : ''}</div>
          </div>
        </div>

        {/* Tabella piloti / progresso / resistenza */}
        <div style={{ borderRadius: 14, border: '1px solid #caa84f44', background: '#ffffff08', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 90px 70px', gap: 8, padding: '10px 14px', font: '700 12px CinzelS,serif', letterSpacing: '.1em', color: '#bfe6cf', borderBottom: '1px solid #ffffff14' }}>
            <span>#</span><span>CAVALLO · PILOTA</span><span>PROGRESSO</span><span>ENERGIA</span><span>STATO</span>
          </div>
          {(started ? ordered : t.seats).map(s => (
            <div key={s.horseId} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 90px 70px', gap: 8, padding: '9px 14px', alignItems: 'center', borderBottom: '1px solid #ffffff0a' }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: s.color, display: 'grid', placeItems: 'center', font: '800 14px CinzelS,serif', color: '#fff' }}>{s.horseId}</span>
              <span><b style={{ color: '#f6e7bf' }}>{s.name}</b> <span style={{ color: '#bfe6cf', fontSize: 13 }}>· {s.nickname ?? (s.cpu ? 'CPU' : 'libero')}</span></span>
              <span style={{ fontSize: 13, color: '#9fe0b6' }}>{Math.round(s.position / t.rules.length * 100)}%</span>
              <span style={{ fontSize: 13, color: '#edc449' }}>{Math.round(s.energy)}%</span>
              <span style={{ fontSize: 12, color: started ? (s.finish !== null ? '#6fe08a' : '#bfe6cf') : (s.playerId ? (s.ready ? '#6fe08a' : '#edc449') : '#8aa') }}>
                {started ? (s.finish !== null ? 'arrivato' : t.status === 'race' ? 'in corsa' : '—') : (s.playerId ? (s.ready ? 'Pronto' : 'attesa') : 'CPU')}
              </span>
            </div>
          ))}
        </div>

        {/* Impostazioni gara (valori EFFETTIVI del motore, NON i mockup 140/270/410/540) */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, color: '#bfe6cf', font: '600 14px CinzelS,serif' }}>
          <span style={chip}>🏁 {t.rules.length} m</span>
          <span style={chip}>⛼ {t.rules.hurdles.length} ostacoli</span>
          <span style={chip}>📍 {t.rules.hurdles.join(' / ')} m</span>
          <span style={chip}>⚡ {t.rules.maxSprintPerSec} tocchi/s</span>
          <span style={chip}>👥 {occupied}/6 piloti{occupied < 6 ? ' · posti liberi = CPU' : ''}</span>
        </div>

        {/* Comandi */}
        <div style={{ display: 'grid', gap: 10 }}>
          {t.status === 'lobby' && (
            <button disabled={busy || (occupied > 0 && !allReady)} onClick={() => call('/gestione/casino/sprint/start')} style={bigBtn}>
              🏁 AVVIA GARA {occupied > 0 && !allReady ? '· attendi i piloti pronti' : ''}
            </button>
          )}
          {(t.status === 'race' || t.status === 'countdown') && <button disabled={busy} onClick={() => call('/gestione/casino/sprint/pause')} style={{ ...bigBtn, background: '#ffffff12', color: '#f6e7bf', boxShadow: 'none', border: '1px solid #caa84f66' }}>⏸ PAUSA</button>}
          {t.status === 'paused' && <button disabled={busy} onClick={() => call('/gestione/casino/sprint/resume')} style={bigBtn}>▶ RIPRENDI</button>}
          {(t.status === 'results' || t.status === 'paused') && <button disabled={busy} onClick={() => call('/gestione/casino/sprint/reset')} style={{ ...bigBtn, background: '#ffffff12', color: '#f6e7bf', boxShadow: 'none', border: '1px solid #caa84f66' }}>↻ Nuova gara (conserva i piloti)</button>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#ffffff0c', borderRadius: 12, padding: 12 }}>
            <QRCodeSVG value={`${ORIGIN}gestione/casino?sprintplay=${t.displayCode}`} size={78} />
            <div style={{ color: '#bfe6cf', fontSize: 13 }}>QR ingresso piloti<br /><b style={{ color: '#f0ca68', fontSize: 18 }}>{t.displayCode}</b></div>
            <button disabled={busy} onClick={() => call('/gestione/casino/sprint/suspend')} style={{ ...ghost, marginLeft: 'auto', width: 'auto', padding: '10px 14px' }}>{t.suspended ? 'Riattiva' : 'Sospendi'}</button>
          </div>
          <a href={`${ORIGIN}gestione/casino?sprint=${t.displayCode}&host=1`} target="_blank" rel="noreferrer" style={{ ...ghost, textAlign: 'center', textDecoration: 'none', display: 'block' }}>🖥️ Apri il monitor 80″ ↗</a>
        </div>
      </div>
    </div>
  );
}
const chip: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, background: '#ffffff0c', border: '1px solid #caa84f33' };
const bigBtn: React.CSSProperties = { padding: 18, borderRadius: 14, border: 'none', background: 'linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34)', color: '#231503', font: '800 22px CinzelS,serif', cursor: 'pointer', boxShadow: '0 4px 0 #7a4d12' };
const ghost: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #caa84f66', background: '#ffffff12', color: '#f0ca68', font: '700 15px CinzelS,serif', cursor: 'pointer', width: '100%' };

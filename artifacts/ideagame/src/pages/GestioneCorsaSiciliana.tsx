/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ════════════════════════════════════════════════════════════════════════════
   CORSA SICILIANA — variante della corsa dei cavalli con carte siciliane. 4 cavalli,
   uno per seme (Coppe/Denari/Spade/Bastoni). Il conduttore pesca una carta: avanza di
   1 casella SOLO il cavallo del seme uscito. Primo al traguardo vince. L'esito deriva
   dalle CARTE estratte (motore server). Tema Sicilia: maiolica blu/oro, limoni, mare.
   Viste: monitor 80" (?sic=CODE, host con &host=1), telefono (?sicplay=), regia (?sicregia=).

   MONITOR: ricostruito pixel-faithful sul mockup approvato col metodo mockup-replica.
   Base = sfondo-sicilia-pulito.png (clean-plate con cornice/limoni/maiolica/plance).
   Art dipinta ritagliata dal mockup (plancia titolo, medaglioni, ritratti); carte reali
   dagli ATLANTI siciliani via rect del mazzo.json; testi/numeri dinamici in codice
   (Cinzel/Lora). Cavalli PNG per seme (una posa, traslazione + oscillazione).
   ════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const AB = BASE;
const ASSET = `${AB}corsa-siciliana/`;
const ORIGIN = (typeof window !== 'undefined' ? window.location.origin : '') + BASE;

type Suit = 'coppe' | 'denari' | 'spade' | 'bastoni';
const SUITS: Suit[] = ['coppe', 'denari', 'spade', 'bastoni'];
const SUIT_META: Record<Suit, { label: string; color: string; glow: string; cavallo: string }> = {
  coppe:   { label: 'COPPE',   color: '#7a1f1f', glow: '#e86a4a', cavallo: 'coppe-rosso.png' },
  denari:  { label: 'DENARI',  color: '#9a6a12', glow: '#ffcf5a', cavallo: 'denari-oro.png' },
  spade:   { label: 'SPADE',   color: '#26407a', glow: '#6ea0ff', cavallo: 'spade-blu.png' },
  bastoni: { label: 'BASTONI', color: '#2e6b2e', glow: '#6fe08a', cavallo: 'bastoni-verde.png' },
};
/* dimensioni native degli atlanti (per il ritaglio via <image>) */
const ATLAS_SIZE: Record<Suit, { w: number; h: number }> = {
  coppe: { w: 1983, h: 793 }, denari: { w: 1983, h: 793 },
  spade: { w: 1536, h: 1024 }, bastoni: { w: 1536, h: 1024 },
};

type SicCardSuit = Suit | 'banco';
type SiciliaCard = { suit: SicCardSuit; value: number };
type SicWinner = Suit | 'banco';
type SicPlayer = { id: string; nickname: string; avatarUrl: string | null; balance: number; suit: Suit | null; stake: number };
type SicHist = { race: number; at: string; winner: SicWinner | null; cards: number; players: number; pickedWinner: number; pot: number };
type SicPot = Record<Suit, number> & { total: number };
type SicTbl = {
  id: string; name: string; displayCode: string; type: 'sicilia';
  phase: 'betting' | 'racing' | 'result'; race: number; trackLen: number;
  positions: Record<Suit, number>; last: SiciliaCard | null; winner: SicWinner | null;
  bancoEnabled: boolean; bancoCards: number; bancoPos: number;
  quota: number; pot: SicPot;
  drawn: number; deckLeft: number; players: SicPlayer[]; suspended: boolean; history: SicHist[];
};
type SicState = { table: SicTbl; sessionId: string };

/* carta del mazzo.json: identità logica + rettangolo nell'atlante */
type MazzoCard = { id: string; suit: Suit; rank: number; rect: { x: number; y: number; width: number; height: number } };

const SIC_FONT = `
@font-face{font-family:"Cinzel";font-weight:400 900;src:url(${ASSET}font/Cinzel-Variable.ttf) format("truetype");font-display:swap}
@font-face{font-family:"Lora";font-weight:400 700;src:url(${ASSET}font/Lora-Variable.ttf) format("truetype");font-display:swap}
@font-face{font-family:"Lora";font-weight:400 700;font-style:italic;src:url(${ASSET}font/Lora-Italic-Variable.ttf) format("truetype");font-display:swap}`;
/* font usato da Telefono/Regia (invariato) */
const FONT = `@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;

function useSicTable(code: string, ms = 800): SicState | null {
  const [st, setSt] = useState<SicState | null>(null);
  useEffect(() => { let on = true; const load = () => fetch(`${API}/gestione/casino/sicilia/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {}); load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); }; }, [code, ms]);
  return st;
}
/* mazzo.json → mappa "suit-rank" → carta (per ritagliare la carta reale dall'atlante). Identità logica dal manifest, MAI OCR. */
function useMazzo(): Map<string, MazzoCard> {
  const [map, setMap] = useState<Map<string, MazzoCard>>(new Map());
  useEffect(() => {
    let on = true;
    fetch(`${ASSET}data/mazzo.json`).then(r => r.ok ? r.json() : null).then(d => {
      if (!on || !d?.cards) return;
      const m = new Map<string, MazzoCard>();
      for (const c of d.cards as MazzoCard[]) m.set(`${c.suit}-${c.rank}`, c);
      setMap(m);
    }).catch(() => {});
    return () => { on = false; };
  }, []);
  return map;
}
const api = (path: string, body?: unknown) => fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

/* ── Semi siciliani in SVG — usati solo da Telefono/Regia (icone piccole) ──────── */
function SuitIcon({ suit, size = 40 }: { suit: Suit; size?: number }) {
  const c = SUIT_META[suit];
  const common = { width: size, height: size, viewBox: '0 0 48 48' } as const;
  if (suit === 'coppe') return (
    <svg {...common}><defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4d77a" /><stop offset="1" stopColor="#b9801f" /></linearGradient></defs>
      <path d="M12 8h24l-3 12a9 9 0 0 1-18 0z" fill="url(#gc)" stroke="#7a5410" strokeWidth="1.5" />
      <rect x="22" y="30" width="4" height="7" fill="url(#gc)" /><rect x="15" y="37" width="18" height="4" rx="2" fill="url(#gc)" stroke="#7a5410" strokeWidth="1" />
      <circle cx="24" cy="15" r="3" fill="#9f2b2b" /></svg>
  );
  if (suit === 'denari') return (
    <svg {...common}><circle cx="24" cy="24" r="16" fill="#f4d77a" stroke="#7a5410" strokeWidth="2" /><circle cx="24" cy="24" r="11" fill="none" stroke="#b9801f" strokeWidth="1.5" />
      {Array.from({ length: 12 }).map((_, i) => { const a = i * 30 * Math.PI / 180; return <line key={i} x1={24 + 8 * Math.cos(a)} y1={24 + 8 * Math.sin(a)} x2={24 + 11 * Math.cos(a)} y2={24 + 11 * Math.sin(a)} stroke="#b9801f" strokeWidth="1.5" />; })}
      <circle cx="24" cy="24" r="5" fill="#c9972f" /></svg>
  );
  if (suit === 'spade') return (
    <svg {...common}><defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dfe8f5" /><stop offset="1" stopColor="#8aa6cf" /></linearGradient></defs>
      <path d="M24 4l4 26h-8z" fill="url(#gs)" stroke="#3a5280" strokeWidth="1.3" /><rect x="22" y="29" width="4" height="12" fill="#b98b38" /><rect x="15" y="31" width="18" height="4" rx="2" fill="#c9972f" stroke="#7a5410" strokeWidth="1" />
      <circle cx="24" cy="40" r="3" fill="#b98b38" /></svg>
  );
  return (
    <svg {...common}><defs><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a5a28" /><stop offset="1" stopColor="#5a3a18" /></linearGradient></defs>
      <rect x="21" y="8" width="6" height="32" rx="3" transform="rotate(32 24 24)" fill="url(#gb)" stroke="#3a2510" strokeWidth="1.2" />
      <rect x="21" y="8" width="6" height="32" rx="3" transform="rotate(-32 24 24)" fill="url(#gb)" stroke="#3a2510" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="4" fill="#2e7d3a" /></svg>
  );
  void c;
}

/* ── Carta siciliana reale: dorso maiolica (immagine) + fronte ritagliato dall'atlante ── */
function CardBack({ h = 290 }: { h?: number }) {
  const w = Math.round(h * 0.63);
  return <div style={{ width: w, height: h, borderRadius: 12, background: `url(${ASSET}dorso-maiolica.png) center/cover`, boxShadow: '0 10px 24px #0008' }} />;
}
function CardFace({ suit, value, mazzo, h = 290 }: { suit: Suit; value: number; mazzo: Map<string, MazzoCard>; h?: number }) {
  const card = mazzo.get(`${suit}-${value}`);
  if (!card) return <CardBack h={h} />;
  const r = card.rect; const as = ATLAS_SIZE[suit];
  const w = Math.round(h * (r.width / r.height));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${r.width} ${r.height}`} style={{ filter: 'drop-shadow(0 10px 24px #0008)' }}>
      <image href={`${ASSET}atlanti/${suit}.png`} x={-r.x} y={-r.y} width={as.w} height={as.h} />
    </svg>
  );
}

/* ── Geometria del palco (coordinate del mockup 1672×941) ─────────────────────── */
const STAGE_W = 1672, STAGE_H = 941;
const LANES_Y = [291, 417, 543, 668];          // centri verticali delle 4 corsie
const CELLS_L = 303, CELLS_R = 1080;            // estensione orizzontale delle caselle (9 numeri)
const PILL_L = 162, PILL_W = 918, PILL_H = 84;  // capsula ivory della corsia: ingloba etichetta + caselle
const FIN_L = 1090, FIN_W = 80;                 // colonna traguardo a scacchi
const cellW = (N: number) => (CELLS_R - CELLS_L) / N;
const cellCenter = (pos: number, N: number) => CELLS_L + (pos - 0.5) * cellW(N);
const cellLeft = (pos: number, N: number) => CELLS_L + (pos - 1) * cellW(N);

const SIC_CSS = SIC_FONT + `
.sic{position:fixed;inset:0;overflow:hidden;background:#06204f;display:flex;align-items:center;justify-content:center;font-family:"Lora",Georgia,serif;}
.sic .st{position:relative;width:${STAGE_W}px;height:${STAGE_H}px;flex:none;transform-origin:center center;
  background:url(${ASSET}sfondo-sicilia-pulito.png) 0 0/${STAGE_W}px ${STAGE_H}px no-repeat;}
.sic .lane-pill{position:absolute;height:${PILL_H}px;border-radius:16px;
  background:linear-gradient(180deg,#fffdf4,#f0e6cc);border:3px solid #cdae6a;
  box-shadow:inset 0 2px 0 #fff,inset 0 -3px 6px #c9b680,0 4px 10px #0003;}
.sic .cellnum{position:absolute;display:grid;place-items:center;font:600 34px/1 "Cinzel",serif;color:#2b3c63;}
.sic .celldiv{position:absolute;width:2px;background:#cdae6a99;}
.sic .cellglow{position:absolute;border-radius:10px;}
.sic .fin{position:absolute;height:${PILL_H}px;width:${FIN_W}px;border-radius:12px;overflow:hidden;
  border:3px solid #c9972f;background:repeating-conic-gradient(#14213d 0 25%,#fbf6e6 0 50%) 0 0/20px 20px;box-shadow:0 4px 10px #0003;}
.sic .medal{position:absolute;width:108px;height:108px;z-index:3;filter:drop-shadow(0 3px 5px #0004);}
.sic .lname{position:absolute;z-index:2;font:700 33px/1 "Cinzel",serif;letter-spacing:.005em;text-shadow:0 1px 0 #fff9;}
.sic .horse{position:absolute;transform:translate(-50%,-50%);transition:left .55s cubic-bezier(.22,.8,.3,1);z-index:4;
  animation:sicbob 2.4s ease-in-out infinite;}
.sic .horse img{display:block;height:120px;width:auto;filter:drop-shadow(0 6px 5px #0005);}
@keyframes sicbob{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,calc(-50% - 5px))}}
.sic .giro{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;
  border-radius:12px;background:radial-gradient(ellipse at 50% 25%,#1c3f80,#0d2250);
  border:3px solid #e8c45f;box-shadow:0 5px 14px #0006,inset 0 0 0 2px #0a1b44;color:#ffe9a6;}
.sic .giro span{font:600 18px/1 "Cinzel",serif;letter-spacing:.22em;opacity:.95}
.sic .giro b{font:700 54px/.9 "Cinzel",serif;color:#fff;margin-top:4px}
.sic .menu{position:absolute;display:grid;place-items:center;border-radius:50%;
  background:radial-gradient(circle at 42% 30%,#1c3f80,#0d2250);border:3px solid #e8c45f;box-shadow:0 5px 14px #0006;}
.sic .panel{position:absolute;border-radius:20px;background:radial-gradient(ellipse at 50% 0%,#17386f,#0c1f49);
  border:4px solid #e8c45f;box-shadow:0 10px 28px #0008,inset 0 0 0 2px #0a1b44;}
.sic .pesca{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;
  border-radius:16px;border:3px solid #f0d886;background:linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34);
  color:#2a1803;font:700 38px/1 "Cinzel",serif;letter-spacing:.02em;cursor:pointer;
  box-shadow:0 5px 0 #7a4d12,inset 0 1px 0 #fff8;}
.sic .pesca:disabled{opacity:.6;cursor:default;box-shadow:0 3px 0 #7a4d12;}
.sic .pesca small{font:italic 400 18px/1 "Lora",serif;margin-top:7px;opacity:.9;letter-spacing:0}
.sic .usc{position:absolute;text-align:center;color:#17284c;}
.sic .usc b{display:block;font:700 40px/1 "Cinzel",serif;color:#15284f;letter-spacing:.04em}
.sic .usc em{display:block;font:italic 400 21px/1.2 "Lora",serif;color:#3c4a6a;margin-top:8px}
.sic .chip{position:absolute;border-radius:16px;background:linear-gradient(180deg,#fffdf4,#efe4c8);
  border:3px solid #cdae6a;display:flex;align-items:center;gap:14px;padding:0 18px;box-shadow:0 5px 12px #0004;}
.sic .chip .av{width:92px;height:92px;flex:none;border-radius:50%;object-fit:cover;}
.sic .chip .lbl{font:700 26px/1 "Cinzel",serif;letter-spacing:.02em}
.sic .chip .sub{font:italic 400 17px/1.25 "Lora",serif;color:#6a5a38;margin-top:3px}
.sic .win{position:absolute;inset:0;display:grid;place-items:center;background:rgba(6,20,54,.74);z-index:30;}
.sic .win .card{padding:44px 90px;border-radius:26px;background:radial-gradient(ellipse at 50% 25%,#1c3f80,#0c1f49);
  border:5px solid #e8c45f;text-align:center;box-shadow:0 16px 46px #000b;}
.sic .win h2{margin:0;font:700 70px/1 "Cinzel",serif;background:linear-gradient(180deg,#fff6c8,#ffe08a 50%,#e4ad4b);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
`;

export function CorsaSiciliaMonitor({ displayCode, host = false }: { displayCode: string; host?: boolean }) {
  const st = useSicTable(displayCode, 700);
  const mazzo = useMazzo();
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const [busy, setBusy] = useState(false);
  const t = st?.table;
  const scale = Math.min(dim.w / STAGE_W, dim.h / STAGE_H);

  const draw = useCallback(async () => {
    if (!t || busy || t.phase !== 'racing' || t.winner) return;
    setBusy(true);
    try { await api('/gestione/casino/sicilia/draw', { displayCode, token: `${t.race}:${t.drawn}:${Date.now()}` }); }
    finally { setTimeout(() => setBusy(false), 650); }   // blocca il doppio-click durante l'animazione
  }, [t, busy, displayCode]);

  if (!t) return <div className="sic"><style>{SIC_CSS}</style><div style={{ color: '#ffe9a6', font: '400 30px "Cinzel",serif' }}>Carico il tavolo…</div></div>;
  const N = t.trackLen;
  const canDraw = host && t.phase === 'racing' && !t.winner && !busy;
  const bySuit = (s: Suit) => t.players.filter(p => p.suit === s);
  const chipLeft = [108, 466, 852, 1240];   // 4 card giocatore in basso

  return (
    <div className="sic"><style>{SIC_CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})` }}>

        {/* GIRO (in alto a sinistra) */}
        <div className="giro" style={{ left: 238, top: 15, width: 147, height: 111 }}>
          <span>GIRO</span><b>{String(t.race).padStart(2, '0')}</b>
        </div>

        {/* Plancia titolo (art dipinta ritagliata dal mockup) */}
        <img src={`${ASSET}crops/plancia-titolo.png`} alt="Corsa Siciliana — Idea Eventi" draggable={false}
          style={{ position: 'absolute', left: 408, top: 12, width: 844, height: 'auto', pointerEvents: 'none' }} />

        {/* Menu (decorativo, coerente col mockup) */}
        <div className="menu" style={{ left: 1557, top: 12, width: 88, height: 87 }}>
          <div style={{ width: 40 }}>{[0, 1, 2].map(i => <div key={i} style={{ height: 4, borderRadius: 2, background: '#e8c45f', margin: '5px 0' }} />)}</div>
        </div>

        {/* Piatto totale + cavallo del Banco (sopra il pannello mazzo) */}
        <div style={{ position: 'absolute', left: 1195, top: 150, width: 463, textAlign: 'center', color: '#ffe9a6', font: '700 28px "Cinzel",serif' }}>
          PIATTO {t.pot?.total ?? 0} · ×{t.quota ?? 3}
          {t.bancoEnabled && <span style={{ color: '#ffd27a', fontSize: 24 }}>{'  ·  '}🏦 {t.bancoPos}/{N}</span>}
        </div>

        {/* 4 corsie */}
        {SUITS.map((s, i) => {
          const cy = LANES_Y[i];
          const pos = t.positions[s];
          const m = SUIT_META[s];
          const hx = pos <= 0 ? CELLS_L - 18 : cellCenter(pos, N);
          return (
            <div key={s}>
              {/* medaglione seme (ritaglio dipinto) */}
              <img className="medal" src={`${ASSET}crops/medaglione-${s}.png`} alt="" draggable={false}
                style={{ left: 63, top: cy - 54 }} />
              {/* etichetta seme (dentro la capsula, sopra la pillola) */}
              <div className="lname" style={{ left: 196, top: cy - 17, color: m.color }}>{m.label}</div>
              {/* pillola corsia */}
              <div className="lane-pill" style={{ left: PILL_L, top: cy - PILL_H / 2, width: PILL_W }} />
              {/* divisore etichetta ↔ caselle */}
              <div className="celldiv" style={{ left: CELLS_L, top: cy - PILL_H / 2 + 12, height: PILL_H - 24 }} />
              {/* divisori + numeri caselle */}
              {Array.from({ length: N }).map((_, c) => {
                const cl = cellLeft(c + 1, N);
                return (
                  <div key={c}>
                    {c > 0 && <div className="celldiv" style={{ left: cl, top: cy - PILL_H / 2 + 12, height: PILL_H - 24 }} />}
                    <div className="cellnum" style={{ left: cl, top: cy - 20, width: cellW(N), height: 40, color: pos === c + 1 ? m.color : '#2b3c63' }}>{c + 1}</div>
                  </div>
                );
              })}
              {/* highlight casella corrente */}
              {pos >= 1 && pos <= N && (
                <div className="cellglow" style={{ left: cellLeft(pos, N) + 3, top: cy - PILL_H / 2 + 4, width: cellW(N) - 6, height: PILL_H - 8, background: `radial-gradient(ellipse at 50% 50%, ${m.glow}cc 0%, ${m.glow}44 55%, transparent 78%)` }} />
              )}
              {/* traguardo a scacchi */}
              <div className="fin" style={{ left: FIN_L, top: cy - PILL_H / 2 }} />
              {/* cavallo del seme */}
              <div className="horse" style={{ left: hx, top: cy - 8, animationDelay: `${i * 0.3}s`, filter: pos >= 1 ? `drop-shadow(0 0 14px ${m.glow})` : 'none' }}>
                <img src={`${ASSET}cavalli/${m.cavallo}`} alt={m.label} draggable={false} />
              </div>
            </div>
          );
        })}

        {/* Pannello mazzo + carta corrente */}
        <div className="panel" style={{ left: 1195, top: 208, width: 463, height: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <CardBack h={300} />
          {t.last ? (t.last.suit === 'banco'
            ? <div style={{ width: 189, height: 300, borderRadius: 12, border: '3px solid #e8c45f', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg,#143b86,#0a2a6a)', color: '#ffe9a6', font: '700 30px "Cinzel",serif', textAlign: 'center', gap: 8 }}><span style={{ fontSize: 64 }}>🏦</span>BANCO</div>
            : <CardFace suit={t.last.suit as Suit} value={t.last.value} mazzo={mazzo} h={300} />)
            : <div style={{ width: 189, height: 300, borderRadius: 12, border: '3px dashed #e8c45f66', display: 'grid', placeItems: 'center', color: '#ffe9a6', font: 'italic 400 18px "Lora",serif', textAlign: 'center' }}>in attesa<br />di pescata</div>}
        </div>

        {/* "È USCITO …" */}
        <div className="usc" style={{ left: 1192, top: 552, width: 468 }}>
          {t.last ? (t.last.suit === 'banco'
            ? <><b>È USCITO BANCO</b><em>Il cavallo del Banco avanza di 1 casella</em></>
            : <><b>È USCITO {SUIT_META[t.last.suit as Suit].label}</b><em>Il cavallo {SUIT_META[t.last.suit as Suit].label[0] + SUIT_META[t.last.suit as Suit].label.slice(1).toLowerCase()} avanza di 1 casella</em></>)
            : <em style={{ fontSize: 22 }}>{t.phase === 'betting' ? 'Puntate aperte — punta dal telefono' : 'Pesca la prima carta'}</em>}
        </div>

        {/* Pulsante PESCA */}
        <button className="pesca" onClick={draw} disabled={!canDraw} title={host ? '' : 'Pescata riservata al conduttore (regia)'}
          style={{ left: 1213, top: 638, width: 444, height: 104 }}>
          {t.winner ? 'CORSA CONCLUSA' : 'PESCA UNA CARTA'}
          <small>{t.winner ? `in ${t.drawn} carte` : host ? (t.phase === 'racing' ? 'Tocca il mazzo per avanzare' : 'Avvia la corsa dalla regia') : 'Riservato al conduttore'} · mazzo {t.deckLeft}</small>
        </button>

        {/* Striscia giocatori per seme (ritratti dipinti) */}
        {SUITS.map((s, i) => {
          const m = SUIT_META[s]; const list = bySuit(s); const first = list[0];
          return (
            <div className="chip" key={s} style={{ left: chipLeft[i], top: 770, width: 350, height: 104 }}>
              <img className="av" src={`${ASSET}crops/ritratto-${s}.png`} alt="" draggable={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lbl" style={{ color: m.color }}>{m.label}</div>
                <div className="sub">{list.length ? `${list.length} giocatore${list.length > 1 ? 'i' : ''}${first ? ' · ' + first.nickname : ''}` : <>Scegli il tuo cavallo<br />dal telefono</>}</div>
              </div>
            </div>
          );
        })}

        {/* vincitore */}
        {t.phase === 'result' && t.winner && (
          <div className="win"><div className="card">
            {t.winner === 'banco'
              ? <><div style={{ fontSize: 110, marginBottom: 6 }}>🏦</div><h2>VINCE IL BANCO</h2><div style={{ color: '#ffe9a6', font: 'italic 400 24px "Lora",serif', marginTop: 10 }}>in {t.drawn} carte · le puntate vanno alla casa</div></>
              : <><img src={`${ASSET}crops/medaglione-${t.winner}.png`} alt="" style={{ width: 120, height: 120, marginBottom: 12 }} /><h2>VINCE {SUIT_META[t.winner as Suit].label}</h2><div style={{ color: '#ffe9a6', font: 'italic 400 24px "Lora",serif', marginTop: 10 }}>in {t.drawn} carte · {bySuit(t.winner as Suit).length} hanno vinto ×{t.quota ?? 3}</div></>}
          </div></div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ TELEFONO ════════════════ */
const PHONE_CSS = FONT + `
.sicp{position:fixed;inset:0;overflow:auto;color:#fff;font-family:"Baskerville Casino",Georgia,serif;background:radial-gradient(ellipse 150% 80% at 50% 0%,#2f6fae,#143b86 55%,#0a2a6a 100%);display:flex;flex-direction:column;align-items:center;}
.sicp .wrap{width:100%;max-width:460px;min-height:100%;display:flex;flex-direction:column;padding:16px 16px 28px;gap:14px;}
.sicp .h1{font:700 26px/1.15 "Baskerville Casino",serif;text-align:center;}
.sicp .h2{text-align:center;color:#cfe0f5;font-size:14px;}
.sicp .suits{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.sicp .suit{display:flex;align-items:center;gap:12px;padding:16px;border-radius:16px;border:2px solid #ffffff22;background:#ffffff0e;cursor:pointer;color:#fff;}
.sicp .suit.sel{border-color:#f1d98c;box-shadow:0 0 0 2px #f1d98c,0 0 18px #f1d98c55;background:#ffffff18;}
.sicp .suit .nm{font:700 22px/1 "Baskerville Casino",serif;}
.sicp .medal{width:56px;height:56px;flex:none;border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff6d8,#e7c976 70%);border:3px solid #c9972f;display:grid;place-items:center;}
.sicp .panel{border-radius:16px;border:2px solid #f1d98c55;background:#ffffff0e;padding:16px;text-align:center;}
.sicp .big{font:700 34px/1 "Baskerville Casino",serif;color:#ffe9a6;}
`;
const SIC_CHIPS = [10, 50, 100, 250];   // multipli di 10 (vincolo backend)
export function CorsaSiciliaPhone({ displayCode }: { displayCode: string }) {
  const [playerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [me, setMe] = useState<{ id: string; nickname: string } | null>(null);
  const st = useSicTable(displayCode, 900);
  const t = st?.table;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Suit | null>(null);
  const [chip, setChip] = useState(50);
  useEffect(() => { if (!playerCode) { setMe(null); return; } fetch(`${API}/gestione/casino/player/${playerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.player) setMe({ id: d.player.id, nickname: d.player.nickname }); }).catch(() => {}); }, [playerCode, t?.race]);
  const meRow = t && me ? (t.players.find(p => p.id === me.id) ?? null) : null;
  const mine = meRow?.suit ?? null;
  const stake = meRow?.stake ?? 0;
  const balance = meRow?.balance ?? 0;
  const quota = t?.quota ?? 3;
  const betSuit: Suit | null = mine ?? sel;
  const bet = async () => { if (!betSuit) return; setBusy(true); setErr(''); try { const r = await api('/gestione/casino/sicilia/bet', { displayCode, playerCode, suit: betSuit, amount: chip }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };
  const unbet = async () => { setBusy(true); setErr(''); try { await api('/gestione/casino/sicilia/unbet', { displayCode, playerCode }); setSel(null); } finally { setBusy(false); } };

  const Shell = (c: React.ReactNode) => <div className="sicp"><style>{PHONE_CSS}</style><div className="wrap"><div style={{ textAlign: 'center' }}><div style={{ font: '700 20px/1 "Baskerville Casino",serif', color: '#ffe9a6', letterSpacing: '.08em' }}>CORSA SICILIANA</div></div>{c}</div></div>;
  if (!playerCode || !me) return Shell(<div className="panel" style={{ marginTop: 30 }}><div className="h1">Entra alla serata</div><div className="h2">Scansiona il QR del casinò e accedi, poi siediti al tavolo e punta.</div></div>);
  if (!t) return Shell(<div className="h2" style={{ marginTop: 40 }}>Carico il tavolo…</div>);

  if (t.phase === 'result' && t.winner) {
    const bancoWon = t.winner === 'banco';
    const won = !bancoWon && mine === t.winner;
    const prize = won ? stake * quota : 0;
    return Shell(
      <div className="panel">
        {bancoWon
          ? <><div className="big">Vince il Banco 🏦</div><div className="h2" style={{ marginTop: 6 }}>Il cavallo del Banco è arrivato primo: le puntate vanno alla casa.</div></>
          : <><div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><SuitIcon suit={t.winner as Suit} size={64} /></div><div className="big">Vince {SUIT_META[t.winner as Suit].label}</div></>}
        <div className="h2" style={{ marginTop: 8 }}>
          {stake > 0 ? (won ? `🎉 Hai vinto ${prize} fiche!` : `Hai perso ${stake} fiche`) : (mine ? `Avevi puntato su ${SUIT_META[mine].label}` : 'Non avevi puntato')}
        </div>
        <div className="h2" style={{ marginTop: 6 }}>Le tue fiche: <b style={{ color: '#ffe9a6' }}>{balance}</b></div>
      </div>
    );
  }

  const racing = t.phase === 'racing';
  const gold: React.CSSProperties = { marginTop: 4, padding: '14px', borderRadius: 14, border: 0, background: 'linear-gradient(180deg,#ffe9a6,#d9a63a)', color: '#2a1c04', font: '700 18px "Baskerville Casino",serif', cursor: 'pointer', width: '100%' };
  const ghost: React.CSSProperties = { marginTop: 10, padding: '10px', borderRadius: 12, border: '1px solid #ffffff33', background: 'transparent', color: '#cfe0f5', cursor: 'pointer', width: '100%' };
  return Shell(<>
    <div className="h1">{mine ? 'La tua puntata' : 'Punta sul tuo cavallo'}</div>
    <div className="h2">{racing ? 'Corsa in corso — tifa per il tuo seme!' : 'Scegli un seme, poi punta le fiche'}</div>
    <div className="h2">Le tue fiche: <b style={{ color: '#ffe9a6' }}>{balance}</b>{t.bancoEnabled ? ' · 🏦 c’è il cavallo del Banco' : ''}</div>
    <div className="suits">
      {SUITS.map(s => { const m = SUIT_META[s]; const active = betSuit === s; const locked = !!mine && mine !== s; return (
        <button key={s} className={`suit${active ? ' sel' : ''}`} disabled={busy || racing || locked} onClick={() => setSel(s)}>
          <span className="medal"><SuitIcon suit={s} size={34} /></span>
          <span style={{ flex: 1 }}><span className="nm" style={{ color: m.glow }}>{m.label}</span><br /><span className="h2" style={{ fontSize: 12 }}>casella {t.positions[s]}/{t.trackLen} · piatto {t.pot?.[s] ?? 0}</span></span>
        </button>
      ); })}
    </div>
    {!racing && betSuit && <>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {SIC_CHIPS.map(c => <button key={c} onClick={() => setChip(c)} style={{ padding: '10px 16px', borderRadius: 12, border: `2px solid ${chip === c ? '#f1d98c' : '#ffffff22'}`, background: chip === c ? '#ffffff18' : '#ffffff0e', color: '#fff', font: '700 18px "Baskerville Casino",serif', cursor: 'pointer' }}>{c}</button>)}
      </div>
      <button disabled={busy || balance < chip} onClick={bet} style={gold}>Punta {chip} su {SUIT_META[betSuit].label}</button>
    </>}
    {err && <div className="h2" style={{ color: '#ffb4b4' }}>{err}</div>}
    {mine && stake > 0 && <div className="panel">
      <div className="h2">Hai puntato (vinci ×{quota})</div>
      <div className="big" style={{ color: SUIT_META[mine].glow, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><SuitIcon suit={mine} size={34} />{stake} su {SUIT_META[mine].label}</div>
      {!racing && <button disabled={busy} onClick={unbet} style={ghost}>Annulla puntata</button>}
    </div>}
  </>);
}

/* ════════════════════════════════════════════════ REGIA ═══════════════════ */
export function CorsaSiciliaRegia({ displayCode }: { displayCode: string }) {
  const st = useSicTable(displayCode, 800);
  const t = st?.table;
  const [busy, setBusy] = useState(false);
  const call = async (path: string, body?: object) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setTimeout(() => setBusy(false), 500); } };
  const B = (import.meta.env.BASE_URL as string) || '/';
  if (!t) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a2a6a', color: '#ffe9a6', fontFamily: 'Georgia' }}>Carico…</div>;
  const m = (s: Suit) => SUIT_META[s];
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse 120% 90% at 50% 0%,#1f4a9c,#0a2a6a)', color: '#fff', fontFamily: '"Baskerville Casino",Georgia,serif', padding: 24, boxSizing: 'border-box' }}>
      <style>{FONT}</style>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <img src={`${B}casino/logo-idea-casino.png`} alt="" style={{ height: 56 }} />
          <div style={{ font: '700 32px/1 "Baskerville Casino",serif', color: '#ffe9a6', marginTop: 4 }}>Regia · Corsa Siciliana</div>
          <div style={{ color: '#cfe0f5' }}>{t.name} · <b style={{ color: '#ffe9a6' }}>{t.displayCode}</b> · Giro {t.race}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          {SUITS.map(s => (
            <div key={s} style={{ borderRadius: 12, border: `2px solid ${m(s).glow}66`, background: '#ffffff0e', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <SuitIcon suit={s} size={34} />
              <div style={{ flex: 1 }}><div style={{ font: '700 18px/1 "Baskerville Casino",serif', color: m(s).glow }}>{m(s).label}</div><div style={{ color: '#cfe0f5', fontSize: 13 }}>casella {t.positions[s]} / {t.trackLen} · piatto {t.pot?.[s] ?? 0}</div></div>
              {t.winner === s && <span style={{ color: '#ffe08a', fontWeight: 700 }}>🏁</span>}
            </div>
          ))}
        </div>
        {t.bancoEnabled && (
          <div style={{ borderRadius: 12, border: '2px solid #ffe08a66', background: '#ffffff0e', padding: 12, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 30 }}>🏦</span>
            <div style={{ flex: 1 }}><div style={{ font: '700 18px/1 "Baskerville Casino",serif', color: '#ffe08a' }}>Cavallo del Banco</div><div style={{ color: '#cfe0f5', fontSize: 13 }}>casella {t.bancoPos} / {t.trackLen} · {t.bancoCards} carte Banco nel mazzo</div></div>
            {t.winner === 'banco' && <span style={{ color: '#ffe08a', fontWeight: 700 }}>🏁</span>}
          </div>
        )}
        <div style={{ textAlign: 'center', marginBottom: 10, color: '#cfe0f5' }}>Piatto totale: <b style={{ color: '#ffe9a6' }}>{t.pot?.total ?? 0}</b> fiche · quota ×{t.quota ?? 3}</div>
        {t.winner && <div style={{ textAlign: 'center', marginBottom: 10, font: '700 22px "Baskerville Casino",serif', color: '#ffe08a' }}>🏁 {t.winner === 'banco' ? 'Vince il BANCO — tutte le puntate alla casa' : `Vince ${m(t.winner as Suit).label}`}</div>}
        {t.last && <div style={{ textAlign: 'center', marginBottom: 12, color: '#cfe0f5' }}>Ultima carta: <b style={{ color: '#fff' }}>{t.last.suit === 'banco' ? '🏦 Banco' : `${t.last.value} di ${m(t.last.suit as Suit).label}`}</b> · mazzo {t.deckLeft}</div>}

        <div style={{ display: 'grid', gap: 10 }}>
          {t.phase === 'racing' && !t.winner && (
            <button disabled={busy} onClick={() => call('/gestione/casino/sicilia/draw', { token: `${t.race}:${t.drawn}:${Date.now()}` })}
              style={{ padding: 20, borderRadius: 14, border: '2px solid #f1d98c', background: 'linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34)', color: '#231503', font: '700 28px "Baskerville Casino",serif', cursor: 'pointer', boxShadow: '0 4px 0 #7a4d12' }}>
              🂠 PESCA UNA CARTA
            </button>
          )}
          {t.phase === 'betting' && <button disabled={busy} onClick={() => call('/gestione/casino/sicilia/start')} style={btnG}>▶ Avvia la corsa (Via)</button>}
          {(t.phase === 'result' || t.phase === 'betting') && <button disabled={busy} onClick={() => call('/gestione/casino/sicilia/open')} style={btnGhost}>↻ Nuova corsa (apri puntate)</button>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <label style={{ color: '#cfe0f5' }}>Caselle
              <input type="number" min={3} max={10} defaultValue={t.trackLen} disabled={t.phase === 'racing' || busy} onBlur={e => call('/gestione/casino/sicilia/settings', { trackLen: +e.target.value })}
                style={{ width: 64, marginLeft: 8, padding: 8, borderRadius: 8, border: '1px solid #ffffff33', background: '#0a2a6a', color: '#ffe9a6', textAlign: 'center' }} />
            </label>
            <button disabled={busy} onClick={() => call('/gestione/casino/sicilia/suspend')} style={{ ...btnGhost, width: 'auto', padding: '8px 14px' }}>{t.suspended ? 'Riattiva' : 'Sospendi'}</button>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', background: '#ffffff0e', borderRadius: 12, padding: 10 }}>
            <label style={{ color: '#cfe0f5', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!t.bancoEnabled} disabled={t.phase !== 'betting' || busy} onChange={e => call('/gestione/casino/sicilia/settings', { bancoEnabled: e.target.checked })} />
              🏦 Cavallo del Banco
            </label>
            {t.bancoEnabled && <label style={{ color: '#cfe0f5' }}>Carte Banco
              <input type="number" min={1} max={15} defaultValue={t.bancoCards} disabled={t.phase !== 'betting' || busy} onBlur={e => call('/gestione/casino/sicilia/settings', { bancoCards: +e.target.value })}
                style={{ width: 56, marginLeft: 8, padding: 8, borderRadius: 8, border: '1px solid #ffffff33', background: '#0a2a6a', color: '#ffe9a6', textAlign: 'center' }} />
            </label>}
            <span style={{ color: '#8fa9d6', fontSize: 12 }}>più carte = banco vince più spesso</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', background: '#ffffff0e', borderRadius: 12, padding: 10 }}>
            <QRCodeSVG value={`${ORIGIN}gestione/casino?sicplay=${t.displayCode}`} size={72} />
            <div style={{ color: '#cfe0f5', fontSize: 13 }}>QR ingresso giocatori<br /><b style={{ color: '#ffe9a6', fontSize: 18 }}>{t.displayCode}</b></div>
          </div>
          <a href={`${ORIGIN}gestione/casino?sic=${t.displayCode}&host=1`} target="_blank" rel="noreferrer" style={{ ...btnGhost, textAlign: 'center', textDecoration: 'none', display: 'block' }}>🖥️ Apri il monitor 80″ (host) ↗</a>
        </div>
      </div>
    </div>
  );
}
const btnG: React.CSSProperties = { padding: 16, borderRadius: 12, border: '1px solid #bff0cf', background: 'linear-gradient(180deg,#39d46b,#139a3e 52%,#0c7a33)', color: '#04210e', font: '700 20px "Baskerville Casino",serif', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #f1d98c66', background: '#ffffff12', color: '#ffe9a6', font: '700 16px "Baskerville Casino",serif', cursor: 'pointer', width: '100%' };

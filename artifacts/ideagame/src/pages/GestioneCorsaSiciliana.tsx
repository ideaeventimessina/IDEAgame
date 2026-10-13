/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ════════════════════════════════════════════════════════════════════════════
   CORSA SICILIANA — variante della corsa dei cavalli con carte siciliane. 4 cavalli,
   uno per seme (Coppe/Denari/Spade/Bastoni). Il conduttore pesca una carta: avanza di
   1 casella SOLO il cavallo del seme uscito. Primo al traguardo vince. L'esito deriva
   dalle CARTE estratte (motore server). Tema Sicilia: maiolica blu/oro, limoni, mare.
   Viste: monitor 80" (?sic=CODE, host con &host=1), telefono (?sicplay=), regia (?sicregia=).
   Semi disegnati in SVG (mai carte francesi); dorso maiolica unico.
   ════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const AB = BASE;
const ORIGIN = (typeof window !== 'undefined' ? window.location.origin : '') + BASE;

type Suit = 'coppe' | 'denari' | 'spade' | 'bastoni';
const SUITS: Suit[] = ['coppe', 'denari', 'spade', 'bastoni'];
const SUIT_META: Record<Suit, { label: string; color: string; glow: string }> = {
  coppe:   { label: 'COPPE',   color: '#9f2b2b', glow: '#e05a5a' },
  denari:  { label: 'DENARI',  color: '#c9972f', glow: '#ffe08a' },
  spade:   { label: 'SPADE',   color: '#2f5fa6', glow: '#6ea0ff' },
  bastoni: { label: 'BASTONI', color: '#2e7d3a', glow: '#5ee08a' },
};
type SiciliaCard = { suit: Suit; value: number };
type SicPlayer = { id: string; nickname: string; avatarUrl: string | null; balance: number; suit: Suit | null };
type SicHist = { race: number; at: string; winner: Suit | null; cards: number; players: number; pickedWinner: number };
type SicTbl = {
  id: string; name: string; displayCode: string; type: 'sicilia';
  phase: 'betting' | 'racing' | 'result'; race: number; trackLen: number;
  positions: Record<Suit, number>; last: SiciliaCard | null; winner: Suit | null;
  drawn: number; deckLeft: number; players: SicPlayer[]; suspended: boolean; history: SicHist[];
};
type SicState = { table: SicTbl; sessionId: string };

const FONT = `@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;

function useSicTable(code: string, ms = 800): SicState | null {
  const [st, setSt] = useState<SicState | null>(null);
  useEffect(() => { let on = true; const load = () => fetch(`${API}/gestione/casino/sicilia/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {}); load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); }; }, [code, ms]);
  return st;
}
const api = (path: string, body?: unknown) => fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

/* ── Semi siciliani in SVG (mai carte francesi) ──────────────────────────────── */
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

/* ── Carta siciliana: dorso maiolica + fronte (valore × simbolo del seme) ─────── */
function CardBack({ w = 150 }: { w?: number }) {
  const h = w * 1.52;
  return (
    <div style={{ width: w, height: h, borderRadius: 10, background: 'linear-gradient(145deg,#1f4a9c,#143b86)', border: '3px solid #f1d98c', boxShadow: '0 8px 22px #0007, inset 0 0 0 2px #0a2a6a', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <svg width={w * 0.62} height={w * 0.62} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="30" fill="#f4d77a" stroke="#c9972f" strokeWidth="3" />
        {Array.from({ length: 16 }).map((_, i) => { const a = i * 22.5 * Math.PI / 180; return <line key={i} x1={50 + 30 * Math.cos(a)} y1={50 + 30 * Math.sin(a)} x2={50 + 40 * Math.cos(a)} y2={50 + 40 * Math.sin(a)} stroke="#f4d77a" strokeWidth="3" strokeLinecap="round" />; })}
        <circle cx="42" cy="46" r="3" fill="#143b86" /><circle cx="58" cy="46" r="3" fill="#143b86" /><path d="M40 58 q10 8 20 0" stroke="#143b86" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 6, borderRadius: 7, border: '1.5px solid #f1d98c88', pointerEvents: 'none' }} />
    </div>
  );
}
function CardFace({ card, w = 150 }: { card: SiciliaCard; w?: number }) {
  const h = w * 1.52; const c = SUIT_META[card.suit];
  const n = Math.min(card.value, 7); // disposizione simboli (figure 8/9/10 → mostra 1 grande)
  const figure = card.value >= 8;
  return (
    <div style={{ width: w, height: h, borderRadius: 10, background: 'linear-gradient(160deg,#fff8ea,#f1e4c8)', border: '3px solid #f1d98c', boxShadow: '0 8px 22px #0007', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 8, top: 6, font: `700 ${w * 0.17}px/1 "Baskerville Casino",serif`, color: c.color }}>{card.value}</div>
      <div style={{ position: 'absolute', right: 8, bottom: 6, font: `700 ${w * 0.17}px/1 "Baskerville Casino",serif`, color: c.color, transform: 'rotate(180deg)' }}>{card.value}</div>
      <div style={{ position: 'absolute', inset: `${h * 0.17}px ${w * 0.14}px`, display: 'grid', gridTemplateColumns: figure ? '1fr' : 'repeat(2,1fr)', placeItems: 'center', gap: 2 }}>
        {figure ? <SuitIcon suit={card.suit} size={w * 0.5} /> : Array.from({ length: n }).map((_, i) => <SuitIcon key={i} suit={card.suit} size={w * 0.26} />)}
      </div>
    </div>
  );
}

const SIC_CSS = FONT + `
.sic{position:fixed;inset:0;overflow:hidden;background:#0a2a6a;display:flex;align-items:center;justify-content:center;font-family:"Baskerville Casino",Georgia,serif;}
.sic .st{position:relative;width:1680px;height:945px;flex:none;transform-origin:center center;overflow:hidden;
  background:linear-gradient(180deg,#bfe3f5 0%,#8fc6ea 30%,#2f6fae 62%,#143b86 100%);
  box-shadow:inset 0 0 0 10px #16398a,inset 0 0 0 16px #f1d98c,inset 0 0 0 20px #16398a;}
.sic .maj{position:absolute;inset:20px;border:14px solid transparent;border-image:repeating-linear-gradient(45deg,#1f4a9c 0 14px,#f4d77a 14px 28px) 14;border-radius:8px;pointer-events:none;opacity:.9;}
.sic .lane{position:absolute;height:120px;border-radius:16px;background:linear-gradient(180deg,#fff8ea,#efe3c6);border:3px solid #d9bf7a;box-shadow:inset 0 2px 0 #fff,0 4px 12px #0003;display:flex;align-items:center;}
.sic .cell{flex:1 1 0;height:100%;display:grid;place-items:center;border-left:2px solid #d9bf7a88;font:700 30px/1 "Baskerville Casino",serif;color:#9a865a;position:relative;}
.sic .cell.cur{background:radial-gradient(ellipse at 50% 50%,var(--hl) 0%,transparent 75%);}
.sic .medal{width:92px;height:92px;flex:none;margin:0 10px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff6d8,#e7c976 70%);border:4px solid #c9972f;display:grid;place-items:center;box-shadow:0 3px 8px #0005;}
.sic .lname{width:150px;flex:none;font:700 26px/1 "Baskerville Casino",serif;letter-spacing:.04em;}
.sic .fin{width:26px;flex:none;height:100%;background:repeating-conic-gradient(#111 0 25%,#fff 0 50%) 0 0/22px 22px;border-left:3px solid #c9972f;}
.sic .horse{position:absolute;top:50%;transform:translate(-50%,-50%);transition:left .5s cubic-bezier(.2,.8,.3,1);z-index:3;}
.sic .horseimg{width:120px;height:94px;background:url(${AB}ippo/horse-gallop.png) 0 0/600% 100% no-repeat;filter:drop-shadow(0 4px 6px #0006);}
.sic .title{position:absolute;left:50%;top:14px;transform:translateX(-50%);text-align:center;}
.sic .banner{display:inline-block;padding:10px 60px;border-radius:20px;background:radial-gradient(ellipse at 50% 40%,#1f4a9c,#102c66);border:4px solid #f1d98c;box-shadow:0 6px 18px #0006,inset 0 0 0 2px #0a2a6a;}
.sic .banner h1{margin:0;font:700 62px/1 "Baskerville Casino",serif;letter-spacing:.02em;background:linear-gradient(180deg,#fff6c8,#ffe08a 48%,#e4ad4b);-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap;filter:drop-shadow(0 2px 1px #0008);}
.sic .banner .sub{color:#ffe9a6;font:400 20px/1 "Baskerville Casino",serif;letter-spacing:.02em;margin-top:4px;}
.sic .giro{position:absolute;left:34px;top:26px;width:120px;height:92px;border-radius:14px;background:radial-gradient(ellipse at 50% 30%,#1f4a9c,#102c66);border:3px solid #f1d98c;display:grid;place-items:center;color:#ffe9a6;box-shadow:0 4px 12px #0006;}
.sic .giro b{font:700 46px/0.9 "Baskerville Casino",serif;color:#fff;}
.sic .panel{position:absolute;right:34px;top:196px;width:420px;height:560px;border-radius:18px;background:radial-gradient(ellipse at 50% 0%,#1f4a9c,#0f2c66);border:4px solid #f1d98c;box-shadow:0 8px 24px #0007,inset 0 0 0 2px #0a2a6a;padding:18px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;}
.sic .pesca{width:100%;margin-top:auto;padding:16px;border-radius:14px;border:2px solid #f1d98c;background:linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34);color:#231503;font:700 30px/1 "Baskerville Casino",serif;letter-spacing:.03em;cursor:pointer;box-shadow:0 4px 0 #7a4d12,inset 0 1px 0 #fff8;}
.sic .pesca:disabled{opacity:.55;cursor:default;}
.sic .pesca small{display:block;font:400 15px/1.2 "Baskerville Casino",serif;margin-top:5px;opacity:.85;}
.sic .usc{color:#ffe9a6;text-align:center;margin:14px 0 6px;}
.sic .usc b{font:700 30px/1 "Baskerville Casino",serif;color:#fff;letter-spacing:.06em;}
.sic .strip{position:absolute;left:34px;right:34px;bottom:26px;height:120px;display:flex;gap:12px;}
.sic .chip{flex:1 1 0;border-radius:14px;background:linear-gradient(180deg,#fff8ea,#efe3c6);border:3px solid #d9bf7a;display:flex;align-items:center;gap:10px;padding:0 14px;box-shadow:0 4px 12px #0003;}
.sic .chip .av{width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid #c9972f;background:#16398a;}
.sic .chip .t{font:700 22px/1.1 "Baskerville Casino",serif;}
.sic .chip .s{font:400 14px/1.2 "Baskerville Casino",serif;color:#7a6a44;}
.sic .win{position:absolute;inset:0;display:grid;place-items:center;background:rgba(8,20,54,.72);z-index:20;}
.sic .win .card{padding:40px 80px;border-radius:24px;background:radial-gradient(ellipse at 50% 30%,#1f4a9c,#0f2c66);border:5px solid #f1d98c;text-align:center;box-shadow:0 12px 40px #000a;}
.sic .win h2{margin:0;font:700 64px/1 "Baskerville Casino",serif;background:linear-gradient(180deg,#fff6c8,#ffe08a 50%,#e4ad4b);-webkit-background-clip:text;background-clip:text;color:transparent;}
`;

function laneGeom(trackLen: number) {
  const left = 432, right = 1180 - 26, top = 196, gap = 12, h = 120;
  const cellsW = right - left;
  return { left, right, top, gap, h, cellsW, cellW: cellsW / trackLen };
}

export function CorsaSiciliaMonitor({ displayCode, host = false }: { displayCode: string; host?: boolean }) {
  const st = useSicTable(displayCode, 700);
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const [busy, setBusy] = useState(false);
  const t = st?.table;
  const scale = Math.min(dim.w / 1680, dim.h / 945);

  const draw = useCallback(async () => {
    if (!t || busy || t.phase !== 'racing' || t.winner) return;
    setBusy(true);
    try { await api('/gestione/casino/sicilia/draw', { displayCode, token: `${t.race}:${t.drawn}:${Date.now()}` }); }
    finally { setTimeout(() => setBusy(false), 650); }   // blocca il doppio-click durante l'animazione
  }, [t, busy, displayCode]);

  if (!t) return <div className="sic"><style>{SIC_CSS}</style><div style={{ color: '#ffe9a6', fontSize: 30 }}>Carico il tavolo…</div></div>;
  const g = laneGeom(t.trackLen);
  const playUrl = `${ORIGIN}gestione/casino?sicplay=${t.displayCode}`;
  const canDraw = host && t.phase === 'racing' && !t.winner && !busy;
  const bySuit = (s: Suit) => t.players.filter(p => p.suit === s);

  return (
    <div className="sic"><style>{SIC_CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})` }}>
        <div className="maj" />
        <div className="giro"><span style={{ font: '400 15px/1 "Baskerville Casino",serif', letterSpacing: '.2em' }}>GIRO</span><b>{String(t.race).padStart(2, '0')}</b></div>
        <div className="title">
          <div className="banner">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 2 }}>
              <img src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI" style={{ height: 34, objectFit: 'contain' }} />
            </div>
            <h1>CORSA SICILIANA</h1>
            <div className="sub">Quattro semi, quattro cavalli</div>
          </div>
        </div>

        {/* 4 corsie */}
        {SUITS.map((s, i) => {
          const top = g.top + i * (g.h + 16);
          const pos = t.positions[s];
          const horseLeft = g.left + (pos <= 0 ? -34 : (pos - 0.5) * g.cellW);
          const m = SUIT_META[s];
          return (
            <div key={s}>
              <div className="medal" style={{ position: 'absolute', left: 150, top: top + 14 }}><SuitIcon suit={s} size={54} /></div>
              <div className="lname" style={{ position: 'absolute', left: 150 + 102, top: top + 46, color: m.color }}>{m.label}</div>
              <div className="lane" style={{ left: g.left, width: g.cellsW + 26, top }}>
                {Array.from({ length: t.trackLen }).map((_, c) => (
                  <div key={c} className={`cell${pos === c + 1 ? ' cur' : ''}`} style={{ ['--hl' as string]: `${m.glow}66` }}>{c + 1}</div>
                ))}
                <div className="fin" />
              </div>
              <div className="horse" style={{ left: horseLeft, top: top + g.h / 2 }}>
                <div className="horseimg" style={{ filter: `drop-shadow(0 0 10px ${m.glow}) drop-shadow(0 4px 6px #0006)` }} />
              </div>
            </div>
          );
        })}

        {/* pannello mazzo + carta + pesca */}
        <div className="panel">
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <CardBack w={150} />
            {t.last ? <CardFace card={t.last} w={150} /> : <div style={{ width: 150, height: 228, borderRadius: 10, border: '3px dashed #f1d98c66', display: 'grid', placeItems: 'center', color: '#ffe9a6', font: '400 15px "Baskerville Casino",serif' }}>nessuna<br />carta</div>}
          </div>
          <div className="usc">
            {t.last ? <>È USCITO <b>{SUIT_META[t.last.suit].label}</b><div style={{ font: '400 16px "Baskerville Casino",serif', opacity: .85 }}>Il cavallo {SUIT_META[t.last.suit].label.toLowerCase()} avanza di 1 casella</div></>
              : <div style={{ font: '400 18px "Baskerville Casino",serif' }}>{t.phase === 'betting' ? 'Scegli i cavalli e avvia la corsa' : 'Pesca la prima carta'}</div>}
          </div>
          <button className="pesca" onClick={draw} disabled={!canDraw} title={host ? '' : 'Pescata riservata al conduttore (regia)'}>
            {t.winner ? 'CORSA CONCLUSA' : 'PESCA UNA CARTA'}
            <small>{host ? (t.phase === 'racing' ? 'Tocca per far avanzare' : 'Avvia la corsa dalla regia') : 'Riservato al conduttore'} · mazzo {t.deckLeft}</small>
          </button>
        </div>

        {/* striscia giocatori per seme */}
        <div className="strip">
          {SUITS.map(s => { const list = bySuit(s); const first = list[0]; const m = SUIT_META[s]; return (
            <div className="chip" key={s}>
              {first?.avatarUrl ? <img className="av" src={first.avatarUrl} alt="" /> : <div className="av" style={{ display: 'grid', placeItems: 'center', color: '#ffe9a6', font: '700 26px serif' }}>{first ? first.nickname.slice(0, 1).toUpperCase() : ''}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t" style={{ color: m.color, display: 'flex', alignItems: 'center', gap: 8 }}><SuitIcon suit={s} size={26} />{m.label}</div>
                <div className="s">{list.length ? `${list.length} giocatore${list.length > 1 ? 'i' : ''}${first ? ' · ' + first.nickname : ''}` : 'Scegli il tuo cavallo dal telefono'}</div>
              </div>
            </div>
          ); })}
        </div>

        {/* QR d'ingresso (piccolo, in alto a destra sotto il menu) */}
        <div style={{ position: 'absolute', right: 40, top: 26, background: '#fff', padding: 5, borderRadius: 8, boxShadow: '0 3px 8px #0006' }}>
          <QRCodeSVG value={playUrl} size={64} />
          <div style={{ textAlign: 'center', font: '700 11px/1.2 "Baskerville Casino",serif', color: '#102c66', marginTop: 2 }}>{t.displayCode}</div>
        </div>

        {/* vincitore */}
        {t.phase === 'result' && t.winner && (
          <div className="win"><div className="card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><SuitIcon suit={t.winner} size={90} /></div>
            <h2>VINCE {SUIT_META[t.winner].label}</h2>
            <div style={{ color: '#ffe9a6', font: '400 22px "Baskerville Casino",serif', marginTop: 8 }}>in {t.drawn} carte · {bySuit(t.winner).length} hanno scelto bene</div>
          </div></div>
        )}
      </div>
    </div>
  );
}

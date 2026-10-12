/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Lockdown Idea Eventi — MONITOR CASA (vista display 80") ──────────────────
   Replica pixel-faithful del mockup 07 (pannello "13 MONITOR CASA · ESPLORA LE
   STANZE"). Palco fisso 744×456 scalato con transform:scale(), come gli altri
   monitor del progetto (vedi MonitorBetting in GestioneIppodromo).

   Mockup DIPINTO → separazione pittura/interfaccia:
   · house.png  = villa isometrica notturna ritagliata dal mockup (sfondo).
     Logo "LOCKDOWN by IDEA EVENTI" ed etichette di base sono BAKED nel dipinto;
     le pill delle stanze vengono ri-disegnate in CODICE sopra, mascherando le
     baked, così nomi e stanza attiva sono dati-driven (mock interni).
   · QR "LOCK24"      = vero QR (qrcode.react) dall'URL di accesso.
   · Etichette stanze + bordo oro stanza attiva + fascia giocatori + barra MASTER
     = codice, a coordinate misurate col righello di measure.mjs.
   Nessun backend: DATI MOCK interni. ?casa=CODE imposta solo il codice del QR. */

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const AB = (import.meta.env.BASE_URL as string) || '/';
const ORIGIN = window.location.origin + AB;
const LK = `${AB}lockdown/`;

const FONT =
  `@font-face{font-family:"Baskerville Lockdown";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}` +
  `@font-face{font-family:"Baskerville Lockdown";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;

// ── Stanze: nome, centro della pill (x,y dal righello), stato attivo ───────────
type Room = { name: string; x: number; y: number };
const ROOMS: Room[] = [
  { name: 'Cucina', x: 128, y: 103 },
  { name: '10 Sfumature', x: 278, y: 100 },
  { name: 'Biblioteca', x: 465, y: 105 },
  { name: 'Palestra', x: 597, y: 104 },
  { name: 'Studio', x: 163, y: 206 },
  { name: 'Salone', x: 368, y: 230 },
  { name: 'Cinema', x: 597, y: 206 },
  { name: 'Balcone', x: 155, y: 293 },
  { name: 'Gabinetto', x: 492, y: 293 },
  { name: 'Ufficio', x: 633, y: 292 },
];
const ACTIVE_ROOM = 'Cucina';
// Bordo oro luminoso attorno alla stanza attiva (bbox misurato sul dipinto).
const HILITE: Record<string, { x: number; y: number; w: number; h: number }> = {
  Cucina: { x: 56, y: 34, w: 150, h: 112 },
};

// ── Giocatori (mock): avatar ritagliati dal dipinto + saldo Lock-Euro ──────────
type Player = { name: string; avatar: string; balance: number };
const CX = [31, 95, 156, 223, 289, 356, 424, 493]; // centri avatar dal righello
const PLAYERS: Player[] = [
  { name: 'Giulia', avatar: 'p-giulia.png', balance: 950 },
  { name: 'Marco', avatar: 'p-marco.png', balance: 420 },
  { name: 'Elena', avatar: 'p-elena.png', balance: 680 },
  { name: 'Luca', avatar: 'p-luca.png', balance: 310 },
  { name: 'Sofia', avatar: 'p-sofia.png', balance: 770 },
  { name: 'Davide', avatar: 'p-davide.png', balance: 500 },
  { name: 'Chiara', avatar: 'p-chiara.png', balance: 620 },
  { name: 'Matteo', avatar: 'p-matteo.png', balance: 460 },
];
const MASTER = { current: 600, goal: 1500 };

// Lucchetto oro (icona Lock-Euro) — SVG nitido, scala con la fontSize via em.
function Lock({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.12em', flex: 'none' }}>
      <rect x="4" y="10.5" width="16" height="11" rx="2.4" fill="#e8c879" />
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" stroke="#e8c879" strokeWidth="2.1" fill="none" />
      <circle cx="12" cy="15.4" r="1.7" fill="#2a1d06" />
      <rect x="11.2" y="15.6" width="1.6" height="3.4" rx="0.8" fill="#2a1d06" />
    </svg>
  );
}

const fmt = (n: number) => n.toLocaleString('it-IT');

const CSS = FONT + `
.lkd{position:fixed;inset:0;overflow:hidden;background:#03090d;display:flex;align-items:center;justify-content:center;font-family:"Baskerville Lockdown",Georgia,serif;}
.lkd .st{position:relative;width:744px;height:456px;flex:none;transform-origin:center center;background:#03090d;}
.lkd .bg{position:absolute;left:0;top:0;width:744px;height:360px;object-fit:cover;}
.lkd .a{position:absolute;}
/* pill stanza — maschera la baked e porta nome + stato */
.lkd .pill{transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;
  padding:3px 11px;border-radius:13px;white-space:nowrap;
  background:rgba(9,13,20,.86);box-shadow:0 1px 4px rgba(0,0,0,.6),inset 0 0 0 1px rgba(120,96,52,.35);
  color:#f3ead2;font:400 13px/1 "Baskerville Lockdown",serif;letter-spacing:.01em;}
.lkd .pill.on{color:#ffe7a6;background:rgba(18,13,5,.86);
  box-shadow:0 0 10px rgba(255,200,110,.45),inset 0 0 0 1px rgba(232,200,121,.85);}
/* bordo oro stanza attiva */
.lkd .hl{border:2px solid #ffd766;border-radius:12px;pointer-events:none;
  box-shadow:0 0 14px 2px rgba(255,205,90,.55),inset 0 0 10px rgba(255,205,90,.28);}
/* QR */
.lkd .qr{background:#fff;padding:2px;border-radius:3px;box-shadow:0 0 0 1px rgba(232,200,121,.5);}
/* fascia giocatori */
.lkd .band{left:0;top:360px;width:744px;height:96px;
  background:linear-gradient(180deg,#0a1119 0%,#060b11 100%);
  border-top:1px solid rgba(201,151,47,.55);box-shadow:inset 0 1px 0 rgba(255,220,140,.12);}
.lkd .pl{position:absolute;top:361px;width:60px;transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:6px;}
.lkd .pl img{width:46px;height:46px;border-radius:50%;object-fit:cover;}
.lkd .pl .nm{font:400 11px/1 "Baskerville Lockdown",serif;color:#efe6d2;}
.lkd .pl .cr{display:flex;align-items:center;gap:3px;font:700 13px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
/* divisore e sezione MASTER (posizioni assolute dal righello) */
.lkd .div{left:528px;top:378px;width:1px;height:62px;background:linear-gradient(180deg,rgba(201,151,47,0),rgba(201,151,47,.6),rgba(201,151,47,0));}
.lkd .mttl{left:641px;top:376px;transform:translateX(-50%);font:700 13px/1 "Baskerville Lockdown",serif;letter-spacing:.08em;color:#f2e4ad;padding-left:.08em;}
.lkd .mval{left:625px;top:397px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;font:700 15px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
.lkd .mval .goal{color:#8a7a52;}
.lkd .mbar{left:556px;top:424px;width:168px;height:9px;border-radius:5px;background:#10171f;box-shadow:inset 0 0 0 1px rgba(201,151,47,.4);overflow:hidden;}
.lkd .mbar>i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#c9972f,#ffe08a);}
`;

export default function GestioneLockdown() {
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const r = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const casa = new URLSearchParams(window.location.search).get('casa') || 'LOCK24';
  const scale = Math.min(dim.w / 744, dim.h / 456);
  const joinUrl = `${ORIGIN}gestione/lockdown/join?casa=${encodeURIComponent(casa)}`;
  const pct = Math.max(0, Math.min(1, MASTER.current / MASTER.goal));

  return (
    <div className="lkd"><style>{CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})` }}>
        {/* villa dipinta (logo + base baked) */}
        <img className="bg" src={`${LK}house.png`} alt="Mappa della casa" />

        {/* QR vero in alto a destra */}
        <div className="a qr" style={{ left: 674, top: 1 }}>
          <QRCodeSVG value={joinUrl} size={46} />
        </div>

        {/* bordo oro stanza attiva */}
        {HILITE[ACTIVE_ROOM] && (
          <div className="a hl" style={{ ...HILITE[ACTIVE_ROOM] }} />
        )}

        {/* etichette stanze (mascherano le baked) */}
        {ROOMS.map(r => (
          <div key={r.name} className={`a pill${r.name === ACTIVE_ROOM ? ' on' : ''}`}
            style={{ left: r.x, top: r.y }}>{r.name}</div>
        ))}

        {/* fascia giocatori */}
        <div className="a band" />
        {PLAYERS.map((p, i) => (
          <div className="pl" key={p.name} style={{ left: CX[i] }}>
            <img src={`${LK}${p.avatar}`} alt={p.name} />
            <div className="nm">{p.name}</div>
            <div className="cr" aria-label={`${p.name}: ${fmt(p.balance)} Lock-Euro`}>
              <Lock size={12} />{fmt(p.balance)}
            </div>
          </div>
        ))}

        {/* MASTER */}
        <div className="a div" />
        <div className="a mttl">MASTER</div>
        <div className="a mval" aria-label={`Master: ${fmt(MASTER.current)} di ${fmt(MASTER.goal)} Lock-Euro`}>
          <Lock size={15} />{fmt(MASTER.current)} <span className="goal">/ {fmt(MASTER.goal)}</span>
        </div>
        <div className="a mbar"><i style={{ width: `${pct * 100}%` }} /></div>
      </div>
    </div>
  );
}

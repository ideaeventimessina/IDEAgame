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

// Scala condivisa: palco fisso → riempie lo schermo mantenendo le proporzioni.
function useScale(w = 744, h = 456) {
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const r = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  return Math.min(dim.w / w, dim.h / h);
}

// ── Dispatcher: ?finale=CODE → FINALE, ?sfida=CODE → SFIDA, altrimenti CASA ────
export default function GestioneLockdown() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('finale') !== null) return <MonitorFinale />;
  if (q.get('sfida') !== null) return <MonitorSfida />;
  return <MonitorCasa />;
}

function MonitorCasa() {
  const scale = useScale(744, 456);
  const casa = new URLSearchParams(window.location.search).get('casa') || 'LOCK24';
  const joinUrl = `${ORIGIN}gestione/lockdown/join?casa=${encodeURIComponent(casa)}`;
  const pct = Math.max(0, Math.min(1, MASTER.current / MASTER.goal));

  return (
    <div className="lkd"><style>{CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})` }}>
        {/* villa dipinta (base baked) */}
        <img className="bg" src={`${LK}house.png`} alt="Mappa della casa" />

        {/* fascia scura in alto: nasconde titolo/sottotitolo/QR dipinti (baked) */}
        <div className="a" style={{ left: 0, top: 0, width: 744, height: 50, background: 'linear-gradient(180deg,#0a1322 0%,#0a1322 58%,rgba(10,19,34,0) 100%)' }} />

        {/* logo REALE intero + sottotitolo testo corretto */}
        <img className="a" src={`${LK}logo-lockdown.png`} alt="LOCKDOWN" style={{ left: 282, top: 0, width: 180, height: 50 }} />
        <div className="a" style={{ left: 272, top: 44, width: 200, textAlign: 'center', font: '700 10px/1 "Baskerville Casino",serif', letterSpacing: '.24em', color: '#d8b96a', textShadow: '0 1px 3px #000' }}>by IDEAeventi</div>

        {/* QR vero in alto a destra — riquadro bianco che copre il QR finto baked */}
        <div className="a" style={{ left: 648, top: 4, width: 84, height: 84, background: '#fff', borderRadius: 4, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 1px rgba(232,200,121,.5)' }}>
          <QRCodeSVG value={joinUrl} size={70} />
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

/* ─── MONITOR SFIDA (vista display 80") ───────────────────────────────────────
   Replica pixel-faithful del mockup 07, pannello "14 MONITOR SFIDA · CREATIVITA'
   IN CUCINA". Stesso impianto della vista casa: palco fisso 744×452 scalato.

   Mockup DIPINTO → separazione pittura/interfaccia:
   · kitchen.png = scena cucina notturna + le 3 cornici d'oro dipinte
     (INGREDIENTE, TEMPO, "Scrivi le ricette"), i pomodori, la clessidra, l'icona
     telefono, la miniatura della stanza → tutta PITTURA, ritagliata dal mockup.
   · Logo "LOCKDOWN" reale + "by IDEAeventi" (testo, regola brand).
   · DINAMICI, coperti e ri-disegnati in CODICE sopra la pittura: nome ingrediente
     (POMODORO), timer (00:35), "N/M risposte ricevute" + pallini, etichetta stanza.
   · Fascia giocatori (avatar p-*.png + saldi Lock-Euro) e barra MASTER = codice.
   Nessun backend: DATI MOCK interni. ?sfida=CODE seleziona questa vista. */

const SFIDA = {
  room: 'Cucina',
  ingredient: 'Pomodoro',  // nome dinamico → mostrato in MAIUSCOLO
  timeLeft: 35,            // secondi rimanenti → mm:ss
  got: 5,                  // risposte ricevute
  total: 8,                // giocatori attesi
};
const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
// Centri avatar della fascia SFIDA (dal righello: passo ~66px, leggermente diversi da CASA).
const SFIDA_CX = [36, 100, 166, 234, 300, 366, 431, 497];

const CSS_SFIDA = `
/* base dipinta (scena + cornici), fino al bordo oro della fascia (y360) */
.lkd .s-bg{position:absolute;left:0;top:0;width:744px;height:360px;object-fit:cover;}
/* strip che nasconde il logo dipinto (solo al centro: lascia libera la miniatura a dx) */
.lkd .s-top{left:146px;top:0;width:428px;height:48px;background:linear-gradient(180deg,#07111b 0%,#07111b 68%,rgba(7,17,27,0) 100%);}
/* etichetta stanza (copre la "Cucina" dipinta, dato-driven) */
.lkd .s-room{top:3px;width:60px;height:23px;transform:translateX(-50%);display:grid;place-items:center;
  background:linear-gradient(180deg,#121a25,#0c131c);color:#f3e2ac;
  font:400 14px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;border-radius:3px;}
/* valore ingrediente (copre POMODORO dipinto) */
.lkd .s-ingr{left:260px;top:80px;width:182px;height:42px;display:grid;place-items:center;
  text-transform:uppercase;white-space:nowrap;
  background:radial-gradient(140% 175% at 50% 135%,#241b0f 0%,#120f0b 46%,#0a0b10 72%);
  color:#f6d27a;font:700 29px/1 "Baskerville Lockdown",serif;letter-spacing:.035em;
  text-shadow:0 1px 2px #000,0 0 13px rgba(246,200,110,.35);}
/* timer (copre 00:35 dipinto) — a destra della clessidra */
.lkd .s-timer{left:353px;top:168px;width:114px;height:42px;display:grid;place-items:center;white-space:nowrap;
  background:radial-gradient(155% 185% at 50% 130%,#241b0f 0%,#120f0b 44%,#07090e 70%);
  color:#f6d27a;font:700 44px/1 "Baskerville Lockdown",serif;letter-spacing:.01em;
  text-shadow:0 1px 2px #000,0 0 14px rgba(246,200,110,.35);}
/* blocco risposte (copre "N/M risposte" + pallini dipinti, sulla scena calda) */
.lkd .s-respbg{left:256px;top:306px;width:186px;height:44px;
  background:radial-gradient(135% 150% at 45% 45%,rgba(16,11,8,.99) 0%,rgba(16,11,8,.95) 52%,rgba(16,11,8,0) 100%);}
.lkd .s-resptxt{left:373px;top:310px;transform:translateX(-50%);white-space:nowrap;
  font:400 15px/1 "Baskerville Lockdown",serif;color:#efe3c6;}
.lkd .s-resptxt b{font-weight:700;color:#ffe7a6;}
.lkd .s-dots{left:395px;top:335px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;}
.lkd .s-dots i{display:block;width:26px;height:9px;border-radius:5px;background:#231a0d;box-shadow:inset 0 0 0 1px rgba(201,151,47,.45);}
.lkd .s-dots i.on{background:linear-gradient(90deg,#c9972f,#ffe08a);box-shadow:0 0 6px rgba(255,200,110,.55);}
/* fascia giocatori (bordo oro a y360, come la vista casa) */
.lkd .s-band{left:0;top:360px;width:744px;height:92px;
  background:linear-gradient(180deg,#0a1119 0%,#060b11 100%);
  border-top:1px solid rgba(201,151,47,.58);box-shadow:inset 0 1px 0 rgba(255,220,140,.12);}
.lkd .s-pl{position:absolute;top:361px;width:62px;transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:6px;}
.lkd .s-pl img{width:46px;height:46px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px rgba(201,151,47,.5);}
.lkd .s-pl .nm{font:400 11px/1 "Baskerville Lockdown",serif;color:#efe6d2;}
.lkd .s-pl .cr{display:flex;align-items:center;gap:3px;font:700 13px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
/* divisore + MASTER */
.lkd .s-div{left:522px;top:368px;width:1px;height:72px;background:linear-gradient(180deg,rgba(201,151,47,0),rgba(201,151,47,.6),rgba(201,151,47,0));}
.lkd .s-mttl{left:654px;top:376px;transform:translateX(-50%);font:700 15px/1 "Baskerville Lockdown",serif;letter-spacing:.09em;color:#f2e4ad;}
.lkd .s-mval{left:652px;top:398px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;font:700 16px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
.lkd .s-mval .goal{color:#8a7a52;}
.lkd .s-mbar{left:556px;top:421px;width:166px;height:12px;border-radius:6px;background:#10171f;box-shadow:inset 0 0 0 1px rgba(201,151,47,.4);overflow:hidden;}
.lkd .s-mbar>i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#c9972f,#ffe08a);}
`;

function MonitorSfida() {
  const scale = useScale(744, 452);
  const pct = Math.max(0, Math.min(1, MASTER.current / MASTER.goal));
  const dots = Array.from({ length: SFIDA.total });

  return (
    <div className="lkd"><style>{CSS + CSS_SFIDA}</style>
      <div className="st" style={{ height: 452, transform: `scale(${scale})` }}>
        {/* scena cucina + cornici dipinte (base) */}
        <img className="s-bg" src={`${LK}kitchen.png`} alt="Cucina in gioco" />

        {/* strip + logo reale (aspetto 196×62, non deformato) + sottotitolo brand */}
        <div className="a s-top" />
        <img className="a" src={`${LK}logo-lockdown.png`} alt="LOCKDOWN" style={{ left: 305, top: 0, width: 138, height: 44 }} />
        <div className="a" style={{ left: 274, top: 44, width: 200, textAlign: 'center', font: '700 9px/1 "Baskerville Lockdown",serif', letterSpacing: '.22em', color: '#d8b96a', textShadow: '0 1px 3px #000' }}>by IDEAeventi</div>

        {/* etichetta stanza attiva (copre la "Cucina" dipinta) */}
        <div className="a s-room" style={{ left: 709 }}>{SFIDA.room}</div>

        {/* ingrediente dinamico */}
        <div className="a s-ingr">{SFIDA.ingredient}</div>

        {/* timer dinamico */}
        <div className="a s-timer" aria-label={`Tempo rimanente ${mmss(SFIDA.timeLeft)}`}>{mmss(SFIDA.timeLeft)}</div>

        {/* risposte ricevute + pallini (testo e pallini centrati indipendentemente) */}
        <div className="a s-respbg" />
        <div className="a s-resptxt"><b>{SFIDA.got}/{SFIDA.total}</b> risposte ricevute</div>
        <div className="a s-dots" aria-label={`${SFIDA.got} di ${SFIDA.total} risposte`}>
          {dots.map((_, i) => <i key={i} className={i < SFIDA.got ? 'on' : ''} />)}
        </div>

        {/* fascia giocatori */}
        <div className="a s-band" />
        {PLAYERS.map((p, i) => (
          <div className="s-pl" key={p.name} style={{ left: SFIDA_CX[i] }}>
            <img src={`${LK}${p.avatar}`} alt={p.name} />
            <div className="nm">{p.name}</div>
            <div className="cr" aria-label={`${p.name}: ${fmt(p.balance)} Lock-Euro`}>
              <Lock size={12} />{fmt(p.balance)}
            </div>
          </div>
        ))}

        {/* MASTER */}
        <div className="a s-div" />
        <div className="a s-mttl">MASTER</div>
        <div className="a s-mval" aria-label={`Master: ${fmt(MASTER.current)} di ${fmt(MASTER.goal)} Lock-Euro`}>
          <Lock size={15} />{fmt(MASTER.current)} <span className="goal">/ {fmt(MASTER.goal)}</span>
        </div>
        <div className="a s-mbar"><i style={{ width: `${pct * 100}%` }} /></div>
      </div>
    </div>
  );
}

/* ─── MONITOR FINALE (vista display 80") ──────────────────────────────────────
   Replica pixel-faithful del mockup 07, pannello "16 FINALE · IL VINCITORE".
   Stesso impianto delle viste casa/sfida: palco fisso 744×448 scalato.

   Mockup DIPINTO → separazione pittura/interfaccia:
   · finale.png = scena notturna villa/giardino + podio fotorealistico (basi
     1/2/3 con alloro), cornice rossa della spia, coriandoli dipinti → PITTURA
     ritagliata dal mockup (baked base).
   · Logo "LOCKDOWN" reale + "by IDEAeventi" (testo, regola brand).
   · DINAMICI, coperti da fasce/pannelli OPACHI e ri-disegnati in CODICE sopra la
     pittura (mai testo su testo): "LA VINCITRICE È <nome>", i saldi dei 3 podi,
     "LA SPIA ERA <nome>", "RIEPILOGO MASTER n/m" + barra.
   · Avatar dei 3 vincitori + foto spia = p-*.png (demo), cerchiati, sopra i volti
     dipinti; cornice rossa spia resta dipinta.
   MOTION: coriandoli dorati che cadono · nome vincitore che entra e pulsa · le
     colonne del podio (avatar+saldo) che salgono in sequenza sulle basi · spia
     rivelata con flip/fade · barra MASTER che si riempie. Rispetta reduce-motion.
   Nessun backend: DATI MOCK interni. ?finale=CODE seleziona questa vista. */

type Podium = { name: string; avatar: string; balance: number };
const FINALE: {
  winner: Podium; second: Podium; third: Podium;
  spy: { name: string; avatar: string };
  master: { current: number; goal: number };
} = {
  winner: { name: 'Giulia', avatar: 'p-giulia.png', balance: 1200 },
  second: { name: 'Davide', avatar: 'p-davide.png', balance: 950 },
  third:  { name: 'Elena',  avatar: 'p-elena.png',  balance: 770 },
  spy:    { name: 'Marco',  avatar: 'p-marco.png' },
  master: { current: 950, goal: 1500 },
};

// Coriandoli dorati: generati una volta, cadono in loop con delay/durata varie.
type Confetto = { left: number; delay: number; dur: number; w: number; h: number; rot: number; hue: string; sway: number };
function makeConfetti(n: number): Confetto[] {
  const golds = ['#ffe08a', '#e8c879', '#c9972f', '#f6d27a', '#fff2cf'];
  const out: Confetto[] = [];
  for (let i = 0; i < n; i++) {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    out.push({
      left: r(2, 98), delay: r(0, 5.5), dur: r(4.5, 8.5),
      w: r(4, 8), h: r(7, 14), rot: r(0, 360),
      hue: golds[i % golds.length], sway: r(-26, 26),
    });
  }
  return out;
}

const CSS_FINALE = `
.lkd .f-bg{position:absolute;left:0;top:0;width:744px;height:448px;object-fit:cover;}
/* velo scuro ai bordi per far risaltare testi e podio */
.lkd .f-vig{left:0;top:0;width:744px;height:448px;pointer-events:none;
  background:radial-gradient(120% 90% at 42% 44%,rgba(2,6,11,0) 40%,rgba(2,6,11,.55) 100%);}
/* coriandoli */
.lkd .f-conf{left:0;top:0;width:744px;height:448px;overflow:hidden;pointer-events:none;}
.lkd .f-conf i{position:absolute;top:-16px;border-radius:1px;opacity:.9;
  animation:fFall linear infinite;will-change:transform;}
@keyframes fFall{
  0%{transform:translate(0,-20px) rotate(0deg);opacity:0;}
  8%{opacity:.95;}
  100%{transform:translate(var(--sway),470px) rotate(540deg);opacity:.9;}
}
/* logo reale + sottotitolo brand */
/* fascia superiore opaca: nasconde logo+sottotitolo dipinti, sfuma sul cielo */
/* fascia superiore OPACA larga: copre logo + "LA VINCITRICE È GIULIA" dipinti */
.lkd .f-top{left:80px;top:0;width:548px;height:120px;pointer-events:none;
  background:linear-gradient(180deg,#06101f 0%,#06101f 92%,rgba(6,16,31,0) 100%);}
.lkd .f-logo{left:316px;top:3px;width:120px;height:38px;}
.lkd .f-by{left:276px;top:40px;width:200px;text-align:center;
  font:700 9px/1 "Baskerville Lockdown",serif;letter-spacing:.24em;color:#d8b96a;text-shadow:0 1px 3px #000;}
/* titolo vincitrice: impilato SOTTO il logo, centrato, su fascia opaca (niente sovrapposizioni) */
.lkd .f-win{left:352px;top:52px;width:430px;transform:translateX(-50%);text-align:center;
  transform-origin:50% 60%;animation:fWinIn .75s cubic-bezier(.2,.8,.25,1) both;}
.lkd .f-sub{display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;
  font:400 13px/1 "Baskerville Lockdown",serif;letter-spacing:.14em;color:#e9dcb6;text-shadow:0 1px 3px #000;}
.lkd .f-sub::before,.lkd .f-sub::after{content:"";width:22px;height:1px;background:linear-gradient(90deg,rgba(201,151,47,0),#c9972f);}
.lkd .f-sub::after{background:linear-gradient(90deg,#c9972f,rgba(201,151,47,0));}
.lkd .f-name{margin-top:3px;font:700 42px/1 "Baskerville Lockdown",serif;letter-spacing:.03em;
  color:#ffe29a;background:linear-gradient(180deg,#fff3cf 0%,#ffdf93 46%,#d79b2e 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.65)) drop-shadow(0 0 14px rgba(255,200,110,.4));
  animation:fPulse 2.6s ease-in-out 1s infinite;}
@keyframes fWinIn{0%{opacity:0;transform:translate(-50%,16px) scale(.9);}100%{opacity:1;transform:translate(-50%,0) scale(1);}}
@keyframes fPulse{0%,100%{filter:drop-shadow(0 2px 3px rgba(0,0,0,.65)) drop-shadow(0 0 12px rgba(255,200,110,.35));}
  50%{filter:drop-shadow(0 2px 3px rgba(0,0,0,.65)) drop-shadow(0 0 22px rgba(255,210,130,.7));}}
/* colonne podio (avatar + saldo) — salgono sulle basi dipinte, in sequenza */
.lkd .f-col{position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;
  animation:fRise .7s cubic-bezier(.2,.8,.25,1) both;will-change:transform,opacity;}
@keyframes fRise{0%{opacity:0;transform:translate(-50%,56px);}100%{opacity:1;transform:translate(-50%,0);}}
.lkd .f-av{border-radius:50%;object-fit:cover;background:#0a0f16;}
.lkd .f-av.g1{width:132px;height:132px;border:4px solid #f3c969;box-shadow:0 0 22px rgba(255,205,105,.6),0 6px 16px rgba(0,0,0,.6);}
.lkd .f-av.g2{width:102px;height:102px;border:3px solid #cdd3da;box-shadow:0 0 14px rgba(205,213,222,.45),0 5px 14px rgba(0,0,0,.6);}
.lkd .f-av.g3{width:86px;height:86px;border:3px solid #c08a4e;box-shadow:0 0 12px rgba(192,138,78,.45),0 5px 12px rgba(0,0,0,.6);}
/* pillola saldo (copre il badge dipinto) */
.lkd .f-bal{display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;border-radius:9px;position:relative;z-index:2;
  background:linear-gradient(180deg,#14100a,#0a0806);box-shadow:0 2px 7px rgba(0,0,0,.6),inset 0 0 0 1.5px rgba(232,200,121,.7);
  color:#ffe7a6;font-weight:700;font-family:"Baskerville Lockdown",serif;}
.lkd .f-bal.g1{margin-top:-2px;padding:9px 16px;font-size:24px;}
.lkd .f-bal.g2{margin-top:0;padding:8px 13px;font-size:19px;}
.lkd .f-bal.g3{margin-top:0;padding:8px 11px;font-size:17px;}
/* pannello spia (dx alto) — fasce opache sopra i testi dipinti */
.lkd .f-spy{left:652px;top:92px;width:180px;transform:translateX(-50%);text-align:center;
  animation:fFlip .7s ease-out 1.5s both;transform-origin:50% 50%;will-change:transform,opacity;}
@keyframes fFlip{0%{opacity:0;transform:translateX(-50%) perspective(600px) rotateY(82deg);}
  60%{opacity:1;}100%{opacity:1;transform:translateX(-50%) perspective(600px) rotateY(0deg);}}
.lkd .f-spy .cover{position:absolute;left:-6px;background:linear-gradient(180deg,#0c1422,#0a1119);border-radius:4px;}
.lkd .f-spy .h1{font:400 11px/1 "Baskerville Lockdown",serif;letter-spacing:.14em;color:#d9cba6;}
.lkd .f-spy .h2{margin-top:7px;font:700 15px/1 "Baskerville Lockdown",serif;letter-spacing:.08em;color:#f2d9d0;
  text-shadow:0 0 9px rgba(220,70,60,.5);}
.lkd .f-spyph{left:652px;top:190px;width:84px;height:84px;transform:translate(-50%,-50%);border-radius:50%;
  object-fit:cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4);}
.lkd .f-spynm{left:652px;top:269px;width:170px;transform:translateX(-50%);text-align:center;white-space:nowrap;z-index:2;
  font:700 25px/1 "Baskerville Lockdown",serif;color:#ffe7a6;text-shadow:0 2px 3px #000,0 0 12px rgba(255,200,110,.35);}
.lkd .f-spynm-bg{left:566px;top:240px;width:172px;height:46px;border-radius:5px;
  background:linear-gradient(180deg,#0b1220,#0a1018);}
/* pannello MASTER (dx basso) — copre tutto il pannello master dipinto */
.lkd .f-mbg{left:566px;top:298px;width:172px;height:102px;border-radius:7px;
  background:linear-gradient(180deg,#0c1422,#0a1119);box-shadow:inset 0 0 0 1px rgba(201,151,47,.45),0 4px 12px rgba(0,0,0,.5);}
.lkd .f-mttl{left:652px;top:311px;width:180px;transform:translateX(-50%);text-align:center;white-space:nowrap;
  font:700 12px/1 "Baskerville Lockdown",serif;letter-spacing:.08em;color:#f2e4ad;}
.lkd .f-mval{left:652px;top:333px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;
  font:700 16px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
.lkd .f-mval .goal{color:#8a7a52;}
.lkd .f-mbar{left:576px;top:370px;width:152px;height:11px;border-radius:6px;background:#10171f;
  box-shadow:inset 0 0 0 1px rgba(201,151,47,.4);overflow:hidden;}
.lkd .f-mbar>i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#c9972f,#ffe08a);
  width:var(--w);animation:fBar 1.2s cubic-bezier(.2,.8,.25,1) .9s both;}
@keyframes fBar{0%{width:0;}100%{width:var(--w);}}
@media (prefers-reduced-motion: reduce){
  .lkd .f-conf i{animation:none;opacity:0;}
  .lkd .f-win,.lkd .f-name,.lkd .f-col,.lkd .f-spy,.lkd .f-mbar>i{animation:none!important;opacity:1!important;transform:translateX(-50%)!important;}
  .lkd .f-win,.lkd .f-name{transform:translateX(-50%)!important;}
  .lkd .f-mbar>i{width:var(--w)!important;transform:none!important;}
}
`;

function MonitorFinale() {
  const scale = useScale(744, 448);
  const pct = Math.max(0, Math.min(1, FINALE.master.current / FINALE.master.goal));
  const confetti = useState(() => makeConfetti(26))[0];
  const { winner, second, third, spy, master } = FINALE;

  return (
    <div className="lkd"><style>{CSS + CSS_FINALE}</style>
      <div className="st" style={{ height: 448, transform: `scale(${scale})` }}>
        {/* scena dipinta (base baked) */}
        <img className="f-bg" src={`${LK}finale.png`} alt="Finale: la vincitrice sul podio" />
        <div className="a f-vig" />

        {/* coriandoli dorati animati */}
        <div className="a f-conf" aria-hidden>
          {confetti.map((c, i) => (
            <i key={i} style={{
              left: `${c.left}%`, width: c.w, height: c.h, background: c.hue,
              ['--sway' as string]: `${c.sway}px`, transform: `rotate(${c.rot}deg)`,
              animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`,
            }} />
          ))}
        </div>

        {/* fascia superiore opaca (copre logo + titolo dipinti) */}
        <div className="a f-top" />

        {/* logo reale + sottotitolo brand (copre il logo dipinto, resta sopra) */}
        <img className="a f-logo" src={`${LK}logo-lockdown.png`} alt="LOCKDOWN" />
        <div className="a f-by">by IDEAeventi</div>
        <div className="a f-win">
          <div className="f-sub">LA VINCITRICE È</div>
          <div className="f-name">{winner.name.toUpperCase()}</div>
        </div>

        {/* PODIO — 3 colonne (avatar + saldo) che salgono in sequenza sulle basi */}
        <div className="f-col" style={{ left: 129, top: 160, animationDelay: '.35s' }}>
          <img className="f-av g2" src={`${LK}${second.avatar}`} alt={second.name} />
          <div className="f-bal g2" aria-label={`${second.name}: ${fmt(second.balance)} Lock-Euro`}>
            <Lock size={17} />{fmt(second.balance)}
          </div>
        </div>
        <div className="f-col" style={{ left: 484, top: 190, animationDelay: '.6s' }}>
          <img className="f-av g3" src={`${LK}${third.avatar}`} alt={third.name} />
          <div className="f-bal g3" aria-label={`${third.name}: ${fmt(third.balance)} Lock-Euro`}>
            <Lock size={15} />{fmt(third.balance)}
          </div>
        </div>
        <div className="f-col" style={{ left: 315, top: 124, animationDelay: '.9s' }}>
          <img className="f-av g1" src={`${LK}${winner.avatar}`} alt={winner.name} />
          <div className="f-bal g1" aria-label={`${winner.name}: ${fmt(winner.balance)} Lock-Euro`}>
            <Lock size={22} />{fmt(winner.balance)}
          </div>
        </div>

        {/* PANNELLO SPIA — foto demo nella cornice rossa dipinta + nome dinamico */}
        <img className="a f-spyph" src={`${LK}${spy.avatar}`} alt={spy.name} />
        <div className="a f-spy">
          <div className="cover" style={{ top: -4, width: 192, height: 44 }} />
          <div className="h1" style={{ position: 'relative' }}>E INFINE…</div>
          <div className="h2" style={{ position: 'relative' }}>LA SPIA ERA</div>
        </div>
        <div className="a f-spynm-bg" />
        <div className="a f-spynm">{spy.name}</div>

        {/* PANNELLO MASTER — riepilogo + barra che si riempie */}
        <div className="a f-mbg" />
        <div className="a f-mttl">RIEPILOGO MASTER</div>
        <div className="a f-mval" aria-label={`Master: ${fmt(master.current)} di ${fmt(master.goal)} Lock-Euro`}>
          <Lock size={16} />{fmt(master.current)} <span className="goal">/ {fmt(master.goal)}</span>
        </div>
        <div className="a f-mbar"><i style={{ ['--w' as string]: `${pct * 100}%` }} /></div>
      </div>
    </div>
  );
}

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

// ── Dispatcher: ?finale → FINALE, ?sfida → SFIDA, ?regia → REGIA, else CASA ─────
export default function GestioneLockdown() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('finale') !== null) return <MonitorFinale />;
  if (q.get('sfida') !== null) return <MonitorSfida />;
  if (q.get('regia') !== null) return <RegiaMaster />;
  if (q.get('contenuti') !== null) return <AdminContenuti />;
  if (q.get('penalita') !== null) return <AdminPenalita />;
  if (q.get('registro') !== null) return <AdminRegistro />;
  if (q.get('crea') !== null) return <AdminCrea />;
  return <MonitorCasa />;
}

// Catalogo reale delle 10 stanze (ordine del catalogo server), condiviso dalle viste admin.
const ROOM_CATALOG = [
  'Cucina', '10 Sfumature', 'Biblioteca', 'Palestra', 'Studio',
  'Salone', 'Cinema', 'Balcone', 'Gabinetto', 'Ufficio',
];

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

/* ─── REGIA MASTER (console host, tablet/desktop) ──────────────────────────────
   Replica del mockup 07, pannello "15 REGIA MASTER · GESTISCI LA PARTITA".
   Palco fisso 768×512 scalato (come casa/sfida/finale).

   Mockup DIPINTO → separazione pittura/interfaccia:
   · room-thumb-cucina.png = miniatura stanza attiva ritagliata dal dipinto.
   · Logo "LOCKDOWN" reale + "by IDEAeventi" (regola brand).
   · Tutto il resto (tab, tabella, timeline, pulsanti, barra MASTER) = CODICE a
     coordinate misurate col righello di measure.mjs.
   CORREZIONI dal pacchetto (03-SCHERMATE): la tabella Cucina del mockup riporta
   somme esemplificative incoerenti. Qui ESITO/VARIAZIONE sono CALCOLATE dalla
   regola Cucina (Premio 40×ricette valide se ≥4, altrimenti Penalità 80), non
   copiate dalle righe dipinte. Vedi DEVIATIONS.md. La console NON conosce la spia.
   Nessun backend: DATI MOCK interni. ?regia seleziona questa vista. */

// Riga tabella: nome + n. ricette valide; esito/variazione calcolati dalla regola.
type RegiaRow = { name: string; valid: number };
const REGIA_ROWS: RegiaRow[] = [
  { name: 'Giulia', valid: 5 },
  { name: 'Marco', valid: 3 },
  { name: 'Elena', valid: 4 },
  { name: 'Luca', valid: 2 },
  { name: 'Sofia', valid: 4 },
  { name: 'Davide', valid: 3 },
  { name: 'Chiara', valid: 1 },
  { name: 'Matteo', valid: 3 },
];
// Regola Cucina (02-REGOLE-E-STANZE): 40 Lock-Euro per ricetta valida; <4 ricette → penalità 80.
function cucinaOutcome(valid: number): { label: string; delta: number; kind: 'premio' | 'penalita' } {
  if (valid >= 4) return { label: 'Premio', delta: 40 * valid, kind: 'premio' };
  return { label: 'Penalità', delta: -80, kind: 'penalita' };
}
// Timeline "ANDAMENTO PARTITA": i 10 nomi reali del catalogo, nell'ordine del mockup.
const ANDAMENTO = [
  '10 Sfumature', 'Biblioteca', 'Palestra', 'Studio',
  'Cinema', 'Balcone', 'Gabinetto', 'Ufficio', 'Salone',
];
const TABS: { id: string; label: string }[] = [
  { id: 'giocatori', label: 'Giocatori' },
  { id: 'stanze', label: 'Stanze' },
  { id: 'contenuti', label: 'Contenuti' },
  { id: 'registro', label: 'Registro' },
];

// ── Icone (SVG nitidi, currentColor) ──────────────────────────────────────────
const IPeople = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><circle cx="9" cy="8" r="3.1" fill="currentColor"/><circle cx="16.5" cy="9" r="2.4" fill="currentColor" opacity=".8"/><path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" stroke="currentColor" strokeWidth="1.8" fill="none"/><path d="M15 14.3c2.6.1 5 1.7 5 4.7" stroke="currentColor" strokeWidth="1.6" fill="none" opacity=".8"/></svg>);
const IHome = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M4 11l8-6.5L20 11" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M6 10.5V19h12v-8.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round"/></svg>);
const IDoc = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M7 3.5h7l4 4V20.5H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M13.5 3.8V8h4.2M9.5 12h7M9.5 15h7" stroke="currentColor" strokeWidth="1.6"/></svg>);
const IList = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><rect x="4" y="5" width="4" height="4" rx="1" fill="currentColor"/><rect x="4" y="14" width="4" height="4" rx="1" fill="currentColor"/><path d="M11 7h9M11 16h9" stroke="currentColor" strokeWidth="1.8"/></svg>);
const ICheck = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const INext = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M4 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor"/></svg>);
const IBolt = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>);
const IMinus = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2"/><path d="M7.5 12h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>);
const IPause = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/></svg>);
const IClipboard = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><rect x="5" y="4.5" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="9" y="2.6" width="6" height="3.4" rx="1.1" fill="currentColor"/><path d="M8.5 12l2.3 2.3L15.5 9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>);

const TAB_ICON: Record<string, typeof IPeople> = {
  giocatori: IPeople, stanze: IHome, contenuti: IDoc, registro: IList,
};

const CSS_REGIA = `
.lkd .rg{position:relative;width:768px;height:512px;flex:none;background:#010b14;transform-origin:center center;
  color:#eadfc4;font-family:"Baskerville Lockdown",Georgia,serif;}
.lkd .rg .a{position:absolute;}
/* header */
.rg .r-ttl{left:20px;top:16px;font:700 23px/1 "Baskerville Lockdown",serif;letter-spacing:.015em;color:#f3ead2;}
.rg .r-sub{left:21px;top:48px;font:400 12px/1 "Baskerville Lockdown",serif;letter-spacing:.17em;color:#8a7a52;}
.rg .r-by{left:284px;top:62px;width:200px;text-align:center;font:700 9px/1 "Baskerville Lockdown",serif;letter-spacing:.24em;color:#d8b96a;}
/* tabs */
.rg .r-tabs{left:16px;top:86px;width:589px;height:42px;display:flex;gap:8px;}
.rg .r-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:9px;
  background:linear-gradient(180deg,#0b1420,#081019);box-shadow:inset 0 0 0 1px rgba(90,110,130,.32);
  color:#c6d2dc;font:400 15px/1 "Baskerville Lockdown",serif;}
.rg .r-tab svg{font-size:19px;color:#9fb0bd;}
.rg .r-tab.on{color:#ffe7a6;background:linear-gradient(180deg,#171206,#0f0c05);
  box-shadow:0 0 12px rgba(255,200,110,.28),inset 0 0 0 1.5px rgba(232,200,121,.85);}
.rg .r-tab.on svg{color:#e8c879;}
/* MASTER box (destra, in alto) */
.rg .r-right{left:600px;top:82px;width:150px;height:388px;border-radius:11px;
  background:linear-gradient(180deg,#0a1420,#070f18);box-shadow:inset 0 0 0 1px rgba(201,151,47,.28);}
.rg .r-mttl{left:675px;top:90px;transform:translateX(-50%);font:700 12px/1 "Baskerville Lockdown",serif;letter-spacing:.1em;color:#f2e4ad;}
.rg .r-mval{left:675px;top:106px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;
  font:700 17px/1 "Baskerville Lockdown",serif;color:#ffe7a6;}
.rg .r-mval .goal{color:#8a7a52;}
.rg .r-mbar{left:614px;top:131px;width:122px;height:9px;border-radius:5px;background:#10171f;
  box-shadow:inset 0 0 0 1px rgba(201,151,47,.4);overflow:hidden;}
.rg .r-mbar>i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#c9972f,#ffe08a);}
.rg .r-rdiv{left:614px;top:153px;width:122px;height:1px;background:linear-gradient(90deg,rgba(201,151,47,0),rgba(201,151,47,.5),rgba(201,151,47,0));}
/* ANDAMENTO PARTITA */
.rg .r-andt{left:613px;top:173px;white-space:nowrap;font:700 10px/1 "Baskerville Lockdown",serif;letter-spacing:.04em;color:#c9b887;}
.rg .r-tl{left:614px;top:200px;width:132px;}
.rg .r-step{position:relative;display:flex;align-items:flex-start;gap:11px;height:26.5px;}
.rg .r-step.first{height:30px;}
.rg .r-step .dot{flex:none;width:13px;height:13px;border-radius:50%;margin-top:1px;z-index:1;
  background:#0a131d;box-shadow:inset 0 0 0 2px rgba(130,120,92,.75);}
.rg .r-step.on .dot{background:radial-gradient(circle,#ffe08a 0%,#e8c879 55%,#c9972f 100%);box-shadow:0 0 8px rgba(255,200,110,.7);}
.rg .r-step::before{content:"";position:absolute;left:6px;top:13px;width:1.5px;height:30px;background:rgba(120,108,78,.5);}
.rg .r-step:last-child::before{display:none;}
.rg .r-step .lbl{font:400 13px/1.15 "Baskerville Lockdown",serif;color:#b9c4cd;}
.rg .r-step.on .lbl{color:#ffe29a;}
.rg .r-step.on .lbl b{display:block;font-weight:700;}
.rg .r-step.on .lbl span{font-size:12px;color:#d8c48a;}
/* colonna sinistra: miniatura + stato */
.rg .r-left{left:6px;top:142px;width:140px;text-align:center;}
.rg .r-thumb{width:118px;height:55px;border-radius:7px;object-fit:cover;display:block;margin:0 auto;
  box-shadow:0 2px 7px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(201,151,47,.6);}
.rg .r-lcap{margin-top:15px;font:400 11px/1 "Baskerville Lockdown",serif;letter-spacing:.11em;color:#8a7a52;}
.rg .r-lval{margin-top:6px;font:700 22px/1 "Baskerville Lockdown",serif;letter-spacing:-.005em;color:#f6d27a;}
.rg .r-licon{margin-top:22px;color:#e8c879;font-size:30px;line-height:0;}
/* tabella RISPOSTE */
.rg .r-tbl{left:148px;top:140px;width:430px;height:248px;border-radius:9px;overflow:hidden;
  background:#060d16;box-shadow:inset 0 0 0 1px rgba(90,110,130,.28);}
.rg .r-tcap{position:absolute;left:11px;top:13px;font:700 13px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;color:#f1ead6;}
.rg .r-thead{position:absolute;left:0;top:38px;width:430px;height:28px;background:#131d28;display:flex;align-items:center;
  font:700 9px/1 "Baskerville Lockdown",serif;letter-spacing:.07em;color:#8fa0ad;box-shadow:inset 0 -1px 0 rgba(90,110,130,.3);}
.rg .r-row{position:absolute;left:0;width:430px;height:22.6px;display:flex;align-items:center;font:400 13px/1 "Baskerville Lockdown",serif;}
.rg .r-row.alt{background:rgba(255,255,255,.022);}
.rg .c1{width:108px;padding-left:18px;color:#e9e3d2;text-align:left;}
.rg .c2{width:125px;text-align:center;color:#e9e3d2;}
.rg .c3{width:105px;text-align:center;}
.rg .c4{width:92px;text-align:center;font-weight:700;}
.rg .r-thead .c1{color:#8fa0ad;}
.rg .premio{color:#55c07e;}
.rg .penalita{color:#e85c52;}
/* pulsanti azione */
.rg .r-acts{left:16px;top:400px;width:567px;height:84px;display:flex;gap:10px;}
.rg .r-btn{flex:1;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
  font:700 13px/1.12 "Baskerville Lockdown",serif;text-align:center;letter-spacing:.01em;}
.rg .r-btn svg{font-size:23px;margin-bottom:1px;}
.rg .r-btn.green{background:linear-gradient(180deg,#1b5a3a,#123f29);color:#e8f6ec;box-shadow:inset 0 0 0 1.5px rgba(70,190,120,.6),0 3px 8px rgba(0,0,0,.4);}
.rg .r-btn.green svg{color:#7ee6a6;}
.rg .r-btn.blue{background:linear-gradient(180deg,#123a58,#0c2a42);color:#e4f0f8;box-shadow:inset 0 0 0 1.5px rgba(70,150,210,.55),0 3px 8px rgba(0,0,0,.4);}
.rg .r-btn.blue svg{color:#6fb6e6;}
.rg .r-btn.gold{background:linear-gradient(180deg,#4a3410,#2c2008);color:#f4dfa0;box-shadow:inset 0 0 0 1.5px rgba(200,160,70,.6),0 3px 8px rgba(0,0,0,.4);}
.rg .r-btn.gold svg{color:#ffd86a;}
.rg .r-btn.red{background:linear-gradient(180deg,#6a2224,#481618);color:#f7e2e2;box-shadow:inset 0 0 0 1.5px rgba(200,80,80,.6),0 3px 8px rgba(0,0,0,.4);}
.rg .r-btn.red svg{color:#ff8a82;}
.rg .r-btn.slate{background:linear-gradient(180deg,#1b2735,#121c28);color:#e2eaf1;box-shadow:inset 0 0 0 1.5px rgba(90,110,130,.5),0 3px 8px rgba(0,0,0,.4);}
.rg .r-btn.slate svg{color:#b9c6d2;}
`;

function RegiaMaster() {
  const scale = useScale(768, 512);
  const pct = Math.max(0, Math.min(1, MASTER.current / MASTER.goal));
  const [tab, setTab] = useState('giocatori');

  return (
    <div className="lkd"><style>{CSS + CSS_REGIA}</style>
      <div className="rg" style={{ transform: `scale(${scale})` }}>
        {/* header */}
        <div className="a r-ttl">REGIA MASTER</div>
        <div className="a r-sub">GESTISCI LA PARTITA</div>
        <img className="a" src={`${LK}logo-lockdown-t.png`} alt="LOCKDOWN" style={{ left: 294, top: 16, width: 180, height: 46 }} />
        <div className="a r-by">by IDEAeventi</div>

        {/* tabs */}
        <div className="a r-tabs" role="tablist">
          {TABS.map(t => {
            const Ic = TAB_ICON[t.id];
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id}
                className={`r-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
                <Ic /> {t.label}
              </button>
            );
          })}
        </div>

        {/* colonna destra: MASTER + ANDAMENTO PARTITA */}
        <div className="a r-right" />
        <div className="a r-mttl">MASTER</div>
        <div className="a r-mval" aria-label={`Master: ${fmt(MASTER.current)} di ${fmt(MASTER.goal)} Lock-Euro`}>
          <Lock size={16} />{fmt(MASTER.current)} <span className="goal">/ {fmt(MASTER.goal)}</span>
        </div>
        <div className="a r-mbar"><i style={{ width: `${pct * 100}%` }} /></div>
        <div className="a r-rdiv" />
        <div className="a r-andt">ANDAMENTO PARTITA</div>
        <div className="a r-tl">
          <div className="r-step first on">
            <span className="dot" />
            <span className="lbl"><b>Cucina</b><span>Valutazione</span></span>
          </div>
          {ANDAMENTO.map(r => (
            <div className="r-step" key={r}>
              <span className="dot" />
              <span className="lbl">{r}</span>
            </div>
          ))}
        </div>

        {/* colonna sinistra: miniatura stanza attiva + stato */}
        <div className="a r-left">
          <img className="r-thumb" src={`${LK}room-thumb-cucina.png`} alt="Stanza attuale: Cucina" />
          <div className="r-lcap">STANZA ATTUALE</div>
          <div className="r-lval">Cucina</div>
          <div className="r-licon"><IClipboard /></div>
          <div className="r-lcap" style={{ marginTop: 10 }}>FASE ATTUALE</div>
          <div className="r-lval">Valutazione</div>
        </div>

        {/* tabella RISPOSTE DEI GIOCATORI */}
        <div className="a r-tbl">
          <div className="r-tcap">RISPOSTE DEI GIOCATORI</div>
          <div className="r-thead">
            <div className="c1">GIOCATORE</div><div className="c2">N. RICETTE VALIDE</div>
            <div className="c3">ESITO</div><div className="c4">VARIAZIONE</div>
          </div>
          {REGIA_ROWS.map((r, i) => {
            const o = cucinaOutcome(r.valid);
            return (
              <div className={`r-row${i % 2 ? ' alt' : ''}`} key={r.name} style={{ top: 66 + i * 22.6 }}>
                <div className="c1">{r.name}</div>
                <div className="c2">{r.valid}</div>
                <div className={`c3 ${o.kind}`}>{o.label}</div>
                <div className={`c4 ${o.kind}`}>{o.delta > 0 ? o.delta : Math.abs(o.delta)}</div>
              </div>
            );
          })}
        </div>

        {/* pulsanti azione */}
        <div className="a r-acts">
          <button className="r-btn green"><ICheck />Conferma<br />valutazione</button>
          <button className="r-btn blue"><INext />Prossima<br />stanza</button>
          <button className="r-btn gold"><IBolt />Colpo di scena</button>
          <button className="r-btn red"><IMinus />Penalità</button>
          <button className="r-btn slate"><IPause />Pausa</button>
        </div>
      </div>
    </div>
  );
}

/* ─── ADMIN · CONTENUTI (console host, tablet/desktop) ─────────────────────────
   Replica del mockup 08, pannello "21 CONTENUTI · PANNELLO AMMINISTRATORE".
   Palco fisso 512×512 scalato. Editor versionato delle stanze (bozza/approvato).

   CORREZIONI dal pacchetto (03-SCHERMATE): l'editor del mockup inventa nomi di
   stanze (Atrio, Giardino, Cantina, Mansarda…). Qui la lista usa i DIECI nomi
   reali del catalogo (ROOM_CATALOG). Cinema = 20 parole, 300s (corretto nel
   mockup). Badge "21" di catalogo omesso. Nessun backend: DATI MOCK. ?contenuti. */

const CSS_ADMIN = `
.lkd .ad{position:relative;width:512px;height:512px;flex:none;background:#020407;transform-origin:center center;
  color:#dfe6ee;font-family:"Baskerville Lockdown",Georgia,serif;overflow:hidden;}
.lkd .ad .a{position:absolute;}
/* bagliore proiettore (eco del dipinto, top-destra) */
.ad .ad-glow{left:300px;top:-60px;width:320px;height:260px;pointer-events:none;
  background:radial-gradient(closest-side,rgba(240,170,70,.22),rgba(240,170,70,0) 72%);}
/* header */
.ad .ad-h1{left:0;top:66px;width:512px;text-align:center;font:700 26px/1 "Baskerville Lockdown",serif;letter-spacing:.06em;color:#f3e6bf;}
.ad .ad-h2{left:0;top:100px;width:512px;text-align:center;font:400 12px/1 "Baskerville Lockdown",serif;letter-spacing:.14em;color:#9a8c63;}
.ad .ad-by{left:156px;top:45px;width:200px;text-align:center;font:700 8px/1 "Baskerville Lockdown",serif;letter-spacing:.24em;color:#d8b96a;}
/* card generica */
.ad .card{border-radius:12px;background:linear-gradient(180deg,rgba(11,20,28,.94),rgba(6,12,18,.96));
  box-shadow:inset 0 0 0 1px rgba(90,110,130,.3),0 6px 18px rgba(0,0,0,.45);}
/* lista stanze (sinistra) */
.ad .ad-left{left:16px;top:128px;width:142px;height:330px;}
.ad .ad-ltt{position:absolute;left:14px;top:13px;font:700 11.5px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;color:#e7dcc0;}
.ad .ad-ldv{position:absolute;left:12px;top:33px;width:118px;height:1px;background:rgba(90,110,130,.3);}
.ad .ad-room{position:absolute;left:8px;width:126px;height:26px;display:flex;align-items:center;gap:8px;padding:0 7px;border-radius:7px;white-space:nowrap;
  font:400 12px/1 "Baskerville Lockdown",serif;color:#cfd8e0;}
.ad .ad-room .n{flex:none;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
  font:700 9px/1 "Baskerville Lockdown",serif;color:#aeb9c2;box-shadow:inset 0 0 0 1.4px rgba(120,135,148,.6);}
.ad .ad-room.on{color:#ffe7a6;box-shadow:inset 0 0 0 1.5px rgba(232,200,121,.85);background:rgba(28,22,8,.6);}
.ad .ad-room.on .n{color:#ffe7a6;box-shadow:inset 0 0 0 1.4px rgba(232,200,121,.85);}
/* editor (destra) */
.ad .ad-right{left:170px;top:128px;width:326px;height:330px;}
.ad .ad-ett{position:absolute;left:18px;top:14px;font:700 15px/1 "Baskerville Lockdown",serif;color:#eef0ee;}
.ad .ad-echip{position:absolute;left:18px;top:40px;display:flex;align-items:center;gap:9px;font:700 14px/1 "Baskerville Lockdown",serif;color:#eadfbf;}
.ad .ad-echip .n{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;color:#ffe7a6;box-shadow:inset 0 0 0 1.5px rgba(232,200,121,.7);}
.ad .ad-edv{position:absolute;left:16px;top:70px;width:294px;height:1px;background:rgba(90,110,130,.26);}
.ad .ad-lbl{position:absolute;font:400 10.5px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;color:#9aa7b2;}
.ad .ad-fld{position:absolute;display:flex;align-items:center;padding:0 11px;border-radius:7px;
  background:#0b141d;box-shadow:inset 0 0 0 1px rgba(90,110,130,.4);
  font:400 13px/1 "Baskerville Lockdown",serif;color:#eaf0f5;}
.ad .ad-ta{position:absolute;padding:9px 11px;border-radius:7px;background:#0b141d;box-shadow:inset 0 0 0 1px rgba(90,110,130,.4);
  font:400 12.5px/1.3 "Baskerville Lockdown",serif;color:#dbe6ef;}
.ad .ad-seg{position:absolute;display:flex;align-items:center;justify-content:center;height:34px;border-radius:8px;
  font:400 13px/1 "Baskerville Lockdown",serif;color:#c3cdd6;box-shadow:inset 0 0 0 1px rgba(90,110,130,.4);background:#0b141d;}
.ad .ad-seg.on{color:#ffe7a6;background:linear-gradient(180deg,#1b1406,#110c04);box-shadow:inset 0 0 0 1.5px rgba(232,200,121,.85);}
.ad .ad-tog{position:absolute;width:46px;height:24px;border-radius:13px;background:#0e1822;box-shadow:inset 0 0 0 1px rgba(90,110,130,.5);}
.ad .ad-tog>i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#aab4bd;}
.ad .ad-note{position:absolute;font:400 11px/1 "Baskerville Lockdown",serif;color:#7f8b95;}
`;

function AdminContenuti() {
  const scale = useScale(512, 512);
  const selected = 6; // indice (0-based) di "Cinema" nel catalogo reale
  return (
    <div className="lkd"><style>{CSS + CSS_ADMIN}</style>
      <div className="ad" style={{ transform: `scale(${scale})` }}>
        <div className="a ad-glow" />
        {/* header */}
        <img className="a" src={`${LK}logo-lockdown-t.png`} alt="LOCKDOWN" style={{ left: 181, top: 6, width: 150, height: 38 }} />
        <div className="a ad-by">by IDEAeventi</div>
        <div className="a ad-h1">CONTENUTI</div>
        <div className="a ad-h2">PANNELLO AMMINISTRATORE</div>

        {/* lista stanze (10 reali) */}
        <div className="a card ad-left">
          <div className="ad-ltt">Stanze della casa (10)</div>
          <div className="ad-ldv" />
          {ROOM_CATALOG.map((r, i) => (
            <div className={`ad-room${i === selected ? ' on' : ''}`} key={r} style={{ top: 44 + i * 28 }}>
              <span className="n">{i + 1}</span>{r}
            </div>
          ))}
        </div>

        {/* editor stanza */}
        <div className="a card ad-right">
          <div className="ad-ett">Modifica stanza</div>
          <div className="ad-echip"><span className="n">7</span>Cinema</div>
          <div className="ad-edv" />

          <div className="ad-lbl" style={{ left: 18, top: 80 }}>Titolo stanza</div>
          <div className="ad-fld" style={{ left: 18, top: 95, width: 116, height: 30 }}>Cinema</div>
          <div className="ad-lbl" style={{ left: 144, top: 81, fontSize: 9 }}>Limite parole</div>
          <div className="ad-fld" style={{ left: 144, top: 95, width: 52, height: 30, justifyContent: 'center' }}>20</div>
          <div className="ad-lbl" style={{ left: 214, top: 81, fontSize: 9 }}>Durata (secondi)</div>
          <div className="ad-fld" style={{ left: 212, top: 95, width: 88, height: 30, justifyContent: 'center' }}>300</div>

          <div className="ad-lbl" style={{ left: 18, top: 138 }}>Contenuto</div>
          <div className="ad-ta" style={{ left: 18, top: 153, width: 290, height: 56 }}>
            Descrivi una scena di un film senza nominare il titolo.
          </div>

          <div className="ad-lbl" style={{ left: 18, top: 224 }}>Stato contenuto</div>
          <div className="ad-seg on" style={{ left: 18, top: 239, width: 92 }}>Originale</div>
          <div className="ad-seg" style={{ left: 118, top: 239, width: 92 }}>Proposto</div>
          <div className="ad-seg" style={{ left: 218, top: 239, width: 92 }}>Approvato</div>

          <div className="ad-lbl" style={{ left: 18, top: 290, fontSize: 12, color: '#c6cfd7' }}>Contenuto Adulto (18+)</div>
          <div className="ad-tog" style={{ left: 264, top: 286 }}><i /></div>
          <div className="ad-note" style={{ left: 18, top: 308 }}>Non disponibile con il preset Famiglia.</div>
        </div>
      </div>
    </div>
  );
}

/* ─── ADMIN · PENALITÀ (console host) ──────────────────────────────────────────
   Replica del mockup 08, pannello "19 PENALITÀ · PANNELLO AMMINISTRATORE".
   Palco fisso 512×512. I valori (richiesta 80, saldo 50, trasferimento 50, finale 0)
   sono SPEC-CORRETTI (02-REGOLE: penalità trasferisce solo il disponibile; nessuno
   esce a zero → "Resta in gioco"). Badge "19" omesso. Lampada/busto dipinti resi
   come bagliore caldo. Nessun backend: DATI MOCK. ?penalita. */

const IInfo = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><circle cx="12" cy="12" r="9.3" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="7.7" r="1.25" fill="currentColor"/><path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>);
const IChevron = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IUndo = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M9 7H5V3M5 7a8 8 0 1 1-2 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const IPlay = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/></svg>);
const IClose = () => (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>);

const PEN_ROWS: { label: string; value: string; info?: boolean }[] = [
  { label: 'Penalità richiesta (punti)', value: '80' },
  { label: 'Saldo disponibile del giocatore', value: '50' },
  { label: 'Trasferimento effettivo (punti)', value: '50', info: true },
  { label: 'Saldo finale del giocatore', value: '0' },
];

const CSS_PENALITA = `
.ad .pn-warm{left:360px;top:120px;width:220px;height:300px;pointer-events:none;
  background:radial-gradient(closest-side,rgba(240,180,90,.20),rgba(240,180,90,0) 72%);}
.ad .pn-card{left:18px;top:148px;width:424px;height:352px;}
.ad .pn-lbl{position:absolute;left:16px;font:400 13px/1 "Baskerville Lockdown",serif;color:#cfd8e0;}
.ad .pn-fld{position:absolute;left:232px;width:176px;height:30px;display:flex;align-items:center;padding:0 12px;border-radius:7px;
  background:#0b141d;box-shadow:inset 0 0 0 1px rgba(90,110,130,.42);font:400 14px/1 "Baskerville Lockdown",serif;color:#eaf0f5;}
.ad .pn-fld.sel{justify-content:space-between;}
.ad .pn-fld .chev{color:#8fa0ad;font-size:16px;display:flex;}
.ad .pn-i{position:absolute;left:414px;color:#7f8b95;font-size:17px;display:flex;}
.ad .pn-info{position:absolute;left:16px;top:208px;width:398px;height:50px;display:flex;align-items:center;gap:12px;padding:0 14px;border-radius:9px;
  background:rgba(14,46,56,.55);box-shadow:inset 0 0 0 1px rgba(60,150,170,.5);}
.ad .pn-info .ic{flex:none;color:#4fc5d6;font-size:22px;display:flex;}
.ad .pn-info .t1{font:700 13px/1.25 "Baskerville Lockdown",serif;color:#bfe9f0;}
.ad .pn-info .t2{font:400 12px/1.25 "Baskerville Lockdown",serif;color:#a9bcc4;}
.ad .pn-btn{position:absolute;left:16px;top:270px;width:398px;height:50px;border-radius:10px;display:grid;place-items:center;
  background:linear-gradient(180deg,#e9c877,#caa23f);color:#2a1d06;font:700 17px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;
  box-shadow:0 4px 12px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,235,180,.6);}
`;

function AdminPenalita() {
  const scale = useScale(512, 512);
  return (
    <div className="lkd"><style>{CSS + CSS_ADMIN + CSS_PENALITA}</style>
      <div className="ad" style={{ transform: `scale(${scale})` }}>
        <div className="a pn-warm" />
        {/* header */}
        <img className="a" src={`${LK}logo-lockdown-t.png`} alt="LOCKDOWN" style={{ left: 181, top: 6, width: 150, height: 38 }} />
        <div className="a ad-by">by IDEAeventi</div>
        <div className="a ad-h1">PENALITÀ</div>
        <div className="a ad-h2">PANNELLO AMMINISTRATORE</div>

        {/* card modulo */}
        <div className="a card pn-card">
          <div className="pn-lbl" style={{ top: 165 - 148 }}>Giocatore destinatario</div>
          <div className="pn-fld sel" style={{ top: 157 - 148 }}>Marco<span className="chev"><IChevron /></span></div>
          {PEN_ROWS.map((r, i) => {
            const fieldTop = 195 - 148 + i * 36;
            return (
              <div key={r.label}>
                <div className="pn-lbl" style={{ top: fieldTop + 9 }}>{r.label}</div>
                <div className="pn-fld" style={{ top: fieldTop }}>{r.value}</div>
                {r.info && <div className="pn-i" style={{ top: fieldTop + 7 }}><IInfo /></div>}
              </div>
            );
          })}
          <div className="pn-info">
            <span className="ic"><IInfo /></span>
            <span>
              <span className="t1">Resta in gioco</span><br />
              <span className="t2">La penalità non elimina il giocatore dalla partita.</span>
            </span>
          </div>
          <div className="pn-btn">Conferma penalità</div>
        </div>
      </div>
    </div>
  );
}

/* ─── ADMIN · PAUSA E REGISTRO (console host) ──────────────────────────────────
   Replica del mockup 08, pannello "22 PAUSA E REGISTRO · PANNELLO AMMINISTRATORE".
   Palco fisso 512×512. Pausa con timer congelato, registro eventi e rettifica come
   NUOVA operazione compensativa con motivo obbligatorio (03-SCHERMATE: la rettifica
   non cancella il movimento). Badge "22" omesso. DATI MOCK. ?registro. */

const REG_ROWS: { ora: string; gioc: string; op: string; delta: string; kind: 'premio' | 'penalita'; note: string }[] = [
  { ora: '21:42', gioc: 'Giulia', op: 'Premio', delta: '+200', kind: 'premio', note: 'Sfida bonus' },
  { ora: '21:38', gioc: 'Marco', op: 'Penalità', delta: '−50', kind: 'penalita', note: 'Regola infranta' },
  { ora: '21:35', gioc: 'Master', op: 'Premio', delta: '+50', kind: 'premio', note: 'Aiuto fornito' },
];

const CSS_REGISTRO = `
.ad .rg-warm{left:330px;top:-30px;width:230px;height:200px;pointer-events:none;
  background:radial-gradient(closest-side,rgba(255,190,90,.22),rgba(255,190,90,0) 70%);}
/* card pausa */
.ad .rg-pause{left:18px;top:118px;width:476px;height:100px;box-shadow:inset 0 0 0 1px rgba(60,150,170,.4),0 6px 18px rgba(0,0,0,.45);}
.ad .rg-pic{position:absolute;left:36px;top:18px;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
  color:#4fc5d6;font-size:22px;box-shadow:inset 0 0 0 2px rgba(79,197,214,.7);}
.ad .rg-pt1{position:absolute;left:96px;top:20px;font:700 18px/1 "Baskerville Lockdown",serif;color:#d7ecef;}
.ad .rg-pt2{position:absolute;left:96px;top:44px;font:400 12.5px/1 "Baskerville Lockdown",serif;color:#9fb2ba;}
.ad .rg-time{position:absolute;left:300px;top:14px;width:158px;height:52px;border-radius:9px;background:#0a1016;
  box-shadow:inset 0 0 0 1px rgba(90,110,130,.4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;}
.ad .rg-time .l{font:400 10px/1 "Baskerville Lockdown",serif;letter-spacing:.06em;color:#9aa7b2;}
.ad .rg-time .v{font:700 24px/1 "Baskerville Lockdown",serif;color:#f6e6bc;}
.ad .rg-resume{position:absolute;left:12px;top:70px;width:452px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(180deg,#e9c877,#caa23f);color:#2a1d06;font:700 15px/1 "Baskerville Lockdown",serif;box-shadow:inset 0 0 0 1px rgba(255,235,180,.6);}
.ad .rg-resume svg{font-size:14px;}
/* registro eventi */
.ad .rg-ett{left:18px;top:232px;font:700 14px/1 "Baskerville Lockdown",serif;color:#eadfc2;}
.ad .rg-tbl{left:18px;top:250px;width:476px;border-radius:8px;overflow:hidden;background:#0a131c;box-shadow:inset 0 0 0 1px rgba(90,110,130,.26);}
.ad .rg-row{display:flex;align-items:center;height:23px;font:400 12px/1 "Baskerville Lockdown",serif;color:#dbe3ea;}
.ad .rg-row.head{height:21px;background:#131d28;font-weight:700;font-size:9.5px;letter-spacing:.05em;color:#8fa0ad;}
.ad .rg-row.alt{background:rgba(255,255,255,.02);}
.ad .rg-row .k0{width:76px;padding-left:12px;}
.ad .rg-row .k1{width:86px;}
.ad .rg-row .k2{width:88px;}
.ad .rg-row .k3{width:82px;font-weight:700;}
.ad .rg-row .k4{flex:1;}
.ad .rg-row .premio{color:#55c07e;}
.ad .rg-row .penalita{color:#e85c52;}
.ad .rg-undo{left:108px;top:344px;width:296px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(180deg,#e9c877,#caa23f);color:#2a1d06;font:700 13px/1 "Baskerville Lockdown",serif;box-shadow:inset 0 0 0 1px rgba(255,235,180,.6);}
.ad .rg-undo svg{font-size:14px;}
/* modale annulla */
.ad .rg-modal{left:70px;top:384px;width:384px;height:114px;border-radius:11px;background:linear-gradient(180deg,#0e1826,#0a121c);
  box-shadow:inset 0 0 0 1px rgba(120,140,160,.4),0 10px 28px rgba(0,0,0,.6);}
.ad .rg-mtt{position:absolute;left:16px;top:12px;font:700 13px/1 "Baskerville Lockdown",serif;color:#eef1f4;}
.ad .rg-mx{position:absolute;right:14px;top:11px;color:#9aa7b2;font-size:15px;display:flex;}
.ad .rg-mlbl{position:absolute;left:16px;top:33px;font:400 10px/1 "Baskerville Lockdown",serif;color:#9aa7b2;}
.ad .rg-mta{position:absolute;left:16px;top:46px;width:352px;height:32px;border-radius:7px;background:#0a1016;box-shadow:inset 0 0 0 1px rgba(90,110,130,.42);}
.ad .rg-mb{position:absolute;top:84px;height:24px;border-radius:7px;display:grid;place-items:center;font:700 12px/1 "Baskerville Lockdown",serif;}
.ad .rg-mb.cancel{left:196px;width:84px;color:#c6d0d8;box-shadow:inset 0 0 0 1px rgba(90,110,130,.5);}
.ad .rg-mb.ok{left:286px;width:82px;background:linear-gradient(180deg,#e9c877,#caa23f);color:#2a1d06;}
`;

function AdminRegistro() {
  const scale = useScale(512, 512);
  return (
    <div className="lkd"><style>{CSS + CSS_ADMIN + CSS_REGISTRO}</style>
      <div className="ad" style={{ transform: `scale(${scale})` }}>
        <div className="a rg-warm" />
        {/* header */}
        <img className="a" src={`${LK}logo-lockdown-t.png`} alt="LOCKDOWN" style={{ left: 181, top: 6, width: 150, height: 38 }} />
        <div className="a ad-by">by IDEAeventi</div>
        <div className="a ad-h1" style={{ top: 64, fontSize: 24 }}>PAUSA E REGISTRO</div>
        <div className="a ad-h2">PANNELLO AMMINISTRATORE</div>

        {/* card pausa */}
        <div className="a card rg-pause">
          <div className="rg-pic"><IPause /></div>
          <div className="rg-pt1">Pausa attiva</div>
          <div className="rg-pt2">Il timer è congelato.</div>
          <div className="rg-time"><span className="l">Tempo rimanente</span><span className="v">00:24</span></div>
          <div className="rg-resume"><IPlay />Riprendi</div>
        </div>

        {/* registro eventi */}
        <div className="a rg-ett">Registro eventi</div>
        <div className="a rg-tbl">
          <div className="rg-row head"><div className="k0">Ora</div><div className="k1">Giocatore</div><div className="k2">Operazione</div><div className="k3">Variazione</div><div className="k4">Note</div></div>
          {REG_ROWS.map((r, i) => (
            <div className={`rg-row${i % 2 ? ' alt' : ''}`} key={r.ora}>
              <div className="k0">{r.ora}</div><div className="k1">{r.gioc}</div>
              <div className="k2">{r.op}</div><div className={`k3 ${r.kind}`}>{r.delta}</div><div className="k4">{r.note}</div>
            </div>
          ))}
        </div>
        <div className="a rg-undo"><IUndo />Annulla ultima operazione</div>

        {/* modale annulla ultima operazione */}
        <div className="a rg-modal">
          <div className="rg-mtt">Annulla ultima operazione</div>
          <div className="rg-mx"><IClose /></div>
          <div className="rg-mlbl">Motivo (obbligatorio)</div>
          <div className="rg-mta" />
          <div className="rg-mb cancel">Annulla</div>
          <div className="rg-mb ok">Conferma</div>
        </div>
      </div>
    </div>
  );
}

/* ─── ADMIN · CREA PARTITA (console host) ──────────────────────────────────────
   Replica del mockup 08, pannello "17 CREA PARTITA · PANNELLO AMMINISTRATORE".
   Palco fisso 512×512. Setup partita: nome, preset (Originale/Famiglia), durata
   (Normale/A tempo), soglia Master, QR di accesso. Il QR è REALE (qrcode.react),
   non illustrativo (03-SCHERMATE: nessun QR disegnato per accessi veri). Badge
   "17" omesso. DATI MOCK (?crea=CODE imposta solo il codice del QR). */

const CSS_CREA = `
.ad .cr-warm{left:330px;top:-20px;width:230px;height:200px;pointer-events:none;
  background:radial-gradient(closest-side,rgba(255,185,90,.2),rgba(255,185,90,0) 70%);}
.ad .cr-lbl{position:absolute;font:400 12.5px/1 "Baskerville Lockdown",serif;color:#c3ccd4;}
.ad .cr-fld{position:absolute;display:flex;align-items:center;padding:0 14px;border-radius:9px;background:#0b141d;
  box-shadow:inset 0 0 0 1px rgba(90,110,130,.42);font:400 15px/1 "Baskerville Lockdown",serif;color:#eaf0f5;}
.ad .cr-seg{position:absolute;height:38px;display:grid;place-items:center;border-radius:9px;
  font:400 14px/1 "Baskerville Lockdown",serif;color:#c3ccd4;background:#0b141d;box-shadow:inset 0 0 0 1px rgba(90,110,130,.4);}
.ad .cr-seg.on{color:#ffe7a6;background:linear-gradient(180deg,#1b1406,#110c04);box-shadow:inset 0 0 0 1.5px rgba(232,200,121,.85);}
.ad .cr-qr{position:absolute;left:316px;top:166px;width:172px;height:172px;border-radius:12px;background:#fff;display:grid;place-items:center;
  box-shadow:0 4px 14px rgba(0,0,0,.5),inset 0 0 0 1px rgba(232,200,121,.4);}
.ad .cr-cap{position:absolute;left:312px;top:348px;width:184px;text-align:center;font:400 12px/1.4 "Baskerville Lockdown",serif;color:#aab6bf;}
.ad .cr-btn{position:absolute;left:24px;top:428px;width:464px;height:50px;border-radius:11px;display:grid;place-items:center;
  background:linear-gradient(180deg,#e9c877,#caa23f);color:#2a1d06;font:700 18px/1 "Baskerville Lockdown",serif;letter-spacing:.02em;
  box-shadow:0 4px 12px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,235,180,.6);}
`;

function AdminCrea() {
  const scale = useScale(512, 512);
  const code = new URLSearchParams(window.location.search).get('crea') || 'LOCK24';
  const joinUrl = `${ORIGIN}gestione/lockdown/join?casa=${encodeURIComponent(code)}`;
  return (
    <div className="lkd"><style>{CSS + CSS_ADMIN + CSS_CREA}</style>
      <div className="ad" style={{ transform: `scale(${scale})` }}>
        <div className="a cr-warm" />
        {/* header */}
        <img className="a" src={`${LK}logo-lockdown-t.png`} alt="LOCKDOWN" style={{ left: 181, top: 6, width: 150, height: 38 }} />
        <div className="a ad-by">by IDEAeventi</div>
        <div className="a ad-h1">CREA PARTITA</div>
        <div className="a ad-h2">PANNELLO AMMINISTRATORE</div>

        {/* form */}
        <div className="a cr-lbl" style={{ left: 30, top: 162 }}>Nome della partita</div>
        <div className="a cr-fld" style={{ left: 28, top: 180, width: 274, height: 36 }}>Casa di Jonny</div>

        <div className="a cr-lbl" style={{ left: 30, top: 234 }}>Preset di gioco</div>
        <div className="a cr-seg on" style={{ left: 28, top: 250, width: 134 }}>Originale</div>
        <div className="a cr-seg" style={{ left: 168, top: 250, width: 134 }}>Famiglia</div>

        <div className="a cr-lbl" style={{ left: 30, top: 304 }}>Durata della stanza</div>
        <div className="a cr-seg on" style={{ left: 28, top: 320, width: 134 }}>Normale</div>
        <div className="a cr-seg" style={{ left: 168, top: 320, width: 134 }}>A tempo</div>

        <div className="a cr-lbl" style={{ left: 30, top: 386 }}>Soglia Master (punti)</div>
        <div className="a cr-fld" style={{ left: 174, top: 370, width: 128, height: 36, justifyContent: 'center' }}>1500</div>

        {/* QR reale */}
        <div className="a cr-qr"><QRCodeSVG value={joinUrl} size={150} /></div>
        <div className="a cr-cap">Scansiona questo QR con i dispositivi dei giocatori per unirsi alla partita.</div>

        {/* CTA */}
        <div className="a cr-btn">Crea e mostra QR</div>
      </div>
    </div>
  );
}

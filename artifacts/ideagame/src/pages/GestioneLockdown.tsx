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

// ── Dispatcher: ?sfida=CODE → MONITOR SFIDA, altrimenti MONITOR CASA ───────────
export default function GestioneLockdown() {
  const sfida = new URLSearchParams(window.location.search).get('sfida');
  return sfida !== null ? <MonitorSfida /> : <MonitorCasa />;
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

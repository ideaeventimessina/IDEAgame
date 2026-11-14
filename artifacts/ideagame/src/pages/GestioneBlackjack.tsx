/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Blackjack Idea Eventi Casinò ────────────────────────────────────────────
   Tre interfacce sullo stesso motore server-autorevole (vedi gestione-casino.ts):
   · BlackjackPhone   — il giocatore gioca dal proprio smartphone (accesso→posto→
                        puntata→turno→esito), unico a inviare azioni di gioco.
   · BlackjackMonitor — vista pubblica 80" (sola lettura): attesa/partita/risultati.
   · BlackjackRegia    — controllo mano per tavolo; BlackjackTablesView = elenco/crea.
   Stile coerente con la roulette: panno verde, cornici oro, carte realistiche,
   font Baskerville. Importi = crediti virtuali (niente simbolo €). ─────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTableMusic } from '@/audio/useTableMusic';
import { ScreenFit } from '@/components/ScreenFit';
import { CasPhone, Hero } from '../casino-ui/kit';
import { DealerFab } from '../casino-ui/DealerFab';

const API = ((import.meta.env.BASE_URL as string) || '/') + 'api';
const ORIGIN = window.location.origin + ((import.meta.env.BASE_URL as string) || '/');
const AB = (import.meta.env.BASE_URL as string) || '/';
const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

/* ── Tipi (specchio dello stato ripulito dal server) ── */
type BjCard = { r: string; s: string };
type BjSeatState = { code: string; playerId: string | null; nickname: string | null; avatarUrl: string | null; balance: number | null; bet: number; cards: BjCard[]; total: number | null; soft: boolean; status: string; outcome: string | null; profit: number; doubled: boolean };
type BjHist = { hand: number; at: string; dealerTotal: number; dealerCards: BjCard[]; results: { seatNo: number; nickname: string; bet: number; total: number; outcome: string; profit: number }[] };
type BjTbl = {
  id: string; name: string; displayCode: string; type: 'blackjack';
  phase: 'waiting' | 'betting' | 'playing' | 'dealer' | 'result'; round: number;
  seats: Record<string, BjSeatState>;
  dealer: { cards: BjCard[]; total: number | null; hidden: boolean };
  activeSeat: number | null; turnEndsAt: string | null; betEndsAt: string | null;
  minBet: number; maxBet: number; step: number; timeout: number; betSeconds: number; soft17Hit: boolean; suspended: boolean;
  hasDealer?: boolean; mode?: 'digital' | 'hybrid';
  history: BjHist[];
};
type BjState = { table: BjTbl; sessionId: string; seatNo: number | null };

/* ── Helper comuni ── */
const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const seatOrder = (t: BjTbl) => Object.keys(t.seats).map(Number).sort((a, b) => a - b);
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const grp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // migliaia col punto (indipendente dall'ICU)
function outcomeLabel(o: string | null): { t: string; cls: string } {
  switch (o) {
    case 'win': return { t: 'HAI VINTO', cls: 'win' };
    case 'blackjack': return { t: 'BLACKJACK', cls: 'bj' };
    case 'push': return { t: 'PAREGGIO', cls: 'push' };
    case 'lose': return { t: 'HAI PERSO', cls: 'lose' };
    case 'bust': return { t: 'SBALLATO', cls: 'lose' };
    default: return { t: '', cls: '' };
  }
}
function outcomeShort(o: string): { t: string; cls: string } {
  switch (o) {
    case 'win': return { t: 'Vinto', cls: 'win' };
    case 'blackjack': return { t: 'Blackjack', cls: 'win' };
    case 'push': return { t: 'Pareggio', cls: 'push' };
    default: return { t: 'Perso', cls: 'lose' };
  }
}

function useCountdown(iso: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!iso) { setN(0); return; }
    const tick = () => setN(Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [iso]);
  return n;
}
function useBjTable(code: string, ms = 900): BjState | null {
  const [st, setSt] = useState<BjState | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/bj/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d && d.table) setSt(d); }).catch(() => {});
    load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); };
  }, [code, ms]);
  return st;
}
async function fileToAvatar(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const s = 320, cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d')!; const scale = Math.max(s / img.width, s / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
  return cv.toDataURL('image/jpeg', 0.82);
}

/* ── Font + stile condiviso ── */
const BJ_FONT = `@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;
const CARD_CSS = `
.bjcard{position:relative;background:linear-gradient(158deg,#ffffff 0%,#eceadf 100%);border-radius:8px;box-shadow:0 3px 7px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;font-family:Georgia,"Times New Roman",serif;font-weight:700;color:#141414;flex:none}
.bjcard .cr{position:absolute;top:3%;left:8%;line-height:1}
.bjcard .cs{font-size:1.9em;line-height:1}
.bjcard .red{color:#c40812}
.bjcard.back{background:repeating-linear-gradient(45deg,#0a1c4d,#0a1c4d 5px,#15367e 5px,#15367e 10px);box-shadow:0 3px 7px rgba(0,0,0,.55),inset 0 0 0 2px #e6c268,inset 0 0 0 4px #0a1c4d}
.bjcard.back::after{content:"◆";position:absolute;inset:0;display:grid;place-items:center;color:#e6c268;font-size:1.5em;text-shadow:0 0 6px rgba(0,0,0,.6)}
.bjtot{display:inline-grid;place-items:center;min-width:1.9em;height:1.5em;padding:0 .35em;border-radius:999px;background:#0c0c08;border:2px solid #e6c268;color:#ffe9a6;font-weight:700}
.bjtot.bust{border-color:#e0484a;color:#ff9b9b;background:#2a0a0a}`;

function Card({ c, back, w = 58 }: { c?: BjCard; back?: boolean; w?: number }) {
  const h = Math.round(w * 1.42);
  if (back || !c) return <div className="bjcard back" style={{ width: w, height: h }} />;
  const red = c.s === 'h' || c.s === 'd';
  return (
    <div className="bjcard" style={{ width: w, height: h, fontSize: Math.round(w * 0.34) }}>
      <span className={`cr${red ? ' red' : ''}`}>{c.r}</span>
      <span className={`cs${red ? ' red' : ''}`}>{SUIT[c.s]}</span>
    </div>
  );
}
function Total({ v, bust, size = 15 }: { v: number | null; bust?: boolean; size?: number }) {
  if (v == null) return null;
  return <span className={`bjtot${bust ? ' bust' : ''}`} style={{ fontSize: size }}>{v}</span>;
}
function Avatar({ url, name, size = 54 }: { url?: string | null; name?: string | null; size?: number }) {
  return url
    ? <img src={url} alt={name ?? ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e6c268' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(#2a2a28,#141412)', border: '2px solid #6e5320', display: 'grid', placeItems: 'center', color: '#8a7a52', fontSize: size * 0.5 }}>👤</div>;
}

/* ════════════════════════════════════════════════════════════════════════════
   TELEFONO
   ════════════════════════════════════════════════════════════════════════════ */
const PHONE_CSS = BJ_FONT + CARD_CSS + `
.bjp{position:fixed;inset:0;overflow:hidden;color:#fff;font-family:"Baskerville Casino",Georgia,serif;
  background:radial-gradient(ellipse 150% 80% at 50% 6%,#0a5a26 0%,#063f18 45%,#02220c 100%);display:flex;flex-direction:column;align-items:center;}
.bjp .wrap{width:100%;max-width:460px;display:flex;flex-direction:column;}
.bjp .content{display:flex;flex-direction:column;padding:4px 16px 22px;gap:12px;flex:1;}
/* ── header: barra di stato + duomo di marmo + arco oro + wordmark ── */
.bjp .head{position:relative;text-align:center;}
.bjp .sbar{position:absolute;top:7px;left:0;right:0;z-index:4;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#fff;font:600 13px/1 -apple-system,"Helvetica Neue",Arial,sans-serif;}
.bjp .sbar .ic{display:flex;align-items:center;gap:5px;}
.bjp .dome{position:relative;height:96px;overflow:hidden;
  background:
    radial-gradient(120% 150% at 18% -30%,rgba(90,94,102,.35),transparent 46%),
    radial-gradient(130% 150% at 86% -20%,rgba(70,74,82,.3),transparent 44%),
    linear-gradient(120deg,transparent 46%,rgba(150,150,160,.10) 47%,transparent 49%),
    linear-gradient(55deg,transparent 60%,rgba(140,140,150,.08) 61%,transparent 63%),
    radial-gradient(130% 160% at 50% -46%,#1b1d22 0%,#0c0d10 44%,#050506 72%);
  border-radius:0 0 46% 46%/0 0 100% 100%;
  box-shadow:inset 0 -3px 0 #d9b65d,inset 0 -5px 0 #8a6a24,inset 0 -14px 20px #e8c87918,0 3px 7px #000a;}
.bjp .logo{position:absolute;left:50%;top:14px;transform:translateX(-50%);height:66px;object-fit:contain;filter:drop-shadow(0 2px 8px #000c);z-index:3;}
.bjp .word{position:relative;display:flex;align-items:center;justify-content:center;gap:14px;margin:5px 0 2px;
  font:700 22px/1 "Baskerville Casino",serif;letter-spacing:.1em;
  background:linear-gradient(180deg,#fff3c4,#ffdd87 48%,#e0a847);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 1px #000a);}
.bjp .word::before,.bjp .word::after{content:"";width:34px;height:12px;background:no-repeat center/contain;}
.bjp .word::before{background-image:url(${AB}casino/flourish-l.png);}
.bjp .word::after{background-image:url(${AB}casino/flourish-r.png);}
.bjp .h1{font:700 26px/1.12 "Baskerville Casino",serif;color:#fff;text-align:center;margin:2px 0 0;text-shadow:0 2px 6px #0007;}
.bjp .h1 .gold{color:#ffdd87;}
.bjp .h2{text-align:center;color:#cbd8c9;font-size:14px;line-height:1.35;margin:-2px 0 2px;}
.bjp .panel{position:relative;border-radius:16px;padding:14px 16px;background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #c6992f;box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 30px #0007,0 4px 12px #0006;}
.bjp .lbl{color:#e8c879;font-size:13px;text-align:center;}
.bjp .lbl.left{text-align:left;}
.bjp .big{font:700 40px/1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;}
.bjp .credit{display:flex;align-items:center;justify-content:center;gap:10px;font:700 34px/1 "Baskerville Casino",serif;color:#ffe9a6;}
.bjp .mchip{width:28px;height:28px;border-radius:50%;flex:none;position:relative;background:radial-gradient(circle at 38% 30%,#f26d6d,#c21118 60%,#8c0a10);box-shadow:0 1px 3px #0009,inset 0 0 0 1px #0004;}
.bjp .mchip::before{content:"";position:absolute;inset:3px;border-radius:50%;border:2px dashed #fff;opacity:.92;}
.bjp .mchip::after{content:"";position:absolute;inset:8px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#fff5,transparent 60%);border:1px solid #fff6;}
.bjp .mchip.grn{background:radial-gradient(circle at 38% 30%,#5fd481,#1a9247 60%,#0c6a32);}
.bjp .mchip.drop{animation:bjChipDrop .6s cubic-bezier(.22,1.2,.4,1) both;}
.bjp input[type=text]{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 20px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.14em;text-transform:uppercase;box-shadow:inset 0 2px 6px #0008;}
.bjp input.name{letter-spacing:0;text-transform:none;font-size:18px;text-align:left;}
.bjp .photo{position:relative;width:104px;height:104px;margin:2px auto 0;}
.bjp .photo img,.bjp .photo .ph{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid #e6c268;box-shadow:0 0 0 2px #0008,0 4px 12px #0008;}
.bjp .photo .ph{display:grid;place-items:center;background:radial-gradient(circle at 42% 34%,#2a2a28,#121210);color:#8a7a52;font-size:48px;}
.bjp .cambadge{position:absolute;right:2px;bottom:2px;width:30px;height:30px;border-radius:50%;background:linear-gradient(180deg,#ffe694,#d59a34);border:2px solid #7a4d12;display:grid;place-items:center;box-shadow:0 2px 5px #0008;}
.bjp .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:15px;border-radius:13px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 20px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,0 7px 15px #0007,inset 0 1px 0 #fff8;margin-top:auto;}
.bjp .gbtn.ghost{background:#121511;color:#ffe9a6;border:2px solid #6e5320;box-shadow:inset 0 0 0 1px #ffe9a620;}
.bjp .gbtn:disabled{opacity:.5;cursor:default;}
.bjp .step{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.bjp .rnd{width:60px;height:60px;border-radius:50%;border:3px solid #e8cd7a;background:radial-gradient(circle at 40% 28%,#201708,#0a0a07);color:#ffe9a6;font:700 38px/1 serif;cursor:pointer;display:grid;place-items:center;box-shadow:0 0 12px #e8c87933,inset 0 2px 5px #fff2,0 3px 6px #0007;}
.bjp .rnd:active{transform:scale(.94);}
.bjp .stepval{flex:1;text-align:center;font:700 56px/1 "Baskerville Casino",serif;color:#ffe9a6;text-shadow:0 2px 6px #0008;}
.bjp .chips{display:flex;gap:8px;justify-content:center;}
.bjp .chipcol{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;}
.bjp .chip{width:52px;height:52px;border-radius:50%;position:relative;flex:none;box-shadow:0 3px 7px #0009,inset 0 0 0 2px #0003;transition:transform .15s ease;}
.bjp .chip::before{content:"";position:absolute;inset:3px;border-radius:50%;border:3px dashed #ffffffe0;}
.bjp .chip::after{content:"";position:absolute;inset:10px;border-radius:50%;border:1px solid #ffffff66;background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 62%);}
.bjp .chip b{position:absolute;inset:0;display:grid;place-items:center;z-index:1;font:700 15px/1 Georgia,serif;color:#fff;text-shadow:0 1px 2px #000a;}
.bjp .chipcol.sel .chip{transform:translateY(-3px) scale(1.04);box-shadow:0 0 0 3px #ffe9a6,0 0 14px #ffe9a6aa,0 4px 8px #0009;}
.bjp .chiplbl{padding:3px 0;width:46px;text-align:center;border-radius:8px;background:#0b1a10;border:1px solid #6e5320;color:#e8c879;font:700 13px/1 "Baskerville Casino",serif;}
.bjp .chipcol.sel .chiplbl{border-color:#ffe9a6;color:#ffe9a6;background:#13230f;}
.bjp .seatpick{position:relative;height:272px;margin:2px 0 0;}
.bjp .seatpick .felt{position:absolute;left:2%;right:2%;top:0;bottom:4%;border-radius:48%/40%;background:radial-gradient(ellipse at 50% 26%,#0c7a31,#076322 52%,#044a1a 78%,#032f12);border:3px solid #c9972f;box-shadow:inset 0 0 44px #0009,inset 0 0 0 1px #ffe9a630,0 6px 16px #0007;}
.bjp .tlogo{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);height:46px;opacity:.5;filter:grayscale(.3);}
.bjp .dealer{position:absolute;left:50%;top:4%;transform:translate(-50%,-50%);z-index:3;}
.bjp .sbtn{position:absolute;width:46px;height:46px;border-radius:50%;transform:translate(-50%,-50%);display:grid;place-items:center;border:3px solid #cdaa52;background:radial-gradient(circle at 42% 34%,#2b2b27,#111110);color:#e3d6a8;font:700 16px/1 serif;cursor:pointer;z-index:2;box-shadow:0 2px 5px #0008;overflow:hidden;}
.bjp .sbtn .ava{width:100%;height:100%;object-fit:cover;}
.bjp .sbtn.occ{cursor:not-allowed;border-color:#8a7a52;}
.bjp .sbtn.sel{border-color:#4ade80;box-shadow:0 0 0 3px #4ade8066,0 0 16px #4ade80cc;animation:bjPulse 1.7s ease-in-out infinite;}
.bjp .hand{display:flex;gap:12px;}
.bjp .handbox{flex:1;position:relative;border-radius:13px;border:2px solid #b98b38;background:linear-gradient(160deg,#0c2717,#06160d);padding:9px 8px 20px;text-align:center;box-shadow:inset 0 0 0 1px #ffe9a614,0 3px 9px #0006;}
.bjp .handbox .t{color:#eadbb0;font:700 13px/1 "Baskerville Casino",serif;margin-bottom:6px;}
.bjp .cards{display:flex;gap:6px;justify-content:center;align-items:flex-end;min-height:76px;}
.bjp .handbox .bjtot{position:absolute;left:50%;bottom:-13px;transform:translateX(-50%);}
.bjp .actions{display:flex;gap:9px;}
.bjp .act{flex:1;border:none;border-radius:13px;padding:12px 4px 10px;color:#fff;font:700 15px/1.1 "Baskerville Casino",serif;letter-spacing:.03em;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 3px 0 rgba(0,0,0,.45),inset 0 1px 0 #ffffff33;}
.bjp .act svg{width:30px;height:30px;}
.bjp .act.hit{background:linear-gradient(#1fb356,#0b7531);}
.bjp .act.stand{background:linear-gradient(#e03a44,#9c0208);}
.bjp .act.dbl{background:linear-gradient(#f3cf6a,#cf9633);color:#241704;}
.bjp .act:disabled{background:linear-gradient(#3b3f3b,#2a2d2a);color:#8c938c;box-shadow:0 3px 0 rgba(0,0,0,.4);cursor:default;}
.bjp .act:disabled svg{opacity:.55;}
.bjp .act:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.45);}
.bjp .winrow{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;margin:3px 0;}
.bjp .laurel{width:34px;height:50px;flex:none;}
.bjp .outcome{font:700 38px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.02em;white-space:nowrap;}
.bjp .outcome.win,.bjp .outcome.bj{background:linear-gradient(180deg,#fff3c4,#ffdd87 46%,#e3a948);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(243,201,95,.55));}
.bjp .outcome.lose{color:#ff7a7a;text-shadow:0 0 16px rgba(220,40,40,.5);}
.bjp .outcome.push{color:#cfe8d6;}
.bjp .winrow .spark{position:absolute;width:8px;height:8px;background:radial-gradient(#fff,#ffe08a 42%,transparent 72%);border-radius:50%;opacity:.8;animation:bjTwinkle 1.5s ease-in-out infinite;}
.bjp .note{display:flex;align-items:center;justify-content:center;gap:8px;color:#8ee6a8;font:700 16px/1.2 "Baskerville Casino",serif;}
.bjp .note.lose{color:#ff8e8e;}
.bjp .notesub{text-align:center;color:#cbd8c9;font-size:13px;margin-top:-4px;}
.bjp .err{color:#ffb3b3;text-align:center;font-size:14px;}
.bjp .prow{display:flex;align-items:center;gap:12px;}
.bjp .prow .pname{font:700 20px/1 "Baskerville Casino",serif;color:#fff;}
.bjp .prow .pcr{margin-left:auto;text-align:right;color:#cbd8c9;font-size:12px;line-height:1.3;}
.bjp .prow .pcr b{display:block;color:#ffe9a6;font-size:17px;}
.bjp .profit{font:700 30px/1 "Baskerville Casino",serif;}
.bjp .tbar{height:6px;border-radius:999px;background:#02160b;border:1px solid #3a2708;overflow:hidden;margin-top:8px;}
.bjp .tbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#f0c357,#ffe9a6);box-shadow:0 0 8px #e8c87988;transition:width .9s linear;}
/* ── motion ── */
@keyframes bjRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes bjPulse{0%,100%{box-shadow:0 0 0 3px #4ade8044,0 0 10px #4ade8066}50%{box-shadow:0 0 0 3px #4ade8088,0 0 20px #4ade80cc}}
@keyframes bjGlow{0%,100%{box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 30px #0007,0 0 6px #e8c87900}50%{box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.2),inset 0 10px 30px #0007,0 0 20px #e8c87977}}
@keyframes bjChipDrop{0%{transform:translateY(-34px) scale(1.35);opacity:0}70%{transform:translateY(3px) scale(1)}100%{transform:none;opacity:1}}
@keyframes bjWin{0%{transform:scale(.55);opacity:0}60%{transform:scale(1.07);opacity:1}100%{transform:scale(1)}}
@keyframes bjTwinkle{0%{opacity:.4;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}100%{opacity:.6;transform:scale(.85)}}
.bjp .content>*{animation:bjRise .45s ease both;}
.bjp .content>*:nth-child(2){animation-delay:.05s}
.bjp .content>*:nth-child(3){animation-delay:.1s}
.bjp .content>*:nth-child(4){animation-delay:.15s}
.bjp .content>*:nth-child(5){animation-delay:.2s}
.bjp .content>*:nth-child(6){animation-delay:.25s}
.bjp .content>*:nth-child(7){animation-delay:.3s}
.bjp .turnglow{animation:bjGlow 1.8s ease-in-out infinite;}
.bjp .h1.turnpulse{animation:bjH1 1.8s ease-in-out infinite;}
@keyframes bjH1{0%,100%{text-shadow:0 2px 6px #0007}50%{text-shadow:0 0 16px #ffe08a99,0 2px 6px #0007}}
.bjp .winout{animation:bjWin .7s cubic-bezier(.22,1.3,.4,1) both;}
/* dorso carta ornato (immagine condivisa col monitor) */
.bjp .bjcard.back{background:#0a1430 url(${AB}bj/card-back.png) center/cover;box-shadow:0 3px 7px rgba(0,0,0,.55),inset 0 0 0 1px #0007;}
.bjp .bjcard.back::after{content:none;}
@media (prefers-reduced-motion:reduce){.bjp *{animation:none!important;}}
`;
const CHIP_BG: Record<number, string> = {
  10: 'radial-gradient(circle at 40% 30%,#4fd277,#0c7a33 62%,#064d1f)',
  20: 'radial-gradient(circle at 40% 30%,#f26d6d,#c21118 62%,#8c0a10)',
  50: 'radial-gradient(circle at 40% 30%,#5aa0f6,#13408a 62%,#0c2d63)',
  100: 'radial-gradient(circle at 40% 30%,#4a4a4a,#111110 62%,#060606)',
  500: 'radial-gradient(circle at 40% 30%,#c07cf7,#5b1a8a 62%,#3c0f5e)',
};

/* ── barra di stato iOS fittizia (coerenza col mockup) ── */
function PhoneStatusBar() {
  return (
    <div className="sbar">
      <span>9:41</span>
      <span className="ic">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="#fff" strokeWidth="1.4"><path d="M1 4.3C3 2.5 5.3 1.6 8 1.6s5 .9 7 2.7"/><path d="M3.4 6.8C4.7 5.7 6.2 5.1 8 5.1s3.3.6 4.6 1.7"/><path d="M5.8 9.2C6.4 8.7 7.1 8.4 8 8.4s1.6.3 2.2.8"/></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="1" y="1" width="19" height="10" rx="2.5" stroke="#fff" strokeOpacity=".6"/><rect x="2.6" y="2.6" width="15" height="6.8" rx="1.3" fill="#fff"/><rect x="21" y="4" width="1.8" height="4" rx="1" fill="#fff" fillOpacity=".7"/></svg>
      </span>
    </div>
  );
}

/* ── icone azioni (bianche, nette) ── */
const IconCarta = () => (<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="7" width="16" height="21" rx="2.5" transform="rotate(-9 11 17)" fill="#fff"/><rect x="12" y="5" width="16" height="21" rx="2.5" transform="rotate(7 20 15)" fill="#fff" stroke="#0b7531" strokeWidth="1.2"/><text x="17" y="19" fontSize="10" fontFamily="Georgia" fontWeight="700" fill="#0b7531" textAnchor="middle">A</text></svg>);
const IconStai = () => (<svg viewBox="0 0 32 32" fill="#fff"><path d="M9 15V7.5a2 2 0 0 1 4 0V14h1V5.5a2 2 0 0 1 4 0V14h1V7a2 2 0 0 1 4 0v7h1V9.5a2 2 0 0 1 4 0V19c0 5-3.6 9-9 9-4 0-6.5-2-9-6l-3.2-5.3a2 2 0 0 1 3.3-2.2L9 16z"/></svg>);
const IconDbl = () => (<svg viewBox="0 0 32 32" fill="none"><ellipse cx="16" cy="11" rx="12" ry="4.6" fill="#241704" stroke="#7a5410" strokeWidth="1.2"/><path d="M4 11v6c0 2.5 5.4 4.6 12 4.6s12-2.1 12-4.6v-6" fill="#2e1e05"/><ellipse cx="16" cy="11" rx="12" ry="4.6" fill="#3a2706"/><ellipse cx="16" cy="11" rx="7" ry="2.6" fill="none" stroke="#f3cf6a" strokeWidth="1.2"/><path d="M4 17v5c0 2.5 5.4 4.6 12 4.6s12-2.1 12-4.6v-5" fill="none" stroke="#7a5410" strokeWidth="1.2"/></svg>);
const IconClock = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8c879" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2" strokeLinecap="round"/><path d="M9 2h6" strokeLinecap="round"/></svg>);
const IconHourglass = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9" strokeLinecap="round" strokeLinejoin="round"/></svg>);

/* ── rami d'alloro (oro) per "HAI VINTO" ── */
function Laurel({ flip }: { flip?: boolean }) {
  return (
    <svg className="laurel" viewBox="0 0 40 58" fill="#e7b64a" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M33 56C20 50 12 40 11 24 10 16 13 8 20 2c-3 7-3 13-1 20 2 8 7 14 15 18z" opacity=".95"/>
      {[8, 15, 22, 29, 36, 43].map((y, i) => {
        const s = 1 - i * 0.07, x = 30 - i * 3.3;
        return <ellipse key={i} cx={x} cy={y} rx={7 * s} ry={3.3 * s} transform={`rotate(-38 ${x} ${y})`} />;
      })}
    </svg>
  );
}

function BlackjackHeader() {
  return (
    <div className="head">
      <PhoneStatusBar />
      <div className="dome">
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
      </div>
      <div className="word">BLACKJACK</div>
    </div>
  );
}

export function BlackjackPhone({ displayCode }: { displayCode: string }) {
  const [playerCode, setPlayerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [me, setMe] = useState<{ id: string; nickname: string; fishBalance: number } | null>(null);
  const st = useBjTable(displayCode, 900);
  const [tableCode, setTableCode] = useState(displayCode);
  const [nick, setNick] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chip, setChip] = useState(0);
  const [confirmDbl, setConfirmDbl] = useState(false);
  const [selSeat, setSelSeat] = useState<number | null>(null);

  // carica identità giocatore se ho già il codice
  useEffect(() => {
    if (!playerCode) { setMe(null); return; }
    fetch(`${API}/gestione/casino/player/${playerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.player) setMe({ id: d.player.id, nickname: d.player.nickname, fishBalance: d.player.fishBalance }); }).catch(() => {});
  }, [playerCode, st?.table.round]);

  const t = st?.table;
  const mySeatNo = useMemo(() => {
    if (!t || !me) return null;
    for (const no of seatOrder(t)) if (t.seats[String(no)]?.playerId === me.id) return no;
    return null;
  }, [t, me]);
  const mySeat = mySeatNo != null && t ? t.seats[String(mySeatNo)] : null;
  const myCode = mySeat?.code ?? '';
  const myBalance = mySeat?.balance ?? me?.fishBalance ?? 0;
  const betCd = useCountdown(t?.phase === 'betting' ? t.betEndsAt : null);
  const turnCd = useCountdown(t?.phase === 'playing' && t.activeSeat === mySeatNo ? t.turnEndsAt : null);

  const enroll = async () => {
    const code = tableCode.trim().toUpperCase(); if (!code || !nick.trim()) { setErr('Inserisci codice e nome'); return; }
    if (!photo) { setErr('Scatta il selfie per entrare'); return; } // SELFIE OBBLIGATORIO
    setBusy(true); setErr('');
    try {
      const info = await fetch(`${API}/gestione/casino/bj/${code}`).then(r => r.ok ? r.json() : null);
      if (!info?.sessionId) { setErr('Tavolo non trovato'); return; }
      const p = await api(`/gestione/casino/sessions/${info.sessionId}/players`, { nickname: nick.trim(), tableId: null, photo });
      if (p?.id && p?.playerCode) { try { localStorage.setItem('casino_player', p.playerCode); } catch { /* */ } setPlayerCode(p.playerCode); setMe({ id: p.id, nickname: p.nickname, fishBalance: p.fishBalance }); }
      else setErr(p?.error || 'Accesso non riuscito');
    } finally { setBusy(false); }
  };
  const takeSeat = async (no: number) => {
    setBusy(true); setErr('');
    try { const r = await api('/gestione/casino/bj/join', { displayCode, seatNo: no, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); }
  };
  const placeBet = async (amount: number) => { setBusy(true); setErr(''); try { const r = await api('/gestione/casino/bj/bet', { seatCode: myCode, amount, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };
  const unbet = async () => { setBusy(true); try { await api('/gestione/casino/bj/unbet', { seatCode: myCode, playerCode }); } finally { setBusy(false); } };
  const act = async (kind: 'hit' | 'stand' | 'double') => { setBusy(true); setErr(''); try { const r = await api(`/gestione/casino/bj/${kind}`, { seatCode: myCode, playerCode }); if (r?.error) setErr(r.error); setConfirmDbl(false); } finally { setBusy(false); } };

  const footer = <footer className="foot">IDEAeventi · Blackjack — avvicìnati a 21 senza sballare</footer>;
  const Phone = (label: string, body: React.ReactNode, badge?: React.ReactNode) => (
    <CasPhone eyebrow="Casinò · Giocatore" title="Blackjack" footer={footer}>
      <Hero label={label} badge={badge} />
      {body}
    </CasPhone>
  );

  // 01 ACCESSO (selfie obbligatorio)
  if (!me) return Phone('Accesso',
    <section className="panel">
      <h2>Entra al tavolo</h2>
      <p>Inserisci il codice del tavolo e scatta il selfie: al tavolo il dealer ti riconosce dalla faccia.</p>
      <input className="field" value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="Codice tavolo" />
      <input className="field" value={nick} onChange={e => setNick(e.target.value)} placeholder="Il tuo nome" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '2px 0 6px', cursor: 'pointer' }}>
        {photo
          ? <img src={photo} alt="" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: '3px solid #c1974d', flex: 'none' }} />
          : <span style={{ width: 76, height: 76, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '3px dashed #b19455', background: '#081b14', fontSize: 30, flex: 'none' }}>📸</span>}
        <div><div style={{ fontWeight: 800 }}>Selfie obbligatorio</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{photo ? 'Tocca per rifarlo' : 'Tocca per scattare'}</div></div>
        <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await fileToAvatar(f)); }} />
      </label>
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn" disabled={busy || !photo} onClick={enroll}>Entra ›</button></div>
    </section>
  );

  if (!t) return Phone('Attendi', <section className="panel"><p>Carico il tavolo…</p></section>);
  if (t.suspended && mySeatNo == null) return Phone('Sospeso', <section className="panel"><h2>Tavolo sospeso</h2><p>Attendi la riapertura dalla regia.</p></section>);

  // 02 SIEDITI AL TAVOLO
  if (mySeatNo == null) {
    const nos = seatOrder(t);
    const occupied = nos.filter(no => t.seats[String(no)]?.playerId).length;
    const full = occupied >= nos.length;
    return Phone('Accesso e posto',
      <section className="panel">
        <h2>Siediti al tavolo</h2>
        {full && <p>Tavolo pieno — attendi che si liberi un posto.</p>}
        <div className="list">
          {nos.map(no => {
            const s = t.seats[String(no)]!; const occ = !!s.playerId; const sel = selSeat === no;
            return (
              <div key={no} className={`line${sel ? ' sel' : ''}`} style={{ cursor: occ ? 'default' : 'pointer', opacity: occ ? .7 : 1 }}
                onClick={() => { if (!occ && !busy) setSelSeat(no); }}>
                <strong>Posto {String(no).padStart(2, '0')}</strong>
                <span>{occ ? (s.nickname ?? 'Occupato') : (sel ? 'Scelto ✓' : 'Libero')}</span>
              </div>
            );
          })}
        </div>
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn" disabled={busy || selSeat == null} onClick={() => selSeat != null && takeSeat(selSeat)}>{selSeat != null ? `Siediti al posto ${String(selSeat).padStart(2, '0')}` : 'Scegli un posto'}</button></div>
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  const dealerUp = t.dealer.cards[0];
  const handPanel = (
    <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
      <div className="tile center" style={{ flex: 1, padding: 14 }}>
        <small className="eyebrow">Le tue carte</small>
        <div className="cards">{mySeat!.cards.map((c, i) => <Card key={i} c={c} w={52} />)}</div>
        <Total v={mySeat!.total} bust={mySeat!.status === 'bust'} />
      </div>
      <div className="tile center" style={{ flex: 1, padding: 14 }}>
        <small className="eyebrow">Banco</small>
        <div className="cards">{dealerUp && <Card c={dealerUp} w={52} />}{t.dealer.hidden && <Card back w={52} />}{!t.dealer.hidden && t.dealer.cards.slice(1).map((c, i) => <Card key={i} c={c} w={52} />)}</div>
        <Total v={t.dealer.hidden ? (dealerUp ? Number(dealerUp.r === 'A' ? 11 : SUIT[dealerUp.s] && isNaN(+dealerUp.r) ? 10 : +dealerUp.r) : null) : t.dealer.total} />
      </div>
    </div>
  );

  // ESITO
  if (t.phase === 'result') {
    const ol = outcomeLabel(mySeat!.outcome);
    const won = ol.cls === 'win' || ol.cls === 'bj';
    const profit = mySeat!.profit;
    return Phone('Esito',
      <section className="panel center">
        <h2 style={{ color: won ? 'var(--green)' : 'var(--red)' }}>{ol.t || '—'}</h2>
        <small className="eyebrow">Profitto</small>
        <div className="metric" style={{ color: profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--red)' : 'var(--gold)' }}>{profit > 0 ? '+' : ''}{profit}</div>
        <div className="cards">{mySeat!.cards.map((c, i) => <Card key={i} c={c} w={52} />)}</div>
        <div className="list" style={{ marginTop: 14, textAlign: 'left' }}>
          <div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div>
          <div className="line"><strong>Nuovo credito</strong><span>{grp(myBalance)} punti</span></div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn ghost">Prossima mano</button></div>
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  // TURNO / ATTESA
  if (t.phase === 'playing' || t.phase === 'dealer') {
    const myTurn = t.phase === 'playing' && t.activeSeat === mySeatNo && mySeat!.status === 'playing';
    const activeSeat = t.activeSeat != null ? t.seats[String(t.activeSeat)] : null;
    const activeName = activeSeat?.nickname ?? (t.activeSeat != null ? `Posto ${t.activeSeat}` : '—');
    const canDouble = myTurn && mySeat!.cards.length === 2 && !mySeat!.doubled && myBalance >= mySeat!.bet;
    return Phone(myTurn ? 'Il tuo turno' : 'Attesa',
      <section className="panel">
        <h2>{myTurn ? `Totale ${mySeat!.total ?? ''}` : <>Turno di <span style={{ color: 'var(--gold)' }}>{activeName}</span></>}</h2>
        {handPanel}
        <div className="list"><div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div></div>
        {myTurn ? <div className="status center">Tempo per giocare · {fmtTime(turnCd)}</div>
          : mySeat!.status === 'stand' ? <div className="status">Hai scelto STAI · attendi il banco</div>
          : mySeat!.status === 'bust' ? <div className="status lose">Sei sballato</div>
          : mySeat!.status === 'blackjack' ? <div className="status">Blackjack! · attendi la fine della mano</div>
          : <div className="status">Segui la mano sul tavolo.</div>}
        {err && <div className="err">{err}</div>}
        {confirmDbl ? (
          <>
            <div className="list"><div className="line"><strong>Raddoppio</strong><span>{mySeat!.bet} → {mySeat!.bet * 2} punti</span></div></div>
            <div className="status">Riceverai una sola carta.</div>
            <div className="actions"><button className="btn" disabled={busy} onClick={() => act('double')}>Conferma</button><button className="btn ghost" onClick={() => setConfirmDbl(false)}>Annulla</button></div>
          </>
        ) : (
          <div className="actions">
            <button className="btn" disabled={!myTurn || busy} onClick={() => act('hit')}>Carta</button>
            <button className="btn ghost" disabled={!myTurn || busy} onClick={() => act('stand')}>Stai</button>
            <button className="btn ghost" disabled={!canDouble || busy} onClick={() => setConfirmDbl(true)}>Raddoppia</button>
          </div>
        )}
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  // PUNTATA CONFERMATA / CARTE FISICHE — fase betting
  if (mySeat!.status === 'bet') {
    const hybrid = t.mode === 'hybrid';
    return Phone(hybrid ? 'Carte fisiche' : 'Confermata',
      <section className="panel">
        <h2>{hybrid ? 'Dealer umano' : 'Puntata confermata'}</h2>
        <div className="status">{hybrid ? 'La puntata è registrata. Il mazziere distribuisce le carte vere.' : `In attesa della distribuzione${t.betEndsAt ? ` · ${fmtTime(betCd)}` : ''}`}</div>
        <div className="list">
          <div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div>
          <div className="line"><strong>Disponibili</strong><span>{grp(myBalance)} punti</span></div>
        </div>
        {err && <div className="err">{err}</div>}
        {!hybrid && <div className="actions"><button className="btn ghost" disabled={busy} onClick={unbet}>Ritira puntata</button></div>}
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  // SCELTA PUNTATA
  const chips = [10, 20, 50, 100].filter(c => c <= t.maxBet);
  const cur = chip || (mySeat!.bet || Math.max(t.minBet, chips[0] || t.minBet));
  const dec = () => setChip(Math.max(t.minBet, cur - t.step));
  const inc = () => setChip(Math.min(t.maxBet, Math.min(myBalance, cur + t.step)));
  return Phone('Punta',
    <section className="panel">
      <h2>Puntata</h2>
      <div className="step"><button className="rnd" onClick={dec}>−</button><div className="val">{cur}</div><button className="rnd" onClick={inc}>+</button></div>
      <div className="row" style={{ justifyContent: 'center' }}>{chips.map(c => <span key={c} className={`chip${cur === c ? ' sel' : ''}`} onClick={() => setChip(c)}>{c}</span>)}</div>
      {t.betEndsAt && <div className="status center">Tempo rimanente · {fmtTime(betCd)}</div>}
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn" disabled={busy || cur > myBalance} onClick={() => placeBet(cur)}>Conferma puntata</button></div>
    </section>,
    `${grp(myBalance)} punti`
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MONITOR 80" (sola lettura) — palchi fissi 744×407 fedeli ai mockup
   ════════════════════════════════════════════════════════════════════════════ */
function dealerVisibleTotal(d: { cards: BjCard[]; total: number | null; hidden: boolean }): number | null {
  if (!d.hidden) return d.total;
  const up = d.cards[0]; if (!up) return null;
  return up.r === 'A' ? 11 : isNaN(+up.r) ? 10 : +up.r;
}
/* ── Monitor PARTITA (fase playing/dealer) — palco fisso 744×407 fedele al mockup ── */
const MON2_CSS = BJ_FONT + CARD_CSS + `
.bjm2{position:fixed;inset:0;overflow:hidden;background:#02120a;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.bjm2 .stage{position:relative;width:836px;height:470px;flex:none;transform-origin:center center;border-radius:16px;overflow:hidden;
  background:
    radial-gradient(60% 42% at 50% 100%, rgba(255,255,255,.05), transparent 70%),
    radial-gradient(120% 100% at 50% 6%, #0e8a3a 0%, #0a6e2c 34%, #075523 60%, #063f19 82%, #04300f 100%);
  box-shadow:inset 0 0 0 4px #0a2a16, inset 0 0 0 7px #c79a35, inset 0 0 0 9px #0a2a16, inset 0 0 90px #00210d;}
.bjm2 .stage::before{content:"";position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(34% 46% at 100% 0%, rgba(4,20,10,.7),transparent 62%),
  radial-gradient(30% 46% at 0% 100%, rgba(4,20,10,.55),transparent 62%),
  radial-gradient(30% 46% at 100% 100%, rgba(4,20,10,.55),transparent 62%);}
.bjm2 .logo{position:absolute;left:16px;top:34px;height:92px;width:auto;object-fit:contain;filter:drop-shadow(0 2px 6px #000a);z-index:5;}
.bjm2 .arch{position:absolute;left:50%;top:-104px;transform:translateX(-50%);width:430px;height:170px;border-radius:50%;border:2px solid #d9b65d;box-shadow:0 5px 14px #e8c87926,inset 0 -6px 12px #e8c87918;z-index:1;}
.bjm2 .banco{position:absolute;left:50%;top:10px;transform:translateX(-50%);padding:5px 26px;border:2px solid #debb60;border-radius:13px;background:radial-gradient(ellipse at 50% 50%,#083016,#04200c);color:#f5de93;font:700 16px/1 "Baskerville Casino",serif;letter-spacing:.26em;z-index:3;box-shadow:0 0 10px #e8c87955,inset 0 1px 2px #fff3;}
.bjm2 .dtot{position:absolute;left:330px;top:52px;z-index:3;}
.bjm2 .dcards{position:absolute;left:388px;top:40px;display:flex;gap:6px;z-index:2;}
.bjm2 .dback{width:46px;height:65px;border-radius:7px;overflow:hidden;box-shadow:0 3px 8px #000b,inset 0 0 0 1px #0007;border:1px solid #c9a24a;flex:none;}
.bjm2 .dback img{width:100%;height:100%;object-fit:cover;display:block;}
.bjm2 .phone2{position:absolute;right:44px;top:40px;text-align:right;color:#ecd7a0;font:400 15px/1.3 "Baskerville Casino",serif;z-index:5;}
.bjm2 .phicon{position:absolute;right:12px;top:40px;width:25px;height:48px;border:2px solid #e6c268;border-radius:6px;box-shadow:inset 0 0 5px #e8c87944;z-index:5;}
.bjm2 .phicon::after{content:"";position:absolute;left:50%;bottom:4px;transform:translateX(-50%);width:10px;height:2px;border-radius:2px;background:#e6c268;}
.bjm2 .turnbar{position:absolute;left:50%;top:126px;transform:translateX(-50%);padding:7px 30px;border:3px solid #e8cd7a;border-radius:16px;background:linear-gradient(180deg,#05240d,#01160a);box-shadow:0 0 15px #e8c87933,inset 0 0 12px #0009;white-space:nowrap;z-index:3;}
.bjm2 .turnbar span{font:700 27px/1 "Baskerville Casino",serif;letter-spacing:.01em;background:linear-gradient(180deg,#fff4c6,#ffe091 48%,#e4ad4c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 0 #0008);}
.bjm2 .orn{position:absolute;top:130px;z-index:2;color:#e3c173;font:400 30px/1 "Baskerville Casino",serif;opacity:.75;text-shadow:0 1px 2px #000a;}
.bjm2 .orn.l{left:198px;transform:scaleX(-1);}
.bjm2 .orn.r{right:198px;}
.bjm2 .seats2{position:absolute;left:6px;right:6px;top:176px;bottom:10px;display:flex;gap:6px;z-index:4;}
.bjm2 .st{position:relative;flex:1 1 0;border-radius:12px;border:2px solid #356a41;background:linear-gradient(162deg,#0e2c1b,#06160d);box-shadow:inset 0 1px 0 #ffffff12,0 4px 10px #0007;display:flex;flex-direction:column;align-items:center;}
.bjm2 .st.active{border-color:#5de78d;box-shadow:0 0 20px #4ade80cc,inset 0 0 16px #4ade8033;}
.bjm2 .snum{position:absolute;top:-13px;left:50%;transform:translateX(-50%);width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#1d1708,#0b0b07);border:2px solid #e6c268;color:#ffe9a6;display:grid;place-items:center;font:700 13px/1 serif;z-index:3;box-shadow:0 2px 4px #0008;}
.bjm2 .scards2{display:flex;justify-content:center;align-items:flex-end;margin-top:18px;height:70px;}
.bjm2 .stot2{margin-top:-10px;z-index:2;position:relative;}
.bjm2 .sav{margin-top:9px;}
.bjm2 .snm{font:700 16px/1 "Baskerville Casino",serif;color:#fff;margin-top:7px;max-width:94%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bjm2 .smeta{font:400 12px/1.5 "Baskerville Casino",serif;color:#cedbc9;text-align:center;margin-top:3px;}
.bjm2 .smeta b{color:#ffe9a6;font-weight:700;}
`;
function BjPlayStage({ t, turnCd, dim }: { t: BjTbl; turnCd: number; dim: { w: number; h: number } }) {
  const scale = Math.min(dim.w / 836, dim.h / 470);
  const nos = seatOrder(t);
  const up = t.dealer.cards[0];
  const activeName = t.activeSeat != null ? (t.seats[String(t.activeSeat)]?.nickname ?? `Posto ${t.activeSeat}`) : null;
  return (
    <div className="bjm2"><style>{MON2_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
        {/* BANCO: arco oro + pill + carte + totale */}
        <div className="arch" />
        <div className="banco">BANCO</div>
        <div className="dtot"><Total v={dealerVisibleTotal(t.dealer)} size={16} /></div>
        <div className="dcards">
          {up && <Card c={up} w={46} />}
          {t.dealer.hidden
            ? <div className="dback"><img src={`${AB}bj/card-back.png`} alt="" /></div>
            : t.dealer.cards.slice(1).map((c, i) => <Card key={i} c={c} w={46} />)}
        </div>
        {/* smartphone */}
        <div className="phone2">Gioca dal tuo<br />smartphone</div>
        <div className="phicon" />
        {/* turno */}
        <span className="orn l">❧</span>
        <div className="turnbar"><span>{t.phase === 'dealer' || activeName == null ? 'Il banco gioca…' : <>Turno di {activeName} · {fmtTime(turnCd)}</>}</span></div>
        <span className="orn r">❧</span>
        {/* postazioni */}
        <div className="seats2">
          {nos.map(no => {
            const s = t.seats[String(no)]!;
            const active = t.activeSeat === no && t.phase === 'playing';
            return (
              <div key={no} className={`st${active ? ' active' : ''}`}>
                <div className="snum">{no}</div>
                <div className="scards2">
                  {s.cards.length
                    ? s.cards.map((c, i) => <div key={i} style={{ marginLeft: i ? -8 : 0, transform: `rotate(${(i - (s.cards.length - 1) / 2) * 8}deg)`, transformOrigin: 'bottom center' }}><Card c={c} w={34} /></div>)
                    : <Card back w={34} />}
                </div>
                {s.total != null && <div className="stot2"><Total v={s.total} bust={s.status === 'bust'} size={13} /></div>}
                <div className="sav"><Avatar url={s.avatarUrl} name={s.nickname} size={50} /></div>
                <div className="snm">{s.nickname ?? 'Libero'}</div>
                <div className="smeta">Puntata {s.bet || '—'}<br />Credito <b>{String(s.balance ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</b></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Icona gruppo giocatori (oro) ── */
function PeopleIcon() {
  return (
    <svg viewBox="0 0 64 44" width={46} height={34} fill="#efc14c" style={{ flex: 'none' }} xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="12" r="10" />
      <path d="M13 44c0-11 8.5-17 19-17s19 6 19 17z" />
      <circle cx="10" cy="17" r="7.5" />
      <path d="M0 43c0-8 5-13.5 11-13.5 2 0 3.9.6 5.5 1.6C13.2 33.5 10.8 38 10.8 43z" />
      <circle cx="54" cy="17" r="7.5" />
      <path d="M64 43c0-8-5-13.5-11-13.5-2 0-3.9.6-5.5 1.6C50.8 33.5 53.2 38 53.2 43z" />
    </svg>
  );
}
function outcomeBadge(o: string | null): { t: string; cls: string } {
  switch (o) {
    case 'win': return { t: 'VINTO', cls: 'win' };
    case 'blackjack': return { t: 'BLACKJACK', cls: 'win' };
    case 'push': return { t: 'PARI', cls: 'push' };
    default: return { t: 'PERSO', cls: 'lose' };
  }
}

/* ── Monitor ATTESA / PUNTATE (fase waiting/betting) — palco fisso 744×407 fedele al mockup "07 MONITOR ATTESA" ── */
const MON3_CSS = BJ_FONT + CARD_CSS + `
.bjm3{position:fixed;inset:0;overflow:hidden;background:#02120a;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.bjm3 .stage{position:relative;width:836px;height:470px;flex:none;transform-origin:center center;border-radius:16px;overflow:hidden;
  background:
    radial-gradient(60% 42% at 50% 100%, rgba(255,255,255,.05), transparent 70%),
    radial-gradient(120% 100% at 50% 6%, #0e8a3a 0%, #0a6e2c 34%, #075523 60%, #063f19 82%, #04300f 100%);
  box-shadow:inset 0 0 0 4px #0a2a16, inset 0 0 0 7px #c79a35, inset 0 0 0 9px #0a2a16, inset 0 0 90px #00210d;}
.bjm3 .stage::before{content:"";position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(34% 46% at 100% 0%, rgba(4,20,10,.75) 0%, rgba(4,18,9,0) 62%),
  radial-gradient(30% 46% at 0% 100%, rgba(4,20,10,.6) 0%, rgba(4,18,9,0) 62%),
  radial-gradient(30% 46% at 100% 100%, rgba(4,20,10,.6) 0%, rgba(4,18,9,0) 62%);}
.bjm3 .logo{position:absolute;left:16px;top:40px;height:104px;width:auto;object-fit:contain;filter:drop-shadow(0 2px 6px #000a);z-index:5;}
.bjm3 .title{position:absolute;left:180px;right:92px;top:52px;text-align:center;z-index:5;
  font:700 62px/1 "Baskerville Casino",serif;letter-spacing:.01em;
  background:linear-gradient(180deg,#fff7d0 0%,#ffe690 36%,#eab44f 66%,#c6861f 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1px #6a4a16;
  text-shadow:0 1px 0 #7a551b,0 2px 0 #553912,0 4px 6px #000b;}
.bjm3 .orn{position:absolute;top:70px;z-index:6;color:#e3c173;font:400 34px/1 "Baskerville Casino",serif;opacity:.8;text-shadow:0 1px 2px #000a;}
.bjm3 .orn.l{left:228px;transform:scaleX(-1);}
.bjm3 .orn.r{right:110px;}
.bjm3 .qrbox{position:absolute;left:108px;top:176px;width:150px;height:150px;background:#fff;border-radius:10px;padding:9px;box-sizing:border-box;z-index:5;box-shadow:0 3px 10px #0009,0 0 0 2px #debb60;}
.bjm3 .qrbox svg{display:block;width:100%;height:100%;}
.bjm3 .scan{position:absolute;left:276px;top:186px;width:190px;z-index:5;color:#f4ead3;font:700 24px/1.28 "Baskerville Casino",serif;}
.bjm3 .codelbl{position:absolute;left:276px;top:292px;width:190px;text-align:center;z-index:5;color:#e8c879;font:400 13px/1 "Baskerville Casino",serif;letter-spacing:.2em;}
.bjm3 .codepill{position:absolute;left:300px;top:308px;width:142px;text-align:center;padding:8px 0;z-index:5;border:2px solid #debb60;border-radius:12px;background:radial-gradient(ellipse at 50% 50%,#083016,#04200c);color:#ffe9a6;font:700 28px/1 "Baskerville Casino",serif;letter-spacing:.1em;box-shadow:0 0 12px #e8c87944,inset 0 1px 3px #fff3;}
.bjm3 .tavolo{position:absolute;left:556px;top:174px;width:220px;box-sizing:border-box;text-align:center;padding:11px 10px;z-index:5;border:3px solid #e8cd7a;border-radius:15px;background:radial-gradient(ellipse at 50% 50%,#06330f,#02220c);color:#ffe7ac;font:700 28px/1 "Baskerville Casino",serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px #000a;box-shadow:0 0 16px #e8c87933,inset 0 0 12px #0009;}
.bjm3 .ginfo{position:absolute;left:556px;top:232px;width:220px;text-align:center;z-index:5;}
.bjm3 .ginfo .cnt{display:inline-flex;align-items:center;gap:12px;color:#ffe3a0;font:700 34px/1 "Baskerville Casino",serif;}
.bjm3 .ginfo .lb{color:#e8c879;font:400 16px/1 "Baskerville Casino",serif;margin-top:3px;}
.bjm3 .ginfo svg{width:40px;height:40px;fill:#e8c879;}
.bjm3 .status{position:absolute;left:548px;top:304px;width:236px;box-sizing:border-box;text-align:center;padding:11px 0;z-index:5;border:3px solid #52e08a;border-radius:15px;background:linear-gradient(180deg,#05270e,#01160a);color:#eafff0;font:700 26px/1 "Baskerville Casino",serif;box-shadow:0 0 18px #52e08a66,inset 0 0 12px #0009;}
.bjm3 .status.wait{border-color:#e0b24a;color:#ffe3a0;box-shadow:0 0 18px #e0b24a55,inset 0 0 12px #0009;}
.bjm3 .seats{position:absolute;left:12px;right:12px;bottom:10px;height:112px;display:flex;gap:6px;z-index:5;}
.bjm3 .seat{position:relative;flex:1 1 0;border-radius:13px;border:2px solid #7c6632;background:linear-gradient(162deg,#0f2e1c,#06160d);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:15px;box-shadow:inset 0 1px 0 #ffffff12,inset 0 0 0 1px #4a3c1a;}
.bjm3 .seat.free{border-color:#55492a;}
.bjm3 .snum{position:absolute;top:-11px;left:50%;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#1d1708,#0b0b07);border:2px solid #e6c268;color:#ffe9a6;display:grid;place-items:center;font:700 13px/1 serif;z-index:2;box-shadow:0 2px 4px #0008;}
.bjm3 .avr{width:56px;height:56px;border-radius:50%;border:2px solid #d9b85a;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#163a26,#07160e);}
.bjm3 .avr.free{border-color:#4e5a50;}
.bjm3 .seat .nm{font:700 17px/1 "Baskerville Casino",serif;color:#fff;margin-top:8px;max-width:96%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bjm3 .seat .cr{font:700 15px/1 "Baskerville Casino",serif;color:#ffe9a6;margin-top:4px;}
.bjm3 .seat .lib{font:400 16px/1 "Baskerville Casino",serif;color:#86b596;margin-top:13px;}
`;
function BjWaitStage({ t, dim, playUrl }: { t: BjTbl; dim: { w: number; h: number }; playUrl: string }) {
  const scale = Math.min(dim.w / 836, dim.h / 470);
  const nos = seatOrder(t);
  const occupied = nos.filter(no => t.seats[String(no)]?.playerId).length;
  const betting = t.phase === 'betting';
  return (
    <div className="bjm3"><style>{MON3_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
        <span className="orn l">❧</span>
        <div className="title">BLACKJACK</div>
        <span className="orn r">❧</span>
        <div className="qrbox"><QRCodeSVG value={playUrl} size={132} /></div>
        <div className="scan">Scansiona<br />e gioca dal<br />tuo telefono</div>
        <div className="codelbl">CODICE TAVOLO</div>
        <div className="codepill">{t.displayCode}</div>
        <div className="tavolo">{t.name}</div>
        <div className="ginfo"><span className="cnt"><PeopleIcon /> {occupied} / {nos.length}</span><div className="lb">giocatori</div></div>
        {/* La pillola di stato resta solo in modalità ibrida (lì non c'è il tasto touch che la direbbe già). */}
        {t.mode === 'hybrid' && <div className={`status${betting ? '' : ' wait'}`}>{betting ? '🃏 Carte fisiche · punta dal telefono' : '🃏 Il mazziere distribuisce'}</div>}
        <BjTouchBar t={t} />
        <div className="seats">
          {nos.map(no => {
            const s = t.seats[String(no)]!;
            if (!s.playerId) return <div key={no} className="seat free"><div className="snum">{no}</div><div className="avr free"><Avatar size={52} /></div><div className="lib">Libero</div></div>;
            return (
              <div key={no} className="seat"><div className="snum">{no}</div>
                <div className="avr"><Avatar url={s.avatarUrl} name={s.nickname} size={52} /></div>
                <div className="nm">{s.nickname}</div>
                <div className="cr">{String(s.balance ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Monitor RISULTATI (fase result) — palco fisso 744×407 fedele al mockup "17 MONITOR RISULTATI" ── */
const MON4_CSS = BJ_FONT + CARD_CSS + `
.bjm4{position:fixed;inset:0;overflow:hidden;background:#02120a;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.bjm4 .stage{position:relative;width:744px;height:407px;flex:none;transform-origin:center center;border-radius:18px;overflow:hidden;
  background:
    radial-gradient(ellipse 66% 46% at 50% -4%,#020a05 0%,#04140a 36%,rgba(5,24,12,0) 62%),
    radial-gradient(ellipse 122% 86% at 50% 52%,#0b7330 0%,#065a22 38%,#033d15 68%,#01240b 100%);
  box-shadow:inset 0 0 0 3px #0a2a16,inset 0 0 0 7px #bd922f,inset 0 0 0 9px #0a2a16,inset 0 0 80px #000a;}
.bjm4 .logo{position:absolute;right:8px;top:4px;width:150px;height:80px;object-fit:fill;filter:drop-shadow(0 2px 6px #000a);}
.bjm4 .banner{position:absolute;left:50%;top:5px;transform:translateX(-50%);padding:6px 32px;border:3px solid #e8cd7a;border-radius:14px;background:radial-gradient(ellipse at 50% 50%,#06330f,#02220c);white-space:nowrap;box-shadow:0 0 14px #e8c87955,inset 0 0 10px #0009;z-index:3;}
.bjm4 .banner span{font:700 30px/1 "Baskerville Casino",serif;background:linear-gradient(180deg,#fff4c6,#ffe091 48%,#e4ad4c);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:.02em;}
.bjm4 .bancolab{position:absolute;left:0;right:0;top:55px;text-align:center;color:#eed9a0;font:400 15px/1 "Baskerville Casino",serif;letter-spacing:.28em;}
.bjm4 .bancorow{position:absolute;left:252px;top:76px;display:flex;align-items:center;gap:14px;z-index:2;}
.bjm4 .bancorow .bcards{display:flex;gap:4px;}
.bjm4 .seats4{position:absolute;left:4px;right:4px;top:150px;display:flex;gap:5px;}
.bjm4 .rs{position:relative;flex:1 1 0;height:216px;border-radius:12px;border:2px solid #356a41;background:linear-gradient(162deg,#0e2c1b,#06160d);box-shadow:inset 0 1px 0 #ffffff12,0 4px 10px #0007;display:flex;flex-direction:column;align-items:center;}
.bjm4 .rscards{display:flex;justify-content:center;align-items:flex-end;gap:3px;margin-top:15px;height:54px;}
.bjm4 .rstot{margin-top:-5px;position:relative;z-index:2;}
.bjm4 .rsav{margin-top:7px;}
.bjm4 .rsnm{font:700 15px/1 "Baskerville Casino",serif;color:#fff;margin-top:6px;}
.bjm4 .rsout{margin-top:7px;width:84%;text-align:center;padding:5px 0 6px;border-radius:9px;font:700 14px/1 "Baskerville Casino",serif;letter-spacing:.04em;}
.bjm4 .rsout .amt{display:block;font:700 18px/1 "Baskerville Casino",serif;margin-top:3px;}
.bjm4 .rsout.win{background:linear-gradient(180deg,#0e4a24,#07381a);border:1px solid #2f8a4e;color:#86f2aa;}
.bjm4 .rsout.lose{background:linear-gradient(180deg,#4a1010,#380b0b);border:1px solid #8a2f2f;color:#ff9b9b;}
.bjm4 .rsout.push{background:linear-gradient(180deg,#43430f,#2a2a0c);border:1px solid #8a7a2f;color:#ffe08a;}
.bjm4 .nextpill{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);padding:7px 36px;border:3px solid #e8cd7a;border-radius:16px;background:radial-gradient(ellipse at 50% 50%,#06330f,#02220c);color:#ffe9a6;font:700 20px/1 "Baskerville Casino",serif;white-space:nowrap;box-shadow:0 0 12px #e8c87944,inset 0 0 10px #0009;}
`;
function BjResultStage({ t, dim }: { t: BjTbl; dim: { w: number; h: number } }) {
  const scale = Math.min(dim.w / 744, dim.h / 407);
  const nos = seatOrder(t);
  return (
    <div className="bjm4"><style>{MON4_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
        <div className="banner"><span>Mano {String(t.round).padStart(3, '0')} · Banco {t.dealer.total ?? '—'}</span></div>
        <div className="bancolab">BANCO</div>
        <div className="bancorow">
          <Total v={t.dealer.total} size={18} />
          <div className="bcards">{t.dealer.cards.map((c, i) => <Card key={i} c={c} w={50} />)}</div>
        </div>
        <div className="seats4">
          {nos.map(no => {
            const s = t.seats[String(no)]!;
            if (!s.playerId) return <div key={no} className="rs"><div className="rscards"><Card back w={34} /></div><div className="rsav" style={{ marginTop: 20 }}><Avatar size={44} /></div><div className="rsnm">Libero</div></div>;
            const o = outcomeBadge(s.outcome);
            return (
              <div key={no} className="rs">
                <div className="rscards">{s.cards.length ? s.cards.map((c, i) => <Card key={i} c={c} w={34} />) : <Card back w={34} />}</div>
                {s.total != null && <div className="rstot"><Total v={s.total} bust={s.status === 'bust'} size={13} /></div>}
                <div className="rsav"><Avatar url={s.avatarUrl} name={s.nickname} size={44} /></div>
                <div className="rsnm">{s.nickname ?? '—'}</div>
                <div className={`rsout ${o.cls}`}>{o.t}<span className="amt">{s.profit > 0 ? '+' : ''}{s.profit}</span></div>
              </div>
            );
          })}
        </div>
        <div className="nextpill">La prossima mano inizierà a breve</div>
        <BjTouchBar t={t} />
      </div>
    </div>
  );
}

/* ── Barra comandi TOUCH del monitor 80″ — pilota il tavolo col dito, niente regia ──
   Attesa → "Apri puntate"; Puntate → "Distribuisci"; Risultati → "Nuova mano".
   In gioco il banco gioca da solo (nessun tasto). Overlay fisso, non scala col palco. */
function BjTouchBar({ t }: { t: BjTbl }) {
  const [busy, setBusy] = useState(false);
  const run = async (path: string) => { setBusy(true); try { await api(path, { displayCode: t.displayCode }); } finally { setBusy(false); } };
  if (t.mode === 'hybrid') return null; // carte fisiche: comanda il mazziere dal telefono
  let label = '', path = '';
  if (t.phase === 'waiting') { label = '▶ APRI PUNTATE'; path = '/gestione/casino/bj/open'; }
  else if (t.phase === 'betting') { label = '🂠 DISTRIBUISCI'; path = '/gestione/casino/bj/deal'; }
  else if (t.phase === 'result') { label = '↻ NUOVA MANO'; path = '/gestione/casino/bj/open'; }
  else return null; // playing/dealer: automatico
  const canAct = !(t.suspended && t.phase !== 'betting'); // su tavolo sospeso non si riapre
  // Dentro il palco (scala col resto): a destra, SOPRA il rail delle facce — non copre né facce né QR.
  return (
    <div style={{ position: 'absolute', right: 20, bottom: 132, zIndex: 20 }}>
      <button onClick={() => run(path)} disabled={busy || !canAct}
        style={{ minWidth: 264, padding: '16px 26px', borderRadius: 16, border: 'none', cursor: 'pointer',
          fontFamily: '"Baskerville Casino",Georgia,serif', fontWeight: 800, fontSize: 25, color: '#231503', whiteSpace: 'nowrap',
          background: 'linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34)', boxShadow: '0 6px 0 #7a4d12',
          opacity: busy || !canAct ? 0.5 : 1, touchAction: 'manipulation' }}>
        {t.suspended && t.phase !== 'betting' ? '⏸ Tavolo sospeso' : label}
      </button>
    </div>
  );
}

export function BlackjackMonitor({ displayCode }: { displayCode: string }) {
  useTableMusic('casino', 'lobby_loop');
  const st = useBjTable(displayCode, 900);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  // auto-progressione: alla scadenza puntate distribuisce; forza timeout turni; dopo risultato riapre
  const lastAuto = useRef(0);
  useEffect(() => {
    const t = st?.table; if (!t) return;
    const now = Date.now();
    if (t.mode !== 'hybrid' && t.phase === 'betting' && t.betEndsAt && now > Date.parse(t.betEndsAt) && Object.values(t.seats).some(s => s.bet > 0) && now - lastAuto.current > 1500) { lastAuto.current = now; api('/gestione/casino/bj/deal', { displayCode }); }
    if (t.phase === 'playing' && t.turnEndsAt && now > Date.parse(t.turnEndsAt) + 1200 && t.activeSeat != null && now - lastAuto.current > 1500) { lastAuto.current = now; fetch(`${API}/gestione/casino/bj/${displayCode}`); }
  }, [st, displayCode]);
  const turnCd = useCountdown(st?.table.phase === 'playing' ? st.table.turnEndsAt : null);
  if (!st) return <div className="bjm3"><style>{MON3_CSS}</style><div style={{ color: '#9fe0b4', fontSize: 24 }}>Carico il tavolo…</div></div>;
  const t = st.table;
  const playUrl = `${ORIGIN}gestione/casino?bjplay=${t.displayCode}`;

  // Fase di gioco: palco fisso 744×407 fedele al mockup "08 MONITOR PARTITA"
  const stage = (t.phase === 'playing' || t.phase === 'dealer') ? <BjPlayStage t={t} turnCd={turnCd} dim={dim} />
    : t.phase === 'result' ? <BjResultStage t={t} dim={dim} />      // Risultati "17 MONITOR RISULTATI"
      : <BjWaitStage t={t} dim={dim} playUrl={playUrl} />;           // Attesa/puntate "07 MONITOR ATTESA"
  // La barra comandi touch ora vive DENTRO ogni palco (scala col resto, non copre le facce).
  return stage;
}

/* ════════════════════════════════════════════════════════════════════════════
   REGIA (per tavolo) — canvas fisso 1600×900
   ════════════════════════════════════════════════════════════════════════════ */
const REGIA_CSS = BJ_FONT + CARD_CSS + `
.bjr{position:fixed;inset:0;overflow:auto;background:#06110e;display:flex;align-items:flex-start;justify-content:center;color:#fcf1d7;font-family:"Baskerville Casino",Georgia,serif;}
.bjr .stage{position:relative;width:1600px;height:900px;flex:none;transform-origin:top center;background:radial-gradient(ellipse 120% 90% at 50% 10%,#17402e,#0e2a1f 55%,#06110e);box-shadow:inset 0 0 0 8px #0a1a14,inset 0 0 0 11px #625334;padding:26px;box-sizing:border-box;}
.bjr .logo{position:absolute;right:30px;top:20px;height:120px;}
.bjr .title{font:700 44px/1 "Cinzel Cas","Baskerville Casino",serif;color:#e5c680;letter-spacing:.01em;}
.bjr .pill{display:inline-flex;align-items:center;gap:10px;margin-top:12px;padding:10px 24px;border-radius:999px;border:1px solid #82d5aa;color:#82d5aa;font-size:22px;box-shadow:0 0 16px #82d5aa33;}
.bjr .pill.closed{border-color:#e5c680;color:#e5c680;box-shadow:0 0 16px #e5c68033;}
.bjr .code{position:absolute;right:30px;top:150px;color:#bac9b9;font-size:20px;}
.bjr .panel{position:absolute;border-radius:14px;background:linear-gradient(160deg,#10251d,#0a1a14);border:1px solid #625334;box-shadow:inset 0 0 0 1px rgba(229,198,128,.08);padding:16px;box-sizing:border-box;}
.bjr table{width:100%;border-collapse:collapse;font-size:19px;}
.bjr th{color:#e5c680;text-align:left;font-weight:700;padding:8px 10px;border-bottom:1px solid #2f5a3a;}
.bjr td{padding:8px 10px;border-bottom:1px solid #16331f;}
.bjr .dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;}
.bjr .set{display:flex;align-items:center;justify-content:space-between;margin:10px 0;}
.bjr .set input,.bjr .set select{width:120px;padding:8px;border-radius:8px;border:1px solid #625334;background:#0a1a14;color:#e5c680;font:700 16px serif;text-align:center;}
.bjr .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid #efd9a0;background:linear-gradient(180deg,#efd9a0,#e5c680 52%,#caa44f);color:#2a2008;font:700 22px/1 "Cinzel Cas","Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #5a4a1c,inset 0 1px 0 #fff8;}
.bjr .gbtn:disabled{opacity:.5;}
.bjr .foot{position:absolute;left:26px;right:26px;bottom:24px;display:flex;gap:16px;}
.bjr .fbtn{flex:1;padding:14px;border-radius:12px;border:1px solid #625334;background:#0a1a14;color:#e5c680;font:700 20px serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;}
.bjr .res.win{color:#82d5aa;font-weight:700;}
.bjr .res.lose{color:#ff9a92;font-weight:700;}
.bjr .res.push{color:#e5c680;font-weight:700;}
.bjr .mini{display:inline-flex;gap:3px;vertical-align:middle;}
`;
export function BlackjackRegia({ displayCode }: { displayCode: string }) {
  const st = useBjTable(displayCode, 1200);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const [busy, setBusy] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showDealer, setShowDealer] = useState(false);
  const [dealerCode, setDealerCode] = useState<string | null>(null);
  const call = async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setBusy(false); } };
  const bindDealer = async (assign: boolean) => {
    const sid = st?.sessionId, tid = st?.table.id;
    if (!sid || !tid) return; setBusy(true);
    try { const r = await api(`/gestione/casino/sessions/${sid}/bj-tables/${tid}/dealer`, { assign }); setDealerCode(assign ? (r?.dealerCode ?? null) : null); } finally { setBusy(false); }
  };
  const exportHist = () => {
    const t = st?.table; if (!t) return;
    const rows = [['mano', 'ora', 'banco', 'posto', 'giocatore', 'puntata', 'totale', 'esito', 'profitto']];
    for (const h of t.history) for (const r of h.results) rows.push([String(h.hand), new Date(h.at).toLocaleString('it-IT'), String(h.dealerTotal), String(r.seatNo), r.nickname, String(r.bet), String(r.total), r.outcome, String(r.profit)]);
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `blackjack-${t.displayCode}-mani.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (!st) return <div className="bjr"><style>{REGIA_CSS}</style><div style={{ color: '#9fe0b4', fontSize: 26 }}>Carico…</div></div>;
  const t = st.table;
  const scale = Math.min(dim.w / 1600, Math.max(0.4, dim.h / 900));
  const nos = seatOrder(t);
  const phaseLabel = t.phase === 'betting' ? 'Puntate aperte' : t.phase === 'result' ? 'Mano completata' : t.phase === 'waiting' ? 'In attesa' : 'Mano in corso';
  const closed = t.phase !== 'betting';
  const lastHist = t.history[0];

  const primary = () => {
    if (t.mode === 'hybrid') return <div className="gbtn" style={{ textAlign: 'center', background: 'linear-gradient(160deg,#0d2a19,#061710)', color: '#9fe0b4', border: '2px solid #c6992f', cursor: 'default' }}>🃏 Carte fisiche · comanda il mazziere dal suo telefono</div>;
    if (t.phase === 'betting') return <button className="gbtn" disabled={busy} onClick={() => call('/gestione/casino/bj/deal', {})}>🂠 Chiudi puntate e distribuisci</button>;
    if (t.phase === 'playing' || t.phase === 'dealer') return <button className="gbtn" disabled>Mano in corso…</button>;
    return <button className="gbtn" disabled={busy || t.suspended} onClick={() => call('/gestione/casino/bj/open', {})}>▸ {t.phase === 'result' ? 'Nuova mano' : 'Apri puntate'}</button>;
  };

  return (
    <div className="bjr"><style>{REGIA_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="" />
        <div className="title">{t.phase === 'result' ? `Mano ${String(t.round).padStart(3, '0')} · Completata` : 'Regia Blackjack'}</div>
        <div><span className={`pill${closed ? ' closed' : ''}`}>● {phaseLabel}</span></div>
        <div className="code">{t.name} · Codice: <b style={{ color: '#ffe9a6' }}>{t.displayCode}</b></div>

        {t.phase === 'result' && lastHist ? (
          /* 10 — RISULTATI */
          <div className="panel" style={{ left: 26, top: 200, right: 26, bottom: 96 }}>
            <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 22, color: '#ffe9a6' }}>Banco: <b>{lastHist.dealerTotal}</b> <span className="mini">{lastHist.dealerCards.map((c, i) => <Card key={i} c={c} w={30} />)}</span></div>
            <table><thead><tr><th>#</th><th>Giocatore</th><th>Puntata</th><th>Mano</th><th>Totale</th><th>Esito</th><th>Profitto</th></tr></thead>
              <tbody>{lastHist.results.map(r => { const o = outcomeShort(r.outcome); return (
                <tr key={r.seatNo}><td>{r.seatNo}</td><td>{r.nickname}</td><td>{r.bet}</td>
                  <td><span className="mini">{(t.seats[String(r.seatNo)]?.cards ?? []).map((c, i) => <Card key={i} c={c} w={26} />)}</span></td>
                  <td>{r.total}</td><td className={`res ${o.cls}`}>{o.t}</td><td className={`res ${o.cls}`}>{r.profit > 0 ? '+' : ''}{r.profit}</td></tr>
              ); })}</tbody>
            </table>
          </div>
        ) : (
          <>
            {/* 09 — giocatori */}
            <div className="panel" style={{ left: 26, top: 200, width: 740, bottom: 96 }}>
              <table><thead><tr><th>#</th><th>Giocatore</th><th>Credito</th><th>Stato</th></tr></thead>
                <tbody>{nos.map(no => { const s = t.seats[String(no)]!; return (
                  <tr key={no}><td>{no}</td><td>{s.nickname ?? '—'}</td><td>{s.balance != null ? s.balance.toLocaleString('it-IT') : '-'}</td>
                    <td><span className="dot" style={{ background: s.playerId ? '#4ade80' : '#555' }} />{s.playerId ? (s.bet > 0 ? `Puntata ${s.bet}` : 'Connesso') : 'Libero'}</td></tr>
                ); })}</tbody>
              </table>
            </div>
            {/* impostazioni */}
            <div className="panel" style={{ right: 26, top: 200, width: 760, bottom: 96 }}>
              <div style={{ color: '#ffe9a6', fontSize: 24, marginBottom: 12 }}>⚙ Impostazioni tavolo</div>
              <Setting label="Min puntata" value={t.minBet} step={5} disabled={closed || busy} onChange={v => call('/gestione/casino/bj/settings', { minBet: v })} />
              <Setting label="Max puntata" value={t.maxBet} step={50} disabled={closed || busy} onChange={v => call('/gestione/casino/bj/settings', { maxBet: v })} />
              <Setting label="Timeout turno (s)" value={t.timeout} step={5} disabled={busy} onChange={v => call('/gestione/casino/bj/settings', { timeout: v })} />
              <div className="set"><span>Banco sta su</span><select value={t.soft17Hit ? 'h' : 's'} disabled={closed || busy} onChange={e => call('/gestione/casino/bj/settings', { soft17Hit: e.target.value === 'h' })}><option value="s">Soft 17 (sta)</option><option value="h">Soft 17 (pesca)</option></select></div>
              <div style={{ marginTop: 20 }}>{primary()}</div>
            </div>
          </>
        )}

        <div className="foot">
          {t.phase === 'result' ? (
            <>
              <button className="fbtn" style={{ background: 'linear-gradient(180deg,#ffe694,#eab74a)', color: '#231503', borderColor: '#f3dea0' }} disabled={busy || t.suspended} onClick={() => call('/gestione/casino/bj/open', {})}>↻ Nuova mano</button>
              <button className="fbtn" onClick={() => window.open(`${ORIGIN}gestione/casino?bj=${t.displayCode}`, '_blank')}>🖥 Monitor</button>
              <button className="fbtn" onClick={() => setShowHist(true)}>≡ Storico mani</button>
              <button className="fbtn" onClick={exportHist}>⬇ Esporta</button>
            </>
          ) : (
            <>
              <button className="fbtn" onClick={() => window.open(`${ORIGIN}gestione/casino?bj=${t.displayCode}`, '_blank')}>🖥 Apri monitor</button>
              <button className="fbtn" onClick={() => setShowQr(true)}>🔳 Mostra QR</button>
              <button className="fbtn" style={{ borderColor: t.hasDealer ? '#4ade80' : '#b98b38', color: t.hasDealer ? '#9fe0b4' : '#ffe9a6' }} onClick={() => setShowDealer(true)}>👔 Mazziere{t.hasDealer ? ' ✓' : ''}</button>
              <button className="fbtn" onClick={() => setShowHist(true)}>≡ Storico mani</button>
              <button className="fbtn" style={{ borderColor: t.suspended ? '#4ade80' : '#8a2f2f', color: t.suspended ? '#9fe0b4' : '#ff9b9b' }} disabled={busy} onClick={() => call('/gestione/casino/bj/suspend', { suspended: !t.suspended })}>{t.suspended ? '▶ Riattiva' : '⏸ Sospendi'}</button>
            </>
          )}
        </div>

        {showQr && (
          <div style={{ position: 'absolute', inset: 0, background: '#000b', display: 'grid', placeItems: 'center' }} onClick={() => setShowQr(false)}>
            <div className="panel" style={{ textAlign: 'center', padding: 28 }} onClick={e => e.stopPropagation()}>
              <div style={{ background: '#fff', padding: 18, borderRadius: 12, display: 'inline-block' }}><QRCodeSVG value={`${ORIGIN}gestione/casino?bjplay=${t.displayCode}`} size={300} /></div>
              <div style={{ color: '#ffe9a6', marginTop: 14, fontSize: 24 }}>Scansiona e gioca dal telefono</div>
              <div style={{ color: '#cbd8c9', fontSize: 20, marginTop: 4 }}>Codice tavolo: <b style={{ color: '#ffe9a6' }}>{t.displayCode}</b></div>
            </div>
          </div>
        )}

        {showDealer && (
          <div style={{ position: 'absolute', inset: 0, background: '#000b', display: 'grid', placeItems: 'center' }} onClick={() => setShowDealer(false)}>
            <div className="panel" style={{ width: 620, textAlign: 'center', padding: 28 }} onClick={e => e.stopPropagation()}>
              <div style={{ color: '#ffe9a6', fontSize: 28, marginBottom: 6 }}>👔 Mazziere al tavolo</div>
              {!t.hasDealer && !dealerCode ? (
                <>
                  <div style={{ color: '#cbd8c9', fontSize: 19, margin: '8px 24px 18px', lineHeight: 1.4 }}>Lega un mazziere: comanda il tavolo dal suo telefono. Può giocare col <b style={{ color: '#ffe9a6' }}>mazzo digitale</b> o con <b style={{ color: '#ffe9a6' }}>carte fisiche</b> (segna lui gli esiti e paga).</div>
                  <button className="gbtn" disabled={busy} onClick={() => bindDealer(true)}>👤 Assegna un mazziere</button>
                </>
              ) : (
                <>
                  {dealerCode ? (
                    <>
                      <div style={{ background: '#fff', padding: 18, borderRadius: 12, display: 'inline-block' }}><QRCodeSVG value={`${ORIGIN}gestione/casino?bjdealer=${dealerCode}`} size={260} /></div>
                      <div style={{ color: '#ffe9a6', marginTop: 14, fontSize: 22 }}>Telefono del mazziere</div>
                      <div style={{ color: '#cbd8c9', fontSize: 18, marginTop: 4 }}>Inquadra il QR col telefono del mazziere</div>
                    </>
                  ) : (
                    <div style={{ color: '#9fe0b4', fontSize: 20, margin: '18px 0' }}>Mazziere legato ✓<br /><span style={{ color: '#cbd8c9', fontSize: 16 }}>premi "Mostra QR mazziere" per rivederne il link</span></div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                    {!dealerCode && <button className="fbtn" disabled={busy} onClick={() => bindDealer(true)}>🔳 Mostra QR mazziere</button>}
                    <button className="fbtn" style={{ borderColor: '#8a2f2f', color: '#ff9b9b' }} disabled={busy} onClick={() => { bindDealer(false); }}>✕ Slega mazziere</button>
                  </div>
                </>
              )}
              <div><button className="fbtn" style={{ marginTop: 16 }} onClick={() => setShowDealer(false)}>Chiudi</button></div>
            </div>
          </div>
        )}

        {showHist && (
          <div style={{ position: 'absolute', inset: 0, background: '#000a', display: 'grid', placeItems: 'center' }} onClick={() => setShowHist(false)}>
            <div className="panel" style={{ width: 1100, maxHeight: 760, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ color: '#ffe9a6', fontSize: 26, marginBottom: 10 }}>Storico mani</div>
              <table><thead><tr><th>Mano</th><th>Ora</th><th>Banco</th><th>Esiti</th></tr></thead>
                <tbody>{t.history.map(h => (
                  <tr key={h.hand + h.at}><td>{String(h.hand).padStart(3, '0')}</td><td>{new Date(h.at).toLocaleTimeString('it-IT')}</td><td>{h.dealerTotal}</td>
                    <td>{h.results.map(r => `${r.nickname} ${r.profit > 0 ? '+' : ''}${r.profit}`).join(' · ')}</td></tr>
                ))}{t.history.length === 0 && <tr><td colSpan={4} style={{ color: '#9fe0b4' }}>Nessuna mano ancora.</td></tr>}</tbody>
              </table>
              <button className="gbtn" style={{ marginTop: 14 }} onClick={() => setShowHist(false)}>Chiudi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Setting({ label, value, step, disabled, onChange }: { label: string; value: number; step: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div className="set"><span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="fbtn" style={{ padding: '6px 14px', flex: 'none' }} disabled={disabled} onClick={() => onChange(Math.max(step, value - step))}>−</button>
        <b style={{ color: '#ffe9a6', minWidth: 60, textAlign: 'center' }}>{value}</b>
        <button className="fbtn" style={{ padding: '6px 14px', flex: 'none' }} disabled={disabled} onClick={() => onChange(value + step)}>+</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAZZIERE — ?bjdealer=DEALERCODE  (telefono del mazziere, carte FISICHE)
   Specchio del 7½: toggle Digitale/Carte fisiche, apre la mano, segna l'esito di
   ogni giocatore (Vince 1:1 / BJ 3:2 / Pari / Perde) e paga; +/− fish a mano.
   ════════════════════════════════════════════════════════════════════════════ */
const BJ_DEALER_CSS = BJ_FONT + `
.bjd{position:fixed;inset:0;overflow:auto;background:radial-gradient(ellipse at 50% 0%,#17402e,#06110e 70%);color:#fcf1d7;font-family:"Baskerville Casino",Georgia,serif;}
.bjd .wrap{max-width:540px;margin:0 auto;padding:14px 14px 40px;}
.bjd h1{font:700 22px/1.1 "Cinzel Cas","Baskerville Casino",serif;color:#e5c680;text-align:center;margin:6px 0 2px;}
.bjd .sub{text-align:center;color:#bac9b9;font-size:13px;margin-bottom:12px;}
.bjd .modebar{display:flex;gap:8px;margin-bottom:12px;}
.bjd .modebar button{flex:1;padding:11px;border-radius:12px;border:1px solid #625334;background:#10251d;color:#bac9b9;font:700 14px/1.2 "Baskerville Casino",serif;cursor:pointer;}
.bjd .modebar button.on{background:linear-gradient(180deg,#efd9a0,#e5c680 52%,#caa44f);color:#2a2008;border-color:#efd9a0;}
.bjd .gbtn{display:block;width:100%;box-sizing:border-box;padding:15px;border-radius:13px;border:1px solid #efd9a0;background:linear-gradient(180deg,#efd9a0,#e5c680 52%,#caa44f);color:#2a2008;font:700 18px/1 "Cinzel Cas","Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #5a4a1c,0 6px 14px #0007;margin-bottom:12px;}
.bjd .gbtn.pay{background:linear-gradient(180deg,#9fe8c0,#82d5aa 52%,#4fae82);color:#07240f;border-color:#9fe8c0;box-shadow:0 3px 0 #0a5a28,0 6px 14px #0007;}
.bjd .gbtn:disabled{opacity:.5;cursor:default;}
.bjd .card{background:linear-gradient(160deg,#10251d,#0a1a14);border:1px solid #625334;border-radius:16px;padding:14px;margin-bottom:12px;}
.bjd .hint{color:#82d5aa;font-size:12px;text-align:center;margin:2px 0 10px;}
.bjd .plist{display:flex;flex-direction:column;gap:10px;}
.bjd .pl{display:flex;align-items:center;gap:11px;background:linear-gradient(160deg,#10251d,#0a1a14);border:1px solid #625334;border-radius:14px;padding:10px 12px;}
.bjd .pl .nm{font:700 16px/1.1 "Baskerville Casino",serif;color:#fcf1d7;}
.bjd .pl .bal{color:#bac9b9;font-size:12px;}
.bjd .pl .mid{flex:1;min-width:0;}
.bjd .pl .bet{display:inline-flex;align-items:center;gap:5px;color:#e5c680;font:700 15px/1 "Baskerville Casino",serif;background:#0a1a14;border:1px solid #625334;border-radius:999px;padding:3px 10px;margin-top:3px;}
.bjd .ob{display:grid;grid-template-columns:1fr 1fr;gap:5px;min-width:150px;}
.bjd .ob button{padding:7px 4px;border-radius:9px;border:1px solid #4a4a44;background:#0e1f18;color:#bac9b9;font:700 12px/1.05 "Baskerville Casino",serif;cursor:pointer;}
.bjd .ob button.win.on{background:linear-gradient(180deg,#9fe8c0,#4fae82);color:#07240f;border-color:#9fe8c0;}
.bjd .ob button.bj.on{background:linear-gradient(180deg,#efd9a0,#caa44f);color:#2a2008;border-color:#efd9a0;}
.bjd .ob button.push.on{background:linear-gradient(180deg,#bac9b9,#8aa092);color:#0a1a14;border-color:#d4e0d4;}
.bjd .ob button.lose.on{background:#3a1413;color:#ff9a92;border-color:#8a2f2f;}
.bjd .tx{display:flex;gap:6px;margin-top:8px;}
.bjd .tx button{flex:1;padding:9px 2px;border-radius:9px;border:1px solid #625334;background:#0a1a14;font:700 14px/1 "Baskerville Casino",serif;cursor:pointer;}
.bjd .tx button.up{color:#82d5aa;}
.bjd .tx button.down{color:#ff9a92;}
.bjd .outl{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ffffff12;}
.bjd .outl:last-child{border-bottom:none;}
.bjd .outl .oc{font:700 14px/1 "Baskerville Casino",serif;padding:3px 10px;border-radius:999px;}
.bjd .outl .oc.win{background:linear-gradient(180deg,#efd9a0,#caa44f);color:#2a2008;}
.bjd .outl .oc.lose{background:#3a1413;border:1px solid #8a2f2f;color:#ff9a92;}
`;
type BjOutMark = 'win' | 'blackjack' | 'push' | 'lose';
export function BlackjackDealer({ dealerCode }: { dealerCode: string }) {
  const st = useBjTable(dealerCode, 1000);
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, BjOutMark>>({});
  const call = useCallback(async (path: string, body: Record<string, unknown>) => { setBusy(true); try { return await api(path, { dealerCode, ...body }); } finally { setBusy(false); } }, [dealerCode]);
  const t = st?.table;
  if (!t) return <div className="bjd"><style>{BJ_DEALER_CSS}</style><div className="wrap"><h1>Mazziere Blackjack</h1><div className="sub">Carico…</div></div></div>;
  const seated = seatOrder(t).map(no => t.seats[String(no)]!).filter(s => s.playerId);
  const betting = seated.filter(s => s.bet > 0);
  const hybrid = t.mode === 'hybrid';
  const settle = async () => {
    const outcomes: Record<string, BjOutMark> = {};
    for (const s of betting) if (s.playerId) outcomes[s.playerId] = marks[s.playerId] ?? 'lose';
    await call('/gestione/casino/bj/dealer-settle', { outcomes });
    setMarks({});
  };
  const tx = (playerId: string, delta: number) => call('/gestione/casino/bj/dealer-tx', { playerId, delta });
  const mark = (id: string, m: BjOutMark) => setMarks(p => ({ ...p, [id]: m }));
  return (
    <div className="bjd"><style>{BJ_DEALER_CSS}</style>
      <DealerFab dealerCode={dealerCode} />
      <div className="wrap">
        <h1>Mazziere · {t.name}</h1>
        <div className="sub">Mano #{t.round} · {hybrid ? (t.phase === 'betting' ? 'puntate aperte' : t.phase === 'result' ? 'mano conclusa' : 'pronto') : 'tavolo digitale (gioca da solo)'}</div>

        <div className="modebar">
          <button className={!hybrid ? 'on' : ''} disabled={busy || t.phase === 'playing'} onClick={() => call('/gestione/casino/bj/dealer-mode', { mode: 'digital' })}>🖥 Digitale</button>
          <button className={hybrid ? 'on' : ''} disabled={busy} onClick={() => call('/gestione/casino/bj/dealer-mode', { mode: 'hybrid' })}>🃏 Carte fisiche</button>
        </div>

        {hybrid ? (
          <>
            {t.phase !== 'betting' && <button className="gbtn" disabled={busy || t.suspended} onClick={() => call('/gestione/casino/bj/dealer-open', {})}>▸ {t.phase === 'result' ? 'Nuova mano' : 'Apri mano (puntate)'}</button>}
            {t.phase === 'betting' && (
              <div className="card">
                <div className="hint">Distribuisci le carte vere, poi segna l'esito di ciascuno e paga.</div>
                {betting.length === 0 ? <div className="sub" style={{ margin: 0 }}>Nessuna puntata ancora. Attendi che i giocatori puntino.</div> : (
                  <div className="plist">
                    {betting.map(s => {
                      const m = marks[s.playerId!] ?? 'lose';
                      return (
                        <div key={s.playerId} className="pl">
                          <Avatar url={s.avatarUrl} name={s.nickname} size={62} />
                          <div className="mid"><div className="nm">{s.nickname ?? '—'}</div><div className="bet">🂠 {s.bet}</div></div>
                          <div className="ob">
                            <button className={`win${m === 'win' ? ' on' : ''}`} onClick={() => mark(s.playerId!, 'win')}>Vince 1:1</button>
                            <button className={`bj${m === 'blackjack' ? ' on' : ''}`} onClick={() => mark(s.playerId!, 'blackjack')}>BJ 3:2</button>
                            <button className={`push${m === 'push' ? ' on' : ''}`} onClick={() => mark(s.playerId!, 'push')}>Pari</button>
                            <button className={`lose${m === 'lose' ? ' on' : ''}`} onClick={() => mark(s.playerId!, 'lose')}>Perde</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {betting.length > 0 && <button className="gbtn pay" style={{ marginTop: 12, marginBottom: 0 }} disabled={busy} onClick={settle}>💰 Paga gli esiti</button>}
              </div>
            )}
            {t.phase === 'result' && t.history[0] && (
              <div className="card">
                <div className="hint">Esito mano #{t.history[0].hand}</div>
                {t.history[0].results.map((r, i) => (
                  <div key={i} className="outl"><span className="nm" style={{ fontSize: 15 }}>{r.nickname}</span><span className={`oc ${r.profit > 0 ? 'win' : 'lose'}`}>{r.profit > 0 ? `+${r.profit}` : 'perso'}</span></div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="card"><div className="hint">Il tavolo è in modalità digitale: distribuisce le carte e paga da solo. Da qui puoi solo accreditare/prelevare fish.</div></div>
        )}

        <div className="card">
          <div className="hint">Accredita o togli fish a mano (tutti i giocatori seduti)</div>
          <div className="plist">
            {seated.length === 0 ? <div className="sub" style={{ margin: 0 }}>Nessun giocatore seduto.</div> : seated.map(s => (
              <div key={s.playerId} className="pl">
                <Avatar url={s.avatarUrl} name={s.nickname} size={56} />
                <div className="mid"><div className="nm">{s.nickname ?? '—'}</div><div className="bal">Saldo {grp(s.balance ?? 0)}</div>
                  <div className="tx">
                    <button className="up" disabled={busy} onClick={() => tx(s.playerId!, 25)}>+25</button>
                    <button className="up" disabled={busy} onClick={() => tx(s.playerId!, 100)}>+100</button>
                    <button className="down" disabled={busy} onClick={() => tx(s.playerId!, -25)}>−25</button>
                    <button className="down" disabled={busy} onClick={() => tx(s.playerId!, -100)}>−100</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ELENCO TAVOLI (hub regia) — ?bjtables=SESSIONID
   ════════════════════════════════════════════════════════════════════════════ */
const HUB_CSS = BJ_FONT + `
.bjh{position:fixed;inset:0;overflow:auto;color:#fcf1d7;font-family:"Baskerville Casino",Georgia,serif;background:radial-gradient(ellipse 120% 80% at 50% 0%,#17402e,#0e2a1f 50%,#06110e);padding:28px;}
.bjh .logo{height:110px;position:absolute;right:30px;top:20px;}
.bjh h1{font:700 44px/1 "Cinzel Cas","Baskerville Casino",serif;color:#e5c680;}
.bjh .row{display:flex;gap:22px;flex-wrap:wrap;margin-top:24px;align-items:flex-start;}
.bjh .tcard{width:360px;border-radius:16px;background:linear-gradient(160deg,#10251d,#0a1a14);border:1px solid #625334;padding:18px;}
.bjh .tcard h2{margin:0 0 6px;font:700 30px/1 "Cinzel Cas",serif;color:#fcf1d7;}
.bjh .pill{display:inline-block;padding:6px 16px;border-radius:999px;font-size:16px;border:1px solid #82d5aa;color:#82d5aa;}
.bjh .pill.b{border-color:#e5c680;color:#e5c680;}
.bjh .acts{display:flex;gap:10px;margin-top:16px;}
.bjh .acts button{flex:1;padding:12px;border-radius:10px;border:1px solid #625334;background:#0a1a14;color:#e5c680;font:700 16px serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;}
.bjh .new{width:320px;border-radius:16px;background:linear-gradient(160deg,#10251d,#0a1a14);border:1px solid #625334;padding:18px;}
.bjh .new label{display:block;color:#e5c680;font-size:15px;margin:10px 0 4px;}
.bjh .new input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #625334;background:#0a1a14;color:#e5c680;font:700 17px serif;}
.bjh .gbtn{width:100%;margin-top:16px;padding:14px;border-radius:10px;border:1px solid #efd9a0;background:linear-gradient(180deg,#efd9a0,#e5c680 52%,#caa44f);color:#2a2008;font:700 19px "Cinzel Cas",serif;cursor:pointer;}
.bjh .qr{position:fixed;inset:0;background:#000b;display:grid;place-items:center;}
.bjh .qr .box{background:#10251d;border:1px solid #625334;border-radius:16px;padding:24px;text-align:center;}
.bjh .qr .box .w{background:#fff;padding:16px;border-radius:12px;display:inline-block;}
`;
export function BlackjackTablesView({ sessionId }: { sessionId: string }) {
  const [tables, setTables] = useState<Array<{ id: string; name: string; displayCode: string; phase: string; occupied: number; seatsN: number; minBet: number; maxBet: number }>>([]);
  const [name, setName] = useState('');
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(500);
  const [timeout_, setTimeout_] = useState(30);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const load = useCallback(() => { fetch(`${API}/gestione/casino/sessions/${sessionId}/bj-tables`).then(r => r.json()).then(d => setTables(d.tables ?? [])).catch(() => {}); }, [sessionId]);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
  const create = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/bj-tables`, { name: name || `Tavolo ${tables.length + 1}`, seats: 7, minBet, maxBet, timeout: timeout_ }); setName(''); load(); } finally { setBusy(false); } };
  const open = (q: string) => window.open(q, '_blank');

  return (
    <div className="bjh"><style>{HUB_CSS}</style>
      <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="" />
      <h1>Tavoli Blackjack</h1>
      <div className="row">
        {tables.map(tb => (
          <div key={tb.id} className="tcard">
            <h2>{tb.name}</h2>
            <div style={{ color: '#cbd8c9', margin: '4px 0 10px' }}>{tb.occupied} / {tb.seatsN} posti · <span className={`pill${tb.phase !== 'betting' ? ' b' : ''}`}>{tb.phase === 'betting' ? 'Puntate aperte' : tb.phase === 'waiting' ? 'In attesa' : tb.phase === 'result' ? 'Completata' : 'In gioco'}</span></div>
            <div className="acts">
              <button onClick={() => open(`${ORIGIN}gestione/casino?bj=${tb.displayCode}`)}>🖥<span>Monitor 80″ touch</span></button>
              <button onClick={() => setQr(`${ORIGIN}gestione/casino?bjplay=${tb.displayCode}`)}>🔳<span>QR giocatori</span></button>
            </div>
          </div>
        ))}
        <div className="new">
          <h2 style={{ margin: 0, fontSize: 26, color: '#e5c680', fontFamily: '"Cinzel Cas",serif' }}>Nuovo tavolo</h2>
          <label>Nome tavolo</label><input value={name} onChange={e => setName(e.target.value)} placeholder={`Tavolo ${tables.length + 1}`} />
          <label>Puntata minima</label><input type="number" value={minBet} onChange={e => setMinBet(+e.target.value)} />
          <label>Puntata massima</label><input type="number" value={maxBet} onChange={e => setMaxBet(+e.target.value)} />
          <label>Timeout mano (secondi)</label><input type="number" value={timeout_} onChange={e => setTimeout_(+e.target.value)} />
          <button className="gbtn" disabled={busy} onClick={create}>+ Crea tavolo</button>
        </div>
      </div>
      {qr && (
        <div className="qr" onClick={() => setQr(null)}>
          <div className="box" onClick={e => e.stopPropagation()}>
            <div className="w"><QRCodeSVG value={qr} size={280} /></div>
            <div style={{ color: '#ffe9a6', marginTop: 14, fontSize: 20 }}>Scansiona per giocare dal telefono</div>
          </div>
        </div>
      )}
    </div>
  );
}

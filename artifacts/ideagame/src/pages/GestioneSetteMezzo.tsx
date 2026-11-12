/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Sette e Mezzo — IDEA Eventi Casinò ──────────────────────────────────────
   Tre interfacce sullo stesso motore server-autorevole (gestione-casino.ts, rotte
   /gestione/casino/sm/*):
   · SetteMezzoPhone   — il giocatore gioca dal telefono (accesso→posto→puntata→
                         CARTA/STO→esito). Unico a inviare azioni di gioco.
   · SetteMezzoMonitor — vista pubblica 80" (sola lettura): attesa / mano / esiti.
   · SetteMezzoRegia   — controllo mano per tavolo; SetteMezzoTablesView = elenco/crea.
   Carte SICILIANE vere (mazzo da 40: corsa-siciliana/atlanti/*). Punto a mezzi
   ("7½"): figure = ½, matta = Re di Denari. Stile coerente con Blackjack/Roulette:
   panno verde, cornici oro, Baskerville. Importi = crediti virtuali. ─────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTableMusic } from '@/audio/useTableMusic';
import { ScreenFit } from '@/components/ScreenFit';
import { CasPhone, Hero } from '../casino-ui/kit';

const API = ((import.meta.env.BASE_URL as string) || '/') + 'api';
const ORIGIN = window.location.origin + ((import.meta.env.BASE_URL as string) || '/');
const AB = (import.meta.env.BASE_URL as string) || '/';
const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

/* ── Tipi (specchio dello stato ripulito dal server) ── */
type SmCard = { suit: 'coppe' | 'denari' | 'spade' | 'bastoni'; rank: number };
type SmSeatState = { code: string; playerId: string | null; nickname: string | null; avatarUrl: string | null; balance: number | null; bet: number; cards: SmCard[]; total: number | null; status: string; outcome: string | null; profit: number };
type SmHist = { hand: number; at: string; bancoTotal: number; bancoCards: SmCard[]; results: { seatNo: number; nickname: string; bet: number; total: number; outcome: string; profit: number }[] };
type SmTbl = {
  id: string; name: string; displayCode: string; type: 'settemezzo';
  phase: 'waiting' | 'betting' | 'playing' | 'result'; round: number;
  seats: Record<string, SmSeatState>;
  banco: { cards: SmCard[]; total: number | null };
  activeSeat: number | null; turnEndsAt: string | null; betEndsAt: string | null;
  minBet: number; maxBet: number; step: number; timeout: number; betSeconds: number; bancoStandAt: number; suspended: boolean; hasDealer: boolean; mode: 'digital' | 'hybrid';
  history: SmHist[];
};
type SmState = { table: SmTbl; sessionId: string; seatNo: number | null; isDealer?: boolean };

/* ── Mazzo siciliano: ritagli dall'atlante per seme (dal mazzo.json), dimensioni atlante ── */
const ATLAS: Record<string, [number, number]> = { coppe: [1983, 793], denari: [1983, 793], spade: [1536, 1024], bastoni: [1536, 1024] };
const RECTS: Record<string, Record<number, [number, number, number, number]>> = {
  coppe: { 1: [74, 11, 336, 377], 2: [431, 11, 357, 377], 3: [802, 11, 379, 377], 4: [1194, 11, 362, 377], 5: [1571, 11, 339, 377], 6: [74, 400, 336, 381], 7: [431, 400, 357, 381], 8: [802, 400, 379, 381], 9: [1194, 400, 362, 381], 10: [1571, 400, 339, 381] },
  denari: { 1: [17, 11, 371, 375], 2: [410, 11, 375, 375], 3: [804, 11, 373, 375], 4: [1199, 11, 376, 375], 5: [1596, 11, 371, 375], 6: [17, 399, 371, 379], 7: [410, 399, 375, 379], 8: [804, 399, 373, 379], 9: [1199, 399, 376, 379], 10: [1596, 399, 371, 379] },
  spade: { 1: [17, 16, 289, 461], 2: [319, 16, 293, 461], 3: [623, 16, 290, 461], 4: [925, 16, 293, 461], 5: [1231, 16, 288, 461], 6: [17, 487, 289, 489], 7: [319, 487, 293, 489], 8: [623, 487, 290, 489], 9: [925, 487, 293, 489], 10: [1231, 487, 288, 489] },
  bastoni: { 1: [11, 9, 295, 476], 2: [315, 9, 298, 476], 3: [622, 9, 293, 476], 4: [925, 9, 297, 476], 5: [1231, 9, 296, 476], 6: [11, 495, 295, 505], 7: [315, 495, 298, 505], 8: [622, 495, 293, 505], 9: [925, 495, 297, 505], 10: [1231, 495, 296, 505] },
};
const isMattaCard = (c?: SmCard) => !!c && c.suit === 'denari' && c.rank === 10;
const CARD_RATIO = 0.70; // cornice uniforme (larghezza/altezza): l'arte sta "contain" su crema

/* ── Helper comuni ── */
const seatOrder = (t: SmTbl) => Object.keys(t.seats).map(Number).sort((a, b) => a - b);
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const grp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** Punto a mezzi: 7 → "7", 7.5 → "7½", 0.5 → "½". */
function pt(v: number | null): string { if (v == null) return ''; const i = Math.floor(v); const half = v - i >= 0.5; if (half) return i === 0 ? '½' : `${i}½`; return String(i); }
function outcomeLabel(o: string | null): { t: string; cls: string } {
  switch (o) {
    case 'win': return { t: 'HAI VINTO', cls: 'win' };
    case 'lose': return { t: 'HAI PERSO', cls: 'lose' };
    case 'bust': return { t: 'SBALLATO', cls: 'lose' };
    default: return { t: '', cls: '' };
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
function useSmTable(code: string, ms = 900): SmState | null {
  const [st, setSt] = useState<SmState | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/sm/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d && d.table) setSt(d); }).catch(() => {});
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

/* ── Font + stile condiviso (identico a Blackjack, carte siciliane al posto delle francesi) ── */
const SM_FONT = `@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;
const CARD_CSS = `
.siccard{position:relative;background:#f4f1e6;border-radius:8px;box-shadow:0 3px 7px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.14);overflow:hidden;flex:none;display:grid;place-items:center}
.siccard .art{background-repeat:no-repeat;}
.siccard.back{background:#2a1a3a url(${AB}corsa-siciliana/dorso-maiolica.png) center/cover;box-shadow:0 3px 7px rgba(0,0,0,.55),inset 0 0 0 1px #0007}
.siccard.matta{box-shadow:0 0 0 2px #ffdd87,0 0 12px #ffdd8788,0 3px 7px rgba(0,0,0,.55)}
.siccard .mt{position:absolute;top:2px;right:3px;color:#e0a000;font-size:.9em;text-shadow:0 1px 2px #fff,0 0 4px #ffdd87;z-index:2;line-height:1}
.smtot{display:inline-grid;place-items:center;min-width:1.9em;height:1.5em;padding:0 .35em;border-radius:999px;background:#0c0c08;border:2px solid #e6c268;color:#ffe9a6;font-weight:700;font-family:"Baskerville Casino",Georgia,serif}
.smtot.bust{border-color:#e0484a;color:#ff9b9b;background:#2a0a0a}
.smtot.sevenhalf{border-color:#8ee6a8;color:#bdf5cf;background:#0a2a14}`;

function SicCard({ c, back, w = 58 }: { c?: SmCard; back?: boolean; w?: number }) {
  const h = Math.round(w / CARD_RATIO);
  if (back || !c) return <div className="siccard back" style={{ width: w, height: h }} />;
  const rect = RECTS[c.suit]?.[c.rank];
  const atlas = ATLAS[c.suit];
  if (!rect || !atlas) return <div className="siccard" style={{ width: w, height: h }} />;
  const [rx, ry, rw, rh] = rect; const [aw, ah] = atlas;
  const ratio = rw / rh, frameRatio = w / h;
  let iw: number, ih: number;
  if (ratio < frameRatio) { ih = h; iw = h * ratio; } else { iw = w; ih = w / ratio; }
  const scale = iw / rw;
  return (
    <div className={`siccard${isMattaCard(c) ? ' matta' : ''}`} style={{ width: w, height: h }}>
      <div className="art" style={{ width: iw, height: ih, backgroundImage: `url(${AB}corsa-siciliana/atlanti/${c.suit}.png)`, backgroundSize: `${aw * scale}px ${ah * scale}px`, backgroundPosition: `${-rx * scale}px ${-ry * scale}px` }} />
      {isMattaCard(c) && <span className="mt" aria-label="matta">★</span>}
    </div>
  );
}
function Total({ v, bust, size = 15 }: { v: number | null; bust?: boolean; size?: number }) {
  if (v == null) return null;
  const seven = v === 7.5;
  return <span className={`smtot${bust ? ' bust' : seven ? ' sevenhalf' : ''}`} style={{ fontSize: size }}>{pt(v)}</span>;
}
function Avatar({ url, name, size = 54 }: { url?: string | null; name?: string | null; size?: number }) {
  return url
    ? <img src={url} alt={name ?? ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e6c268' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(#2a2a28,#141412)', border: '2px solid #6e5320', display: 'grid', placeItems: 'center', color: '#8a7a52', fontSize: size * 0.5 }}>👤</div>;
}

/* ════════════════════════════════════════════════════════════════════════════
   TELEFONO
   ════════════════════════════════════════════════════════════════════════════ */
const PHONE_CSS = SM_FONT + CARD_CSS + `
.smp{position:fixed;inset:0;overflow:hidden;color:#fff;font-family:"Baskerville Casino",Georgia,serif;
  background:radial-gradient(ellipse 150% 80% at 50% 6%,#0a5a26 0%,#063f18 45%,#02220c 100%);display:flex;flex-direction:column;align-items:center;}
.smp .wrap{width:100%;max-width:460px;display:flex;flex-direction:column;}
.smp .content{display:flex;flex-direction:column;padding:4px 16px 22px;gap:12px;flex:1;}
.smp .head{position:relative;text-align:center;}
.smp .sbar{position:absolute;top:7px;left:0;right:0;z-index:4;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#fff;font:600 13px/1 -apple-system,"Helvetica Neue",Arial,sans-serif;}
.smp .sbar .ic{display:flex;align-items:center;gap:5px;}
.smp .dome{position:relative;height:96px;overflow:hidden;
  background:radial-gradient(120% 150% at 18% -30%,rgba(90,94,102,.35),transparent 46%),radial-gradient(130% 150% at 86% -20%,rgba(70,74,82,.3),transparent 44%),radial-gradient(130% 160% at 50% -46%,#1b1d22 0%,#0c0d10 44%,#050506 72%);
  border-radius:0 0 46% 46%/0 0 100% 100%;box-shadow:inset 0 -3px 0 #d9b65d,inset 0 -5px 0 #8a6a24,inset 0 -14px 20px #e8c87918,0 3px 7px #000a;}
.smp .logo{position:absolute;left:50%;top:14px;transform:translateX(-50%);height:66px;object-fit:contain;filter:drop-shadow(0 2px 8px #000c);z-index:3;}
.smp .word{position:relative;display:flex;align-items:center;justify-content:center;gap:12px;margin:5px 0 2px;font:700 20px/1 "Baskerville Casino",serif;letter-spacing:.09em;
  background:linear-gradient(180deg,#fff3c4,#ffdd87 48%,#e0a847);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 1px #000a);}
.smp .word::before,.smp .word::after{content:"";width:30px;height:12px;background:no-repeat center/contain;}
.smp .word::before{background-image:url(${AB}casino/flourish-l.png);}
.smp .word::after{background-image:url(${AB}casino/flourish-r.png);}
.smp .h1{font:700 26px/1.12 "Baskerville Casino",serif;color:#fff;text-align:center;margin:2px 0 0;text-shadow:0 2px 6px #0007;}
.smp .h1 .gold{color:#ffdd87;}
.smp .h2{text-align:center;color:#cbd8c9;font-size:14px;line-height:1.35;margin:-2px 0 2px;}
.smp .panel{position:relative;border-radius:16px;padding:14px 16px;background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #c6992f;box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 30px #0007,0 4px 12px #0006;}
.smp .lbl{color:#e8c879;font-size:13px;text-align:center;}
.smp .lbl.left{text-align:left;}
.smp .big{font:700 40px/1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;}
.smp .credit{display:flex;align-items:center;justify-content:center;gap:10px;font:700 34px/1 "Baskerville Casino",serif;color:#ffe9a6;}
.smp .mchip{width:28px;height:28px;border-radius:50%;flex:none;position:relative;background:radial-gradient(circle at 38% 30%,#f26d6d,#c21118 60%,#8c0a10);box-shadow:0 1px 3px #0009,inset 0 0 0 1px #0004;}
.smp .mchip::before{content:"";position:absolute;inset:3px;border-radius:50%;border:2px dashed #fff;opacity:.92;}
.smp .mchip.grn{background:radial-gradient(circle at 38% 30%,#5fd481,#1a9247 60%,#0c6a32);}
.smp .mchip.drop{animation:smChipDrop .6s cubic-bezier(.22,1.2,.4,1) both;}
.smp input[type=text]{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 20px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.14em;text-transform:uppercase;box-shadow:inset 0 2px 6px #0008;}
.smp input.name{letter-spacing:0;text-transform:none;font-size:18px;text-align:left;}
.smp .photo{position:relative;width:104px;height:104px;margin:2px auto 0;}
.smp .photo img,.smp .photo .ph{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid #e6c268;box-shadow:0 0 0 2px #0008,0 4px 12px #0008;}
.smp .photo .ph{display:grid;place-items:center;background:radial-gradient(circle at 42% 34%,#2a2a28,#121210);color:#8a7a52;font-size:48px;}
.smp .cambadge{position:absolute;right:2px;bottom:2px;width:30px;height:30px;border-radius:50%;background:linear-gradient(180deg,#ffe694,#d59a34);border:2px solid #7a4d12;display:grid;place-items:center;box-shadow:0 2px 5px #0008;}
.smp .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:15px;border-radius:13px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 20px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,0 7px 15px #0007,inset 0 1px 0 #fff8;margin-top:auto;}
.smp .gbtn.ghost{background:#121511;color:#ffe9a6;border:2px solid #6e5320;box-shadow:inset 0 0 0 1px #ffe9a620;}
.smp .gbtn:disabled{opacity:.5;cursor:default;}
.smp .step{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.smp .rnd{width:60px;height:60px;border-radius:50%;border:3px solid #e8cd7a;background:radial-gradient(circle at 40% 28%,#201708,#0a0a07);color:#ffe9a6;font:700 38px/1 serif;cursor:pointer;display:grid;place-items:center;box-shadow:0 0 12px #e8c87933,inset 0 2px 5px #fff2,0 3px 6px #0007;}
.smp .rnd:active{transform:scale(.94);}
.smp .stepval{flex:1;text-align:center;font:700 56px/1 "Baskerville Casino",serif;color:#ffe9a6;text-shadow:0 2px 6px #0008;}
.smp .chips{display:flex;gap:8px;justify-content:center;}
.smp .chipcol{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;}
.smp .chip{width:52px;height:52px;border-radius:50%;position:relative;flex:none;box-shadow:0 3px 7px #0009,inset 0 0 0 2px #0003;transition:transform .15s ease;}
.smp .chip::before{content:"";position:absolute;inset:3px;border-radius:50%;border:3px dashed #ffffffe0;}
.smp .chip::after{content:"";position:absolute;inset:10px;border-radius:50%;border:1px solid #ffffff66;background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 62%);}
.smp .chip b{position:absolute;inset:0;display:grid;place-items:center;z-index:1;font:700 15px/1 Georgia,serif;color:#fff;text-shadow:0 1px 2px #000a;}
.smp .chipcol.sel .chip{transform:translateY(-3px) scale(1.04);box-shadow:0 0 0 3px #ffe9a6,0 0 14px #ffe9a6aa,0 4px 8px #0009;}
.smp .chiplbl{padding:3px 0;width:46px;text-align:center;border-radius:8px;background:#0b1a10;border:1px solid #6e5320;color:#e8c879;font:700 13px/1 "Baskerville Casino",serif;}
.smp .chipcol.sel .chiplbl{border-color:#ffe9a6;color:#ffe9a6;background:#13230f;}
.smp .seatpick{position:relative;height:272px;margin:2px 0 0;}
.smp .seatpick .felt{position:absolute;left:2%;right:2%;top:0;bottom:4%;border-radius:48%/40%;background:radial-gradient(ellipse at 50% 26%,#0c7a31,#076322 52%,#044a1a 78%,#032f12);border:3px solid #c9972f;box-shadow:inset 0 0 44px #0009,inset 0 0 0 1px #ffe9a630,0 6px 16px #0007;}
.smp .tlogo{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);height:46px;opacity:.5;filter:grayscale(.3);}
.smp .dealer{position:absolute;left:50%;top:4%;transform:translate(-50%,-50%);z-index:3;}
.smp .sbtn{position:absolute;width:46px;height:46px;border-radius:50%;transform:translate(-50%,-50%);display:grid;place-items:center;border:3px solid #cdaa52;background:radial-gradient(circle at 42% 34%,#2b2b27,#111110);color:#e3d6a8;font:700 16px/1 serif;cursor:pointer;z-index:2;box-shadow:0 2px 5px #0008;overflow:hidden;}
.smp .sbtn .ava{width:100%;height:100%;object-fit:cover;}
.smp .sbtn.occ{cursor:not-allowed;border-color:#8a7a52;}
.smp .sbtn.sel{border-color:#4ade80;box-shadow:0 0 0 3px #4ade8066,0 0 16px #4ade80cc;animation:smPulse 1.7s ease-in-out infinite;}
.smp .hand{display:flex;gap:12px;}
.smp .handbox{flex:1;position:relative;border-radius:13px;border:2px solid #b98b38;background:linear-gradient(160deg,#0c2717,#06160d);padding:9px 8px 20px;text-align:center;box-shadow:inset 0 0 0 1px #ffe9a614,0 3px 9px #0006;}
.smp .handbox .t{color:#eadbb0;font:700 13px/1 "Baskerville Casino",serif;margin-bottom:6px;}
.smp .cards{display:flex;gap:6px;justify-content:center;align-items:flex-end;min-height:84px;}
.smp .handbox .smtot{position:absolute;left:50%;bottom:-13px;transform:translateX(-50%);}
.smp .actions{display:flex;gap:9px;}
.smp .act{flex:1;border:none;border-radius:13px;padding:14px 4px 12px;color:#fff;font:700 17px/1.1 "Baskerville Casino",serif;letter-spacing:.03em;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 3px 0 rgba(0,0,0,.45),inset 0 1px 0 #ffffff33;}
.smp .act svg{width:30px;height:30px;}
.smp .act.hit{background:linear-gradient(#1fb356,#0b7531);}
.smp .act.stand{background:linear-gradient(#e03a44,#9c0208);}
.smp .act:disabled{background:linear-gradient(#3b3f3b,#2a2d2a);color:#8c938c;box-shadow:0 3px 0 rgba(0,0,0,.4);cursor:default;}
.smp .act:disabled svg{opacity:.55;}
.smp .act:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.45);}
.smp .winrow{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;margin:3px 0;}
.smp .laurel{width:34px;height:50px;flex:none;}
.smp .outcome{font:700 38px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.02em;white-space:nowrap;}
.smp .outcome.win{background:linear-gradient(180deg,#fff3c4,#ffdd87 46%,#e3a948);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(243,201,95,.55));}
.smp .outcome.lose{color:#ff7a7a;text-shadow:0 0 16px rgba(220,40,40,.5);}
.smp .winrow .spark{position:absolute;width:8px;height:8px;background:radial-gradient(#fff,#ffe08a 42%,transparent 72%);border-radius:50%;opacity:.8;animation:smTwinkle 1.5s ease-in-out infinite;}
.smp .note{display:flex;align-items:center;justify-content:center;gap:8px;color:#8ee6a8;font:700 16px/1.2 "Baskerville Casino",serif;}
.smp .note.lose{color:#ff8e8e;}
.smp .notesub{text-align:center;color:#cbd8c9;font-size:13px;margin-top:-4px;}
.smp .err{color:#ffb3b3;text-align:center;font-size:14px;}
.smp .prow{display:flex;align-items:center;gap:12px;}
.smp .prow .pname{font:700 20px/1 "Baskerville Casino",serif;color:#fff;}
.smp .prow .pcr{margin-left:auto;text-align:right;color:#cbd8c9;font-size:12px;line-height:1.3;}
.smp .prow .pcr b{display:block;color:#ffe9a6;font-size:17px;}
.smp .profit{font:700 30px/1 "Baskerville Casino",serif;}
.smp .tbar{height:6px;border-radius:999px;background:#02160b;border:1px solid #3a2708;overflow:hidden;margin-top:8px;}
.smp .tbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#f0c357,#ffe9a6);box-shadow:0 0 8px #e8c87988;transition:width .9s linear;}
.smp .rule{display:flex;align-items:center;justify-content:center;gap:6px;color:#9fe0b4;font-size:12px;margin-top:2px;}
.smp .rule b{color:#ffe9a6;}
@keyframes smRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes smPulse{0%,100%{box-shadow:0 0 0 3px #4ade8044,0 0 10px #4ade8066}50%{box-shadow:0 0 0 3px #4ade8088,0 0 20px #4ade80cc}}
@keyframes smGlow{0%,100%{box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 30px #0007,0 0 6px #e8c87900}50%{box-shadow:0 0 0 1px #3a2708,inset 0 0 0 1px rgba(255,235,160,.2),inset 0 10px 30px #0007,0 0 20px #e8c87977}}
@keyframes smChipDrop{0%{transform:translateY(-34px) scale(1.35);opacity:0}70%{transform:translateY(3px) scale(1)}100%{transform:none;opacity:1}}
@keyframes smWin{0%{transform:scale(.55);opacity:0}60%{transform:scale(1.07);opacity:1}100%{transform:scale(1)}}
@keyframes smTwinkle{0%{opacity:.4;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}100%{opacity:.6;transform:scale(.85)}}
.smp .content>*{animation:smRise .45s ease both;}
.smp .turnglow{animation:smGlow 1.8s ease-in-out infinite;}
.smp .h1.turnpulse{animation:smH1 1.8s ease-in-out infinite;}
@keyframes smH1{0%,100%{text-shadow:0 2px 6px #0007}50%{text-shadow:0 0 16px #ffe08a99,0 2px 6px #0007}}
.smp .winout{animation:smWin .7s cubic-bezier(.22,1.3,.4,1) both;}
@media (prefers-reduced-motion:reduce){.smp *{animation:none!important;}}
`;
const CHIP_BG: Record<number, string> = {
  10: 'radial-gradient(circle at 40% 30%,#4fd277,#0c7a33 62%,#064d1f)',
  20: 'radial-gradient(circle at 40% 30%,#f26d6d,#c21118 62%,#8c0a10)',
  50: 'radial-gradient(circle at 40% 30%,#5aa0f6,#13408a 62%,#0c2d63)',
  100: 'radial-gradient(circle at 40% 30%,#4a4a4a,#111110 62%,#060606)',
  500: 'radial-gradient(circle at 40% 30%,#c07cf7,#5b1a8a 62%,#3c0f5e)',
};

function PhoneStatusBar() {
  return (
    <div className="sbar">
      <span>9:41</span>
      <span className="ic">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="1" y="1" width="19" height="10" rx="2.5" stroke="#fff" strokeOpacity=".6" /><rect x="2.6" y="2.6" width="15" height="6.8" rx="1.3" fill="#fff" /><rect x="21" y="4" width="1.8" height="4" rx="1" fill="#fff" fillOpacity=".7" /></svg>
      </span>
    </div>
  );
}
const IconCarta = () => (<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="7" width="16" height="21" rx="2.5" transform="rotate(-9 11 17)" fill="#fff" /><rect x="12" y="5" width="16" height="21" rx="2.5" transform="rotate(7 20 15)" fill="#fff" stroke="#0b7531" strokeWidth="1.2" /><text x="17" y="19" fontSize="10" fontFamily="Georgia" fontWeight="700" fill="#0b7531" textAnchor="middle">A</text></svg>);
const IconStai = () => (<svg viewBox="0 0 32 32" fill="#fff"><path d="M9 15V7.5a2 2 0 0 1 4 0V14h1V5.5a2 2 0 0 1 4 0V14h1V7a2 2 0 0 1 4 0v7h1V9.5a2 2 0 0 1 4 0V19c0 5-3.6 9-9 9-4 0-6.5-2-9-6l-3.2-5.3a2 2 0 0 1 3.3-2.2L9 16z" /></svg>);
const IconClock = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8c879" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" strokeLinecap="round" /><path d="M9 2h6" strokeLinecap="round" /></svg>);
const IconHourglass = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9" strokeLinecap="round" strokeLinejoin="round" /></svg>);
function Laurel({ flip }: { flip?: boolean }) {
  return (
    <svg className="laurel" viewBox="0 0 40 58" fill="#e7b64a" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M33 56C20 50 12 40 11 24 10 16 13 8 20 2c-3 7-3 13-1 20 2 8 7 14 15 18z" opacity=".95" />
      {[8, 15, 22, 29, 36, 43].map((y, i) => { const s = 1 - i * 0.07, x = 30 - i * 3.3; return <ellipse key={i} cx={x} cy={y} rx={7 * s} ry={3.3 * s} transform={`rotate(-38 ${x} ${y})`} />; })}
    </svg>
  );
}
function SmHeader() {
  return (
    <div className="head">
      <PhoneStatusBar />
      <div className="dome"><img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" /></div>
      <div className="word">SETTE E MEZZO</div>
    </div>
  );
}

export function SetteMezzoPhone({ displayCode }: { displayCode: string }) {
  const [playerCode, setPlayerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [me, setMe] = useState<{ id: string; nickname: string; fishBalance: number } | null>(null);
  const st = useSmTable(displayCode, 900);
  const [tableCode, setTableCode] = useState(displayCode);
  const [nick, setNick] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chip, setChip] = useState(0);
  const [selSeat, setSelSeat] = useState<number | null>(null);

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
      const info = await fetch(`${API}/gestione/casino/sm/${code}`).then(r => r.ok ? r.json() : null);
      if (!info?.sessionId) { setErr('Tavolo non trovato'); return; }
      const p = await api(`/gestione/casino/sessions/${info.sessionId}/players`, { nickname: nick.trim(), tableId: null, photo });
      if (p?.id && p?.playerCode) { try { localStorage.setItem('casino_player', p.playerCode); } catch { /* */ } setPlayerCode(p.playerCode); setMe({ id: p.id, nickname: p.nickname, fishBalance: p.fishBalance }); }
      else setErr(p?.error || 'Accesso non riuscito');
    } finally { setBusy(false); }
  };
  const takeSeat = async (no: number) => { setBusy(true); setErr(''); try { const r = await api('/gestione/casino/sm/join', { displayCode, seatNo: no, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };
  const placeBet = async (amount: number) => { setBusy(true); setErr(''); try { const r = await api('/gestione/casino/sm/bet', { seatCode: myCode, amount, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };
  const unbet = async () => { setBusy(true); try { await api('/gestione/casino/sm/unbet', { seatCode: myCode, playerCode }); } finally { setBusy(false); } };
  const act = async (kind: 'hit' | 'stand') => { setBusy(true); setErr(''); try { const r = await api(`/gestione/casino/sm/${kind}`, { seatCode: myCode, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };

  const footer = <footer className="foot">IDEAeventi · 7½ — avvicìnati a 7½ senza sballare · figure ½ · matta = Re di Denari</footer>;
  const Phone = (label: string, body: React.ReactNode, badge?: React.ReactNode) => (
    <CasPhone eyebrow="Casinò · Giocatore" title="7 e Mezzo" footer={footer}>
      <Hero label={label} badge={badge} />
      {body}
    </CasPhone>
  );
  const fmtPt = (v: number | null) => v == null ? '—' : v === 0.5 ? '½' : Number.isInteger(v) ? String(v) : `${Math.floor(v)}½`;

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

  // 02 SCEGLI POSTO
  if (mySeatNo == null) {
    const nos = seatOrder(t);
    const occupied = nos.filter(no => t.seats[String(no)]?.playerId).length;
    const full = occupied >= nos.length;
    return Phone('Scegli posto',
      <section className="panel">
        <h2>Siediti</h2>
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

  const hybrid = t.mode === 'hybrid';
  const handPanel = (
    <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
      <div className="tile center" style={{ flex: 1, padding: 14 }}>
        <small className="eyebrow">Le tue carte</small>
        <div className="cards">{mySeat!.cards.map((c, i) => <SicCard key={i} c={c} w={58} />)}</div>
        <Total v={mySeat!.total} bust={mySeat!.status === 'bust'} />
      </div>
      <div className="tile center" style={{ flex: 1, padding: 14 }}>
        <small className="eyebrow">Banco</small>
        <div className="cards">{t.banco.cards.map((c, i) => <SicCard key={i} c={c} w={58} />)}{t.banco.cards.length === 0 && <SicCard back w={58} />}</div>
        <Total v={t.banco.total} bust={t.banco.total != null && t.banco.total > 7.5} />
      </div>
    </div>
  );

  // ESITO
  if (t.phase === 'result') {
    const ol = outcomeLabel(mySeat!.outcome);
    const won = ol.cls === 'win';
    const profit = mySeat!.profit;
    return Phone('Esito',
      <section className="panel center">
        <h2 style={{ color: won ? 'var(--green)' : 'var(--red)' }}>{ol.t || '—'}</h2>
        {!hybrid && <>
          <small className="eyebrow">Totale</small>
          <div className="metric">{fmtPt(mySeat!.total)}</div>
          <div className="cards">{mySeat!.cards.map((c, i) => <SicCard key={i} c={c} w={58} />)}</div>
        </>}
        <div className="list" style={{ marginTop: 14, textAlign: 'left' }}>
          <div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div>
          <div className="line"><strong>Profitto</strong><span style={{ color: profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--red)' : 'var(--muted)' }}>{profit > 0 ? '+' : ''}{profit}</span></div>
          <div className="line"><strong>Nuovo credito</strong><span>{grp(myBalance)} punti</span></div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn ghost">Prossima mano</button></div>
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  // TURNO / ATTESA
  if (t.phase === 'playing') {
    const myTurn = t.activeSeat === mySeatNo && mySeat!.status === 'playing';
    const activeSeat = t.activeSeat != null ? t.seats[String(t.activeSeat)] : null;
    const activeName = activeSeat?.nickname ?? (t.activeSeat != null ? `Posto ${t.activeSeat}` : '—');
    return Phone(myTurn ? 'Il tuo turno' : 'Turno',
      <section className="panel">
        <h2>{myTurn ? `Hai ${fmtPt(mySeat!.total)}` : <>Turno di <span style={{ color: 'var(--gold)' }}>{activeName}</span></>}</h2>
        {!hybrid && handPanel}
        <div className="list"><div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div></div>
        {myTurn ? <div className="status center">Tempo per giocare · {fmtTime(turnCd)}</div>
          : mySeat!.status === 'stand' ? <div className="status">Hai detto STO · attendi il banco</div>
          : mySeat!.status === 'bust' ? <div className="status lose">Hai sballato · attendi la fine della mano</div>
          : <div className="status">Attendi il tuo turno…</div>}
        {err && <div className="err">{err}</div>}
        <div className="actions"><button className="btn" disabled={!myTurn || busy} onClick={() => act('hit')}>Carta</button><button className="btn ghost" disabled={!myTurn || busy} onClick={() => act('stand')}>Stai</button></div>
      </section>,
      `${grp(myBalance)} punti`
    );
  }

  // PUNTATA CONFERMATA / CARTE FISICHE — fase betting
  if (mySeat!.status === 'bet') {
    return Phone(hybrid ? 'Carte fisiche' : 'In attesa',
      <section className="panel">
        <h2>{hybrid ? 'Dealer umano' : 'Puntata confermata'}</h2>
        <div className="status">{hybrid ? 'La puntata è registrata. Il mazziere distribuisce le carte vere.' : `In attesa della distribuzione${t.betEndsAt ? ` · ${fmtTime(betCd)}` : ''}`}</div>
        <div className="list">
          <div className="line"><strong>Puntata</strong><span>{mySeat!.bet} punti</span></div>
          <div className="line"><strong>Disponibili</strong><span>{grp(myBalance)} punti</span></div>
        </div>
        {err && <div className="err">{err}</div>}
        {!hybrid && <div className="actions"><button className="btn ghost" disabled={busy} onClick={unbet}>Modifica puntata</button></div>}
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
      <p>Avvicìnati a 7½ senza sballare · figure = ½ · matta = Re di Denari.</p>
      <div className="step"><button className="rnd" onClick={dec}>−</button><div className="val">{cur}</div><button className="rnd" onClick={inc}>+</button></div>
      <div className="row" style={{ justifyContent: 'center' }}>{chips.map(c => <span key={c} className={`chip${cur === c ? ' sel' : ''}`} onClick={() => setChip(c)}>{c}</span>)}</div>
      {t.betEndsAt && <div className="status center">Tempo rimanente · {fmtTime(betCd)}</div>}
      {err && <div className="err">{err}</div>}
      <div className="actions"><button className="btn" disabled={busy || cur > myBalance} onClick={() => placeBet(cur)}>Conferma</button></div>
    </section>,
    `${grp(myBalance)} punti`
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MONITOR 80" (sola lettura) — palco fisso fedele, una sola schermata (ScreenFit)
   ════════════════════════════════════════════════════════════════════════════ */
const MON_CSS = SM_FONT + CARD_CSS + `
.smm{position:fixed;inset:0;overflow:hidden;background:#02120a;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.smm .stage{position:relative;width:1280px;height:720px;flex:none;border-radius:20px;overflow:hidden;
  background:radial-gradient(ellipse 120% 90% at 50% 30%,#0c7a31 0%,#086226 42%,#044a1a 70%,#022e12 100%);
  box-shadow:inset 0 0 0 8px #11361f,inset 0 0 0 11px #c9972f,inset 0 0 120px #000a,0 20px 60px #000;}
.smm .felt-logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;opacity:.07;filter:grayscale(1) brightness(2);}
.smm .title{position:absolute;top:22px;left:0;right:0;text-align:center;z-index:5;}
.smm .title .word{font:700 40px/1 "Baskerville Casino",serif;letter-spacing:.14em;background:linear-gradient(180deg,#fff3c4,#ffdd87 48%,#e0a847);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 3px #000a);}
.smm .title .sub{color:#bfe6cc;font-size:15px;letter-spacing:.06em;margin-top:2px;}
.smm .banco{position:absolute;top:92px;left:50%;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:6px;}
.smm .banco .lab{color:#ffe9a6;font:700 18px/1 "Baskerville Casino",serif;letter-spacing:.1em;}
.smm .banco .cards{display:flex;gap:7px;align-items:flex-end;min-height:118px;}
.smm .seatcard{position:absolute;transform:translate(-50%,-50%);width:200px;z-index:3;display:flex;flex-direction:column;align-items:center;gap:4px;}
.smm .seatcard .nameplate{display:flex;align-items:center;gap:7px;background:linear-gradient(180deg,#14361f,#0a2213);border:2px solid #b98b38;border-radius:999px;padding:3px 12px 3px 3px;box-shadow:0 3px 8px #0007;max-width:100%;}
.smm .seatcard .nm{font:700 15px/1 "Baskerville Casino",serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;}
.smm .seatcard .hand{display:flex;gap:5px;align-items:flex-end;min-height:90px;}
.smm .seatcard .foot{display:flex;align-items:center;gap:8px;}
.smm .seatcard .bet{display:inline-flex;align-items:center;gap:5px;background:#0c0c08;border:2px solid #c9972f;border-radius:999px;padding:2px 10px;color:#ffe9a6;font:700 14px/1 "Baskerville Casino",serif;}
.smm .seatcard .oc{font:700 15px/1 "Baskerville Casino",serif;padding:2px 10px;border-radius:999px;}
.smm .seatcard .oc.win{background:linear-gradient(180deg,#ffe694,#e3a948);color:#231503;}
.smm .seatcard .oc.lose{background:#2a0a0a;border:1px solid #8a2f2f;color:#ff9b9b;}
.smm .seatcard.active{filter:drop-shadow(0 0 14px #ffe08a);}
.smm .seatcard.empty .nameplate{opacity:.5;}
.smm .mchip{width:20px;height:20px;border-radius:50%;flex:none;background:radial-gradient(circle at 38% 30%,#f26d6d,#c21118 60%,#8c0a10);box-shadow:inset 0 0 0 1px #0005;}
.smm .banner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;text-align:center;}
.smm .banner .big{font:700 62px/1 "Baskerville Casino",serif;letter-spacing:.05em;background:linear-gradient(180deg,#fff3c4,#ffdd87 46%,#e0a847);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 6px #000a);}
.smm .banner .sm2{color:#cfe8d6;font-size:20px;margin-top:6px;}
.smm .joinbox{position:absolute;right:26px;bottom:24px;z-index:6;display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,#0d2a19,#061710);border:2px solid #c6992f;border-radius:16px;padding:12px 14px;box-shadow:0 6px 18px #0008;}
.smm .joinbox .qr{background:#fff;padding:7px;border-radius:9px;}
.smm .joinbox .jt{color:#ffe9a6;font:700 16px/1.25 "Baskerville Casino",serif;max-width:170px;}
.smm .joinbox .jt small{display:block;color:#bfe6cc;font-weight:400;font-size:12px;margin-top:3px;letter-spacing:.14em;}
.smm .hist{position:absolute;left:26px;bottom:24px;z-index:6;display:flex;flex-direction:column;gap:4px;background:#061710cc;border:1px solid #2a4a33;border-radius:12px;padding:8px 12px;}
.smm .hist .ht{color:#9fe0b4;font-size:11px;letter-spacing:.1em;}
.smm .hist .hr{color:#e8f2ea;font-size:13px;}
.smm .hist .hr b{color:#ffe9a6;}
`;

function SeatCardMon({ s, active, w }: { s: SmSeatState; active: boolean; w: number }) {
  const empty = !s.playerId;
  const ol = outcomeLabel(s.outcome);
  return (
    <div className={`seatcard${active ? ' active' : ''}${empty ? ' empty' : ''}`} style={{ width: w }}>
      <div className="nameplate"><Avatar url={s.avatarUrl} name={s.nickname} size={30} /><span className="nm">{s.nickname ?? 'Libero'}</span></div>
      {!empty && (s.cards.length > 0) && <div className="hand">{s.cards.map((c, i) => <SicCard key={i} c={c} w={46} />)}</div>}
      <div className="foot">
        {!empty && s.total != null && <Total v={s.total} bust={s.status === 'bust'} size={13} />}
        {s.outcome ? <span className={`oc ${ol.cls}`}>{s.outcome === 'win' ? `+${s.profit}` : ol.t === 'SBALLATO' ? 'Sballa' : 'Perso'}</span>
          : s.bet > 0 ? <span className="bet"><span className="mchip" />{s.bet}</span> : null}
      </div>
    </div>
  );
}

export function SetteMezzoMonitor({ displayCode }: { displayCode: string }) {
  const st = useSmTable(displayCode, 900);
  const t = st?.table;
  useTableMusic('casino', 'lobby_loop');
  // Auto-distribuzione quando scade il tempo puntate (come Blackjack).
  const lastAuto = useRef(0);
  useEffect(() => {
    if (!t) return;
    const now = Date.now();
    if (t.phase === 'betting' && t.betEndsAt && now > Date.parse(t.betEndsAt) && Object.values(t.seats).some(s => s.bet > 0) && now - lastAuto.current > 1500) { lastAuto.current = now; api('/gestione/casino/sm/deal', { displayCode }); }
    if (t.phase === 'playing' && t.turnEndsAt && now > Date.parse(t.turnEndsAt) + 1200 && t.activeSeat != null && now - lastAuto.current > 1500) { lastAuto.current = now; fetch(`${API}/gestione/casino/sm/${displayCode}`); }
  });

  if (!t) return <div className="smm"><style>{MON_CSS}</style><div className="stage"><div className="banner"><div className="big">Sette e Mezzo</div><div className="sm2">Carico…</div></div></div></div>;

  const nos = seatOrder(t);
  // posizioni attorno all'ovale (banco in alto, posti ad arco in basso)
  const POS: Record<number, { left: string; top: string }> = {
    1: { left: '88%', top: '44%' }, 2: { left: '80%', top: '74%' }, 3: { left: '60%', top: '86%' },
    4: { left: '40%', top: '86%' }, 5: { left: '20%', top: '74%' }, 6: { left: '12%', top: '44%' }, 7: { left: '50%', top: '90%' },
  };
  const circ = (i: number, n: number) => { const a = (30 + (i / n) * 300) * Math.PI / 180; return { left: `${50 + 40 * Math.cos(a)}%`, top: `${58 + 34 * Math.sin(a)}%` }; };
  const joinUrl = `${ORIGIN}?smplay=${displayCode}`;
  const h0 = t.history[0];

  const hybrid = t.mode === 'hybrid';
  const banner = t.phase === 'waiting' ? { big: hybrid ? 'Tavolo col mazziere' : 'Fai le puntate', sub: 'Inquadra il QR per sederti e giocare' }
    : t.phase === 'betting' ? { big: 'Puntate aperte', sub: hybrid ? 'Punta dal telefono · carte vere sul tavolo' : 'Punta dal telefono' }
      : null;

  return (
    <div className="smm"><style>{MON_CSS}</style>
      <ScreenFit>
        <div className="stage">
          <img className="felt-logo" src={`${AB}casino/logo-idea-casino.png`} alt="" />
          <div className="title"><div className="word">SETTE E MEZZO</div><div className="sub">{t.name} · {hybrid ? '🃏 Carte fisiche col mazziere' : `Banco sta su ${pt(t.bancoStandAt)}`}{t.suspended ? ' · SOSPESO' : ''}</div></div>

          <div className="banco">
            <div className="lab">BANCO</div>
            {hybrid
              ? <div className="cards" style={{ color: '#ffe9a6', font: '700 15px/1.2 "Baskerville Casino",serif', textAlign: 'center', maxWidth: 240 }}>Il mazziere<br />distribuisce le carte</div>
              : <><div className="cards">{t.banco.cards.length ? t.banco.cards.map((c, i) => <SicCard key={i} c={c} w={74} />) : <SicCard back w={74} />}</div>
                {t.banco.total != null && <Total v={t.banco.total} bust={t.banco.total > 7.5} size={18} />}</>}
          </div>

          {nos.map((no, i) => {
            const s = t.seats[String(no)]!;
            const pos = POS[no] ?? circ(i, nos.length);
            return <div key={no} className="seatcard-wrap" style={{ position: 'absolute', left: pos.left, top: pos.top }}>
              <div style={{ position: 'absolute', transform: 'translate(-50%,-50%)' }}><SeatCardMon s={s} active={t.activeSeat === no && t.phase === 'playing'} w={190} /></div>
            </div>;
          })}

          {banner && <div className="banner" style={{ top: '40%' }}><div className="big">{banner.big}</div><div className="sm2">{banner.sub}</div></div>}

          <div className="joinbox">
            <div className="qr"><QRCodeSVG value={joinUrl} size={74} /></div>
            <div className="jt">Gioca dal telefono<small>{displayCode}</small></div>
          </div>

          {h0 && <div className="hist">
            <div className="ht">ULTIMA MANO · banco {pt(h0.bancoTotal)}</div>
            {h0.results.slice(0, 4).map((r, i) => <div key={i} className="hr">{r.nickname} · {pt(r.total)} · <b>{r.outcome === 'win' ? `+${r.profit}` : 'perso'}</b></div>)}
          </div>}
        </div>
      </ScreenFit>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   REGIA (controllo mano) + ELENCO/CREA TAVOLI
   ════════════════════════════════════════════════════════════════════════════ */
const REGIA_CSS = SM_FONT + CARD_CSS + `
.smr{position:fixed;inset:0;overflow:auto;background:radial-gradient(ellipse at 50% 0%,#0a3d1c,#02190c 70%);color:#ede8d8;font-family:"Baskerville Casino",Georgia,serif;}
.smr .wrap{max-width:560px;margin:0 auto;padding:16px 16px 40px;}
.smr h1{font:700 24px/1.1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;margin:8px 0 2px;}
.smr .sub{text-align:center;color:#bfe6cc;font-size:13px;margin-bottom:14px;}
.smr .card{background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #c6992f;border-radius:16px;padding:14px 16px;margin-bottom:14px;box-shadow:inset 0 0 0 1px #ffe9a614,0 4px 12px #0006;}
.smr .card h2{font:700 16px/1 "Baskerville Casino",serif;color:#e8c879;margin:0 0 10px;letter-spacing:.04em;}
.smr .gbtn{display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 18px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,0 6px 14px #0007;}
.smr .gbtn:disabled{opacity:.5;cursor:default;}
.smr .fbtn{flex:1;padding:12px;border-radius:12px;border:2px solid #6e5320;background:#121511;color:#ffe9a6;font:700 15px/1 "Baskerville Casino",serif;cursor:pointer;}
.smr .row{display:flex;gap:10px;}
.smr .phase{display:inline-block;padding:3px 12px;border-radius:999px;font:700 13px/1.4 "Baskerville Casino",serif;letter-spacing:.06em;}
.smr .phase.waiting{background:#1a2a20;color:#9fe0b4;border:1px solid #2a4a33;}
.smr .phase.betting{background:#2a2410;color:#ffe9a6;border:1px solid #6e5320;}
.smr .phase.playing{background:#10233a;color:#9fc8ff;border:1px solid #2a456e;}
.smr .phase.result{background:#1b2a14;color:#cdf0b0;border:1px solid #42661f;}
.smr .set{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #ffffff12;}
.smr .set:last-child{border-bottom:none;}
.smr .set span{color:#cbd8c9;font-size:14px;}
.smr .set .ctr{display:flex;align-items:center;gap:8px;}
.smr .set .num{min-width:52px;text-align:center;color:#ffe9a6;font:700 17px/1 "Baskerville Casino",serif;}
.smr .sbtn{width:34px;height:34px;border-radius:9px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 20px/1 serif;cursor:pointer;}
.smr .set select{background:#0b1a10;border:2px solid #6e5320;color:#ffe9a6;border-radius:9px;padding:6px 8px;font:700 14px/1 "Baskerville Casino",serif;}
.smr .links{display:flex;gap:10px;flex-wrap:wrap;}
.smr .lnk{flex:1;min-width:150px;display:flex;align-items:center;gap:10px;background:#0b1a10;border:1px solid #6e5320;border-radius:12px;padding:10px;}
.smr .lnk .qr{background:#fff;padding:5px;border-radius:7px;}
.smr .lnk .lt{font:700 14px/1.3 "Baskerville Casino",serif;color:#ffe9a6;}
.smr .lnk .lt small{display:block;color:#9fc8a8;font-weight:400;font-size:11px;}
.smr .mini{display:flex;gap:6px;justify-content:center;align-items:flex-end;min-height:70px;margin:6px 0;}
`;
function Setting({ label, value, step, min = 0, disabled, onChange, fmt }: { label: string; value: number; step: number; min?: number; disabled?: boolean; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="set"><span>{label}</span>
      <div className="ctr">
        <button className="sbtn" disabled={disabled} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <span className="num">{fmt ? fmt(value) : value}</span>
        <button className="sbtn" disabled={disabled} onClick={() => onChange(value + step)}>+</button>
      </div>
    </div>
  );
}

export function SetteMezzoRegia({ displayCode }: { displayCode: string }) {
  const st = useSmTable(displayCode, 1000);
  const [busy, setBusy] = useState(false);
  const [dealerCode, setDealerCode] = useState<string | null>(null);
  const t = st?.table;
  const sid = st?.sessionId;
  const call = useCallback(async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setBusy(false); } }, [displayCode]);
  const bindDealer = useCallback(async (assign: boolean) => {
    if (!sid || !t) return; setBusy(true);
    try { const r = await api(`/gestione/casino/sessions/${sid}/sm-tables/${t.id}/dealer`, { assign }); setDealerCode(assign ? (r?.dealerCode ?? null) : null); } finally { setBusy(false); }
  }, [sid, t]);
  if (!t) return <div className="smr"><style>{REGIA_CSS}</style><div className="wrap"><h1>Regia Sette e Mezzo</h1><div className="sub">Carico…</div></div></div>;
  const closed = t.phase === 'waiting' || t.phase === 'result';
  const monUrl = `${ORIGIN}?sm=${displayCode}`, playUrl = `${ORIGIN}?smplay=${displayCode}`;
  const mainBtn = t.phase === 'betting'
    ? <button className="gbtn" disabled={busy} onClick={() => call('/gestione/casino/sm/deal', {})}>🂠 Chiudi puntate e distribuisci</button>
    : t.phase === 'playing'
      ? <button className="gbtn" disabled style={{ opacity: .6 }}>Mano in corso…</button>
      : <button className="gbtn" disabled={busy || t.suspended} onClick={() => call('/gestione/casino/sm/open', {})}>▸ {t.phase === 'result' ? 'Nuova mano' : 'Apri puntate'}</button>;

  return (
    <div className="smr"><style>{REGIA_CSS}</style>
      <div className="wrap">
        <h1>Regia · {t.name}</h1>
        <div className="sub">Mano #{t.round} · <span className={`phase ${t.phase}`}>{t.phase === 'waiting' ? 'In attesa' : t.phase === 'betting' ? 'Puntate aperte' : t.phase === 'playing' ? 'Mano in corso' : 'Risultati'}</span></div>

        <div className="card">
          <h2>CONTROLLO MANO</h2>
          {mainBtn}
          {t.banco.cards.length > 0 && <div className="mini">{t.banco.cards.map((c, i) => <SicCard key={i} c={c} w={40} />)}<Total v={t.banco.total} bust={t.banco.total != null && t.banco.total > 7.5} size={13} /></div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="fbtn" style={{ borderColor: t.suspended ? '#4ade80' : '#8a2f2f', color: t.suspended ? '#9fe0b4' : '#ff9b9b' }} disabled={busy} onClick={() => call('/gestione/casino/sm/suspend', { suspended: !t.suspended })}>{t.suspended ? '▶ Riattiva' : '⏸ Sospendi'}</button>
          </div>
        </div>

        <div className="card">
          <h2>MAZZIERE (opzionale)</h2>
          {!t.hasDealer && !dealerCode
            ? <>
                <p style={{ color: '#cbd8c9', fontSize: 13, margin: '0 0 10px' }}>Lega un mazziere: comanda il tavolo dal suo telefono. Può giocare col <b>mazzo digitale</b> oppure con <b>carte fisiche</b> (segna lui i vincitori).</p>
                <button className="gbtn" disabled={busy} onClick={() => bindDealer(true)}>👤 Assegna un mazziere</button>
              </>
            : <>
                <div className="links">
                  {dealerCode
                    ? <a className="lnk" href={`${ORIGIN}?smdealer=${dealerCode}`} target="_blank" rel="noreferrer"><span className="qr"><QRCodeSVG value={`${ORIGIN}?smdealer=${dealerCode}`} size={64} /></span><span className="lt">Telefono mazziere<small>inquadra il QR</small></span></a>
                    : <div className="lnk"><span className="lt">Mazziere legato ✓<small>riassegna per rivedere il QR</small></span></div>}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  {!dealerCode && <button className="fbtn" disabled={busy} onClick={() => bindDealer(true)}>Mostra QR mazziere</button>}
                  <button className="fbtn" style={{ borderColor: '#8a2f2f', color: '#ff9b9b' }} disabled={busy} onClick={() => bindDealer(false)}>✕ Slega mazziere</button>
                </div>
              </>}
        </div>

        <div className="card">
          <h2>IMPOSTAZIONI</h2>
          <Setting label="Min puntata" value={t.minBet} step={5} disabled={!closed || busy} onChange={v => call('/gestione/casino/sm/settings', { minBet: v })} />
          <Setting label="Max puntata" value={t.maxBet} step={50} disabled={!closed || busy} onChange={v => call('/gestione/casino/sm/settings', { maxBet: v })} />
          <Setting label="Secondi puntate" value={t.betSeconds} step={5} min={10} disabled={busy} onChange={v => call('/gestione/casino/sm/settings', { betSeconds: v })} />
          <Setting label="Timeout turno (s)" value={t.timeout} step={5} min={10} disabled={busy} onChange={v => call('/gestione/casino/sm/settings', { timeout: v })} />
          <div className="set"><span>Il banco sta su</span>
            <select value={String(t.bancoStandAt)} disabled={!closed || busy} onChange={e => call('/gestione/casino/sm/settings', { bancoStandAt: Number(e.target.value) })}>
              <option value="4">4</option><option value="5">5</option><option value="5.5">5½</option><option value="6">6</option>
            </select>
          </div>
        </div>

        <div className="card">
          <h2>SCHERMI</h2>
          <div className="links">
            <a className="lnk" href={monUrl} target="_blank" rel="noreferrer"><span className="qr"><QRCodeSVG value={monUrl} size={56} /></span><span className="lt">Monitor 80″<small>apri sullo schermo</small></span></a>
            <a className="lnk" href={playUrl} target="_blank" rel="noreferrer"><span className="qr"><QRCodeSVG value={playUrl} size={56} /></span><span className="lt">Telefono giocatore<small>{displayCode}</small></span></a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Vista MAZZIERE (telefono) — ?smdealer= ─────────────────────────────────────
   Carte fisiche: il mazziere apre la mano (i giocatori puntano dal telefono),
   distribuisce carte vere, poi segna i vincitori e paga 1:1. Può sempre
   accreditare/prelevare fish a mano. In modalità digitale vede la mano in corso. */
const DEALER_CSS = SM_FONT + CARD_CSS + `
.smd{position:fixed;inset:0;overflow:auto;background:radial-gradient(ellipse at 50% 0%,#0a3d1c,#02190c 70%);color:#ede8d8;font-family:"Baskerville Casino",Georgia,serif;}
.smd .wrap{max-width:520px;margin:0 auto;padding:14px 14px 40px;}
.smd h1{font:700 22px/1.1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;margin:6px 0 2px;}
.smd .sub{text-align:center;color:#bfe6cc;font-size:13px;margin-bottom:12px;}
.smd .modebar{display:flex;gap:8px;margin-bottom:12px;}
.smd .modebar button{flex:1;padding:11px;border-radius:12px;border:2px solid #6e5320;background:#121511;color:#cbd8c9;font:700 14px/1.2 "Baskerville Casino",serif;cursor:pointer;}
.smd .modebar button.on{background:linear-gradient(180deg,#ffe694,#d59a34);color:#231503;border-color:#f3dea0;}
.smd .gbtn{display:block;width:100%;box-sizing:border-box;padding:15px;border-radius:13px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 18px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,0 6px 14px #0007;margin-bottom:12px;}
.smd .gbtn.pay{background:linear-gradient(180deg,#5fe08a,#1aa64b 52%,#0c7a33);color:#07240f;border-color:#9fe8b8;box-shadow:0 3px 0 #0a5a28,0 6px 14px #0007;}
.smd .gbtn:disabled{opacity:.5;cursor:default;}
.smd .plist{display:flex;flex-direction:column;gap:10px;}
.smd .pl{display:flex;align-items:center;gap:11px;background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #6e5320;border-radius:14px;padding:10px 12px;}
.smd .pl.win{border-color:#5fe08a;box-shadow:0 0 0 1px #5fe08a55,0 0 14px #1aa64b44;}
.smd .pl .nm{font:700 16px/1.1 "Baskerville Casino",serif;color:#fff;}
.smd .pl .bal{color:#9fc8a8;font-size:12px;}
.smd .pl .mid{flex:1;min-width:0;}
.smd .pl .bet{display:inline-flex;align-items:center;gap:5px;color:#ffe9a6;font:700 15px/1 "Baskerville Casino",serif;background:#0c0c08;border:2px solid #c9972f;border-radius:999px;padding:3px 10px;margin-top:3px;}
.smd .pl .mchip{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 38% 30%,#f26d6d,#c21118 60%,#8c0a10);}
.smd .wl{display:flex;flex-direction:column;gap:5px;}
.smd .wl button{padding:7px 12px;border-radius:10px;border:2px solid #4a4a44;background:#161915;color:#cbd8c9;font:700 13px/1 "Baskerville Casino",serif;cursor:pointer;min-width:70px;}
.smd .wl button.win.on{background:linear-gradient(180deg,#5fe08a,#1aa64b);color:#07240f;border-color:#9fe8b8;}
.smd .wl button.lose.on{background:#2a0a0a;color:#ff9b9b;border-color:#8a2f2f;}
.smd .tx{display:flex;gap:6px;margin-top:8px;}
.smd .tx button{flex:1;padding:9px 2px;border-radius:9px;border:2px solid #6e5320;background:#0b1a10;font:700 14px/1 "Baskerville Casino",serif;cursor:pointer;}
.smd .tx button.up{color:#8ee6a8;}
.smd .tx button.down{color:#ff9b9b;}
.smd .card{background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #c6992f;border-radius:16px;padding:14px;margin-bottom:12px;}
.smd .outl{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ffffff12;}
.smd .outl:last-child{border-bottom:none;}
.smd .outl .oc{font:700 14px/1 "Baskerville Casino",serif;padding:3px 10px;border-radius:999px;}
.smd .outl .oc.win{background:linear-gradient(180deg,#ffe694,#e3a948);color:#231503;}
.smd .outl .oc.lose{background:#2a0a0a;border:1px solid #8a2f2f;color:#ff9b9b;}
.smd .hint{color:#9fe0b4;font-size:12px;text-align:center;margin:2px 0 10px;}
`;
export function SetteMezzoDealer({ dealerCode }: { dealerCode: string }) {
  const [st, setSt] = useState<SmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [winners, setWinners] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/sm/${dealerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {});
    load(); const t = setInterval(load, 1000); return () => { on = false; clearInterval(t); };
  }, [dealerCode]);
  const call = useCallback(async (path: string, body: Record<string, unknown>) => { setBusy(true); try { const r = await api(path, { dealerCode, ...body }); return r; } finally { setBusy(false); } }, [dealerCode]);
  const t = st?.table;
  if (!t) return <div className="smd"><style>{DEALER_CSS}</style><div className="wrap"><h1>Mazziere 7½</h1><div className="sub">Carico…</div></div></div>;
  const seated = seatOrder(t).map(no => t.seats[String(no)]!).filter(s => s.playerId);
  const betting = seated.filter(s => s.bet > 0);
  const hybrid = t.mode === 'hybrid';

  const settle = async () => { const w = Object.entries(winners).filter(([, v]) => v).map(([id]) => id); await call('/gestione/casino/sm/dealer-settle', { winners: w }); setWinners({}); };
  const tx = (playerId: string, delta: number) => call('/gestione/casino/sm/dealer-tx', { playerId, delta });

  return (
    <div className="smd"><style>{DEALER_CSS}</style>
      <div className="wrap">
        <h1>Mazziere · {t.name}</h1>
        <div className="sub">Mano #{t.round} · {hybrid ? (t.phase === 'betting' ? 'puntate aperte' : t.phase === 'result' ? 'mano conclusa' : 'pronto') : 'tavolo digitale (gioca da solo)'}</div>

        <div className="modebar">
          <button className={!hybrid ? 'on' : ''} disabled={busy || t.phase === 'playing'} onClick={() => call('/gestione/casino/sm/dealer-mode', { mode: 'digital' })}>🖥 Digitale</button>
          <button className={hybrid ? 'on' : ''} disabled={busy} onClick={() => call('/gestione/casino/sm/dealer-mode', { mode: 'hybrid' })}>🃏 Carte fisiche</button>
        </div>

        {hybrid ? (
          <>
            {t.phase !== 'betting' && <button className="gbtn" disabled={busy || t.suspended} onClick={() => call('/gestione/casino/sm/dealer-open', {})}>▸ {t.phase === 'result' ? 'Nuova mano' : 'Apri mano (puntate)'}</button>}
            {t.phase === 'betting' && (
              <div className="card">
                <div className="hint">Distribuisci le carte vere, poi segna chi ha vinto e paga.</div>
                {betting.length === 0 ? <div className="sub" style={{ margin: 0 }}>Nessuna puntata ancora. Attendi che i giocatori puntino.</div> : (
                  <div className="plist">
                    {betting.map(s => {
                      const w = !!winners[s.playerId!];
                      return (
                        <div key={s.playerId} className={`pl${w ? ' win' : ''}`}>
                          <Avatar url={s.avatarUrl} name={s.nickname} size={62} />
                          <div className="mid"><div className="nm">{s.nickname ?? '—'}</div><div className="bet"><span className="mchip" />{s.bet}</div></div>
                          <div className="wl">
                            <button className={`win${w ? ' on' : ''}`} onClick={() => setWinners(p => ({ ...p, [s.playerId!]: true }))}>Vince</button>
                            <button className={`lose${!w ? ' on' : ''}`} onClick={() => setWinners(p => ({ ...p, [s.playerId!]: false }))}>Perde</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {betting.length > 0 && <button className="gbtn pay" style={{ marginTop: 12, marginBottom: 0 }} disabled={busy} onClick={settle}>💰 Paga i vincitori</button>}
              </div>
            )}
            {t.phase === 'result' && st!.table.history[0] && (
              <div className="card">
                <div className="hint">Esito mano #{st!.table.history[0].hand}</div>
                {st!.table.history[0].results.map((r, i) => (
                  <div key={i} className="outl"><span className="nm" style={{ fontSize: 15 }}>{r.nickname}</span><span className={`oc ${r.outcome === 'win' ? 'win' : 'lose'}`}>{r.outcome === 'win' ? `+${r.profit}` : 'perso'}</span></div>
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

export function SetteMezzoTablesView({ sessionId }: { sessionId: string }) {
  const [tables, setTables] = useState<Array<{ id: string; name: string; displayCode: string; phase: string; round: number; occupied: number; seatsN: number; suspended: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`${API}/gestione/casino/sessions/${sessionId}/sm-tables`).then(r => r.ok ? r.json() : null).then(d => { if (d) setTables(d.tables); }).catch(() => {}), [sessionId]);
  useEffect(() => { load(); const i = setInterval(load, 2500); return () => clearInterval(i); }, [load]);
  const create = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/sm-tables`, { name: 'Sette e Mezzo' }); await load(); } finally { setBusy(false); } };
  return (
    <div className="smr"><style>{REGIA_CSS}</style>
      <div className="wrap">
        <h1>Tavoli Sette e Mezzo</h1>
        <div className="sub">Crea un tavolo e aprilo sull'80″.</div>
        <button className="gbtn" disabled={busy} onClick={create}>+ Nuovo tavolo 7½</button>
        <div style={{ height: 14 }} />
        {tables.map(tb => (
          <div key={tb.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><b style={{ color: '#ffe9a6', fontSize: 17 }}>{tb.name}</b><div className="sub" style={{ textAlign: 'left', margin: '2px 0 0' }}>#{tb.round} · {tb.occupied}/{tb.seatsN} seduti · <span className={`phase ${tb.phase}`}>{tb.phase}</span></div></div>
              <div style={{ fontFamily: 'monospace', color: '#9fc8a8' }}>{tb.displayCode}</div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <a className="fbtn" style={{ textAlign: 'center', textDecoration: 'none' }} href={`${ORIGIN}?sm=${tb.displayCode}`} target="_blank" rel="noreferrer">🖥 Monitor</a>
              <a className="fbtn" style={{ textAlign: 'center', textDecoration: 'none' }} href={`${ORIGIN}?smregia=${tb.displayCode}`} target="_blank" rel="noreferrer">🎛 Regia</a>
              <a className="fbtn" style={{ textAlign: 'center', textDecoration: 'none' }} href={`${ORIGIN}?smplay=${tb.displayCode}`} target="_blank" rel="noreferrer">📱 Gioca</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

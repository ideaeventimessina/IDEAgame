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
  minBet: number; maxBet: number; step: number; timeout: number; betSeconds: number; soft17: boolean; suspended: boolean;
  history: BjHist[];
};
type BjState = { table: BjTbl; sessionId: string; seatNo: number | null };

/* ── Helper comuni ── */
const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const seatOrder = (t: BjTbl) => Object.keys(t.seats).map(Number).sort((a, b) => a - b);
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
.bjp{position:fixed;inset:0;overflow:auto;color:#fff;font-family:"Baskerville Casino",Georgia,serif;
  background:radial-gradient(ellipse 150% 80% at 50% 0%,#0a5a26 0%,#063f18 45%,#02220c 100%);display:flex;flex-direction:column;align-items:center;}
.bjp .wrap{width:100%;max-width:460px;min-height:100%;display:flex;flex-direction:column;padding:14px 16px 24px;gap:14px;}
.bjp .head{text-align:center;}
.bjp .logo{height:66px;object-fit:contain;margin:0 auto;display:block;filter:drop-shadow(0 2px 8px #000a);}
.bjp .word{display:flex;align-items:center;justify-content:center;gap:12px;color:#e8c879;font:700 20px/1 "Baskerville Casino",serif;letter-spacing:.14em;margin-top:2px;}
.bjp .word::before,.bjp .word::after{content:"❧";color:#b98b38;font-size:15px;}
.bjp .h1{font:700 26px/1.1 "Baskerville Casino",serif;color:#fff;text-align:center;margin:6px 0 2px;}
.bjp .h2{text-align:center;color:#cbd8c9;font-size:14px;margin-bottom:4px;}
.bjp .panel{position:relative;border-radius:16px;padding:16px;background:linear-gradient(160deg,#0d2a19,#07180e);border:2px solid #b98b38;box-shadow:0 0 0 2px #3a2708,inset 0 0 0 1px rgba(255,235,160,.12),inset 0 10px 34px #0006;}
.bjp .lbl{color:#e8c879;font-size:13px;text-align:center;}
.bjp .big{font:700 40px/1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;}
.bjp .credit{display:flex;align-items:center;justify-content:center;gap:10px;font:700 34px/1 "Baskerville Casino",serif;color:#ffe9a6;}
.bjp input[type=text]{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 20px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.14em;text-transform:uppercase;}
.bjp .name{letter-spacing:0;text-transform:none;font-size:18px;}
.bjp .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 20px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,0 6px 14px #0007,inset 0 1px 0 #fff8;margin-top:auto;}
.bjp .gbtn:disabled{opacity:.5;}
.bjp .step{display:flex;align-items:center;justify-content:center;gap:16px;}
.bjp .rnd{width:64px;height:64px;border-radius:50%;border:3px solid #e6c268;background:radial-gradient(circle at 40% 30%,#1a1305,#0c0c08);color:#ffe9a6;font:700 34px/1 serif;cursor:pointer;}
.bjp .chips{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
.bjp .chip{width:52px;height:52px;border-radius:50%;border:3px dashed #fff;display:grid;place-items:center;font:700 15px/1 serif;color:#fff;cursor:pointer;box-shadow:0 2px 6px #0008;}
.bjp .chip.sel{outline:3px solid #ffe9a6;outline-offset:2px;}
.bjp .seatpick{position:relative;height:230px;margin:6px 0;}
.bjp .seatpick .felt{position:absolute;inset:0;border-radius:50%/42%;background:radial-gradient(ellipse at 50% 30%,#0a6b2c,#064a1c 70%,#042f12);border:3px solid #c9972f;box-shadow:inset 0 0 40px #0008;}
.bjp .sbtn{position:absolute;width:52px;height:52px;border-radius:50%;transform:translate(-50%,-50%);display:grid;place-items:center;border:3px solid #6e5320;background:linear-gradient(#232320,#121210);color:#cdbf8f;font:700 16px/1 serif;cursor:pointer;}
.bjp .sbtn.occ{opacity:.5;cursor:not-allowed;}
.bjp .sbtn.mine{border-color:#4ade80;box-shadow:0 0 14px #4ade80aa;}
.bjp .hand{display:flex;gap:16px;}
.bjp .handbox{flex:1;border-radius:12px;border:1px solid #2f5a3a;background:#06160d;padding:10px;text-align:center;}
.bjp .handbox .t{color:#cbd8c9;font-size:12px;margin-bottom:6px;}
.bjp .cards{display:flex;gap:6px;justify-content:center;align-items:flex-end;margin-bottom:8px;min-height:84px;}
.bjp .actions{display:flex;gap:10px;}
.bjp .act{flex:1;border:none;border-radius:12px;padding:14px 4px;color:#fff;font:700 15px/1.1 "Baskerville Casino",serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 3px 0 rgba(0,0,0,.4);}
.bjp .act .ic{font-size:22px;}
.bjp .act.hit{background:linear-gradient(#1aa64b,#0c7a33);}
.bjp .act.stand{background:linear-gradient(#d4303a,#9c0208);}
.bjp .act.dbl{background:linear-gradient(#f0c357,#cf9633);color:#231503;}
.bjp .act:disabled{filter:grayscale(1);opacity:.45;}
.bjp .outcome{font:700 40px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.02em;}
.bjp .outcome.win,.bjp .outcome.bj{color:#ffe08a;text-shadow:0 0 18px rgba(243,201,95,.6);}
.bjp .outcome.lose{color:#ff7a7a;text-shadow:0 0 16px rgba(220,40,40,.5);}
.bjp .outcome.push{color:#cfe8d6;}
.bjp .note{display:flex;align-items:center;justify-content:center;gap:8px;color:#9fe0b4;font-size:14px;}
.bjp .err{color:#ffb3b3;text-align:center;font-size:14px;}
.bjp .ministate{display:flex;align-items:center;gap:10px;justify-content:center;background:#0b1a10;border:1px solid #2f5a3a;border-radius:999px;padding:8px 14px;}
.bjp .dealerrow{display:flex;align-items:center;justify-content:center;gap:10px;}
`;
const CHIP_COLORS: Record<number, string> = { 10: 'radial-gradient(circle at 40% 30%,#3bbf63,#0c7a33)', 20: 'radial-gradient(circle at 40% 30%,#ef4444,#9c0208)', 50: 'radial-gradient(circle at 40% 30%,#3b82f6,#13408a)', 100: 'radial-gradient(circle at 40% 30%,#3a3a3a,#0b0b0a)', 500: 'radial-gradient(circle at 40% 30%,#a855f7,#5b1a8a)' };

function BlackjackHeader() {
  return (
    <div className="head">
      <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
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
    setBusy(true); setErr('');
    try {
      const info = await fetch(`${API}/gestione/casino/bj/${code}`).then(r => r.ok ? r.json() : null);
      if (!info?.sessionId) { setErr('Tavolo non trovato'); return; }
      const p = await api(`/gestione/casino/sessions/${info.sessionId}/players`, { nickname: nick.trim(), tableId: null, photo });
      if (p?.id && p?.playerCode) { try { localStorage.setItem('casino_player', p.playerCode); } catch { /* */ } setPlayerCode(p.playerCode); setMe({ id: p.id, nickname: p.nickname, fishBalance: p.fishBalance }); }
      else setErr('Accesso non riuscito');
    } finally { setBusy(false); }
  };
  const takeSeat = async (no: number) => {
    setBusy(true); setErr('');
    try { const r = await api('/gestione/casino/bj/join', { displayCode, seatNo: no, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); }
  };
  const placeBet = async (amount: number) => { setBusy(true); setErr(''); try { const r = await api('/gestione/casino/bj/bet', { seatCode: myCode, amount, playerCode }); if (r?.error) setErr(r.error); } finally { setBusy(false); } };
  const unbet = async () => { setBusy(true); try { await api('/gestione/casino/bj/unbet', { seatCode: myCode, playerCode }); } finally { setBusy(false); } };
  const act = async (kind: 'hit' | 'stand' | 'double') => { setBusy(true); setErr(''); try { const r = await api(`/gestione/casino/bj/${kind}`, { seatCode: myCode, playerCode }); if (r?.error) setErr(r.error); setConfirmDbl(false); } finally { setBusy(false); } };

  const Shell = (children: React.ReactNode) => <div className="bjp"><style>{PHONE_CSS}</style><div className="wrap"><BlackjackHeader />{children}</div></div>;

  // 01 ACCESSO
  if (!me) return Shell(
    <>
      <div className="h1">Entra al tavolo</div>
      <div className="h2">Inserisci il codice del tavolo che ti ha fornito l'organizzazione</div>
      <input type="text" value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="CODICE" />
      <div className="lbl" style={{ marginTop: 4 }}>Il tuo nome</div>
      <input type="text" className="name" value={nick} onChange={e => setNick(e.target.value)} placeholder="Come ti chiami" />
      <div className="lbl">La tua foto (opzionale)</div>
      <label style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        {photo ? <img src={photo} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e6c268' }} /> : <Avatar size={96} />}
        <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await fileToAvatar(f)); }} />
        <span style={{ color: '#e8c879', fontSize: 13, marginTop: 6 }}>📷 Aggiungi foto</span>
      </label>
      {err && <div className="err">{err}</div>}
      <button className="gbtn" disabled={busy} onClick={enroll}>Entra ›</button>
    </>
  );

  if (!t) return Shell(<div className="h2" style={{ marginTop: 40 }}>Carico il tavolo…</div>);
  if (t.suspended && mySeatNo == null) return Shell(<div className="panel" style={{ marginTop: 20 }}><div className="outcome push">Tavolo sospeso</div><div className="h2">Attendi la riapertura dalla regia.</div></div>);

  // 02 POSTO (lobby)
  if (mySeatNo == null) {
    const occupied = seatOrder(t).filter(no => t.seats[String(no)]?.playerId).length;
    const full = occupied >= seatOrder(t).length;
    const pos = (i: number, n: number) => { const a = (-90 + (i / n) * 360) * Math.PI / 180; return { left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 42 * Math.sin(a)}%` }; };
    const nos = seatOrder(t);
    return Shell(
      <>
        <div className="h1">{t.name}</div>
        <div className="h2">{full ? 'Tavolo pieno — attendi un posto' : 'Scegli il tuo posto'}</div>
        <div className="seatpick">
          <div className="felt" />
          <img src={`${AB}casino/logo-idea-casino.png`} alt="" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', height: 54, opacity: .9 }} />
          {nos.map((no, i) => { const s = t.seats[String(no)]!; const occ = !!s.playerId; return (
            <button key={no} className={`sbtn${occ ? ' occ' : ''}`} style={pos(i, nos.length)} disabled={occ || busy} onClick={() => takeSeat(no)} title={occ ? (s.nickname ?? 'occupato') : `Posto ${no}`}>
              {occ && s.avatarUrl ? <img src={s.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : no}
            </button>
          ); })}
        </div>
        <div className="panel"><div className="lbl">Il tuo credito</div><div className="credit">🪙 {myBalance.toLocaleString('it-IT')}</div></div>
        {err && <div className="err">{err}</div>}
        <div style={{ marginTop: 'auto', textAlign: 'center', color: '#9fe0b4', fontSize: 13 }}>{occupied}/{nos.length} posti occupati</div>
      </>
    );
  }

  const dealerUp = t.dealer.cards[0];
  const handPanel = (
    <div className="hand">
      <div className="handbox">
        <div className="t">Le tue carte</div>
        <div className="cards">{mySeat!.cards.map((c, i) => <Card key={i} c={c} w={52} />)}</div>
        <Total v={mySeat!.total} bust={mySeat!.status === 'bust'} />
      </div>
      <div className="handbox">
        <div className="t">Banco</div>
        <div className="cards">{dealerUp && <Card c={dealerUp} w={52} />}{t.dealer.hidden && <Card back w={52} />}{!t.dealer.hidden && t.dealer.cards.slice(1).map((c, i) => <Card key={i} c={c} w={52} />)}</div>
        <Total v={t.dealer.hidden ? (dealerUp ? Number(dealerUp.r === 'A' ? 11 : SUIT[dealerUp.s] && isNaN(+dealerUp.r) ? 10 : +dealerUp.r) : null) : t.dealer.total} />
      </div>
    </div>
  );

  // RISULTATO (06/13/14)
  if (t.phase === 'result') {
    const ol = outcomeLabel(mySeat!.outcome);
    return Shell(
      <>
        <div className="h2">Mano {String(t.round).padStart(3, '0')}</div>
        <div className={`outcome ${ol.cls}`}>{ol.t || '—'}</div>
        {handPanel}
        <div className="hand">
          <div className="handbox"><div className="t">Puntata</div><div className="big" style={{ fontSize: 28 }}>🪙 {mySeat!.bet}</div></div>
          <div className="handbox"><div className="t">Profitto</div><div className="big" style={{ fontSize: 28, color: mySeat!.profit > 0 ? '#5ee08a' : mySeat!.profit < 0 ? '#ff7a7a' : '#cfe8d6' }}>{mySeat!.profit > 0 ? '+' : ''}{mySeat!.profit}</div></div>
        </div>
        <div className="panel"><div className="lbl">Nuovo credito</div><div className="credit">🪙 {myBalance.toLocaleString('it-IT')}</div></div>
        {err && <div className="err">{err}</div>}
        <button className="gbtn" disabled>La regia avvia la prossima mano ›</button>
      </>
    );
  }

  // TURNO (04) / ATTESA (05)
  if (t.phase === 'playing' || t.phase === 'dealer') {
    const myTurn = t.phase === 'playing' && t.activeSeat === mySeatNo && mySeat!.status === 'playing';
    const activeName = t.activeSeat != null ? (t.seats[String(t.activeSeat)]?.nickname ?? `Posto ${t.activeSeat}`) : '—';
    const canDouble = myTurn && mySeat!.cards.length === 2 && !mySeat!.doubled && myBalance >= mySeat!.bet;
    return Shell(
      <>
        <div className="ministate"><Avatar url={mySeat!.avatarUrl} name={me.nickname} size={40} /><b style={{ color: '#ffe9a6' }}>{me.nickname}</b><span style={{ marginLeft: 'auto', color: '#cbd8c9', fontSize: 13 }}>Credito<br /><b style={{ color: '#ffe9a6', fontSize: 16 }}>{myBalance.toLocaleString('it-IT')}</b></span></div>
        <div className="h1" style={{ fontSize: 23 }}>{myTurn ? 'È il tuo turno' : <>Turno di <span style={{ color: '#ffe08a' }}>{activeName}</span></>}</div>
        {handPanel}
        <div className="panel" style={{ padding: 12 }}><div className="lbl">Puntata corrente</div><div className="credit" style={{ fontSize: 26 }}>🪙 {mySeat!.bet}</div></div>
        {myTurn
          ? <div className="panel" style={{ padding: 12 }}><div className="lbl">⏱ Tempo per giocare</div><div className="big" style={{ fontSize: 30 }}>{fmtTime(turnCd)}</div></div>
          : mySeat!.status === 'stand' ? <div className="note">⏳ Hai scelto STAI · attendi il banco…</div>
          : mySeat!.status === 'bust' ? <div className="note" style={{ color: '#ff7a7a' }}>Sei sballato · attendi fine mano</div>
          : mySeat!.status === 'blackjack' ? <div className="note">Blackjack! · attendi fine mano</div>
          : <div className="note">Attendi il tuo turno…</div>}
        {err && <div className="err">{err}</div>}
        {confirmDbl ? (
          <div className="panel">
            <div className="h1" style={{ fontSize: 20 }}>Confermi il raddoppio?</div>
            <div className="h2">Puntata da {mySeat!.bet} a {mySeat!.bet * 2} · Riceverai una sola carta</div>
            <button className="gbtn" style={{ background: 'linear-gradient(#1aa64b,#0c7a33)', color: '#fff' }} disabled={busy} onClick={() => act('double')}>✓ Conferma {mySeat!.bet}</button>
            <button className="gbtn" style={{ background: '#1a1a18', color: '#fff', boxShadow: 'none', marginTop: 8 }} onClick={() => setConfirmDbl(false)}>✕ Annulla</button>
          </div>
        ) : (
          <div className="actions" style={{ marginTop: 'auto' }}>
            <button className="act hit" disabled={!myTurn || busy} onClick={() => act('hit')}><span className="ic">🂡</span>CARTA</button>
            <button className="act stand" disabled={!myTurn || busy} onClick={() => act('stand')}><span className="ic">✋</span>STAI</button>
            <button className="act dbl" disabled={!canDouble || busy} onClick={() => setConfirmDbl(true)}><span className="ic">🪙</span>RADDOPPIA</button>
          </div>
        )}
      </>
    );
  }

  // PUNTATA (03) / RICEVUTA (11) — fase betting
  if (mySeat!.status === 'bet') {
    return Shell(
      <>
        <div className="h1">Puntata confermata</div>
        {t.dealer.cards.length === 0 && <div className="h2">In attesa della distribuzione</div>}
        <div className="panel">
          <div className="credit" style={{ fontSize: 30 }}>🪙 {mySeat!.bet}</div>
          <div className="lbl" style={{ marginTop: 6 }}>{mySeat!.bet} crediti riservati · Disponibili {myBalance.toLocaleString('it-IT')}</div>
        </div>
        <div className="note">⏳ In attesa della distribuzione{t.betEndsAt ? ` · ${fmtTime(betCd)}` : ''}</div>
        {err && <div className="err">{err}</div>}
        <button className="gbtn" style={{ background: '#1a1a18', color: '#ffe9a6', boxShadow: 'none' }} disabled={busy} onClick={unbet}>✎ Modifica puntata</button>
      </>
    );
  }
  // scelta puntata
  const chips = [10, 20, 50, 100].filter(c => c <= t.maxBet);
  const cur = chip || (mySeat!.bet || Math.max(t.minBet, chips[0] || t.minBet));
  const dec = () => setChip(Math.max(t.minBet, cur - t.step));
  const inc = () => setChip(Math.min(t.maxBet, Math.min(myBalance, cur + t.step)));
  return Shell(
    <>
      <div className="h1">Fai la tua puntata</div>
      <div className="panel"><div className="lbl">Credito disponibile</div><div className="credit">🪙 {myBalance.toLocaleString('it-IT')}</div></div>
      <div className="step"><button className="rnd" onClick={dec}>−</button><div className="big" style={{ minWidth: 120 }}>{cur}</div><button className="rnd" onClick={inc}>+</button></div>
      <div className="chips">{chips.map(c => <button key={c} className={`chip${cur === c ? ' sel' : ''}`} style={{ background: CHIP_COLORS[c] }} onClick={() => setChip(c)}>{c}</button>)}</div>
      {t.betEndsAt && <div className="panel" style={{ padding: 12 }}><div className="lbl">⏱ Tempo rimanente</div><div className="big" style={{ fontSize: 30 }}>{fmtTime(betCd)}</div></div>}
      <div className="h2">Puntata {t.minBet}–{t.maxBet}, multipli di {t.step}</div>
      {err && <div className="err">{err}</div>}
      <button className="gbtn" disabled={busy || cur > myBalance} onClick={() => placeBet(cur)}>Conferma puntata ›</button>
    </>
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
.bjm2 .stage{position:relative;width:744px;height:407px;flex:none;transform-origin:center center;border-radius:18px;overflow:hidden;
  background:
    radial-gradient(ellipse 66% 46% at 50% -4%,#020a05 0%,#04140a 36%,rgba(5,24,12,0) 62%),
    radial-gradient(ellipse 122% 86% at 50% 52%,#0b7330 0%,#065a22 38%,#033d15 68%,#01240b 100%);
  box-shadow:inset 0 0 0 3px #0a2a16,inset 0 0 0 7px #bd922f,inset 0 0 0 9px #0a2a16,inset 0 0 80px #000a;}
.bjm2 .logo{position:absolute;left:6px;top:4px;width:167px;height:101px;object-fit:fill;filter:drop-shadow(0 2px 6px #000a);}
.bjm2 .archwrap{position:absolute;left:50%;top:0;transform:translateX(-50%);width:490px;height:54px;overflow:hidden;pointer-events:none;}
.bjm2 .arch{position:relative;width:478px;height:160px;margin:0 auto;border-radius:50%;border:2px solid #d9b65d;box-shadow:0 0 0 1px #6b4a17,0 5px 14px #e8c87933,inset 0 4px 10px #e8c87922;}
.bjm2 .arch::before{content:"";position:absolute;inset:6px;border-radius:50%;border:1px solid #9c7a30;}
.bjm2 .banco{position:absolute;left:50%;top:3px;transform:translateX(-50%);padding:3px 22px;border:2px solid #debb60;border-radius:13px;background:radial-gradient(ellipse at 50% 50%,#083016,#04200c);color:#f5de93;font:700 15px/1 "Baskerville Casino",serif;letter-spacing:.24em;box-shadow:0 0 10px #e8c87955,inset 0 1px 2px #fff3;z-index:3;}
.bjm2 .dup{position:absolute;left:309px;top:36px;z-index:2;}
.bjm2 .dback{position:absolute;left:387px;top:30px;width:52px;height:80px;border-radius:7px;overflow:hidden;box-shadow:0 3px 8px #000b,inset 0 0 0 1px #0007;z-index:2;}
.bjm2 .dback img{width:100%;height:100%;object-fit:cover;display:block;}
.bjm2 .dtot{position:absolute;left:255px;top:55px;z-index:3;}
.bjm2 .phone2{position:absolute;right:40px;top:31px;text-align:right;color:#ecd7a0;font:400 14px/1.3 "Baskerville Casino",serif;}
.bjm2 .phicon{position:absolute;right:9px;top:33px;width:23px;height:45px;border:2px solid #e6c268;border-radius:5px;box-shadow:inset 0 0 5px #e8c87944;}
.bjm2 .phicon::after{content:"";position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:9px;height:2px;border-radius:2px;background:#e6c268;}
.bjm2 .turnbar{position:absolute;left:50%;top:124px;transform:translateX(-50%);padding:6px 24px;border:3px solid #e8cd7a;border-radius:16px;background:linear-gradient(180deg,#05240d,#01160a);box-shadow:0 0 15px #e8c87944,inset 0 0 12px #0009;white-space:nowrap;z-index:2;}
.bjm2 .turnbar span{font:700 26px/1 "Baskerville Casino",serif;letter-spacing:.01em;background:linear-gradient(180deg,#fff4c6,#ffe091 48%,#e4ad4c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 0 #0008);}
.bjm2 .flour{position:absolute;top:135px;height:22px;z-index:1;opacity:.9;}
.bjm2 .flour.l{left:50%;margin-left:-212px;}
.bjm2 .flour.r{left:50%;margin-left:183px;transform:scaleX(-1);}
.bjm2 .seats2{position:absolute;left:4px;right:4px;top:169px;display:flex;gap:5px;}
.bjm2 .st{position:relative;flex:1 1 0;height:231px;border-radius:12px;border:2px solid #356a41;background:linear-gradient(162deg,#0e2c1b,#06160d);box-shadow:inset 0 1px 0 #ffffff12,0 4px 10px #0007;display:flex;flex-direction:column;align-items:center;}
.bjm2 .st.active{border-color:#5de78d;box-shadow:0 0 18px #4ade80cc,inset 0 0 16px #4ade8033;}
.bjm2 .snum{position:absolute;top:-13px;left:50%;transform:translateX(-50%);width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#1d1708,#0b0b07);border:2px solid #e6c268;color:#ffe9a6;display:grid;place-items:center;font:700 13px/1 serif;z-index:3;box-shadow:0 2px 4px #0008;}
.bjm2 .scards2{display:flex;justify-content:center;align-items:flex-end;margin-top:16px;height:68px;}
.bjm2 .stot2{margin-top:-9px;z-index:2;position:relative;}
.bjm2 .sav{margin-top:7px;}
.bjm2 .snm{font:700 15px/1 "Baskerville Casino",serif;color:#fff;margin-top:6px;}
.bjm2 .smeta{font:400 11px/1.4 "Baskerville Casino",serif;color:#cedbc9;text-align:center;margin-top:2px;}
.bjm2 .smeta b{color:#ffe9a6;font-weight:700;}
`;
function BjPlayStage({ t, turnCd, dim }: { t: BjTbl; turnCd: number; dim: { w: number; h: number } }) {
  const scale = Math.min(dim.w / 744, dim.h / 407);
  const nos = seatOrder(t);
  const up = t.dealer.cards[0];
  const activeName = t.activeSeat != null ? (t.seats[String(t.activeSeat)]?.nickname ?? `Posto ${t.activeSeat}`) : null;
  return (
    <div className="bjm2"><style>{MON2_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
        {/* BANCO: arco oro + pill + carte + totale */}
        <div className="archwrap"><div className="arch" /></div>
        <div className="banco">BANCO</div>
        <div className="dtot"><Total v={dealerVisibleTotal(t.dealer)} size={16} /></div>
        {up && <div className="dup"><Card c={up} w={46} /></div>}
        {t.dealer.hidden
          ? <div className="dback"><img src={`${AB}bj/card-back.png`} alt="" /></div>
          : t.dealer.cards.slice(1).map((c, i) => <div key={i} className="dback" style={{ left: 387 + i * 56, borderRadius: 7, overflow: 'visible' }}><Card c={c} w={52} /></div>)}
        {/* smartphone */}
        <div className="phone2">Gioca dal tuo<br />smartphone</div>
        <div className="phicon" />
        {/* turno */}
        <img className="flour l" src={`${AB}casino/flourish-l.png`} alt="" />
        <img className="flour r" src={`${AB}casino/flourish-l.png`} alt="" />
        <div className="turnbar"><span>{t.phase === 'dealer' || activeName == null ? 'Il banco gioca…' : <>Turno di {activeName} · {fmtTime(turnCd)}</>}</span></div>
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
                <div className="sav"><Avatar url={s.avatarUrl} name={s.nickname} size={46} /></div>
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
.bjm3 .stage{position:relative;width:744px;height:407px;flex:none;transform-origin:center center;border-radius:18px;overflow:hidden;
  background:
    radial-gradient(ellipse 66% 46% at 50% -4%,#020a05 0%,#04140a 36%,rgba(5,24,12,0) 62%),
    radial-gradient(ellipse 122% 86% at 50% 52%,#0b7330 0%,#065a22 38%,#033d15 68%,#01240b 100%);
  box-shadow:inset 0 0 0 3px #0a2a16,inset 0 0 0 7px #bd922f,inset 0 0 0 9px #0a2a16,inset 0 0 80px #000a;}
.bjm3 .logo{position:absolute;left:6px;top:4px;width:167px;height:101px;object-fit:fill;filter:drop-shadow(0 2px 6px #000a);}
.bjm3 .title{position:absolute;left:150px;width:470px;top:12px;text-align:center;font:700 58px/1 "Baskerville Casino",serif;letter-spacing:.015em;background:linear-gradient(180deg,#fff6c8,#ffe08a 45%,#e9b24f);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 1px #000a);}
.bjm3 .qrbox{position:absolute;left:100px;top:107px;width:146px;height:146px;background:#fff;border-radius:8px;padding:8px;box-sizing:border-box;box-shadow:0 2px 8px #0009;}
.bjm3 .qrbox svg{display:block;width:100%;height:100%;}
.bjm3 .scan{position:absolute;left:256px;top:118px;width:182px;text-align:center;color:#f3e7c2;font:700 21px/1.25 "Baskerville Casino",serif;}
.bjm3 .codelbl{position:absolute;left:256px;top:208px;width:182px;text-align:center;color:#e8c879;font:400 13px/1 "Baskerville Casino",serif;letter-spacing:.16em;}
.bjm3 .codepill{position:absolute;left:290px;top:226px;width:118px;text-align:center;padding:7px 0;border:2px solid #debb60;border-radius:11px;background:radial-gradient(ellipse at 50% 50%,#083016,#04200c);color:#ffe9a6;font:700 26px/1 "Baskerville Casino",serif;letter-spacing:.08em;box-shadow:0 0 10px #e8c87955,inset 0 1px 2px #fff3;}
.bjm3 .tavolo{position:absolute;left:520px;top:106px;width:184px;text-align:center;padding:9px 0;border:3px solid #e8cd7a;border-radius:14px;background:radial-gradient(ellipse at 50% 50%,#06330f,#02220c);color:#ffe3a0;font:700 30px/1 "Baskerville Casino",serif;text-shadow:0 1px 1px #000a;box-shadow:0 0 14px #e8c87944,inset 0 0 10px #0009;}
.bjm3 .players{position:absolute;left:510px;top:160px;width:200px;display:flex;flex-direction:column;align-items:center;gap:3px;}
.bjm3 .players .prow{display:flex;align-items:center;gap:13px;}
.bjm3 .players .pn{font:700 34px/1 "Baskerville Casino",serif;color:#fff;}
.bjm3 .players .pl{font:400 15px/1 "Baskerville Casino",serif;color:#e8c879;}
.bjm3 .status{position:absolute;left:510px;top:224px;width:200px;text-align:center;padding:10px 0;border:3px solid #4ade80;border-radius:14px;background:linear-gradient(180deg,#05240d,#01160a);color:#eafff0;font:700 24px/1 "Baskerville Casino",serif;box-shadow:0 0 16px #4ade8077,inset 0 0 10px #0009;}
.bjm3 .status.wait{border-color:#e0b24a;color:#ffe3a0;box-shadow:0 0 16px #e0b24a66,inset 0 0 10px #0009;}
.bjm3 .wseats{position:absolute;left:6px;right:6px;bottom:7px;display:flex;gap:5px;}
.bjm3 .ws{position:relative;flex:1 1 0;height:116px;border-radius:12px;border:2px solid #7c6632;background:linear-gradient(162deg,#0e2c1b,#06160d);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:16px;box-shadow:inset 0 1px 0 #ffffff10,inset 0 0 0 1px #4a3c1a;}
.bjm3 .ws.free{border-color:#5a4a26;opacity:.9;}
.bjm3 .wsnum{position:absolute;top:-11px;left:50%;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#1d1708,#0b0b07);border:2px solid #e6c268;color:#ffe9a6;display:grid;place-items:center;font:700 12px/1 serif;z-index:2;box-shadow:0 2px 4px #0008;}
.bjm3 .wsnm{font:700 16px/1 "Baskerville Casino",serif;color:#fff;margin-top:7px;}
.bjm3 .wscr{font:400 14px/1 "Baskerville Casino",serif;color:#ffe9a6;margin-top:4px;}
.bjm3 .wsfree{color:#8aa08c;font:400 15px/1 "Baskerville Casino",serif;margin-top:12px;}
`;
function BjWaitStage({ t, dim, playUrl }: { t: BjTbl; dim: { w: number; h: number }; playUrl: string }) {
  const scale = Math.min(dim.w / 744, dim.h / 407);
  const nos = seatOrder(t);
  const occupied = nos.filter(no => t.seats[String(no)]?.playerId).length;
  const betting = t.phase === 'betting';
  return (
    <div className="bjm3"><style>{MON3_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <img className="logo" src={`${AB}casino/logo-idea-casino.png`} alt="IDEA EVENTI CASINÒ" />
        <div className="title">BLACKJACK</div>
        <div className="qrbox"><QRCodeSVG value={playUrl} size={130} /></div>
        <div className="scan">Scansiona<br />e gioca dal<br />tuo telefono</div>
        <div className="codelbl">CODICE TAVOLO</div>
        <div className="codepill">{t.displayCode}</div>
        <div className="tavolo">{t.name}</div>
        <div className="players"><div className="prow"><PeopleIcon /><span className="pn">{occupied} / {nos.length}</span></div><div className="pl">giocatori</div></div>
        <div className={`status${betting ? '' : ' wait'}`}>{betting ? 'Puntate aperte' : 'In attesa'}</div>
        <div className="wseats">
          {nos.map(no => {
            const s = t.seats[String(no)]!;
            if (!s.playerId) return <div key={no} className="ws free"><div className="wsnum">{no}</div><Avatar size={44} /><div className="wsfree">Libero</div></div>;
            return (
              <div key={no} className="ws"><div className="wsnum">{no}</div>
                <Avatar url={s.avatarUrl} name={s.nickname} size={46} />
                <div className="wsnm">{s.nickname}</div>
                <div className="wscr">{String(s.balance ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</div>
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
      </div>
    </div>
  );
}

export function BlackjackMonitor({ displayCode }: { displayCode: string }) {
  const st = useBjTable(displayCode, 900);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  // auto-progressione: alla scadenza puntate distribuisce; forza timeout turni; dopo risultato riapre
  const lastAuto = useRef(0);
  useEffect(() => {
    const t = st?.table; if (!t) return;
    const now = Date.now();
    if (t.phase === 'betting' && t.betEndsAt && now > Date.parse(t.betEndsAt) && Object.values(t.seats).some(s => s.bet > 0) && now - lastAuto.current > 1500) { lastAuto.current = now; api('/gestione/casino/bj/deal', { displayCode }); }
    if (t.phase === 'playing' && t.turnEndsAt && now > Date.parse(t.turnEndsAt) + 1200 && t.activeSeat != null && now - lastAuto.current > 1500) { lastAuto.current = now; fetch(`${API}/gestione/casino/bj/${displayCode}`); }
  }, [st, displayCode]);
  const turnCd = useCountdown(st?.table.phase === 'playing' ? st.table.turnEndsAt : null);
  if (!st) return <div className="bjm3"><style>{MON3_CSS}</style><div style={{ color: '#9fe0b4', fontSize: 24 }}>Carico il tavolo…</div></div>;
  const t = st.table;
  const playUrl = `${ORIGIN}gestione/casino?bjplay=${t.displayCode}`;

  // Fase di gioco: palco fisso 744×407 fedele al mockup "08 MONITOR PARTITA"
  if (t.phase === 'playing' || t.phase === 'dealer') return <BjPlayStage t={t} turnCd={turnCd} dim={dim} />;
  // Risultati: palco fisso 744×407 fedele al mockup "17 MONITOR RISULTATI"
  if (t.phase === 'result') return <BjResultStage t={t} dim={dim} />;
  // Attesa / puntate: palco fisso 744×407 fedele al mockup "07 MONITOR ATTESA"
  return <BjWaitStage t={t} dim={dim} playUrl={playUrl} />;
}

/* ════════════════════════════════════════════════════════════════════════════
   REGIA (per tavolo) — canvas fisso 1600×900
   ════════════════════════════════════════════════════════════════════════════ */
const REGIA_CSS = BJ_FONT + CARD_CSS + `
.bjr{position:fixed;inset:0;overflow:auto;background:#02140a;display:flex;align-items:flex-start;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.bjr .stage{position:relative;width:1600px;height:900px;flex:none;transform-origin:top center;background:radial-gradient(ellipse 120% 90% at 50% 10%,#0a5a26,#063f18 55%,#02260e);box-shadow:inset 0 0 0 8px #0a2a16,inset 0 0 0 11px #c9972f;padding:26px;box-sizing:border-box;}
.bjr .logo{position:absolute;right:30px;top:20px;height:120px;}
.bjr .title{font:700 44px/1 "Baskerville Casino",serif;color:#ffe9a6;}
.bjr .pill{display:inline-flex;align-items:center;gap:10px;margin-top:12px;padding:10px 24px;border-radius:999px;border:2px solid #4ade80;color:#9fe0b4;font-size:22px;box-shadow:0 0 16px #4ade8055;}
.bjr .pill.closed{border-color:#e0b24a;color:#ffe08a;box-shadow:0 0 16px #e0b24a55;}
.bjr .code{position:absolute;right:30px;top:150px;color:#cbd8c9;font-size:20px;}
.bjr .panel{position:absolute;border-radius:14px;background:linear-gradient(160deg,#0c2417,#06150d);border:2px solid #b98b38;box-shadow:inset 0 0 0 1px rgba(255,235,160,.1);padding:16px;box-sizing:border-box;}
.bjr table{width:100%;border-collapse:collapse;font-size:19px;}
.bjr th{color:#e8c879;text-align:left;font-weight:700;padding:8px 10px;border-bottom:1px solid #2f5a3a;}
.bjr td{padding:8px 10px;border-bottom:1px solid #16331f;}
.bjr .dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;}
.bjr .set{display:flex;align-items:center;justify-content:space-between;margin:10px 0;}
.bjr .set input,.bjr .set select{width:120px;padding:8px;border-radius:8px;border:1px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 16px serif;text-align:center;}
.bjr .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 22px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #7a4d12,inset 0 1px 0 #fff8;}
.bjr .gbtn:disabled{opacity:.5;}
.bjr .foot{position:absolute;left:26px;right:26px;bottom:24px;display:flex;gap:16px;}
.bjr .fbtn{flex:1;padding:14px;border-radius:12px;border:1px solid #6e5320;background:#0c0c08;color:#ffe9a6;font:700 20px serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;}
.bjr .res.win{color:#7ef0a4;font-weight:700;}
.bjr .res.lose{color:#ff9b9b;font-weight:700;}
.bjr .res.push{color:#ffe08a;font-weight:700;}
.bjr .mini{display:inline-flex;gap:3px;vertical-align:middle;}
`;
export function BlackjackRegia({ displayCode }: { displayCode: string }) {
  const st = useBjTable(displayCode, 1200);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const [busy, setBusy] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const call = async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setBusy(false); } };
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
              <div className="set"><span>Banco sta su</span><select value={t.soft17 ? 'h' : 's'} disabled={closed || busy} onChange={e => call('/gestione/casino/bj/settings', { soft17Hit: e.target.value === 'h' })}><option value="s">Soft 17 (sta)</option><option value="h">Soft 17 (pesca)</option></select></div>
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
   ELENCO TAVOLI (hub regia) — ?bjtables=SESSIONID
   ════════════════════════════════════════════════════════════════════════════ */
const HUB_CSS = BJ_FONT + `
.bjh{position:fixed;inset:0;overflow:auto;color:#fff;font-family:"Baskerville Casino",Georgia,serif;background:radial-gradient(ellipse 120% 80% at 50% 0%,#0a5a26,#063f18 50%,#02220c);padding:28px;}
.bjh .logo{height:110px;position:absolute;right:30px;top:20px;}
.bjh h1{font:700 44px/1 "Baskerville Casino",serif;color:#ffe9a6;}
.bjh .row{display:flex;gap:22px;flex-wrap:wrap;margin-top:24px;align-items:flex-start;}
.bjh .tcard{width:360px;border-radius:16px;background:linear-gradient(160deg,#0c2417,#06150d);border:2px solid #b98b38;padding:18px;}
.bjh .tcard h2{margin:0 0 6px;font:700 30px/1 serif;color:#fff;}
.bjh .pill{display:inline-block;padding:6px 16px;border-radius:999px;font-size:16px;border:2px solid #4ade80;color:#9fe0b4;}
.bjh .pill.b{border-color:#e0b24a;color:#ffe08a;}
.bjh .acts{display:flex;gap:10px;margin-top:16px;}
.bjh .acts button{flex:1;padding:12px;border-radius:10px;border:1px solid #6e5320;background:#0c0c08;color:#ffe9a6;font:700 16px serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;}
.bjh .new{width:320px;border-radius:16px;background:linear-gradient(160deg,#0c2417,#06150d);border:2px solid #b98b38;padding:18px;}
.bjh .new label{display:block;color:#e8c879;font-size:15px;margin:10px 0 4px;}
.bjh .new input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 17px serif;}
.bjh .gbtn{width:100%;margin-top:16px;padding:14px;border-radius:10px;border:1px solid #f3dea0;background:linear-gradient(180deg,#ffe694,#f0c357 48%,#d59a34 52%,#eab74a);color:#231503;font:700 19px serif;cursor:pointer;}
.bjh .qr{position:fixed;inset:0;background:#000b;display:grid;place-items:center;}
.bjh .qr .box{background:#06150d;border:2px solid #c9972f;border-radius:16px;padding:24px;text-align:center;}
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
              <button onClick={() => open(`${ORIGIN}gestione/casino?bjregia=${tb.displayCode}`)}>👁<span>Regia</span></button>
              <button onClick={() => open(`${ORIGIN}gestione/casino?bj=${tb.displayCode}`)}>🖥<span>Monitor</span></button>
              <button onClick={() => setQr(`${ORIGIN}gestione/casino?bjplay=${tb.displayCode}`)}>🔳<span>QR</span></button>
            </div>
          </div>
        ))}
        <div className="new">
          <h2 style={{ margin: 0, fontSize: 26, color: '#ffe9a6' }}>Nuovo tavolo</h2>
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

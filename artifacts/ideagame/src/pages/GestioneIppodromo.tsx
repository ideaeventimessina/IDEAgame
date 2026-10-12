/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Ippodromo Idea Eventi — corsa dei cavalli ───────────────────────────────
   Tre interfacce sul motore server-autorevole (gestione-casino.ts):
   · HorsePhone   — il giocatore gioca dal telefono (accesso→scegli cavallo→
                    conferma→ricevuta→corsa→esito). Una puntata per corsa.
   · HorseMonitor — vista pubblica 80": puntate, corsa (pista ovale), risultati.
   · HorseRegia / HorseTablesView — controllo corse ed elenco/creazione tavoli.
   6 cavalli equiprobabili, pagamento 6× (ritorno totale). Crediti virtuali,
   niente simbolo monetario. Animazione deterministica da order+seeds del server. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API = ((import.meta.env.BASE_URL as string) || '/') + 'api';
const ORIGIN = window.location.origin + ((import.meta.env.BASE_URL as string) || '/');
const AB = (import.meta.env.BASE_URL as string) || '/';
const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

export const HORSES = [
  { n: 1, name: 'Fulmine', color: '#d4303a', glow: '#ff5a62' },
  { n: 2, name: 'Stella', color: '#2f6fe0', glow: '#5a95ff' },
  { n: 3, name: 'Vento', color: '#2ca24e', glow: '#5ee08a' },
  { n: 4, name: 'Saetta', color: '#e8c33a', glow: '#ffe08a' },
  { n: 5, name: 'Tempesta', color: '#8a4bd6', glow: '#c08aff' },
  { n: 6, name: 'Luna', color: '#e8862f', glow: '#ffb46a' },
];
const H = (n: number) => HORSES[n - 1]!;

type HorsePlayer = { id: string; nickname: string; avatarUrl: string | null; balance: number; bet: { horse: number; amount: number } | null };
type HorseHist = { race: number; at: string; winner: number; order: number[]; players: number; cancelled?: boolean; results: { playerId: string; nickname: string; horse: number; bet: number; credit: number; profit: number }[] };
type HorseTbl = {
  id: string; name: string; displayCode: string; type: 'horse';
  phase: 'waiting' | 'betting' | 'racing' | 'result'; race: number;
  minBet: number; maxBet: number; step: number; betSeconds: number; raceMs: number;
  betEndsAt: string | null; raceEndsAt: string | null;
  current: { order: number[]; seeds: number[]; startedAt: string; durMs: number } | null;
  betsCount: number; players: HorsePlayer[]; suspended: boolean; history: HorseHist[];
};
type HorseState = { table: HorseTbl; sessionId: string };

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function useCountdown(iso: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => { if (!iso) { setN(0); return; } const tick = () => setN(Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000))); tick(); const t = setInterval(tick, 250); return () => clearInterval(t); }, [iso]);
  return n;
}
function useHorseTable(code: string, ms = 900): HorseState | null {
  const [st, setSt] = useState<HorseState | null>(null);
  useEffect(() => { let on = true; const load = () => fetch(`${API}/gestione/casino/horse/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {}); load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); }; }, [code, ms]);
  return st;
}
// re-render a ~60fps finché la corsa è in diretta (posizioni calcolate localmente)
function useRaceClock(active: boolean): number {
  const [, setT] = useState(0);
  useEffect(() => { if (!active) return; let raf = 0; const loop = () => { setT(x => (x + 1) % 1e6); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, [active]);
  return Date.now();
}
// progresso 0..1 del cavallo h, deterministico da order+seeds (uguale su ogni client)
function horseProgress(cur: HorseTbl['current'], h: number, now: number): number {
  if (!cur) return 0;
  const rank = cur.order.indexOf(h); if (rank < 0) return 0;
  const pFinal = 1 - rank * 0.014;
  const e = 0.72 + (cur.seeds[h - 1] ?? 0.5) * 0.7;
  const frac = Math.max(0, Math.min(1, (now - Date.parse(cur.startedAt)) / cur.durMs));
  return pFinal * Math.pow(frac, e);
}
async function fileToAvatar(file: File): Promise<string> {
  const img = await createImageBitmap(file); const s = 320, cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d')!; const scale = Math.max(s / img.width, s / img.height); const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); return cv.toDataURL('image/jpeg', 0.82);
}

const FONT = `@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}`;

function Brand({ size = 1 }: { size?: number }) {
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 * size }}>
        <span style={{ fontSize: 30 * size }}>🐎</span>
        <span style={{ font: `700 ${30 * size}px "Baskerville Casino",serif`, letterSpacing: '.04em', background: 'linear-gradient(180deg,#fff6c8,#ffe08a 45%,#e9b24f)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>IDEA EVENTI</span>
      </div>
      <div style={{ font: `700 ${15 * size}px "Baskerville Casino",serif`, letterSpacing: '.42em', color: '#e8c879', marginTop: 3 * size, paddingLeft: '.42em' }}>IPPODROMO</div>
    </div>
  );
}
// Pedina cavallo: colore + numero (riconoscibile anche senza distinguere i colori).
function HorseBadge({ n, size = 44, active }: { n: number; size?: number; active?: boolean }) {
  const h = H(n);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `radial-gradient(circle at 38% 30%, ${h.glow}, ${h.color} 68%)`, border: `${Math.max(2, size * 0.06)}px solid #fff`, boxShadow: active ? `0 0 ${size * 0.4}px ${h.glow}` : '0 2px 6px #0007', display: 'grid', placeItems: 'center', color: '#fff', font: `700 ${size * 0.5}px "Baskerville Casino",serif`, flex: 'none', textShadow: '0 1px 2px #0008' }}>{n}</div>
  );
}

/* ════════════════════════════════════════════════ TELEFONO ════════════════ */
const PHONE_CSS = FONT + `
.hp{position:fixed;inset:0;overflow:auto;color:#fff;font-family:"Baskerville Casino",Georgia,serif;background:radial-gradient(ellipse 150% 80% at 50% 0%,#123a1a 0%,#0a2512 45%,#05140a 100%);display:flex;flex-direction:column;align-items:center;}
.hp .wrap{width:100%;max-width:460px;min-height:100%;display:flex;flex-direction:column;padding:16px 16px 26px;gap:14px;}
.hp .h1{font:700 26px/1.15 "Baskerville Casino",serif;text-align:center;color:#fff;}
.hp .h2{text-align:center;color:#bfe0c6;font-size:14px;}
.hp .panel{position:relative;border-radius:16px;padding:16px;background:linear-gradient(160deg,#0e2e18,#07180e);border:2px solid #b98b38;box-shadow:0 0 0 2px #3a2708,inset 0 0 0 1px rgba(255,235,160,.12);}
.hp input[type=text]{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 20px/1 "Baskerville Casino",serif;text-align:center;letter-spacing:.14em;text-transform:uppercase;}
.hp input.name{letter-spacing:0;text-transform:none;font-size:18px;}
.hp .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid #bff0cf;background:linear-gradient(180deg,#39d46b,#139a3e 52%,#0c7a33);color:#04210e;font:700 20px/1 "Baskerville Casino",serif;cursor:pointer;box-shadow:0 3px 0 #0a5a26,0 6px 14px #0007,inset 0 1px 0 #fff6;}
.hp .gbtn.gold{background:linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34);color:#231503;box-shadow:0 3px 0 #7a4d12,inset 0 1px 0 #fff8;border-color:#f3dea0;}
.hp .gbtn:disabled{opacity:.5;}
.hp .hrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:2px solid #2f5a3a;background:#09200f;cursor:pointer;}
.hp .hrow.sel{border-color:#f3c95f;box-shadow:0 0 0 1px #f3c95f,0 0 14px rgba(243,201,95,.3);background:#10331b;}
.hp .hrow .nm{font:700 20px/1 "Baskerville Casino",serif;flex:1;}
.hp .hrow .mx{color:#e8c879;font-size:13px;text-align:right;line-height:1.2;}
.hp .step{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.hp .rnd{width:48px;height:48px;border-radius:50%;border:2px solid #e6c268;background:#17130b;color:#ffe9a6;font:700 26px/1 serif;cursor:pointer;flex:none;}
.hp .big{font:700 34px/1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;}
.hp .kv{display:flex;justify-content:space-between;align-items:center;padding:8px 2px;border-bottom:1px solid #16331f;font-size:17px;}
.hp .kv b{color:#ffe9a6;font-size:20px;}
.hp .kv b.green{color:#5ee08a;}
.hp .kv b.red{color:#ff8a8a;}
.hp .note{text-align:center;color:#9fe0b4;font-size:13px;}
.hp .err{text-align:center;color:#ffb3b3;font-size:14px;}
.hp .outcome{font:700 42px/1 "Baskerville Casino",serif;text-align:center;}
.hp .outcome.win{color:#ffe08a;text-shadow:0 0 18px rgba(243,201,95,.6);}
.hp .outcome.lose{color:#ff8a8a;}
.hp .lanes{display:flex;flex-direction:column;gap:6px;border-radius:14px;overflow:hidden;border:2px solid #6e5320;background:linear-gradient(#5a3f22,#43301a);padding:8px 6px;}
.hp .lane{position:relative;height:30px;border-radius:7px;background:repeating-linear-gradient(90deg,#6b4a28,#6b4a28 16px,#5e4122 16px,#5e4122 32px);}
.hp .lane .fin{position:absolute;right:6px;top:0;bottom:0;width:4px;background:repeating-linear-gradient(#fff,#fff 4px,#111 4px,#111 8px);}
.hp .lane .run{position:absolute;top:50%;transform:translate(-50%,-50%);transition:left .09s linear;display:flex;align-items:center;}
`;
function PhoneShell({ children }: { children: React.ReactNode }) {
  return <div className="hp"><style>{PHONE_CSS}</style><div className="wrap"><div style={{ textAlign: 'center' }}><Brand /></div>{children}</div></div>;
}
function Lanes({ cur, now, big }: { cur: HorseTbl['current']; now: number; big?: boolean }) {
  return (
    <div className="lanes" style={big ? { padding: '12px 8px' } : undefined}>
      {HORSES.map(h => { const p = horseProgress(cur, h.n, now); return (
        <div className="lane" key={h.n} style={big ? { height: 46 } : undefined}>
          <div className="fin" />
          <div className="run" style={{ left: `${6 + p * 86}%` }}><span style={{ fontSize: big ? 30 : 22, filter: `drop-shadow(0 0 4px ${h.glow})`, transform: 'scaleX(-1)', display: 'inline-block' }}>🐎</span><div style={{ marginLeft: -6 }}><HorseBadge n={h.n} size={big ? 26 : 20} /></div></div>
        </div>
      ); })}
    </div>
  );
}

export function HorsePhone({ displayCode }: { displayCode: string }) {
  const [playerCode, setPlayerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [me, setMe] = useState<{ id: string; nickname: string; fishBalance: number } | null>(null);
  const st = useHorseTable(displayCode, 900);
  const t = st?.table;
  const now = useRaceClock(t?.phase === 'racing');
  const [tableCode, setTableCode] = useState(displayCode);
  const [nick, setNick] = useState(''); const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [chosen, setChosen] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => { if (!playerCode) { setMe(null); return; } fetch(`${API}/gestione/casino/player/${playerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.player) setMe({ id: d.player.id, nickname: d.player.nickname, fishBalance: d.player.fishBalance }); }).catch(() => {}); }, [playerCode, t?.race, t?.phase]);

  const mePl = useMemo(() => t && me ? t.players.find(p => p.id === me.id) ?? null : null, [t, me]);
  const myBalance = mePl?.balance ?? me?.fishBalance ?? 0;
  const myBet = mePl?.bet ?? null;
  const betCd = useCountdown(t?.phase === 'betting' ? t.betEndsAt : null);

  const enroll = async () => {
    const code = tableCode.trim().toUpperCase(); if (!code || !nick.trim()) { setErr('Inserisci codice e nome'); return; }
    setBusy(true); setErr('');
    try {
      const info = await fetch(`${API}/gestione/casino/horse/${code}`).then(r => r.ok ? r.json() : null);
      if (!info?.sessionId) { setErr('Tavolo non trovato'); return; }
      const p = await api(`/gestione/casino/sessions/${info.sessionId}/players`, { nickname: nick.trim(), tableId: null, photo });
      if (p?.id && p?.playerCode) { try { localStorage.setItem('casino_player', p.playerCode); } catch { /* */ } setPlayerCode(p.playerCode); setMe({ id: p.id, nickname: p.nickname, fishBalance: p.fishBalance }); }
      else setErr('Accesso non riuscito');
    } finally { setBusy(false); }
  };
  const confirmBet = async () => { if (!chosen) return; setBusy(true); setErr(''); try { const r = await api('/gestione/casino/horse/bet', { displayCode, playerCode, horse: chosen, amount }); if (r?.error) setErr(r.error); else setStep('select'); } finally { setBusy(false); } };
  const cancelBet = async () => { setBusy(true); try { await api('/gestione/casino/horse/unbet', { displayCode, playerCode }); } finally { setBusy(false); } };

  if (!me) return (
    <PhoneShell>
      <div className="h1" style={{ marginTop: 6 }}>Entra al tavolo</div>
      <div className="h2">Inserisci il codice che ti ha dato l'organizzazione</div>
      <input type="text" value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="CODICE" />
      <div className="h2" style={{ textAlign: 'left', color: '#e8c879' }}>Il tuo nome</div>
      <input type="text" className="name" value={nick} onChange={e => setNick(e.target.value)} placeholder="Come ti chiami" />
      <label style={{ display: 'grid', placeItems: 'center', cursor: 'pointer', marginTop: 4 }}>
        {photo ? <img src={photo} alt="" style={{ width: 92, height: 92, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e6c268' }} /> : <div style={{ width: 92, height: 92, borderRadius: '50%', background: '#0b1a10', border: '2px solid #6e5320', display: 'grid', placeItems: 'center', fontSize: 40 }}>📷</div>}
        <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await fileToAvatar(f)); }} />
        <span style={{ color: '#e8c879', fontSize: 13, marginTop: 6 }}>La tua foto (opzionale)</span>
      </label>
      {err && <div className="err">{err}</div>}
      <button className="gbtn" disabled={busy} onClick={enroll}>ENTRA ›</button>
    </PhoneShell>
  );

  if (!t) return <PhoneShell><div className="h2" style={{ marginTop: 40 }}>Carico il tavolo…</div></PhoneShell>;
  if (t.suspended && !myBet) return <PhoneShell><div className="panel" style={{ marginTop: 20, textAlign: 'center' }}><div style={{ fontSize: 40 }}>⛔</div><div className="h1">Tavolo sospeso</div><div className="h2">Attendi la riapertura dalla regia.</div></div></PhoneShell>;

  // RISULTATO
  if (t.phase === 'result') {
    if (!myBet) return <PhoneShell><div className="h1" style={{ marginTop: 10 }}>Corsa {String(t.race).padStart(3, '0')}</div><div className="h2">Non hai partecipato a questa corsa.</div><Lanes cur={t.current} now={Date.now()} /><button className="gbtn gold" disabled style={{ marginTop: 'auto' }}>La regia avvia la prossima corsa</button></PhoneShell>;
    const winner = t.current?.order[0] ?? 0; const won = myBet.horse === winner; const credit = won ? myBet.amount * 6 : 0;
    return (
      <PhoneShell>
        <div className={`outcome ${won ? 'win' : 'lose'}`}>{won ? '🏆 HAI VINTO' : 'HAI PERSO'}</div>
        <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          <HorseBadge n={won ? myBet.horse : winner} size={54} active />
          <div><div style={{ color: '#bfe0c6', fontSize: 13 }}>{won ? 'Il tuo cavallo vince' : `Vince ${winner} · ${H(winner).name}`}</div><div style={{ font: '700 24px "Baskerville Casino",serif' }}>{H(won ? myBet.horse : winner).name}</div>{!won && <div style={{ color: '#bfe0c6', fontSize: 13, marginTop: 4 }}>Il tuo: {myBet.horse} · {H(myBet.horse).name}</div>}</div>
        </div>
        <div className="panel">
          <div className="kv">Puntata<b>{myBet.amount}</b></div>
          <div className="kv">Accredito<b className={won ? 'green' : ''}>{credit}</b></div>
          <div className="kv">Profitto<b className={won ? 'green' : 'red'}>{won ? '+' : '−'}{Math.abs(credit - myBet.amount)}</b></div>
          <div className="kv" style={{ borderBottom: 'none' }}>Credito<b>{myBalance.toLocaleString('it-IT')}</b></div>
        </div>
        <button className="gbtn gold" disabled style={{ marginTop: 'auto' }}>⏱ Attendi prossima corsa</button>
      </PhoneShell>
    );
  }

  // CORSA LIVE
  if (t.phase === 'racing') {
    return (
      <PhoneShell>
        <div className="h1" style={{ fontSize: 20 }}>Puntate chiuse · <span style={{ color: '#5ee08a' }}>Corsa in diretta</span></div>
        <Lanes cur={t.current} now={now} big />
        {myBet ? (
          <div className="panel"><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><HorseBadge n={myBet.horse} size={44} /><div style={{ flex: 1 }}><div style={{ color: '#bfe0c6', fontSize: 13 }}>Il tuo cavallo</div><div style={{ font: '700 20px "Baskerville Casino",serif' }}>{myBet.horse} · {H(myBet.horse).name}</div></div></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}><span>Puntata <b style={{ color: '#ffe9a6' }}>{myBet.amount}</b></span><span>Disponibili <b style={{ color: '#ffe9a6' }}>{myBalance.toLocaleString('it-IT')}</b></span></div></div>
        ) : <div className="note">Non hai puntato su questa corsa.</div>}
      </PhoneShell>
    );
  }

  // RICEVUTA (puntata confermata, fase betting)
  if (myBet && step === 'select') {
    return (
      <PhoneShell>
        <div className="panel" style={{ textAlign: 'center', borderColor: '#2f8a4e' }}><div style={{ color: '#5ee08a', font: '700 20px "Baskerville Casino",serif' }}>✓ Puntata confermata</div></div>
        <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 14 }}><HorseBadge n={myBet.horse} size={54} /><div><div style={{ color: '#bfe0c6', fontSize: 13 }}>Corsa {String(t.race).padStart(3, '0')} · Cavallo {myBet.horse}</div><div style={{ font: '700 24px "Baskerville Casino",serif' }}>{H(myBet.horse).name}</div></div></div>
        <div className="panel"><div className="kv">Riservati<b>{myBet.amount}</b></div><div className="kv" style={{ borderBottom: 'none' }}>Disponibili<b>{myBalance.toLocaleString('it-IT')}</b></div></div>
        {t.betEndsAt && <div className="panel" style={{ textAlign: 'center' }}><div className="h2">⏱ Chiusura scommesse tra</div><div className="big">{fmtTime(betCd)}</div></div>}
        {err && <div className="err">{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button className="gbtn gold" style={{ flex: 1 }} onClick={() => { setChosen(myBet.horse); setAmount(myBet.amount); setStep('confirm'); }}>✎ Modifica</button>
          <button className="gbtn" style={{ flex: 1, background: 'linear-gradient(#d4303a,#9c0208)', color: '#fff', boxShadow: '0 3px 0 #5a0206' }} disabled={busy} onClick={cancelBet}>🗑 Cancella</button>
        </div>
        <div className="note">Solo prima della chiusura</div>
      </PhoneShell>
    );
  }

  // CONFERMA
  if (step === 'confirm' && chosen) {
    const h = H(chosen); const ret = amount * 6;
    return (
      <PhoneShell>
        <div className="h1">Conferma puntata</div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, borderColor: h.color }}>
          <HorseBadge n={chosen} size={64} active /><div style={{ font: '700 26px "Baskerville Casino",serif' }}>{h.name}</div>
        </div>
        <div className="panel"><div className="kv">Puntata<b>{amount}</b></div><div className="kv">Ritorno totale se vinci<b>{ret}</b></div><div className="kv" style={{ borderBottom: 'none' }}>Profitto possibile<b className="green">+{ret - amount}</b></div></div>
        {err && <div className="err">{err}</div>}
        <button className="gbtn" disabled={busy || amount > myBalance} onClick={confirmBet}>CONFERMA ›</button>
        <button className="gbtn gold" style={{ background: '#17130b', color: '#ffe9a6', boxShadow: 'none' }} onClick={() => setStep('select')}>← Indietro</button>
        <div className="note">Dopo la chiusura non puoi modificare la puntata.</div>
      </PhoneShell>
    );
  }

  // SCEGLI CAVALLO + IMPORTO
  const cur = amount || Math.max(t.minBet, 0);
  const dec = () => setAmount(Math.max(t.minBet, (cur || t.minBet) - t.step));
  const inc = () => setAmount(Math.min(t.maxBet, Math.min(myBalance, (cur || t.minBet) + t.step)));
  return (
    <PhoneShell>
      <div className="h1">Scegli il tuo cavallo</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {HORSES.map(h => (
          <div key={h.n} className={`hrow${chosen === h.n ? ' sel' : ''}`} onClick={() => { setChosen(h.n); if (!amount) setAmount(t.minBet); }}>
            <HorseBadge n={h.n} size={40} active={chosen === h.n} />
            <div className="nm">{h.name}</div>
            <div className="mx">6×<br /><span style={{ fontSize: 11, color: '#9fe0b4' }}>ritorno totale</span></div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span>Credito disponibile<br /><b style={{ color: '#ffe9a6', fontSize: 22 }}>{myBalance.toLocaleString('it-IT')}</b></span><div style={{ textAlign: 'right' }}><div style={{ color: '#bfe0c6', fontSize: 13 }}>Puntata</div></div></div>
        <div className="step"><button className="rnd" onClick={dec}>−</button><div className="big" style={{ flex: 1 }}>{cur || t.minBet}</div><button className="rnd" onClick={inc}>+</button></div>
      </div>
      {t.betEndsAt && <div className="note">⏱ Tempo rimanente {fmtTime(betCd)}</div>}
      {err && <div className="err">{err}</div>}
      <button className="gbtn" disabled={!chosen} onClick={() => { setAmount(cur || t.minBet); setStep('confirm'); }}>CONTINUA ›</button>
    </PhoneShell>
  );
}

/* ════════════════════════════════════════════════ MONITOR 80" ═════════════ */
const MON_CSS = FONT + `
.hm{position:fixed;inset:0;overflow:hidden;background:#04140a;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.hm .stage{position:relative;width:1920px;height:1080px;flex:none;transform-origin:center center;background:radial-gradient(ellipse 120% 90% at 50% 30%,#0e3a1c 0%,#082712 46%,#03150a 82%,#020d06 100%);box-shadow:inset 0 0 0 10px #0a2a16,inset 0 0 0 14px #c9972f;}
.hm .brand{position:absolute;left:46px;top:40px;}
.hm .qr{position:absolute;right:50px;top:46px;background:#fff;padding:14px;border-radius:12px;border:4px solid #c9972f;}
.hm .banner{position:absolute;left:50%;top:40px;transform:translateX(-50%);min-width:720px;text-align:center;border:5px solid #f6cf72;border-radius:60px;padding:12px 40px;background:radial-gradient(ellipse at 50% 50%,#000d04,#052e17);box-shadow:0 0 0 2px #6b4a17,0 0 22px rgba(255,210,120,.3);}
.hm .banner h1{margin:0;font:700 56px/1 "Baskerville Casino",serif;background:linear-gradient(180deg,#fff6c8,#ffe08a 45%,#e9b24f);-webkit-background-clip:text;background-clip:text;color:transparent;}
.hm .cards{position:absolute;left:46px;right:46px;top:220px;display:flex;gap:18px;justify-content:center;}
.hm .hcard{flex:1;max-width:280px;border-radius:16px;overflow:hidden;border:3px solid var(--c);background:linear-gradient(160deg,#0c2417,#06150d);box-shadow:0 8px 24px #0008;}
.hm .hcard .top{height:8px;background:var(--c);}
.hm .hcard .body{padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;}
.hm .hcard .nm{font:700 34px/1 "Baskerville Casino",serif;letter-spacing:.02em;}
.hm .hcard .mult{color:#ffe9a6;font:700 40px/1 "Baskerville Casino",serif;}
.hm .hcard .sub{color:#9fe0b4;font-size:18px;}
.hm .cd{position:absolute;left:50%;transform:translateX(-50%);top:640px;text-align:center;border:4px solid #f6cf72;border-radius:40px;padding:12px 60px;background:radial-gradient(ellipse at 50% 50%,#000d04,#052e17);}
.hm .cd .lab{color:#ffe9a6;letter-spacing:.3em;font-size:26px;}
.hm .cd .t{font:700 70px/1 "Baskerville Casino",serif;color:#fff;}
.hm .strip{position:absolute;left:30px;right:30px;bottom:28px;height:120px;border-radius:16px;border:2px solid #c9972f;background:linear-gradient(#0b1f12,#06150d);display:flex;align-items:center;padding:0 18px;gap:16px;}
.hm .strip .lab{color:#e8c879;font-size:20px;width:120px;line-height:1.1;flex:none;}
.hm .prof{display:flex;flex-direction:column;align-items:center;gap:4px;width:92px;}
.hm .prof .nm{font-size:17px;color:#fff;}
.hm .prof .cr{font:700 20px "Baskerville Casino",serif;color:#ffe9a6;}
.hm .track{position:absolute;left:60px;right:60px;top:170px;bottom:170px;}
.hm .podium{position:absolute;left:0;right:0;top:300px;display:flex;align-items:flex-end;justify-content:center;gap:30px;}
.hm .pod{display:flex;flex-direction:column;align-items:center;gap:12px;}
.hm .pod .base{width:200px;border-radius:12px 12px 0 0;background:linear-gradient(#17130b,#0c0c08);border:2px solid #c9972f;display:grid;place-items:center;color:#ffe9a6;font:700 60px "Baskerville Casino",serif;}
.hm .winners{position:absolute;left:50%;transform:translateX(-50%);bottom:170px;width:900px;}
`;
function avatarImg(url: string | null, name: string, size: number) {
  return url ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e6c268' }} /> : <div style={{ width: size, height: size, borderRadius: '50%', background: '#1a1a18', border: '2px solid #6e5320', display: 'grid', placeItems: 'center', color: '#8a7a52', fontSize: size * 0.5 }}>👤</div>;
}
// Pista ovale SVG: punto del cavallo lungo la linea mediana, con corsie concentriche.
function ovalPoint(p: number, lane: number) {
  const cx = 960, cy = 470, rx = 720 - lane * 20, ry = 300 - lane * 15;
  const ang = (90 + p * 360) * Math.PI / 180; // parte dal basso, gira in senso orario
  return { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
}
const AP = `${AB}ippo/`;
/* Monitor PUNTATE — palco fisso 744×456 identico al mockup (asset dipinti ritagliati
   + testi/countdown/fascia in codice). Coordinate dal righello di measure.mjs. */
const BET_CSS = FONT + `
.hmb{position:fixed;inset:0;overflow:hidden;background:#04140a;display:flex;align-items:center;justify-content:center;font-family:"Baskerville Casino",Georgia,serif;}
.hmb .st{position:relative;width:744px;height:456px;flex:none;transform-origin:center center;background:#060b06;}
.hmb .st>img.bg{position:absolute;inset:0;width:744px;height:456px;object-fit:cover;opacity:.0;}
.hmb .a{position:absolute;}
.hmb .code{color:#f6cf72;font:700 22px/1 "Baskerville Casino",serif;text-align:right;}
.hmb .scan{color:#d9c79a;font:700 9px/1.25 "Baskerville Casino",serif;text-align:right;letter-spacing:.02em;}
.hmb .banner{border:2px solid #f6cf72;border-radius:38px;background:radial-gradient(ellipse at 50% 50%,#0a0d02,#05120a);box-shadow:0 0 0 1px #6b4a17,inset 0 0 0 2px #2a1d06,inset 0 0 14px rgba(255,220,140,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;}
.hmb .banner .t1{color:#f3e2a0;letter-spacing:.24em;font:700 20px/1 "Baskerville Casino",serif;padding-left:.24em;}
.hmb .banner .t2{font:700 38px/1 "Baskerville Casino",serif;color:#ffe9a6;margin-top:4px;}
.hmb .strip{border:1px solid #c9972f;border-radius:8px;background:linear-gradient(#0b1f12,#06150d);display:flex;align-items:center;padding:0 8px;overflow:hidden;}
.hmb .strip .lab{color:#e8c879;font:700 11px/1.15 "Baskerville Casino",serif;width:86px;flex:none;}
.hmb .prof{display:flex;flex-direction:column;align-items:center;gap:1px;width:60px;flex:none;}
.hmb .prof .nm{font-size:11px;color:#fff;}
.hmb .prof .cr{font:700 13px "Baskerville Casino",serif;color:#ffe9a6;}
`;
function MonitorBetting({ t, playUrl, betCd, scale }: { t: HorseTbl; playUrl: string; betCd: number; scale: number }) {
  return (
    <div className="hmb"><style>{BET_CSS}</style>
      <div className="st" style={{ transform: `scale(${scale})`, boxShadow: '0 0 0 3px #0a2a16, 0 0 0 5px #c9972f' }}>
        <div className="a" style={{ left: 0, top: 0, width: 744, height: 456, background: 'radial-gradient(ellipse 120% 90% at 50% 30%,#0e3a1c 0%,#082712 46%,#03150a 100%)' }} />
        <img className="a" src={`${AP}logo-ippodromo.png`} alt="" style={{ left: 6, top: 8, width: 150, height: 88 }} />
        <img className="a" src={`${AP}corsa-wordmark.png`} alt="" style={{ left: 162, top: 2, width: 396, height: 92 }} />
        <div className="a code" style={{ left: 556, top: 16, width: 104 }}>{t.displayCode}</div>
        <div className="a scan" style={{ left: 556, top: 42, width: 104 }}>SCANSIONA<br />IL QR CODE DAL TUO<br />SMARTPHONE PER GIOCARE</div>
        <div className="a" style={{ left: 664, top: 6, background: '#fff', padding: 3, borderRadius: 4 }}><QRCodeSVG value={playUrl} size={70} /></div>
        {HORSES.map((h, i) => <img key={h.n} className="a" src={`${AP}card-${h.n}.png`} alt={h.name} style={{ left: 8 + i * 122, top: 102, width: 120, height: 188 }} />)}
        <img className="a" src={`${AP}banner-puntate.png`} alt="" style={{ left: 154, top: 300, width: 436, height: 76 }} />
        <div className="a" style={{ left: 300, top: 336, width: 144, height: 34, display: 'grid', placeItems: 'center', background: 'radial-gradient(ellipse at 50% 50%,#0a0d02 60%,rgba(10,13,2,0))' }}>
          <span style={{ font: '700 32px/1 "Baskerville Casino",serif', color: '#ffe9a6', letterSpacing: '.02em' }}>{t.phase === 'betting' ? fmtTime(betCd) : '—'}</span>
        </div>
        <div className="a strip" style={{ left: 4, top: 386, width: 736, height: 64 }}>
          <div className="lab">GIOCATORI<br />COLLEGATI<br />({t.players.length})</div>
          {t.players.slice(0, 10).map(p => (<div className="prof" key={p.id}>{avatarImg(p.avatarUrl, p.nickname, 36)}<div className="nm">{p.nickname}</div><div className="cr">{p.balance.toLocaleString('it-IT')}</div></div>))}
          {t.players.length === 0 && <div style={{ color: '#9fe0b4', fontSize: 14, marginLeft: 16 }}>In attesa di giocatori…</div>}
        </div>
      </div>
    </div>
  );
}

export function HorseMonitor({ displayCode }: { displayCode: string }) {
  const st = useHorseTable(displayCode, 900);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const t = st?.table;
  const now = useRaceClock(t?.phase === 'racing');
  const lastAuto = useRef(0);
  useEffect(() => {
    if (!t) return; const n = Date.now();
    if (t.phase === 'betting' && t.betEndsAt && n > Date.parse(t.betEndsAt) && n - lastAuto.current > 1500) { lastAuto.current = n; api('/gestione/casino/horse/start', { displayCode }); }
    if (t.phase === 'racing' && t.raceEndsAt && n > Date.parse(t.raceEndsAt) + 300 && n - lastAuto.current > 1500) { lastAuto.current = n; fetch(`${API}/gestione/casino/horse/${displayCode}`); }
  }, [st, displayCode, t]);
  const betCd = useCountdown(t?.phase === 'betting' ? t.betEndsAt : null);
  if (!t) return <div className="hm"><style>{MON_CSS}</style><div style={{ color: '#9fe0b4', fontSize: 30 }}>Carico il tavolo…</div></div>;
  const scale = Math.min(dim.w / 1920, dim.h / 1080);
  const playUrl = `${ORIGIN}gestione/casino?hplay=${t.displayCode}`;
  if (t.phase === 'betting' || t.phase === 'waiting') return <MonitorBetting t={t} playUrl={playUrl} betCd={betCd} scale={Math.min(dim.w / 744, dim.h / 456)} />;
  const strip = (
    <div className="strip">
      <div className="lab">GIOCATORI<br />COLLEGATI<br />({t.players.length})</div>
      {t.players.slice(0, 10).map(p => (<div className="prof" key={p.id}>{avatarImg(p.avatarUrl, p.nickname, 56)}<div className="nm">{p.nickname}</div><div className="cr">{p.balance.toLocaleString('it-IT')}</div></div>))}
      {t.players.length === 0 && <div style={{ color: '#9fe0b4', fontSize: 22, marginLeft: 20 }}>In attesa di giocatori…</div>}
    </div>
  );
  return (
    <div className="hm"><style>{MON_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <div className="brand"><Brand size={1.4} /></div>
        {t.phase === 'racing' || t.phase === 'result' ? null : <div className="qr"><QRCodeSVG value={playUrl} size={150} /></div>}

        {t.phase === 'racing' ? (
          <>
            <div className="banner"><h1>CORSA {String(t.race).padStart(3, '0')} · IN DIRETTA</h1></div>
            <svg className="track" viewBox="0 0 1920 940" preserveAspectRatio="xMidYMid meet">
              <ellipse cx="960" cy="470" rx="820" ry="400" fill="#5a3f22" stroke="#c9972f" strokeWidth="6" />
              <ellipse cx="960" cy="470" rx="560" ry="230" fill="#0e3a1c" stroke="#2ca24e" strokeWidth="4" />
              <line x1="960" y1="770" x2="960" y2="870" stroke="#fff" strokeWidth="6" strokeDasharray="12 10" />
              {HORSES.map((h, i) => { const p = horseProgress(t.current, h.n, now); const pt = ovalPoint(p, i); return (
                <g key={h.n} transform={`translate(${pt.x} ${pt.y})`}>
                  <text y="-30" textAnchor="middle" fontSize="40">🐎</text>
                  <circle r="22" fill={h.color} stroke="#fff" strokeWidth="3" /><text textAnchor="middle" dy="8" fontSize="24" fontWeight="700" fill="#fff">{h.n}</text>
                </g>
              ); })}
            </svg>
            {strip}
          </>
        ) : (
          /* RISULTATI */
          (() => { const order = t.current?.order ?? []; const w = order[0] ?? 0; const winners = (t.history[0]?.results ?? []).filter(r => r.credit > 0);
            const podSpot = (rank: number, size: number) => { const n = order[rank]; return n ? <div className="pod"><HorseBadge n={n} size={size} active={rank === 0} /><div style={{ font: '700 24px "Baskerville Casino",serif' }}>{H(n).name}</div><div className="base" style={{ height: rank === 0 ? 170 : rank === 1 ? 120 : 90 }}>{rank + 1}</div></div> : null; };
            return (
              <>
                <div className="banner" style={{ top: 30 }}><h1>🏆 VINCE {w} · {H(w).name}</h1></div>
                <div style={{ position: 'absolute', right: 60, top: 50, textAlign: 'right', color: '#e8c879', fontSize: 26 }}>CORSA {String(t.race).padStart(3, '0')}<br /><span style={{ fontSize: 18, color: '#9fe0b4' }}>Risultati ufficiali</span></div>
                <div className="podium">{podSpot(1, 90)}{podSpot(0, 120)}{podSpot(2, 80)}</div>
                <div className="winners">
                  <div style={{ textAlign: 'center', color: '#e8c879', font: '700 28px "Baskerville Casino",serif', marginBottom: 12 }}>GIOCATORI VINCENTI</div>
                  {winners.slice(0, 5).map(r => (<div key={r.playerId} style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #2f5a3a', padding: '8px 12px', fontSize: 24 }}><b style={{ flex: 1 }}>{r.nickname}</b><span>Puntata {r.bet}</span><span style={{ color: '#5ee08a', fontWeight: 700 }}>Accredito {r.credit}</span></div>))}
                  {winners.length === 0 && <div style={{ textAlign: 'center', color: '#9fe0b4', fontSize: 24 }}>Nessun vincitore in questa corsa.</div>}
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ REGIA ═══════════════════ */
const REGIA_CSS = FONT + `
.hr{position:fixed;inset:0;overflow:auto;background:#04140a;display:flex;align-items:flex-start;justify-content:center;color:#fff;font-family:"Baskerville Casino",Georgia,serif;}
.hr .stage{position:relative;width:1600px;height:900px;flex:none;transform-origin:top center;background:radial-gradient(ellipse 120% 90% at 50% 10%,#0e3a1c,#082712 55%,#03150a);box-shadow:inset 0 0 0 8px #0a2a16,inset 0 0 0 11px #c9972f;padding:26px;box-sizing:border-box;}
.hr .brand{position:absolute;left:26px;top:22px;}
.hr .title{text-align:center;font:700 44px/1 "Baskerville Casino",serif;color:#ffe9a6;padding-top:6px;}
.hr .sub{text-align:center;color:#9fe0b4;letter-spacing:.3em;font-size:18px;}
.hr .code{position:absolute;right:30px;top:30px;color:#e8c879;font-size:22px;}
.hr .stats{display:flex;gap:16px;justify-content:center;margin-top:18px;}
.hr .stat{border:2px solid #2f5a3a;border-radius:12px;background:#09200f;padding:10px 20px;text-align:center;min-width:150px;}
.hr .stat .k{color:#9fe0b4;font-size:15px;}
.hr .stat .v{font:700 28px "Baskerville Casino",serif;color:#ffe9a6;}
.hr .set{display:flex;align-items:center;gap:6px;}
.hr .set input{width:70px;padding:7px;border-radius:8px;border:1px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 16px serif;text-align:center;}
.hr .cards{position:absolute;left:26px;right:26px;top:220px;display:flex;gap:12px;justify-content:center;}
.hr .hcard{flex:1;max-width:230px;border-radius:12px;overflow:hidden;border:2px solid var(--c);background:#09200f;padding:12px;display:flex;flex-direction:column;align-items:center;gap:6px;}
.hr .hcard .nm{font:700 22px "Baskerville Casino",serif;}
.hr .hcard .mult{color:#ffe9a6;font:700 24px serif;}
.hr .btns{position:absolute;left:26px;right:26px;top:430px;display:flex;gap:14px;}
.hr .b{flex:1;padding:14px;border-radius:12px;border:1px solid #6e5320;background:#0c0c08;color:#ffe9a6;font:700 20px serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}
.hr .b.go{background:linear-gradient(180deg,#39d46b,#0c7a33);color:#04210e;border-color:#bff0cf;}
.hr .b.danger{background:linear-gradient(#d4303a,#9c0208);color:#fff;border-color:#f3b3b3;}
.hr .b:disabled{opacity:.5;}
.hr .hist{position:absolute;left:26px;right:26px;top:510px;bottom:26px;border:2px solid #2f5a3a;border-radius:12px;background:#07180e;padding:12px 16px;overflow:auto;}
.hr table{width:100%;border-collapse:collapse;font-size:18px;}
.hr th{color:#e8c879;text-align:left;padding:7px 8px;border-bottom:1px solid #2f5a3a;}
.hr td{padding:7px 8px;border-bottom:1px solid #16331f;}
.hr .pill{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:999px;border:2px solid #4ade80;color:#9fe0b4;font-size:20px;}
.hr .pill.b{border-color:#e0b24a;color:#ffe08a;}
.hr .pill.r{border-color:#d4303a;color:#ff9b9b;}
`;
export function HorseRegia({ displayCode }: { displayCode: string }) {
  const st = useHorseTable(displayCode, 1200);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const [busy, setBusy] = useState(false); const [showQr, setShowQr] = useState(false); const [showCancel, setShowCancel] = useState(false); const [motivo, setMotivo] = useState('');
  const call = async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { displayCode, ...body }); } finally { setBusy(false); } };
  if (!st) return <div className="hr"><style>{REGIA_CSS}</style><div style={{ color: '#9fe0b4', fontSize: 26 }}>Carico…</div></div>;
  const t = st.table;
  const scale = Math.min(dim.w / 1600, Math.max(0.4, dim.h / 900));
  const stateLabel = t.phase === 'betting' ? 'Puntate aperte' : t.phase === 'racing' ? 'Corsa in diretta' : t.phase === 'result' ? 'Risultati' : 'In attesa';
  const pillCls = t.phase === 'betting' ? '' : t.phase === 'racing' ? 'r' : 'b';
  const primary = t.phase === 'betting'
    ? <button className="b go" disabled={busy} onClick={() => call('/gestione/casino/horse/start', {})}>🏁 Chiudi puntate e avvia</button>
    : t.phase === 'racing' ? <button className="b" disabled>Corsa in corso…</button>
    : <button className="b go" disabled={busy || t.suspended} onClick={() => call('/gestione/casino/horse/open', {})}>▸ {t.phase === 'result' ? 'Nuova corsa' : 'Apri puntate'}</button>;

  return (
    <div className="hr"><style>{REGIA_CSS}</style>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <div className="brand"><Brand size={1.1} /></div>
        <div className="code">{t.name} · <b style={{ color: '#ffe9a6' }}>{t.displayCode}</b></div>
        <div className="title">Regia Ippodromo</div><div className="sub">GESTIONE CORSE VIRTUALI</div>
        <div className="stats">
          <div className="stat"><div className="k">Stato</div><div style={{ marginTop: 6 }}><span className={`pill ${pillCls}`}>● {stateLabel}</span></div></div>
          <div className="stat"><div className="k">Corsa in corso</div><div className="v">{String(t.race).padStart(3, '0')}</div></div>
          <div className="stat"><div className="k">Giocatori</div><div className="v">{t.players.length}</div></div>
          <div className="stat"><div className="k">Impostazioni</div><div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <label className="set">Min<input type="number" defaultValue={t.minBet} disabled={t.phase === 'racing' || busy} onBlur={e => call('/gestione/casino/horse/settings', { minBet: +e.target.value })} /></label>
            <label className="set">Max<input type="number" defaultValue={t.maxBet} disabled={t.phase === 'racing' || busy} onBlur={e => call('/gestione/casino/horse/settings', { maxBet: +e.target.value })} /></label>
            <label className="set">Punt.s<input type="number" defaultValue={t.betSeconds} disabled={busy} onBlur={e => call('/gestione/casino/horse/settings', { betSeconds: +e.target.value })} /></label>
            <label className="set">Corsa.s<input type="number" defaultValue={Math.round(t.raceMs / 1000)} disabled={t.phase === 'racing' || busy} onBlur={e => call('/gestione/casino/horse/settings', { raceSeconds: +e.target.value })} /></label>
          </div></div>
        </div>

        <div className="cards">{HORSES.map(h => (<div className="hcard" key={h.n} style={{ ['--c' as string]: h.color }}><HorseBadge n={h.n} size={52} /><div className="nm">{h.name}</div><div className="mult">6×</div><div style={{ color: '#9fe0b4', fontSize: 14 }}>ritorno totale</div></div>))}</div>

        <div className="btns">
          {primary}
          <button className="b" onClick={() => window.open(`${ORIGIN}gestione/casino?horse=${t.displayCode}`, '_blank')}>🖥 Apri monitor</button>
          <button className="b" onClick={() => setShowQr(true)}>🔳 Mostra QR</button>
          {(t.phase === 'betting' || t.phase === 'racing') && <button className="b danger" onClick={() => setShowCancel(true)}>⚠ Annulla corsa</button>}
          <button className="b danger" disabled={busy} onClick={() => call('/gestione/casino/horse/suspend', { suspended: !t.suspended })}>{t.suspended ? '▶ Riprendi' : '⏸ Sospendi'}</button>
        </div>

        <div className="hist">
          <div style={{ color: '#e8c879', font: '700 22px "Baskerville Casino",serif', marginBottom: 8 }}>Ultime corse</div>
          <table><thead><tr><th>#</th><th>Ora</th><th>Vincitore</th><th>Giocatori</th><th>Stato</th></tr></thead>
            <tbody>
              <tr><td>{String(t.race).padStart(3, '0')}</td><td>—</td><td>{t.phase === 'result' && t.current ? <><HorseBadge n={t.current.order[0]!} size={22} /> {H(t.current.order[0]!).name}</> : <span style={{ color: '#9fe0b4' }}>in corso</span>}</td><td>{t.betsCount}</td><td><span style={{ color: t.phase === 'racing' ? '#ff9b9b' : t.phase === 'betting' ? '#5ee08a' : '#e8c879' }}>● {stateLabel}</span></td></tr>
              {t.history.map(h => (<tr key={h.race + h.at}><td>{String(h.race).padStart(3, '0')}</td><td>{new Date(h.at).toLocaleTimeString('it-IT')}</td><td>{h.cancelled ? <span style={{ color: '#ff9b9b' }}>Annullata</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><HorseBadge n={h.winner} size={22} /> {H(h.winner).name}</span>}</td><td>{h.players}</td><td style={{ color: '#9fe0b4' }}>● {h.cancelled ? 'Rimborsata' : 'Completata'}</td></tr>))}
            </tbody>
          </table>
        </div>

        {showQr && (<div style={{ position: 'absolute', inset: 0, background: '#000b', display: 'grid', placeItems: 'center' }} onClick={() => setShowQr(false)}><div style={{ background: '#07180e', border: '2px solid #c9972f', borderRadius: 16, padding: 28, textAlign: 'center' }} onClick={e => e.stopPropagation()}><div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block' }}><QRCodeSVG value={`${ORIGIN}gestione/casino?hplay=${t.displayCode}`} size={300} /></div><div style={{ color: '#ffe9a6', marginTop: 14, fontSize: 24 }}>Scansiona e gioca · {t.displayCode}</div></div></div>)}
        {showCancel && (<div style={{ position: 'absolute', inset: 0, background: '#000b', display: 'grid', placeItems: 'center' }} onClick={() => setShowCancel(false)}><div style={{ background: '#1a0808', border: '2px solid #d4303a', borderRadius: 16, padding: 28, width: 640 }} onClick={e => e.stopPropagation()}><div style={{ color: '#ff9b9b', font: '700 30px "Baskerville Casino",serif', textAlign: 'center' }}>⚠ Annulla corsa</div><div style={{ textAlign: 'center', color: '#e8c879', margin: '6px 0 14px' }}>Rimborsa tutte le puntate una sola volta.</div><textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo dell'annullamento…" style={{ width: '100%', boxSizing: 'border-box', height: 90, padding: 12, borderRadius: 10, background: '#0b1a10', color: '#fff', border: '1px solid #6e5320' }} /><div style={{ display: 'flex', gap: 12, marginTop: 14 }}><button className="b" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>← Torna indietro</button><button className="b danger" style={{ flex: 1 }} disabled={busy || !motivo.trim()} onClick={async () => { await call('/gestione/casino/horse/cancel', { motivo }); setShowCancel(false); setMotivo(''); }}>🗑 Conferma annullamento</button></div></div></div>)}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ HUB TAVOLI ══════════════ */
const HUB_CSS = FONT + `
.hh{position:fixed;inset:0;overflow:auto;color:#fff;font-family:"Baskerville Casino",Georgia,serif;background:radial-gradient(ellipse 120% 80% at 50% 0%,#0e3a1c,#082712 50%,#03150a);padding:28px;}
.hh h1{font:700 44px/1 "Baskerville Casino",serif;color:#ffe9a6;margin:10px 0 0;}
.hh .row{display:flex;gap:22px;flex-wrap:wrap;margin-top:22px;align-items:flex-start;}
.hh .tcard{width:360px;border-radius:16px;background:linear-gradient(160deg,#0e2e18,#06150d);border:2px solid #b98b38;padding:18px;}
.hh .tcard h2{margin:0 0 8px;font:700 28px serif;}
.hh .kv{display:flex;justify-content:space-between;padding:4px 0;color:#cbd8c9;}
.hh .acts{display:flex;gap:10px;margin-top:14px;}
.hh .acts button{flex:1;padding:12px;border-radius:10px;border:1px solid #6e5320;background:#0c0c08;color:#ffe9a6;font:700 15px serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;}
.hh .new{width:320px;border-radius:16px;background:linear-gradient(160deg,#0e2e18,#06150d);border:2px solid #b98b38;padding:18px;}
.hh .new label{display:block;color:#e8c879;font-size:15px;margin:10px 0 4px;}
.hh .new input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 17px serif;}
.hh .gbtn{width:100%;margin-top:16px;padding:14px;border-radius:10px;border:1px solid #bff0cf;background:linear-gradient(180deg,#39d46b,#0c7a33);color:#04210e;font:700 19px serif;cursor:pointer;}
.hh .pill{padding:5px 14px;border-radius:999px;font-size:15px;border:2px solid #4ade80;color:#9fe0b4;}
.hh .pill.b{border-color:#e0b24a;color:#ffe08a;}.hh .pill.r{border-color:#d4303a;color:#ff9b9b;}
`;
export function HorseTablesView({ sessionId }: { sessionId: string }) {
  const [tables, setTables] = useState<Array<{ id: string; name: string; displayCode: string; phase: string; race: number; players: number; minBet: number; maxBet: number }>>([]);
  const [name, setName] = useState(''); const [minBet, setMinBet] = useState(10); const [maxBet, setMaxBet] = useState(100); const [betS, setBetS] = useState(30); const [raceS, setRaceS] = useState(35);
  const [busy, setBusy] = useState(false); const [qr, setQr] = useState<string | null>(null);
  const load = useCallback(() => { fetch(`${API}/gestione/casino/sessions/${sessionId}/horse-tables`).then(r => r.json()).then(d => setTables(d.tables ?? [])).catch(() => {}); }, [sessionId]);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
  const create = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/horse-tables`, { name: name || `Tavolo ${tables.length + 1}`, minBet, maxBet, betSeconds: betS, raceSeconds: raceS }); setName(''); load(); } finally { setBusy(false); } };
  const open = (q: string) => window.open(q, '_blank');
  const phaseInfo = (ph: string) => ph === 'betting' ? { t: 'Puntate aperte', c: '' } : ph === 'racing' ? { t: 'Corsa in diretta', c: 'r' } : ph === 'result' ? { t: 'Risultati', c: 'b' } : { t: 'In attesa', c: 'b' };
  return (
    <div className="hh"><style>{HUB_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Brand size={1.1} /><h1>Tavoli Ippodromo</h1></div>
      <div className="row">
        {tables.map(tb => { const pi = phaseInfo(tb.phase); return (
          <div key={tb.id} className="tcard">
            <h2>{tb.name}</h2>
            <div className="kv"><span>Codice</span><b style={{ color: '#ffe9a6' }}>{tb.displayCode}</b></div>
            <div className="kv"><span>Corsa attuale</span><b style={{ color: '#ffe9a6' }}>{String(tb.race).padStart(3, '0')}</b></div>
            <div className="kv"><span>Stato</span><span className={`pill ${pi.c}`}>{pi.t}</span></div>
            <div className="kv"><span>Puntata</span><span>{tb.minBet}–{tb.maxBet}</span></div>
            <div className="acts">
              <button onClick={() => open(`${ORIGIN}gestione/casino?hregia=${tb.displayCode}`)}>👁<span>Regia</span></button>
              <button onClick={() => open(`${ORIGIN}gestione/casino?horse=${tb.displayCode}`)}>🖥<span>Monitor</span></button>
              <button onClick={() => setQr(`${ORIGIN}gestione/casino?hplay=${tb.displayCode}`)}>🔳<span>QR</span></button>
            </div>
          </div>
        ); })}
        <div className="new">
          <h2 style={{ margin: 0, fontSize: 26, color: '#ffe9a6' }}>Nuovo tavolo</h2>
          <label>Nome tavolo</label><input value={name} onChange={e => setName(e.target.value)} placeholder={`Tavolo ${tables.length + 1}`} />
          <label>Puntata minima</label><input type="number" value={minBet} onChange={e => setMinBet(+e.target.value)} />
          <label>Puntata massima</label><input type="number" value={maxBet} onChange={e => setMaxBet(+e.target.value)} />
          <label>Puntate (secondi)</label><input type="number" value={betS} onChange={e => setBetS(+e.target.value)} />
          <label>Corsa (secondi)</label><input type="number" value={raceS} onChange={e => setRaceS(+e.target.value)} />
          <button className="gbtn" disabled={busy} onClick={create}>+ Crea tavolo</button>
        </div>
      </div>
      {qr && (<div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'grid', placeItems: 'center' }} onClick={() => setQr(null)}><div style={{ background: '#07180e', border: '2px solid #c9972f', borderRadius: 16, padding: 24, textAlign: 'center' }} onClick={e => e.stopPropagation()}><div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block' }}><QRCodeSVG value={qr} size={280} /></div><div style={{ color: '#ffe9a6', marginTop: 12 }}>Scansiona per giocare</div></div></div>)}
    </div>
  );
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — IDECASINO (frontend) ────────────────────────────────
   Ruoli in base ai parametri URL:
   ?player=CODICE → vista GIOCATORE (il suo QR, saldo fish, puntata)
   ?code=CODICE   → risolto come MASTER, TV, DEALER o iscrizione GIOCATORE
   - TV: QR giocatori sempre visibile + classifica maxi-schermo (codice pubblico).
   - Master: setup "quanti dealer", cassa, QR dealer (a scomparsa), classifica.
   - Dealer: griglia delle FOTO ospiti → tap per sedere al tavolo e pagare/prelevare.
   - Giocatore: login con selfie (+500 fiche), QR, e puntata che va sul suo tavolo.
   Sync via polling 2s. ─────────────────────────────────────────────────────── */

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { PlayerAvatar, fileToAvatarDataUrl } from '../components/PlayerAvatar';

// Numero che "sale" con un tween quando cambia (cassa, saldi). Niente dipendenze.
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current, to = value;
    if (from === to) return;
    const t0 = performance.now(), dur = 500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toLocaleString('it-IT')}</>;
}

const API = (import.meta.env.BASE_URL as string || '/') + 'api';
const ORIGIN = window.location.origin + (import.meta.env.BASE_URL as string || '/');
const GOLD = '#F5B642';
const GOLD_GLOW = '#FFD040';
const BG = 'radial-gradient(ellipse at top,#3d2a08,#0a0602 70%)';

type Player = { id: string; nickname: string; playerCode: string; fishBalance: number; tableId: string | null; avatarUrl?: string | null; pendingBet?: number };
type Table = { id: string; tableNumber: number; name: string; dealerCode: string };
type PerTable = { tableId: string; tableNumber: number; name: string; total: number; players: number };
type State = {
  session: { id: string; name: string; status: string; joinCode: string; masterCode: string };
  tables: Table[]; players: Player[]; standings: Player[]; cassaTotale: number; perTable: PerTable[];
  startFish: number; tvCode: string | null;
};

const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

export default function GestioneCasino() {
  const params = new URLSearchParams(window.location.search);
  const playerCode = params.get('player');
  const tableCode = params.get('table');
  const seatCode = params.get('seat');
  const code = (params.get('code') ?? '').toUpperCase();
  if (tableCode) return <RouletteTableView displayCode={tableCode.toUpperCase()} />;
  if (seatCode) return <SeatController seatCode={seatCode.toUpperCase()} />;
  if (playerCode) return <PlayerView code={playerCode.toUpperCase()} />;
  return <CasinoResolver code={code} />;
}

// Colori fissi per postazione (sedia 1..8) — li usano tappeto, fiche e sedie.
const SEAT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
const seatColor = (n: number) => SEAT_COLORS[(n - 1) % SEAT_COLORS.length];
const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const numColor = (n: number) => n === 0 ? '#00711e' : RED_NUMS.has(n) ? '#c70209' : '#121212';
// Tappeto europeo: 3 righe × 12 colonne (alto 3,6,9…; medio 2,5,8…; basso 1,4,7…).
const FELT_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];
type SeatInfo = { code: string; playerId: string | null; nickname?: string | null; avatarUrl?: string | null; balance?: number | null };
type GameTableState = {
  table: { id: string; name: string; displayCode: string; phase: 'betting' | 'spinning' | 'result'; round: number; seats: Record<string, SeatInfo>; bets: { id: string; seatNo: number; playerId: string; kind: string; numbers: number[]; amount: number }[]; result: { number: number; at: string } | null; history: number[] };
  betsBySeat: Record<string, number>;
  sessionId?: string; seatNo?: string | null;
};
const spotOf = (kind: string, numbers: number[]) => kind === 'straight' ? `n:${numbers[0]}` : kind;

function CasinoResolver({ code }: { code: string }) {
  const [res, setRes] = useState<{ role: string; sessionId: string; tableId?: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!code) { setErr('Nessun codice'); return; }
    fetch(`${API}/gestione/casino/resolve/${code}`).then(r => r.ok ? r.json() : Promise.reject()).then(setRes).catch(() => setErr('Serata non trovata'));
  }, [code]);
  if (err) return <Center>{err}</Center>;
  if (!res) return <Center>Carico…</Center>;
  if (res.role === 'master') return <MasterView sessionId={res.sessionId} />;
  if (res.role === 'tv') return <TvView sessionId={res.sessionId} />;
  if (res.role === 'dealer') return <DealerView dealerCode={code} />;
  return <JoinView sessionId={res.sessionId} />;
}

function useCasinoState(sessionId: string, ms = 2000) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/sessions/${sessionId}`).then(r => r.ok ? r.json() : null).then(s => { if (alive && s) setState(s); }).catch(() => {});
    pull(); const t = setInterval(pull, ms);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, ms]);
  return state;
}

// ══════════════════ CO-BRANDING (IDEAGAME × IDEAEVENTI) ══════════════════
// IDEAgame = logo.png presente nel repo. IDEAeventi = /ideaeventi-logo.png se
// l'utente lo aggiunge; finché non c'è, fallback tipografico elegante.
// IDEAeventi: logo oro-su-nero (asset del cliente). Fallback tipografico se manca.
function EventiMark({ h = 26 }: { h?: number }) {
  const [ok, setOk] = useState(true);
  if (ok) return <img src={`${import.meta.env.BASE_URL || '/'}ideaeventi-logo.png`} alt="IDEAeventi" onError={() => setOk(false)} style={{ height: h, objectFit: 'contain', display: 'block' }} />;
  return (
    <span style={{ fontWeight: 900, fontSize: h * 0.5, letterSpacing: '0.02em', lineHeight: 1 }}>
      <span style={{ color: '#fff' }}>IDEA</span><span style={{ color: GOLD }}>eventi</span>
    </span>
  );
}
/* Co-branding: i due loghi hanno fondi opposti (IDEAgame nero/arancio su chiaro,
   IDEAeventi oro su scuro) → ciascuno nel suo chip, così sono sempre nitidi. */
function BrandBar({ h = 26, dim = 1, presented = false }: { h?: number; dim?: number; presented?: boolean }) {
  const pad = Math.round(h * 0.34);
  const bar = (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', gap: h * 0.4, opacity: dim }}>
      <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.94)', borderRadius: 12, padding: `${pad}px ${pad * 1.4}px` }}>
        <img src={`${import.meta.env.BASE_URL || '/'}logo.png`} alt="IDEAgame" style={{ height: h, objectFit: 'contain', display: 'block' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', background: '#0a0602', border: `1px solid ${GOLD}55`, borderRadius: 12, padding: `${Math.round(pad * 0.5)}px ${pad}px` }}>
        <EventiMark h={h * 1.55} />
      </div>
    </div>
  );
  if (!presented) return bar;
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: h * 0.42, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.4, marginBottom: h * 0.22 }}>presented by</div>
      {bar}
    </div>
  );
}
// Logotipo IDECASINO: oro su nero, come l'insegna "Bottle Casino".
function CasinoWordmark({ size = 40 }: { size?: number }) {
  // "IDEA" è un blocco unico (IDE bianco + A oro, nessun gap) così il brand non si
  // spezza; lo spazio vero cade solo prima di CASINÒ.
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.26, fontWeight: 900, lineHeight: 1, letterSpacing: '0.01em' }}>
      <span style={{ fontSize: size }}><span style={{ color: '#fff' }}>IDE</span><span style={{ color: GOLD, textShadow: `0 0 ${size * 0.5}px ${GOLD}66` }}>A</span></span>
      <span style={{ fontSize: size, color: GOLD, textShadow: `0 0 ${size * 0.5}px ${GOLD}66` }}>CASINÒ</span>
      <span style={{ fontSize: size * 0.82, marginLeft: -size * 0.08 }}>🎰</span>
    </div>
  );
}

// ══════════════════ TV (pubblica, maxi-schermo) ══════════════════
function TvView({ sessionId }: { sessionId: string }) {
  const state = useCasinoState(sessionId, 1500);
  // Zoom responsivo come le altre TV: riempie il maxi-schermo senza rompere il mobile.
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  if (!state) return <Center>Carico…</Center>;
  const top = state.standings.slice(0, 12);
  const joinUrl = `${ORIGIN}gestione/casino?code=${state.session.joinCode}`;
  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", padding: 'clamp(16px,2vw,34px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header: insegna + co-branding */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <CasinoWordmark size={Math.min(72, Math.max(34, vw / 20))} />
          <div style={{ opacity: 0.6, marginTop: 6, fontSize: 'clamp(14px,1.5vw,22px)', fontWeight: 700 }}>{state.session.name}</div>
        </div>
        <BrandBar h={Math.min(30, Math.max(18, vw / 58))} presented />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,0.9fr) 2fr', gap: 'clamp(16px,2vw,34px)', marginTop: 'clamp(14px,2vw,28px)', flex: 1, minHeight: 0 }}>
        {/* Colonna sinistra: QR giocatori SEMPRE disponibile + cassa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px,1.6vw,24px)' }}>
          <div style={{ background: '#ffffff0a', border: `1px solid ${GOLD}33`, borderRadius: 24, padding: 'clamp(16px,1.8vw,28px)', textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(14px,1.3vw,20px)', fontWeight: 800, letterSpacing: '0.08em', color: GOLD, textTransform: 'uppercase' }}>Entra & gioca</div>
            <div style={{ fontSize: 'clamp(11px,1vw,15px)', opacity: 0.55, marginBottom: 12 }}>inquadra, scatta il selfie, ricevi 500 fiche</div>
            <motion.div animate={{ boxShadow: [`0 0 0px ${GOLD}00`, `0 0 40px ${GOLD}55`, `0 0 0px ${GOLD}00`] }} transition={{ duration: 2.6, repeat: Infinity }}
              style={{ background: '#fff', display: 'inline-block', padding: 'clamp(8px,1vw,14px)', borderRadius: 16 }}>
              <QRCodeSVG value={joinUrl} size={Math.min(240, Math.max(130, vw / 6))} />
            </motion.div>
            <div style={{ fontSize: 'clamp(22px,2.4vw,40px)', fontWeight: 900, letterSpacing: '0.25em', color: GOLD, marginTop: 10 }}>{state.session.joinCode}</div>
          </div>
          <div style={{ background: '#ffffff0a', borderRadius: 24, padding: 'clamp(14px,1.6vw,24px)', textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(11px,1vw,15px)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fiche in gioco</div>
            <div style={{ fontSize: 'clamp(40px,4.4vw,80px)', fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}><AnimatedNumber value={state.cassaTotale} /></div>
            <div style={{ opacity: 0.5, fontSize: 'clamp(12px,1.1vw,16px)' }}>{state.players.length} giocatori · {state.tables.length} tavoli</div>
          </div>
          {state.perTable.length > 0 && (
            <div style={{ background: '#ffffff0a', borderRadius: 24, padding: 'clamp(12px,1.4vw,20px)' }}>
              <div style={{ fontSize: 'clamp(11px,1vw,14px)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Per tavolo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {state.perTable.map(pt => (
                  <div key={pt.tableId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(13px,1.2vw,18px)' }}>
                    <span style={{ opacity: 0.8, fontWeight: 700 }}>{pt.name} <span style={{ opacity: 0.45 }}>· {pt.players}</span></span>
                    <span style={{ color: GOLD, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{pt.total.toLocaleString('it-IT')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonna destra: classifica maxi */}
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 'clamp(16px,1.6vw,26px)', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 'clamp(8px,1vw,16px)' }}>🏆 Classifica serata</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px,0.8vw,12px)', overflow: 'hidden' }}>
            <AnimatePresence>
              {top.map((p, i) => <BigRow key={p.id} p={p} i={i} vw={vw} />)}
            </AnimatePresence>
            {top.length === 0 && <div style={{ opacity: 0.4, fontSize: 'clamp(16px,2vw,28px)', textAlign: 'center', padding: 40 }}>In attesa dei primi giocatori… inquadra il QR a sinistra 🎰</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigRow({ p, i, vw }: { p: Player; i: number; vw: number }) {
  const medal = ['🥇', '🥈', '🥉'][i];
  const podium = ['#FCD34D', '#CBD5E1', '#D97706'][i];
  const av = Math.min(72, Math.max(40, vw / 22));
  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 380, damping: 34 }, delay: i < 8 ? i * 0.04 : 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 'clamp(10px,1.2vw,20px)', padding: 'clamp(8px,0.9vw,16px) clamp(12px,1.4vw,24px)', borderRadius: 18,
        background: i < 3 ? `linear-gradient(90deg,${GOLD}1f,transparent)` : '#ffffff08',
        boxShadow: i === 0 ? `0 0 28px ${GOLD}3a` : 'none', border: i < 3 ? `1px solid ${podium}44` : '1px solid #ffffff10',
      }}>
      <motion.span animate={i === 0 ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: 1.8, repeat: Infinity }}
        style={{ width: av * 0.7, textAlign: 'center', fontWeight: 900, fontSize: `clamp(18px,${1.8}vw,${av * 0.5}px)`, color: podium ?? '#ffffff66' }}>{medal ?? i + 1}</motion.span>
      <PlayerAvatar nickname={p.nickname} avatarUrl={p.avatarUrl} size={av} ring={i < 3 ? podium : undefined} />
      <span style={{ flex: 1, fontWeight: 800, fontSize: `clamp(20px,2.6vw,${av * 0.56}px)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname}</span>
      <span style={{ fontWeight: 900, color: GOLD, fontSize: `clamp(24px,3.4vw,${av * 0.72}px)`, fontVariantNumeric: 'tabular-nums', textShadow: i === 0 ? `0 0 18px ${GOLD_GLOW}66` : 'none' }}><AnimatedNumber value={p.fishBalance} /></span>
    </motion.div>
  );
}

// ══════════════════ MASTER ══════════════════
// ══════════════════ MASTER — REGIA (canvas fisso 1672×941, fedele al mockup) ══════
const REGIA_CSS = `
.regia-root{position:fixed;inset:0;background:#03140a;display:grid;place-items:center;overflow:hidden;color:#fff;
  --serif:"Baskerville Casino",Georgia,serif;--gold:#f3c95f;--g1:#fff2bf;--g2:#f3c95f;--g3:#c88a2c;--g4:#7a4d12;--cream:#f4ead3;}
.regia-root *{box-sizing:border-box;margin:0;}
.regia-root .stage{position:relative;width:1672px;height:941px;transform-origin:center center;font-family:var(--serif);
  background:radial-gradient(ellipse 1200px 760px at 836px 300px,#0a5a25 0%,#043f17 44%,#022a0e 78%,#01210a 100%);}
.regia-root .abs{position:absolute;}
.regia-root .corner{position:absolute;pointer-events:none;}
/* header */
.regia-root .logo{left:42px;top:14px;height:104px;}
.regia-root .vline{left:498px;top:30px;width:3px;height:74px;background:linear-gradient(#f3c95f,#8a5c18);opacity:.8;}
.regia-root .rtitle{left:525px;top:24px;font:700 58px/1 var(--serif);letter-spacing:.01em;
  background:linear-gradient(180deg,#fff6c8,#ffe08a 42%,#e9b24f 72%,#ffe594);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 1px #000a);}
.regia-root .rsub{left:528px;top:92px;font:400 22px/1 var(--serif);color:#e8c879;}
.regia-root .live{right:40px;top:50px;display:flex;align-items:center;gap:14px;padding:12px 34px;border:2px solid #f3c95f;border-radius:30px;
  background:radial-gradient(ellipse at 50% 50%,#06220f,#041a0b);box-shadow:0 0 16px rgba(243,201,95,.3),inset 0 0 12px #0008;}
.regia-root .live b{font:700 24px/1 var(--serif);color:#ffe9a6;}
.regia-root .dot{width:15px;height:15px;border-radius:50%;background:#2bd24a;box-shadow:0 0 12px #2bd24a;}
/* pannelli */
.regia-root .panel{position:absolute;top:135px;height:703px;border-radius:14px;
  background:linear-gradient(160deg,#141209 0%,#0a0a07 55%,#07070a 100%);
  border:2px solid #b98b38;box-shadow:0 0 0 2px #3a2708,0 0 22px rgba(243,201,95,.12),inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 40px #0008;}
.regia-root .panel::before{content:"";position:absolute;inset:6px;border:1px solid rgba(243,201,95,.35);border-radius:9px;pointer-events:none;}
.regia-root .phead{position:absolute;left:0;right:0;top:18px;display:flex;flex-direction:column;align-items:center;gap:5px;}
.regia-root .phead .ht{display:flex;align-items:center;justify-content:center;gap:12px;font:700 23px/1 var(--serif);letter-spacing:.02em;color:#ffe9a6;text-shadow:0 1px 2px #000;white-space:nowrap;}
.regia-root .phead small{font:400 15px/1 var(--serif);color:#c8a862;letter-spacing:0;}
.regia-root .orn{color:#c89a40;font-size:20px;opacity:.9;}
.regia-root .pbody{position:absolute;left:18px;right:18px;top:72px;bottom:18px;display:flex;flex-direction:column;}
.regia-root .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border-radius:11px;border:1px solid #f3dea0;
  background:linear-gradient(180deg,#ffe694 0%,#f0c357 48%,#d59a34 52%,#eab74a 100%);color:#231503;font:700 20px/1 var(--serif);cursor:pointer;
  box-shadow:0 3px 0 #7a4d12,0 6px 14px #0008,inset 0 1px 0 #fff8;text-decoration:none;white-space:nowrap;}
.regia-root .gbtn.sm{font-size:16px;padding:16px 14px;}
.regia-root .ghost{display:flex;align-items:center;justify-content:center;gap:9px;padding:16px 14px;border-radius:11px;border:1px solid #b98b38;
  background:linear-gradient(#141209,#0b0b08);color:#ffe9a6;font:700 16px/1 var(--serif);cursor:pointer;}
.regia-root .tile{position:relative;display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;margin-top:14px;
  background:linear-gradient(#17130b,#0c0c08);border:1px solid #6e5320;}
.regia-root .tile .thumb{width:84px;height:84px;border-radius:10px;object-fit:cover;flex:none;border:1px solid #6e5320;}
.regia-root .tile .nm{font:700 24px/1 var(--serif);color:#f4ead3;}
.regia-root .tile .cd{font:400 15px/1 var(--serif);color:#b9a06a;margin-top:6px;}
.regia-root .tile .lnk{display:inline-flex;align-items:center;gap:6px;margin-top:10px;color:#f3c95f;font:700 16px/1 var(--serif);text-decoration:none;}
.regia-root .tile .big{position:absolute;right:16px;top:50%;transform:translateY(-50%);font:700 30px/1 var(--serif);color:#ffe9a6;}
.regia-root .coins{width:104px;height:99px;object-fit:contain;margin:10px auto 0;display:block;}
.regia-root .fiches{text-align:center;font:700 86px/1 var(--serif);color:#ffe49a;filter:drop-shadow(0 2px 2px #000a);}
.regia-root .fiches-l{text-align:center;font:700 26px/1 var(--serif);color:#f4ead3;margin-top:6px;}
.regia-root .fiches-s{text-align:center;font:400 16px/1 var(--serif);color:#9c8a5e;margin-top:6px;}
.regia-root .divorn{display:flex;align-items:center;justify-content:center;gap:12px;color:#8a6a2a;margin:16px 0 8px;}
.regia-root .divorn::before,.regia-root .divorn::after{content:"";height:1px;width:64px;background:linear-gradient(90deg,transparent,#8a6a2a);}
.regia-root .qrlbl{text-align:center;font:400 16px/1 var(--serif);color:#c8a862;}
.regia-root .qrbox{background:#fff;padding:10px;border-radius:12px;box-shadow:0 0 0 2px #f3c95f,0 0 16px rgba(243,201,95,.4);}
.regia-root .code{text-align:center;font:700 30px/1 var(--serif);letter-spacing:.22em;color:#ffe9a6;margin-top:12px;}
.regia-root .regcode{text-align:center;font:400 15px/1 var(--serif);color:#b9a06a;margin-top:12px;}
.regia-root .regcode b{color:#f3c95f;letter-spacing:.14em;}
.regia-root .trophy{width:184px;display:block;margin:34px auto 0;}
.regia-root .empty1{text-align:center;font:700 44px/1 var(--serif);color:#f4ead3;margin-top:24px;}
.regia-root .empty2{text-align:center;font:400 20px/1.4 var(--serif);color:#9c8a5e;margin-top:20px;}
.regia-root .footer{position:absolute;left:0;right:0;bottom:16px;text-align:center;font:700 20px/1 var(--serif);color:#c8a862;letter-spacing:.03em;}
.regia-root .srow{display:flex;flex-direction:column;gap:5px;overflow-y:auto;margin-top:8px;}
.regia-root .srank{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;background:#ffffff08;}
.regia-root .srank .n{width:26px;font:700 17px/1 var(--serif);color:#f3c95f;}
.regia-root .srank .nm{flex:1;font:700 18px/1 var(--serif);color:#f4ead3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.regia-root .srank .v{font:700 19px/1 var(--serif);color:#ffe9a6;}
`;

function MasterView({ sessionId }: { sessionId: string }) {
  const state = useCasinoState(sessionId);
  const [busy, setBusy] = useState(false);
  const [showDealerQr, setShowDealerQr] = useState(false);
  const [gts, setGts] = useState<GameTableState['table'][]>([]);
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const loadGts = useCallback(() => fetch(`${API}/gestione/casino/sessions/${sessionId}/game-tables`).then(r => r.ok ? r.json() : null).then(d => { if (d) setGts(d.tables); }).catch(() => {}), [sessionId]);
  useEffect(() => { loadGts(); const t = setInterval(loadGts, 3000); return () => clearInterval(t); }, [loadGts]);

  const AB = (import.meta.env.BASE_URL as string) || '/';
  const addTable = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/tables`, {}); } finally { setBusy(false); } };
  const addRoulette = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/game-tables`, { type: 'roulette', seats: 10 }); await loadGts(); } finally { setBusy(false); } };

  if (!state) return <Center>Carico…</Center>;
  if (state.tables.length === 0) return <SetupWizard sessionId={sessionId} />;

  const scale = Math.min(dim.w / 1672, dim.h / 941);
  const tvUrl = state.tvCode ? `${ORIGIN}gestione/casino?code=${state.tvCode}` : `${ORIGIN}gestione/casino?code=${state.session.joinCode}`;
  const H = (t: string) => <div className="phead"><div className="ht"><span className="orn">❧</span>{t}<span className="orn" style={{ transform: 'scaleX(-1)' }}>❧</span></div></div>;

  return (
    <div className="regia-root">
      <style>{REGIA_CSS}</style>
      <main className="stage" style={{ transform: `scale(${scale})` }}>
        {/* decori angoli */}
        <img className="corner" src={`${AB}casino/regia/corner-tr.png`} style={{ right: 0, top: 0, width: 186 }} alt="" />
        <img className="corner" src={`${AB}casino/regia/corner-bl.png`} style={{ left: 0, bottom: 0, width: 208 }} alt="" />
        <img className="corner" src={`${AB}casino/regia/corner-br.png`} style={{ right: 0, bottom: 0, width: 210 }} alt="" />

        {/* header */}
        <img className="abs logo" src={`${AB}casino/logo-placeholder.jpg`} alt="IDEA EVENTI CASINÒ" />
        <div className="abs vline" />
        <div className="abs rtitle">REGIA MASTER</div>
        <div className="abs rsub">Gestione della serata</div>
        <div className="abs live"><span className="dot" /><b>Serata attiva</b></div>

        {/* P1 CASSA & ACCESSI */}
        <div className="panel" style={{ left: 20, width: 392 }}>
          {H('CASSA & ACCESSI')}
          <div className="pbody">
            <img className="coins" src={`${AB}casino/regia/coins.png`} alt="" />
            <div className="fiches"><AnimatedNumber value={state.cassaTotale} /></div>
            <div className="fiches-l">Fiches in gioco</div>
            <div className="fiches-s">{state.players.length} giocatori · Credito iniziale {state.startFish}</div>
            <a className="gbtn" href={tvUrl} target="_blank" rel="noreferrer" style={{ marginTop: 18 }}>🖥️ Apri TV e classifica ↗</a>
            <div className="divorn" />
            <div className="qrlbl">QR iscrizione giocatori</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><div className="qrbox"><QRCodeSVG value={`${ORIGIN}gestione/casino?code=${state.session.joinCode}`} size={132} /></div></div>
            <div className="code">{state.session.joinCode}</div>
            <div className="regcode">🔑 Codice regia (per rientrare): <b>{state.session.masterCode}</b></div>
          </div>
        </div>

        {/* P2 TAVOLI & DEALER */}
        <div className="panel" style={{ left: 430, width: 438 }}>
          {H(`TAVOLI & DEALER (${state.tables.length})`)}
          <div className="pbody">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button className="gbtn sm" onClick={addTable} disabled={busy}>＋ Aggiungi tavolo</button>
              <button className="ghost" onClick={() => setShowDealerQr(s => !s)}>▦ {showDealerQr ? 'Nascondi QR' : 'Mostra QR dealer'}</button>
            </div>
            <div style={{ overflowY: 'auto', marginTop: 2 }}>
              {state.tables.map(t => { const pt = state.perTable.find(x => x.tableId === t.id); return (
                <div className="tile" key={t.id}>
                  {showDealerQr
                    ? <div style={{ background: '#fff', padding: 5, borderRadius: 8, flex: 'none' }}><QRCodeSVG value={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} size={74} /></div>
                    : <img className="thumb" src={`${AB}casino/regia/table.png`} alt="" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{t.name}</div>
                    <div className="cd">Codice {t.dealerCode} · {pt?.players ?? 0} giocatori</div>
                    <a className="lnk" href={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} target="_blank" rel="noreferrer">🎰 Apri banco dealer ↗</a>
                  </div>
                  <div className="big">{pt?.total ?? 0}</div>
                </div>
              ); })}
            </div>
          </div>
        </div>

        {/* P3 TAVOLI DA GIOCO */}
        <div className="panel" style={{ left: 878, width: 392 }}>
          <div className="phead"><div className="ht"><span className="orn">❧</span>TAVOLI DA GIOCO<span className="orn" style={{ transform: 'scaleX(-1)' }}>❧</span></div><small>Schermi 80 pollici</small></div>
          <div className="pbody" style={{ top: 78 }}>
            <button className="gbtn" onClick={addRoulette} disabled={busy}>＋ Nuovo tavolo Roulette</button>
            <div style={{ overflowY: 'auto', marginTop: 2 }}>
              {gts.map(g => (
                <div className="tile" key={g.id}>
                  <img className="thumb" src={`${AB}casino/regia/roulette.png`} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{g.name}</div>
                    <div className="cd">{Object.keys(g.seats).length} postazioni · Codice {g.displayCode}</div>
                    <a className="lnk" href={`${ORIGIN}gestione/casino?table=${g.displayCode}`} target="_blank" rel="noreferrer">🖥️ Apri sul maxi-schermo ↗</a>
                  </div>
                </div>
              ))}
              {gts.length === 0 && <div style={{ color: '#9c8a5e', textAlign: 'center', marginTop: 40, font: '400 18px var(--serif)' }}>Crea una roulette e aprila sull'80″.</div>}
            </div>
          </div>
        </div>

        {/* P4 CLASSIFICA SERATA */}
        <div className="panel" style={{ left: 1282, width: 370 }}>
          {H('CLASSIFICA SERATA')}
          <div className="pbody">
            {state.standings.length === 0 ? (
              <>
                <img className="trophy" src={`${AB}casino/regia/trophy.png`} alt="" />
                <div className="empty1">Nessun giocatore</div>
                <div className="divorn" />
                <div className="empty2">La classifica apparirà<br />con i primi iscritti</div>
              </>
            ) : (
              <div className="srow">
                {state.standings.map((p, i) => (
                  <div className="srank" key={p.id}>
                    <span className="n">{i + 1}</span>
                    <span className="nm">{p.nickname}</span>
                    <span className="v">{p.fishBalance.toLocaleString('it-IT')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="footer">❧&nbsp;&nbsp;IDEA EVENTI CASINÒ · Pannello di controllo&nbsp;&nbsp;❧</div>
      </main>
    </div>
  );
}


// Banco "Tavoli": crea tavoli da gioco interattivi (roulette) per l'80".
function GameTablesCard({ sessionId }: { sessionId: string }) {
  const [tables, setTables] = useState<GameTableState['table'][]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`${API}/gestione/casino/sessions/${sessionId}/game-tables`).then(r => r.ok ? r.json() : null).then(d => { if (d) setTables(d.tables); }).catch(() => {}), [sessionId]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  const create = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/game-tables`, { type: 'roulette', seats: 10 }); await load(); } finally { setBusy(false); } };
  return (
    <Card title="🎲 Tavoli da gioco (80″)">
      <button onClick={create} disabled={busy} style={{ ...btn(GOLD), width: '100%', marginBottom: 12 }}>+ Nuovo tavolo Roulette</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tables.map(t => (
          <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#ffffff0a', borderRadius: 12, padding: 10 }}>
            <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}>
              <QRCodeSVG value={`${ORIGIN}gestione/casino?table=${t.displayCode}`} size={56} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>🎡 {t.name}</div>
              <div style={{ fontSize: 12, opacity: 0.5 }}>{Object.keys(t.seats).length} postazioni · codice {t.displayCode}</div>
              <a href={`${ORIGIN}gestione/casino?table=${t.displayCode}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, color: GOLD, fontSize: 13, fontWeight: 800 }}>🖥️ Apri sul maxi-schermo ↗</a>
            </div>
          </div>
        ))}
        {tables.length === 0 && <div style={{ opacity: 0.4 }}>Nessun tavolo. Crea una roulette e aprila sullo schermo 80″.</div>}
      </div>
    </Card>
  );
}

const SETUP_CSS = `
.setup-root{position:fixed;inset:0;overflow:auto;display:grid;place-items:center;padding:32px 18px;color:#fff;
  --serif:"Baskerville Casino",Georgia,serif;font-family:var(--serif);
  background:radial-gradient(ellipse 1100px 760px at 50% 18%,#0a5a25 0%,#043f17 42%,#02240c 78%,#011607 100%);}
.setup-root .wrap{width:100%;max-width:520px;text-align:center;}
.setup-root .logo{height:120px;object-fit:contain;margin:0 auto 6px;display:block;filter:drop-shadow(0 2px 10px #000a);}
.setup-root .sub{color:#e8c879;font:400 20px/1 var(--serif);margin-bottom:26px;}
.setup-root .panel{position:relative;text-align:left;border-radius:16px;padding:26px 24px;
  background:linear-gradient(160deg,#141209 0%,#0a0a07 55%,#07070a 100%);
  border:2px solid #b98b38;box-shadow:0 0 0 2px #3a2708,0 0 24px rgba(243,201,95,.14),inset 0 0 0 1px rgba(255,235,160,.14),inset 0 10px 40px #0008;}
.setup-root .panel::before{content:"";position:absolute;inset:6px;border:1px solid rgba(243,201,95,.3);border-radius:10px;pointer-events:none;}
.setup-root .lbl{font:700 20px/1 var(--serif);color:#ffe9a6;letter-spacing:.01em;}
.setup-root .hint{font:400 14px/1.3 var(--serif);color:#9c8a5e;margin-top:10px;}
.setup-root .row{display:flex;gap:10px;margin-top:14px;}
.setup-root .opt{flex:1;padding:16px 0;border-radius:12px;border:2px solid #6e5320;background:linear-gradient(#17130b,#0c0c08);
  color:#f4ead3;font:700 24px/1 var(--serif);cursor:pointer;transition:all .12s;}
.setup-root .opt.sel{border-color:#f3c95f;background:radial-gradient(ellipse at 50% 30%,#3a2a08,#1a1305);color:#ffe9a6;box-shadow:0 0 16px rgba(243,201,95,.35),inset 0 0 0 1px #f3c95f;}
.setup-root .opt.sm{font-size:20px;padding:14px 0;}
.setup-root .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:22px;padding:18px;border-radius:12px;border:1px solid #f3dea0;
  background:linear-gradient(180deg,#ffe694 0%,#f0c357 48%,#d59a34 52%,#eab74a 100%);color:#231503;font:700 22px/1 var(--serif);cursor:pointer;
  box-shadow:0 3px 0 #7a4d12,0 6px 14px #0008,inset 0 1px 0 #fff8;}
.setup-root .gbtn:disabled{opacity:.6;}
`;
function SetupWizard({ sessionId }: { sessionId: string }) {
  const [dealers, setDealers] = useState(3);
  const [startFish, setStartFish] = useState(500);
  const [busy, setBusy] = useState(false);
  const AB = (import.meta.env.BASE_URL as string) || '/';
  const go = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/setup`, { dealers, startFish }); } finally { setBusy(false); } };
  return (
    <div className="setup-root">
      <style>{`@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${AB}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:block;}@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${AB}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:block;}` + SETUP_CSS}</style>
      <div className="wrap">
        <img className="logo" src={`${AB}casino/logo-placeholder.jpg`} alt="IDEA EVENTI CASINÒ" />
        <div className="sub">Prepariamo la serata</div>
        <div className="panel">
          <div className="lbl">Quanti dealer (tavoli)?</div>
          <div className="row">
            {[1, 2, 3, 4, 5, 6].map(n => <button key={n} className={`opt${dealers === n ? ' sel' : ''}`} onClick={() => setDealers(n)}>{n}</button>)}
          </div>
          <div className="hint">Ognuno riceve un QR dealer per aprire il proprio banco.</div>
          <div className="lbl" style={{ marginTop: 24 }}>Fiche iniziali per giocatore</div>
          <div className="row">
            {[300, 500, 1000, 2000].map(n => <button key={n} className={`opt sm${startFish === n ? ' sel' : ''}`} onClick={() => setStartFish(n)}>{n}</button>)}
          </div>
          <div className="hint">Ogni ospite parte con queste fiche appena fa il login.</div>
        </div>
        <button className="gbtn" onClick={go} disabled={busy}>{busy ? '…' : `Apri ${dealers} ${dealers === 1 ? 'tavolo' : 'tavoli'}`}</button>
      </div>
    </div>
  );
}

// ══════════════════ DEALER ══════════════════
function DealerView({ dealerCode }: { dealerCode: string }) {
  const [data, setData] = useState<{ table: Table; sessionName: string; sessionId: string; tablePlayers: Player[]; allPlayers: Player[] } | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => { fetch(`${API}/gestione/casino/dealer/${dealerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setData(d); }).catch(() => {}); }, [dealerCode]);
  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, [load]);

  const target = useMemo(() => data?.allPlayers.find(p => p.id === targetId) ?? null, [data, targetId]);

  const resolvePlayer = useCallback(async (raw: string) => {
    const m = raw.match(/player=([A-Z0-9]+)/i);
    const pc = (m ? m[1] : raw).toUpperCase().trim();
    const r = await fetch(`${API}/gestione/casino/player/${pc}`);
    if (!r.ok) { setMsg('Giocatore non trovato'); return; }
    const d = await r.json();
    setTargetId(d.player.id); setScanning(false); setMsg('');
  }, []);

  const seat = async (p: Player, seatIt: boolean) => {
    const r = await api(`/gestione/casino/seat`, { dealerCode, playerId: p.id, seat: seatIt });
    if (r.ok) { setMsg(seatIt ? `${p.nickname} è al tuo tavolo ✓` : `${p.nickname} liberato`); load(); }
  };
  const tx = async (delta: number) => {
    if (!target) return;
    const r = await api(`/gestione/casino/tx`, { dealerCode, playerId: target.id, delta });
    if (r.ok) { setMsg(delta > 0 ? `+${delta} pagati ✓` : `${delta} prelevati ✓`); load(); }
    else setMsg(r.error || 'Errore');
  };

  if (!data) return <Center>Carico tavolo…</Center>;

  const mine = data.tablePlayers;
  const others = data.allPlayers.filter(p => p.tableId !== data.table.id);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', padding: 16, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div style={{ fontWeight: 900, fontSize: 20 }}>{data.table.name}</div><div style={{ opacity: 0.5, fontSize: 13 }}>{data.sessionName} · Dealer</div></div>
        <BrandBar h={20} dim={0.75} />
      </div>

      {msg && <div style={{ textAlign: 'center', color: msg.includes('✓') ? '#4ade80' : '#f87171', fontWeight: 800, marginBottom: 10 }}>{msg}</div>}

      {/* Pannello azione sul giocatore selezionato */}
      <AnimatePresence>
        {target && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ background: '#ffffff0d', border: `1px solid ${GOLD}44`, borderRadius: 20, padding: 16, marginBottom: 16, maxWidth: 520, margin: '0 auto 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <PlayerAvatar nickname={target.nickname} avatarUrl={target.avatarUrl} size={64} ring={GOLD} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{target.nickname}</div>
                <div><span style={{ fontSize: 'clamp(28px,9vw,40px)', fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={target.fishBalance} /></span> <span style={{ opacity: 0.5 }}>fiche</span></div>
              </div>
              <button onClick={() => setTargetId(null)} style={{ ...btn('#ffffff22'), padding: '8px 12px' }}>✕</button>
            </div>

            {target.tableId !== data.table.id
              ? <button onClick={() => seat(target, true)} style={{ ...btn(GOLD), width: '100%', marginTop: 12 }}>➕ Siedi al mio tavolo</button>
              : <button onClick={() => seat(target, false)} style={{ ...btn('#ffffff22'), width: '100%', marginTop: 12 }}>Togli dal tavolo</button>}

            {/* Puntata in sospeso → risoluzione rapida (vince/perde) */}
            {(target.pendingBet ?? 0) > 0 && (
              <div style={{ marginTop: 12, background: `${GOLD}14`, borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Puntata in gioco</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: GOLD }}>{target.pendingBet}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => tx(target.pendingBet ?? 0)} style={{ ...btn('#4ade80'), padding: 16, fontSize: 17 }}>VINCE +{target.pendingBet}</motion.button>
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => tx(-(target.pendingBet ?? 0))} style={{ ...btn('#f87171'), padding: 16, fontSize: 17 }}>PERDE −{target.pendingBet}</motion.button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
              {[10, 25, 50, 100].map(n => <motion.button whileTap={{ scale: 0.94 }} key={'p' + n} onClick={() => tx(n)} style={{ ...btn('#4ade80'), padding: 14, fontSize: 15 }}>+{n}</motion.button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
              {[10, 25, 50, 100].map(n => <motion.button whileTap={{ scale: 0.94 }} key={'t' + n} onClick={() => tx(-n)} style={{ ...btn('#f87171'), padding: 14, fontSize: 15 }}>−{n}</motion.button>)}
            </div>
            <QuickAmount onPay={n => tx(n)} onTake={n => tx(-n)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scanner opzionale */}
      <div style={{ maxWidth: 520, margin: '0 auto 14px' }}>
        {scanning
          ? <QrScanner onResult={resolvePlayer} onClose={() => setScanning(false)} />
          : <button onClick={() => setScanning(true)} style={{ ...btn('#ffffff18'), width: '100%' }}>📷 Inquadra il QR del giocatore</button>}
      </div>

      {/* Griglia foto: il dealer tocca la faccia dell'ospite */}
      <PhotoGrid title={`Al mio tavolo (${mine.length})`} players={mine} targetId={targetId} onTap={p => setTargetId(p.id)} emptyHint="Tocca un ospite qui sotto per sederlo al tavolo" />
      {others.length > 0 && <PhotoGrid title="Altri ospiti della serata" players={others} targetId={targetId} onTap={p => setTargetId(p.id)} dim />}
    </div>
  );
}

function PhotoGrid({ title, players, targetId, onTap, emptyHint, dim }: { title: string; players: Player[]; targetId: string | null; onTap: (p: Player) => void; emptyHint?: string; dim?: boolean }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto 18px' }}>
      <div style={{ fontSize: 12, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 4px 8px' }}>{title}</div>
      {players.length === 0 && emptyHint ? <div style={{ opacity: 0.4, fontSize: 14, padding: '0 4px' }}>{emptyHint}</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 10, opacity: dim ? 0.78 : 1 }}>
          {[...players].sort((a, b) => b.fishBalance - a.fishBalance).map(p => (
            <motion.button whileTap={{ scale: 0.93 }} key={p.id} onClick={() => onTap(p)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 10, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                border: targetId === p.id ? `2px solid ${GOLD}` : '1px solid #ffffff14', background: targetId === p.id ? `${GOLD}1c` : '#ffffff08', color: '#fff' }}>
              <div style={{ position: 'relative' }}>
                <PlayerAvatar nickname={p.nickname} avatarUrl={p.avatarUrl} size={60} ring={targetId === p.id ? GOLD : undefined} />
                {(p.pendingBet ?? 0) > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: GOLD, color: '#150c02', fontWeight: 900, fontSize: 11, padding: '2px 6px', borderRadius: 10 }}>{p.pendingBet}</span>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, maxWidth: 84, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname}</div>
              <div style={{ fontWeight: 900, color: GOLD, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.fishBalance.toLocaleString('it-IT')}</div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAmount({ onPay, onTake }: { onPay: (n: number) => void; onTake: (n: number) => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center', marginTop: 10 }}>
      <input type="number" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} placeholder="importo libero" style={inp} />
      <button onClick={() => { if (v) { onPay(Number(v)); setV(''); } }} style={btn('#4ade80')}>Paga</button>
      <button onClick={() => { if (v) { onTake(Number(v)); setV(''); } }} style={btn('#f87171')}>Preleva</button>
    </div>
  );
}

// ══════════════════ GIOCATORE — LOGIN con selfie ══════════════════
function JoinView({ sessionId }: { sessionId: string }) {
  const [nick, setNick] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => { if (!f) return; try { setPhoto(await fileToAvatarDataUrl(f)); } catch { /* ignora */ } };
  const join = async () => {
    if (!nick.trim()) return;
    setBusy(true);
    try {
      const p = await api(`/gestione/casino/sessions/${sessionId}/players`, { nickname: nick, photo });
      if (p?.playerCode) window.location.href = `${ORIGIN}gestione/casino?player=${p.playerCode}`;
    } finally { setBusy(false); }
  };
  return (
    <Center>
      <div style={{ textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <CasinoWordmark size={30} />
        <div style={{ opacity: 0.6, margin: '8px 0 20px', fontSize: 14 }}>Fai il tuo selfie e ricevi <b style={{ color: GOLD }}>500 fiche</b></div>

        <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => fileRef.current?.click()}
          style={{ width: 150, height: 150, borderRadius: '50%', border: `3px dashed ${photo ? GOLD : '#ffffff33'}`, background: '#ffffff08', color: '#fff', cursor: 'pointer', overflow: 'hidden', margin: '0 auto 16px', display: 'block', padding: 0 }}>
          {photo ? <img src={photo} alt="selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 40 }}>📸<div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Scatta selfie</div></span>}
        </motion.button>

        <input value={nick} onChange={e => setNick(e.target.value)} placeholder="Il tuo nome" onKeyDown={e => e.key === 'Enter' && join()} style={{ ...inp, width: '100%', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
        <motion.button whileTap={{ scale: 0.97 }} onClick={join} disabled={busy} style={{ ...btn(GOLD), width: '100%', padding: 16, fontSize: 18 }}>{busy ? '…' : 'Entra al casinò 🎰'}</motion.button>
        {!photo && <div style={{ fontSize: 12, opacity: 0.4, marginTop: 10 }}>Il selfie ti rende riconoscibile al tavolo (puoi anche saltarlo).</div>}
      </div>
    </Center>
  );
}

// ══════════════════ GIOCATORE — vista con puntata ══════════════════
function PlayerView({ code }: { code: string }) {
  const [data, setData] = useState<{ player: Player; sessionName: string; sessionId: string } | null>(null);
  const [err, setErr] = useState('');
  const [betInput, setBetInput] = useState('');
  const [sending, setSending] = useState(false);

  const pull = useCallback(() => fetch(`${API}/gestione/casino/player/${code}`).then(r => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr('Giocatore non trovato')), [code]);
  useEffect(() => { pull(); const t = setInterval(pull, 2000); return () => clearInterval(t); }, [pull]);
  // Memorizza il codice così, scansionando il QR di una sedia, il controller sa chi sei.
  useEffect(() => { try { localStorage.setItem('casino_player', code); } catch { /* */ } }, [code]);

  const placeBet = async (amount: number) => {
    setSending(true);
    try { await api(`/gestione/casino/bet`, { playerCode: code, amount }); setBetInput(''); await pull(); }
    finally { setSending(false); }
  };

  if (err) return <Center>{err}</Center>;
  if (!data) return <Center>Carico…</Center>;
  const p = data.player;
  const pending = p.pendingBet ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 20, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <BrandBar h={20} dim={0.7} />
      <PlayerAvatar nickname={p.nickname} avatarUrl={p.avatarUrl} size={88} ring={GOLD} />
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: -4 }}>{p.nickname}</div>
      <motion.div key={p.fishBalance} initial={{ scale: 1.14 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        style={{ fontSize: 'clamp(56px,18vw,110px)', fontWeight: 900, color: GOLD, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 30px ${GOLD}44` }}><AnimatedNumber value={p.fishBalance} /></motion.div>
      <div style={{ opacity: 0.5, marginTop: -6 }}>le tue fiche</div>

      {/* Puntata */}
      <div style={{ width: '100%', maxWidth: 360, background: '#ffffff0a', border: `1px solid ${pending > 0 ? GOLD : '#ffffff18'}`, borderRadius: 20, padding: 16 }}>
        {pending > 0 ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, opacity: 0.6 }}>Hai puntato</div>
            <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ fontSize: 44, fontWeight: 900, color: GOLD }}>{pending}</motion.div>
            <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 10 }}>mostra il QR al dealer per giocarla</div>
            <button onClick={() => placeBet(0)} disabled={sending} style={{ ...btn('#ffffff22'), width: '100%' }}>Annulla puntata</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.85, marginBottom: 10, textAlign: 'center' }}>Piazza la tua puntata</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
              {[25, 50, 100, 250].map(n => <motion.button whileTap={{ scale: 0.93 }} key={n} disabled={sending || n > p.fishBalance} onClick={() => placeBet(n)}
                style={{ ...btn(GOLD), padding: 14, opacity: n > p.fishBalance ? 0.3 : 1 }}>{n}</motion.button>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" inputMode="numeric" value={betInput} onChange={e => setBetInput(e.target.value)} placeholder="importo" style={inp} />
              <button disabled={sending || !betInput || Number(betInput) > p.fishBalance} onClick={() => placeBet(Number(betInput))} style={btn(GOLD)}>Punta</button>
            </div>
          </>
        )}
      </div>

      <div style={{ background: '#fff', padding: 14, borderRadius: 16, marginTop: 6 }}>
        <QRCodeSVG value={p.playerCode} size={168} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.25em', color: GOLD }}>{p.playerCode}</div>
      <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', maxWidth: 300 }}>Mostra questo QR al dealer per puntare, ricevere o consegnare le fiche</div>
    </div>
  );
}

// ══════════════════ ROULETTE — tappeto condiviso ══════════════════
// Fiche impilate su una casella: un pallino per postazione, colore della sedia.
function ChipStack({ bets, s }: { bets: { seatNo: number; amount: number }[]; s: number }) {
  if (!bets.length) return null;
  const total = bets.reduce((a, b) => a + b.amount, 0);
  const show = bets.slice(0, 4);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: s * 0.72, height: s * 0.72 }}>
        {show.map((b, i) => (
          <div key={i} style={{ position: 'absolute', left: i * 3, top: -i * 3, width: s * 0.5, height: s * 0.5, borderRadius: '50%', background: seatColor(b.seatNo), border: '2px solid #fff', boxShadow: '0 2px 4px #0008' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: Math.max(10, s * 0.26), fontWeight: 900, color: '#fff', textShadow: '0 1px 3px #000', zIndex: 2 }}>{total}</span>
        </div>
      </div>
    </div>
  );
}

function RouletteFelt({ betsBySpot, onPlace, s = 46, result }: { betsBySpot: Record<string, { seatNo: number; amount: number }[]>; onPlace?: (kind: string, numbers: number[]) => void; s?: number; result?: number | null }) {
  const cell = (kind: string, numbers: number[], label: React.ReactNode, style: React.CSSProperties, key: string) => {
    const spot = spotOf(kind, numbers);
    const hit = result != null && (numbers.length ? numbers.includes(result) : spotWinsOutside(kind, result));
    return (
      <button key={key} onClick={onPlace ? () => onPlace(kind, numbers) : undefined}
        style={{ position: 'relative', border: `1px solid ${GOLD}66`, color: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: onPlace ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: hit ? `3px solid ${GOLD}` : 'none', outlineOffset: -2, boxShadow: hit ? `0 0 ${s * 0.4}px ${GOLD}` : 'none', ...style }}>
        {label}
        <ChipStack bets={betsBySpot[spot] ?? []} s={s} />
      </button>
    );
  };
  // Celle numero più alte che larghe (come un vero tappeto). Esterne sullo stesso verde.
  const nH = s * 1.3;
  const outside: React.CSSProperties = { background: 'transparent', fontSize: s * 0.4 };
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `${s * 1.25}px repeat(12, ${s}px) ${s * 1.35}px`, gridAutoRows: 'min-content', background: 'radial-gradient(ellipse at 50% 40%, #0a7a26, #005417 92%)', padding: s * 0.22, borderRadius: s * 0.22, border: `${Math.max(3, s * 0.12)}px solid ${GOLD}`, boxShadow: `0 24px 70px #000b, inset 0 0 ${s * 0.8}px #0005` }}>
      {/* 0 */}
      {cell('straight', [0], <span style={{ fontSize: s * 0.72 }}>0</span>, { gridColumn: '1', gridRow: '1 / span 3', background: numColor(0) }, 'z0')}
      {/* numeri */}
      {FELT_ROWS.map((rowArr, r) => rowArr.map((n, c) => cell('straight', [n], <span style={{ fontSize: s * 0.64 }}>{n}</span>, { gridColumn: String(c + 2), gridRow: String(r + 1), background: numColor(n), height: nH }, `n${n}`)))}
      {/* colonne 2:1 */}
      {['col3', 'col2', 'col1'].map((k, r) => cell(k, [], <span style={{ fontSize: s * 0.3 }}>2:1</span>, { gridColumn: '14', gridRow: String(r + 1), ...outside }, k))}
      {/* dozzine */}
      {cell('dozen1', [], '1 – 12', { gridColumn: '2 / span 4', gridRow: '4', height: s * 1.0, ...outside }, 'd1')}
      {cell('dozen2', [], '13 – 24', { gridColumn: '6 / span 4', gridRow: '4', height: s * 1.0, ...outside }, 'd2')}
      {cell('dozen3', [], '25 – 36', { gridColumn: '10 / span 4', gridRow: '4', height: s * 1.0, ...outside }, 'd3')}
      {/* esterne basse */}
      {cell('low', [], '1 – 18', { gridColumn: '2 / span 2', gridRow: '5', height: s * 1.1, ...outside }, 'low')}
      {cell('even', [], 'PARI', { gridColumn: '4 / span 2', gridRow: '5', height: s * 1.1, ...outside }, 'even')}
      {cell('red', [], '◆', { gridColumn: '6 / span 2', gridRow: '5', height: s * 1.1, ...outside, color: '#e23a3a', fontSize: s * 0.6 }, 'red')}
      {cell('black', [], '◆', { gridColumn: '8 / span 2', gridRow: '5', height: s * 1.1, ...outside, color: '#000', fontSize: s * 0.6 }, 'black')}
      {cell('odd', [], 'DISPARI', { gridColumn: '10 / span 2', gridRow: '5', height: s * 1.1, ...outside, fontSize: s * 0.3 }, 'odd')}
      {cell('high', [], '19 – 36', { gridColumn: '12 / span 2', gridRow: '5', height: s * 1.1, ...outside }, 'high')}
    </div>
  );
}
function spotWinsOutside(kind: string, r: number): boolean {
  switch (kind) {
    case 'red': return RED_NUMS.has(r);
    case 'black': return r !== 0 && !RED_NUMS.has(r);
    case 'even': return r !== 0 && r % 2 === 0;
    case 'odd': return r % 2 === 1;
    case 'low': return r >= 1 && r <= 18;
    case 'high': return r >= 19 && r <= 36;
    case 'dozen1': return r >= 1 && r <= 12;
    case 'dozen2': return r >= 13 && r <= 24;
    case 'dozen3': return r >= 25 && r <= 36;
    case 'col1': return r !== 0 && r % 3 === 1;
    case 'col2': return r !== 0 && r % 3 === 2;
    case 'col3': return r !== 0 && r % 3 === 0;
    default: return false;
  }
}

/* Ruota vettoriale incastonata: numeri grandi in ordine europeo, pallina che
   cade sul numero uscito (che si illumina) e GIRO TRASCINANDO il dito attorno. */
function RouletteWheelPro({ result, phase, onSpin, size = 460 }: { result: number | null; phase: string; onSpin: () => void; size?: number }) {
  const rotate = useMotionValue(0);
  const ballRot = useMotionValue(0);
  const prev = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ on: boolean; last: number; acc: number }>({ on: false, last: 0, acc: 0 });
  const [showResult, setShowResult] = useState(false);

  // Ruota = immagine del mockup (look identico). Gira tanti giri e si ferma; il
  // NUMERO autentico (RNG server) è mostrato al centro e illuminato sul tappeto.
  useEffect(() => {
    if (phase === 'betting') { setShowResult(false); return; }
    if (result == null || result === prev.current) return;
    prev.current = result;
    setShowResult(false);
    const cur = rotate.get();
    const target = cur + 360 * 6 + Math.floor(Math.random() * 360);
    animate(rotate, target, { duration: 4.6, ease: [0.16, 0.73, 0.12, 1], onComplete: () => setShowResult(true) });
    animate(ballRot, ballRot.get() - (360 * 9 + Math.random() * 280), { duration: 4.6, ease: [0.2, 0.7, 0.2, 1] });
  }, [result, phase, rotate, ballRot]);

  const angleAt = (cx: number, cy: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return Math.atan2(cy - (r.top + r.height / 2), cx - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  const onDown = (e: React.PointerEvent) => { if (phase !== 'betting') return; drag.current = { on: true, last: angleAt(e.clientX, e.clientY), acc: 0 }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const a = angleAt(e.clientX, e.clientY);
    let d = a - drag.current.last; if (d > 180) d -= 360; if (d < -180) d += 360;
    drag.current.last = a; drag.current.acc += d;
    rotate.set(rotate.get() + d);
  };
  const onUp = () => { if (drag.current.on && Math.abs(drag.current.acc) > 35 && phase === 'betting') onSpin(); drag.current.on = false; };

  const disc = size * 0.26;
  return (
    <div ref={boxRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      style={{ position: 'relative', width: size, height: size, margin: '0 auto', touchAction: 'none', cursor: phase === 'betting' ? 'grab' : 'default', userSelect: 'none' }}>
      {/* Ruota fotorealistica (immagine) che ruota su div — origine centro affidabile.
          Clip a cerchio: il ritaglio ha gli angoli verdi, così resta solo la ruota. */}
      <motion.div style={{ rotate, position: 'absolute', inset: 0, transformOrigin: '50% 50%', borderRadius: '50%', overflow: 'hidden' }}>
        <img src={`${import.meta.env.BASE_URL || '/'}roulette-wheel.png`} alt="roulette" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </motion.div>
      {/* Pallina che corre nel canale */}
      <motion.div style={{ rotate: ballRot, position: 'absolute', inset: 0, transformOrigin: '50% 50%', pointerEvents: 'none' }}>
        {phase !== 'betting' && !showResult && (
          <div style={{ position: 'absolute', top: '4.5%', left: '50%', transform: 'translateX(-50%)', width: size * 0.038, height: size * 0.038, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff, #c4c4c4)', boxShadow: '0 2px 6px #000b' }} />
        )}
      </motion.div>
      {/* Numero uscito (autentico) al centro della ruota */}
      <AnimatePresence>
        {showResult && result != null && (
          <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: disc, height: disc, borderRadius: '50%', background: numColor(result), border: `${Math.max(3, size * 0.012)}px solid #fff`, boxShadow: `0 0 ${size * 0.1}px ${GOLD}, 0 6px 20px #000a`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: disc * 0.5, fontWeight: 900, color: '#fff', textShadow: '0 2px 6px #000' }}>{result}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {phase === 'betting' && (
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
          style={{ position: 'absolute', bottom: -size * 0.04, left: '50%', transform: 'translateX(-50%)', color: GOLD, fontWeight: 800, fontSize: size * 0.045, whiteSpace: 'nowrap', pointerEvents: 'none' }}>↻ gira la ruota col dito</motion.div>
      )}
    </div>
  );
}

// Card giocatore in basso (foto + nome + CREDITO), stile del mockup; vuoto = QR.
function PlayerChip({ no, seat, bet, h, serif = false }: { no: number; seat: SeatInfo; bet: number; h: number; serif?: boolean }) {
  const av = Math.round(h * 0.36);
  if (seat.playerId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: h * 0.02, background: 'linear-gradient(#141210,#0a0906)', border: `1.5px solid ${GOLD}77`, borderRadius: 12, padding: `${h * 0.06}px ${h * 0.05}px`, width: '100%', overflow: 'hidden', boxShadow: '0 4px 14px #0007' }}>
        <div style={{ position: 'relative' }}>
          <PlayerAvatar nickname={seat.nickname ?? '?'} avatarUrl={seat.avatarUrl} size={av} ring={GOLD} />
          {bet > 0 && <span style={{ position: 'absolute', top: -4, right: -8, background: GOLD, color: '#1a1205', fontWeight: 900, fontSize: av * 0.3, padding: '1px 6px', borderRadius: 9, border: '2px solid #0a0906' }}>{bet}</span>}
        </div>
        <div style={{ fontFamily: serif ? SERIF : 'inherit', fontWeight: serif ? 700 : 800, fontSize: h * 0.16, color: '#f3e6c0', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seat.nickname}</div>
        <div style={{ fontSize: h * 0.085, letterSpacing: '0.16em', color: GOLD, opacity: 0.9, textTransform: 'uppercase' }}>Credito</div>
        <div style={{ fontWeight: 900, fontSize: h * 0.2, fontVariantNumeric: 'tabular-nums' }}>{(seat.balance ?? 0).toLocaleString('it-IT')}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'linear-gradient(#141210,#0a0906)', border: `1.5px solid ${GOLD}44`, borderRadius: 12, padding: `${h * 0.08}px ${h * 0.06}px`, width: '100%' }}>
      <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}><QRCodeSVG value={`${ORIGIN}gestione/casino?seat=${seat.code}`} size={av} /></div>
      <div style={{ fontSize: h * 0.14, fontWeight: 800, opacity: 0.7 }}>Posto {no}</div>
      <div style={{ fontSize: h * 0.1, opacity: 0.45 }}>scansiona</div>
    </div>
  );
}
// Banner "FAI LA TUA PUNTATA" ornamentale.
function Banner({ text, big }: { text: string; big: number }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: big * 0.45, padding: `${big * 0.28}px ${big * 1.2}px`, border: `${Math.max(2, big * 0.07)}px solid ${GOLD}`, borderRadius: 999, background: 'linear-gradient(#0a4f2a,#06331c)', boxShadow: `0 0 ${big}px ${GOLD}33, inset 0 0 ${big * 0.6}px #0006` }}>
      <span style={{ color: GOLD, fontSize: big * 0.7, opacity: 0.8 }}>❧</span>
      <span style={{ color: GOLD, fontWeight: 900, fontSize: big, letterSpacing: '0.07em', textShadow: '0 2px 6px #000', whiteSpace: 'nowrap' }}>{text}</span>
      <span style={{ color: GOLD, fontSize: big * 0.7, opacity: 0.8, transform: 'scaleX(-1)' }}>❧</span>
    </div>
  );
}
// Striscia dei numeri usciti (sotto la ruota).
function HistoryStrip({ history, d }: { history: number[]; d: number }) {
  return (
    <div style={{ display: 'flex', gap: d * 0.28, justifyContent: 'center', flexWrap: 'wrap', background: '#0a0906cc', border: `1px solid ${GOLD}55`, borderRadius: 999, padding: `${d * 0.22}px ${d * 0.4}px` }}>
      {history.slice(0, 10).map((n, i) => (
        <span key={i} style={{ width: d, height: d, borderRadius: '50%', background: numColor(n), border: `1.5px solid ${i === 0 ? GOLD : '#ffffff22'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: d * 0.46, color: '#fff' }}>{n}</span>
      ))}
      {history.length === 0 && <span style={{ color: MUTED_C, fontSize: d * 0.5, padding: '0 8px' }}>nessun numero ancora</span>}
    </div>
  );
}
const MUTED_C = 'rgba(255,255,255,0.5)';

// Logo IDEA EVENTI CASINÒ (alto a destra, come il mockup).
function CasinoBrandMark({ h = 80, serif = false }: { h?: number; serif?: boolean }) {
  const [ok, setOk] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
      {ok
        ? <img src={`${import.meta.env.BASE_URL || '/'}ideaeventi-logo.png`} alt="IDEA EVENTI" onError={() => setOk(false)} style={{ height: h, objectFit: 'contain', filter: 'drop-shadow(0 2px 8px #000a)' }} />
        : <span style={{ fontWeight: 900, fontSize: h * 0.42, color: '#fff', fontFamily: serif ? SERIF : 'inherit' }}>IDEA <span style={{ color: GOLD }}>EVENTI</span></span>}
      <span style={{ fontFamily: serif ? SERIF : 'inherit', fontWeight: 900, fontSize: h * 0.42, color: GOLD, letterSpacing: '0.06em', textShadow: `0 2px 10px ${GOLD}55`, marginTop: -h * 0.07 }}>CASINÒ</span>
    </div>
  );
}
// Font serif classico del mockup (iniettato una volta).
const SERIF = "'Cinzel', Georgia, 'Times New Roman', serif";

// ══════════════════ ROULETTE TABLE — port fedele del design del cliente ══════════
// Palco fisso 1672×941 scalato a pieno schermo. Ruota: cornice dipinta (jpg) +
// rotore SVG coi numeri in ordine europeo reale → la pallina atterra sul numero.
const A_ = (import.meta.env.BASE_URL as string) || '/';
const WHEEL_SEQ = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const classOf = (n: number) => n === 0 ? 'g' : RED_NUMS.has(n) ? 'r' : 'b';

// Suono della pallina che gira: ticchettio (pallina sui separatori) che rallenta +
// rotolio di fondo, sintetizzato con Web Audio — nessun file audio esterno.
let _actx: AudioContext | null = null;
function playBallSpin(dur = 6) {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const Ctor = AC.AudioContext || AC.webkitAudioContext;
    if (!Ctor) return;
    _actx = _actx || new Ctor();
    const ctx = _actx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    // rotolio: rumore filtrato in banda, entra ed esce dolcemente
    const bufLen = Math.ceil(ctx.sampleRate * dur);
    const noise = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(0.05, t0 + 0.25);
    ng.gain.setValueAtTime(0.05, t0 + dur * 0.6);
    ng.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    src.start(t0); src.stop(t0 + dur);
    // ticchettii deceleranti (la pallina passa i separatori sempre più lenta)
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    let t = t0;
    for (let k = 0; k < 90; k++) {
      const p = k / 90;
      t += 0.03 + 0.52 * Math.pow(p, 2.3); // intervallo crescente = rallentamento
      if (t > t0 + dur) break;
      const vol = 0.42 * (1 - p) + 0.06;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = 2600 - 900 * p + (Math.random() * 200 - 100);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0007, t + 0.045);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.05);
    }
  } catch { /* audio non disponibile: silenzio */ }
}
const HIST_CHIP_X = [73, 132, 191, 249, 307, 366, 424, 481, 539, 596];
const CARD_X = [13, 174, 339, 506, 672, 838, 1004, 1170, 1336, 1503];
const CARD_W = [155, 160, 161, 161, 161, 161, 161, 161, 162, 156];
const itFmt = new Intl.NumberFormat('it-IT');

const RT_CSS = `
@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${A_}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:block;}
@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${A_}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:block;}
.rt-root{position:fixed;inset:0;background:#080706;display:grid;place-items:center;overflow:hidden;color:#fff;
  --serif:"Baskerville Casino",Georgia,serif;--black:#080706;--felt-hi:#075c22;--felt:#034a19;--felt-lo:#01300e;--zero:#017422;--cell-green:#003c14;--red:#d20910;--red-lo:#b30309;--blk:#1b1b1a;--blk-lo:#0b0b0a;--gold:#f1c96c;--gold-hi:#ffefb5;--gold-lo:#c8893a;--gold-muted:#a8954f;--cream:#f4ead3;--line:2px;font-family:var(--serif);}
.rt-root *{box-sizing:border-box;margin:0;padding:0;}
.rt-root .stage{position:relative;width:1672px;height:941px;flex:none;transform-origin:center center;background:var(--black);overflow:hidden;}
.rt-root .abs{position:absolute;}
.rt-root .felt{left:-20px;top:13px;width:1682px;height:739px;border-top:3px solid var(--gold);border-right:3px solid var(--gold);border-bottom:3px solid var(--gold-muted);border-top-right-radius:70px;background:linear-gradient(90deg,#0b0906 0,#0b0906 300px,rgba(11,9,6,0) 470px),radial-gradient(ellipse 980px 640px at 1040px 230px,var(--felt-hi) 0%,var(--felt) 45%,var(--felt-lo) 82%,#012a0c 100%);box-shadow:inset 0 0 0 1px rgba(255,239,181,.08);}
.rt-root .felt-line2{left:0;top:750px;width:1672px;height:1px;background:#bcb54b;opacity:.8;}
.rt-root .wheel-frame{left:0;top:0;width:660px;height:705px;background:url(${A_}casino/wheel-frame.jpg) 0 0 / 660px 705px no-repeat;-webkit-mask:radial-gradient(circle at 298px 338px,transparent 258px,#000 272px);mask:radial-gradient(circle at 298px 338px,transparent 258px,#000 272px);}
.rt-root .rotor{left:36px;top:76px;width:524px;height:524px;}
.rt-root .rotor g.spin{transform-box:view-box;transform-origin:0 0;transition:transform 6s cubic-bezier(.12,.7,.18,1);}
.rt-root .rotor g.ball{transform-box:view-box;transform-origin:0 0;transition:transform 6s cubic-bezier(.1,.6,.2,1);filter:drop-shadow(0 1px 2px #000a);}
.rt-root .rotor text{font:700 25px var(--serif);fill:#fff;text-anchor:middle;dominant-baseline:central;}
.rt-root .title{left:605px;top:46px;width:657px;height:78px;border-radius:40px;border:4px solid #f6cf72;background:radial-gradient(ellipse 70% 120% at 50% 50%,#000d04 0%,#00140a 60%,#052e17 100%);box-shadow:0 0 0 1px #6b4a17,0 0 18px rgba(255,210,120,.35),inset 0 0 0 2px rgba(0,0,0,.6),inset 0 0 14px rgba(255,220,140,.25);display:flex;align-items:center;justify-content:center;gap:22px;}
.rt-root .title h1{font:700 47px/1 var(--serif);letter-spacing:-.012em;white-space:nowrap;transform:scaleX(.84);background:linear-gradient(180deg,#fff6c8 0%,#ffe08a 40%,#e9b24f 72%,#ffe594 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 1px rgba(0,0,0,.8));margin:0 -44px;}
.rt-root .title img{width:60px;height:26px;flex:none;}
.rt-root .logo{left:1285px;top:8px;width:360px;height:230px;object-fit:contain;-webkit-mask:linear-gradient(90deg,transparent,#000 14%,#000 88%,transparent),linear-gradient(transparent,#000 10%,#000 86%,transparent);-webkit-mask-composite:source-in;mask-composite:intersect;mask:linear-gradient(90deg,transparent,#000 14%,#000 88%,transparent),linear-gradient(transparent,#000 10%,#000 86%,transparent);}
.rt-root .zero{left:650px;top:248px;width:73px;height:281px;overflow:visible;}
.rt-root .zero text{font:700 54px var(--serif);fill:#fff;text-anchor:middle;dominant-baseline:central;}
.rt-root .grid{left:720px;top:248px;width:922px;height:281px;display:grid;grid-template-columns:repeat(12,1fr) 77px;grid-template-rows:repeat(3,1fr);gap:var(--line);padding:var(--line) var(--line) 0 0;background:var(--gold);border-top-right-radius:8px;}
.rt-root .cell{position:relative;display:grid;place-items:center;font:700 36px/1 var(--serif);color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.6);user-select:none;}
.rt-root .cell.r{background:radial-gradient(ellipse at 50% 35%,var(--red) 0%,#c5050c 60%,var(--red-lo) 100%);}
.rt-root .cell.b{background:radial-gradient(ellipse at 50% 35%,var(--blk) 0%,#131312 60%,var(--blk-lo) 100%);}
.rt-root .cell.g{background:var(--cell-green);font-size:34px;}
.rt-root .grid .cell:nth-child(13){border-top-right-radius:6px;}
.rt-root .cell.win{outline:3px solid var(--gold-hi);outline-offset:-3px;box-shadow:0 0 22px var(--gold),inset 0 0 16px rgba(241,201,108,.5);z-index:3;}
.rt-root .outside{left:674px;top:527px;width:968px;height:197px;background:var(--gold);border:var(--line) solid var(--gold);border-top:0;padding-top:var(--line);border-radius:0 0 12px 12px;overflow:hidden;display:grid;gap:var(--line);grid-template-rows:90px 1fr;grid-template-columns:159px 159px 146px 147px 177px 1fr;}
.rt-root .outside .cell{background:radial-gradient(ellipse at 50% 40%,#024a18 0%,var(--cell-green) 70%,#00320f 100%);font-size:38px;}
.rt-root .outside .d1{grid-column:1 / 3;font-size:42px;}
.rt-root .outside .d2{grid-column:3 / 5;font-size:42px;}
.rt-root .outside .d3{grid-column:5 / 7;font-size:42px;}
.rt-root .outside .word{font-size:31px;letter-spacing:-.01em;transform:scaleX(.92);}
.rt-root .diamond{width:86px;height:62px;}
.rt-root .history{left:32px;top:673px;width:606px;height:67px;border-radius:34px;border:2px solid var(--gold);background:linear-gradient(180deg,#0d0a05,#030302);box-shadow:0 0 0 1px #4a3310,inset 0 0 0 1px rgba(0,0,0,.7),0 0 14px rgba(255,200,110,.18);}
.rt-root .hchip{position:absolute;top:11px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:700 25px/1 var(--serif);color:#fff;border:3px solid var(--gold);box-shadow:0 0 0 1px #3c2a0c,inset 0 2px 3px rgba(255,255,255,.25);}
.rt-root .hchip.r{background:radial-gradient(circle at 40% 30%,#ea2a2c,#b8060c 70%);}
.rt-root .hchip.b{background:radial-gradient(circle at 40% 30%,#2c2c2b,#0b0b0a 70%);}
.rt-root .hchip.g{background:radial-gradient(circle at 40% 30%,#1f9a42,#08662a 70%);}
.rt-root .players{left:0;top:752px;width:1672px;height:189px;background:#060502;}
.rt-root .player{position:absolute;top:8px;height:171px;border-radius:8px;background:linear-gradient(180deg,#0e0d0b 0%,#070706 100%);border:1.5px solid #b48a44;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),inset 0 0 18px rgba(255,200,120,.05);text-align:center;}
.rt-root .player .av{position:absolute;left:50%;top:2px;width:96px;height:96px;margin-left:-48px;border-radius:50%;padding:4px;background:linear-gradient(160deg,var(--gold-hi),var(--gold) 40%,var(--gold-lo) 75%,var(--gold));box-shadow:0 2px 6px rgba(0,0,0,.7);}
.rt-root .player .av img,.rt-root .player .av .ini{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:#2a2118;color:#f4ead3;font:700 40px var(--serif);}
.rt-root .player .name{position:absolute;left:0;right:0;top:99px;font:700 21px/1 var(--serif);color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px;}
.rt-root .player .lbl{position:absolute;left:0;right:0;top:125px;font:700 13px/1 var(--serif);color:#e2b65c;letter-spacing:.02em;}
.rt-root .player .cr{position:absolute;left:0;right:0;top:140px;font:700 27px/1 var(--serif);color:var(--cream);}
.rt-root .player .qr{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#fff;padding:4px;border-radius:8px;}
.rt-root .betchip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);min-width:30px;height:30px;padding:0 6px;border-radius:15px;display:grid;place-items:center;font:700 16px/1 var(--serif);color:#1a1205;background:linear-gradient(#ffe08a,#e0a83a);border:2px solid #fff6;box-shadow:0 2px 5px #0008;z-index:4;}
`;

function RouletteTableView({ displayCode }: { displayCode: string }) {
  const [st, setSt] = useState<GameTableState | null>(null);
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  const spinning = useRef(false);
  const spinG = useRef<SVGGElement | null>(null);
  const ballG = useRef<SVGGElement | null>(null);
  const turns = useRef(0);
  const prevRes = useRef<number | null>(null);
  const [revealN, setRevealN] = useState<number | null>(null); // numero svelato SOLO quando la pallina si ferma
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/table/${displayCode}`).then(r => r.ok ? r.json() : null).then(d => { if (alive && d) setSt(d); }).catch(() => {});
    pull(); const t = setInterval(pull, 900); return () => { alive = false; clearInterval(t); };
  }, [displayCode]);
  const phase = st?.table.phase;
  useEffect(() => {
    if (phase !== 'result') return;
    const t = setTimeout(() => { api(`/gestione/casino/table/next`, { displayCode }); }, 8000);
    return () => clearTimeout(t);
  }, [phase, displayCode]);

  // Disegna il rotore quando l'SVG è nel DOM (dopo il caricamento di `st`).
  // Guardia: se ha già figli non ridisegna (evita reset ad ogni poll).
  useEffect(() => {
    const g = spinG.current; if (!g || g.childNodes.length) return;
    const SEG = 360 / WHEEL_SEQ.length;
    const polar = (r: number, deg: number) => { const a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
    const sector = (r0: number, r1: number, a0: number, a1: number) => {
      const [x0, y0] = polar(r1, a0), [x1, y1] = polar(r1, a1), [x2, y2] = polar(r0, a1), [x3, y3] = polar(r0, a0);
      return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
    };
    const FILL: Record<string, string> = { r: '#d30a12', b: '#151514', g: '#16a043' };
    const FILLP: Record<string, string> = { r: '#cf0a12', b: '#141413', g: '#139a3e' };
    let svg = `<circle r="243" fill="url(#goldBand)"/><circle r="236" fill="#1a0f06"/>`;
    WHEEL_SEQ.forEach((n, i) => { const a0 = i * SEG - SEG / 2, c = classOf(n); svg += `<path d="${sector(194, 236, a0, a0 + SEG)}" fill="${FILL[c]}" stroke="#d9a94e" stroke-width="1.2"/>`; });
    svg += `<circle r="194" fill="none" stroke="url(#goldBand)" stroke-width="8"/>`;
    WHEEL_SEQ.forEach((n, i) => { const a0 = i * SEG - SEG / 2, c = classOf(n); svg += `<path d="${sector(143, 189, a0, a0 + SEG)}" fill="${FILLP[c]}" stroke="#c9963f" stroke-width="1.6"/>`; });
    svg += `<circle r="189" fill="url(#pocketShade)"/>`;
    WHEEL_SEQ.forEach((n, i) => { const [x, y] = polar(215, i * SEG); svg += `<text x="${x}" y="${y}" transform="rotate(${i * SEG} ${x} ${y})">${n}</text>`; });
    svg += `<circle r="143" fill="none" stroke="url(#goldBand)" stroke-width="4"/><image href="${A_}casino/wheel-hub.png" x="-143" y="-143" width="286" height="286"/>`;
    g.innerHTML = svg;
  }, [st]);

  // Gira ruota + pallina e ferma sul numero uscito (sequenza europea reale).
  const spinWheel = useCallback((n: number) => {
    const num = Math.round(Number(n));
    const i = WHEEL_SEQ.indexOf(num); if (i < 0) return;
    prevRes.current = num;
    turns.current += 6;
    const SEG = 360 / WHEEL_SEQ.length;
    if (spinG.current) spinG.current.style.transform = `rotate(${-(turns.current * 360 + i * SEG)}deg)`;
    if (ballG.current) ballG.current.style.transform = `rotate(${turns.current * 360 * 2}deg)`; // orbita opposta, si ferma in alto (sul numero)
    playBallSpin(6); // suono pallina che gira e rallenta
    // Svela il numero SOLO quando la pallina si è fermata (fine animazione 6s).
    setRevealN(null);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealN(num), 6200);
  }, []);
  // Sync fra schermi: se il risultato arriva dal poll (altro display), gira comunque.
  const resultN = st && st.table.phase !== 'betting' ? st.table.result?.number ?? null : null;
  useEffect(() => { if (resultN != null && resultN !== prevRes.current) spinWheel(resultN); }, [resultN, spinWheel]);
  // Nuova mano (torna a "betting"): azzera il numero svelato.
  const phaseNow = st?.table.phase;
  useEffect(() => { if (phaseNow === 'betting') { setRevealN(null); if (revealTimer.current) clearTimeout(revealTimer.current); } }, [phaseNow]);
  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  if (!st) return <Center>Carico il tavolo…</Center>;
  const t = st.table;
  const betsBySpot: Record<string, { seatNo: number; amount: number }[]> = {};
  for (const b of t.bets) { const k = spotOf(b.kind, b.numbers); (betsBySpot[k] ??= []).push({ seatNo: b.seatNo, amount: b.amount }); }
  const totalOf = (spot: string) => (betsBySpot[spot] ?? []).reduce((a, x) => a + x.amount, 0);
  const chipFor = (spot: string) => { const tot = totalOf(spot); return tot > 0 ? <span className="betchip">{tot}</span> : null; };
  const winNum = (n: number) => revealN != null && revealN === n;
  const winOut = (kind: string) => revealN != null && spotWinsOutside(kind, revealN);
  const seats = t.seats;
  const scale = Math.min(dim.w / 1672, dim.h / 941);
  const spin = async () => {
    if (spinning.current || t.phase !== 'betting') return;
    spinning.current = true;
    try {
      const r = await api(`/gestione/casino/table/spin`, { displayCode });
      if (r && r.ok && typeof r.number === 'number') spinWheel(r.number); // gira SUBITO sul numero del server
    } finally { setTimeout(() => (spinning.current = false), 6500); }
  };
  const hist = t.history.slice(0, 10);

  return (
    <div className="rt-root">
      <style>{RT_CSS}</style>
      <main className="stage" style={{ transform: `scale(${scale})` }}>
        <div className="abs felt" />
        <div className="abs felt-line2" />

        {/* ruota: cornice dipinta + rotore (clic = gira) */}
        <div className="abs wheel-frame" />
        <svg className="abs rotor" viewBox="-243 -243 486 486" onClick={spin} style={{ cursor: t.phase === 'betting' ? 'pointer' : 'default' }}>
          <defs>
            <radialGradient id="pocketShade" r="1"><stop offset="0.80" stopColor="#000" stopOpacity=".18" /><stop offset="0.96" stopColor="#000" stopOpacity="0" /></radialGradient>
            <linearGradient id="goldBand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffefb5" /><stop offset=".35" stopColor="#e2b057" /><stop offset=".6" stopColor="#a86c22" /><stop offset="1" stopColor="#f1c96c" /></linearGradient>
          </defs>
          <g className="spin" ref={spinG} />
          <g className="ball" ref={ballG}><circle cx="0" cy="-223" r="9" fill="#fff" stroke="#9a9a9a" strokeWidth="1" /><circle cx="-3" cy="-226" r="3" fill="#fff" opacity="0.85" /></g>
        </svg>

        <div className="abs title"><img src={`${A_}casino/flourish-l.png`} alt="" /><h1>{t.phase === 'betting' ? 'FAI LA TUA PUNTATA' : revealN == null ? 'LA PALLINA GIRA…' : `È USCITO IL ${revealN}`}</h1><img src={`${A_}casino/flourish-r.png`} alt="" /></div>
        <img className="abs logo" src={`${A_}casino/logo-placeholder.jpg`} alt="IDEAeventi Casinò" />

        {/* tavolo */}
        <svg className="abs zero" viewBox="0 0 73 281" style={winNum(0) ? { filter: 'drop-shadow(0 0 16px #f1c96c)' } : undefined}>
          <path d="M22 2 H72 V279 H22 L2 256 V26 Z" fill="#017422" stroke="#f1c96c" strokeWidth="3" strokeLinejoin="round" />
          <text x="38" y="140">0</text>
        </svg>
        {totalOf('n:0') > 0 && <span className="betchip" style={{ left: 686, top: 388 }}>{totalOf('n:0')}</span>}
        <div className="abs grid">
          {[0, 1, 2].map(row => (
            <Fragment key={row}>
              {Array.from({ length: 12 }).map((_, col) => { const n = col * 3 + (3 - row); return <div key={n} className={`cell ${classOf(n)}${winNum(n) ? ' win' : ''}`}>{n}{chipFor('n:' + n)}</div>; })}
              <div className={`cell g${winOut('col' + (3 - row)) ? ' win' : ''}`}>2:1{chipFor('col' + (3 - row))}</div>
            </Fragment>
          ))}
        </div>
        <div className="abs outside">
          <div className={`cell d1${winOut('dozen1') ? ' win' : ''}`}>1 – 12{chipFor('dozen1')}</div>
          <div className={`cell d2${winOut('dozen2') ? ' win' : ''}`}>13 – 24{chipFor('dozen2')}</div>
          <div className={`cell d3${winOut('dozen3') ? ' win' : ''}`}>25 – 36{chipFor('dozen3')}</div>
          <div className={`cell${winOut('low') ? ' win' : ''}`}>1 – 18{chipFor('low')}</div>
          <div className={`cell word${winOut('even') ? ' win' : ''}`}>PARI{chipFor('even')}</div>
          <div className={`cell${winOut('red') ? ' win' : ''}`}><svg className="diamond" viewBox="0 0 86 62"><defs><linearGradient id="dr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e3141a" /><stop offset="1" stopColor="#9c0208" /></linearGradient></defs><path d="M43 2 84 31 43 60 2 31Z" fill="url(#dr)" stroke="#f1c96c" strokeWidth="2.5" /></svg>{chipFor('red')}</div>
          <div className={`cell${winOut('black') ? ' win' : ''}`}><svg className="diamond" viewBox="0 0 86 62"><defs><linearGradient id="db" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2a29" /><stop offset="1" stopColor="#050505" /></linearGradient></defs><path d="M43 2 84 31 43 60 2 31Z" fill="url(#db)" stroke="#f1c96c" strokeWidth="2.5" /></svg>{chipFor('black')}</div>
          <div className={`cell word${winOut('odd') ? ' win' : ''}`}>DISPARI{chipFor('odd')}</div>
          <div className={`cell${winOut('high') ? ' win' : ''}`}>19 – 36{chipFor('high')}</div>
        </div>

        {/* storico */}
        <div className="abs history">
          {hist.map((n, i) => <div key={i} className={`hchip ${classOf(n)}`} style={{ left: HIST_CHIP_X[i]! - 32 - 22 - 2 }}>{n}</div>)}
        </div>

        {/* giocatori */}
        <section className="abs players">
          {Array.from({ length: 10 }).map((_, i) => {
            const no = String(i + 1); const seat = seats[no];
            const left = CARD_X[i]!, width = CARD_W[i]!;
            if (seat && seat.playerId) {
              const bet = st.betsBySeat[no] ?? 0;
              return (
                <article key={no} className="player" style={{ left, width }}>
                  <div className="av">{seat.avatarUrl ? <img src={seat.avatarUrl} alt="" /> : <div className="ini">{(seat.nickname ?? '?').charAt(0).toUpperCase()}</div>}</div>
                  <div className="name">{seat.nickname}</div>
                  <div className="lbl">{bet > 0 ? `PUNTA ${bet}` : 'CREDITO'}</div>
                  <div className="cr">{itFmt.format(seat.balance ?? 0)}</div>
                </article>
              );
            }
            return (
              <article key={no} className="player" style={{ left, width }}>
                <div className="qr"><QRCodeSVG value={`${ORIGIN}gestione/casino?seat=${seat?.code ?? ''}`} size={74} /></div>
                <div className="name" style={{ top: 92 }}>Posto {no}</div>
                <div className="lbl" style={{ top: 118 }}>SCANSIONA</div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}


// ── Controller sedia (telefono): punta dal tuo saldo sul tappeto ────────────────
function SeatController({ seatCode }: { seatCode: string }) {
  const [st, setSt] = useState<GameTableState | null>(null);
  const [me, setMe] = useState<{ seatNo: string; nickname: string; fishBalance: number } | null>(null);
  const [err, setErr] = useState('');
  const [chip, setChip] = useState(25);
  const [msg, setMsg] = useState('');
  const playerCode = useMemo(() => { try { return localStorage.getItem('casino_player') ?? ''; } catch { return ''; } }, []);

  const claim = useCallback(async () => {
    if (!playerCode) { setErr('no-player'); return; }
    const r = await api(`/gestione/casino/table/seat`, { seatCode, playerCode });
    if (r.ok) setMe({ seatNo: r.seatNo, nickname: r.player.nickname, fishBalance: r.player.fishBalance });
    else setErr(r.error || 'Errore');
  }, [seatCode, playerCode]);
  useEffect(() => { claim(); }, [claim]);

  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/table/${seatCode}`).then(r => r.ok ? r.json() : null).then(d => { if (alive && d) setSt(d); }).catch(() => {});
    pull(); const t = setInterval(pull, 900); return () => { alive = false; clearInterval(t); };
  }, [seatCode]);

  const myBalance = useMemo(() => {
    if (!st || !me) return me?.fishBalance ?? 0;
    const s = st.table.seats[me.seatNo];
    return s?.balance ?? me.fishBalance;
  }, [st, me]);
  const myBets = useMemo(() => st && me ? st.table.bets.filter(b => String(b.seatNo) === me.seatNo) : [], [st, me]);
  const myTotal = myBets.reduce((a, b) => a + b.amount, 0);

  const place = async (kind: string, numbers: number[]) => {
    if (!me) return;
    if (chip > myBalance) { setMsg('Fiche insufficienti'); return; }
    const r = await api(`/gestione/casino/table/bet`, { seatCode, kind, numbers, amount: chip });
    if (!r.ok) setMsg(r.error || 'Errore'); else setMsg('');
  };
  const undo = async () => { await api(`/gestione/casino/table/undo`, { seatCode }); };

  if (err === 'no-player') return (
    <Center><div style={{ maxWidth: 340 }}>
      <div style={{ fontSize: 40 }}>🪑</div>
      <div style={{ fontSize: 20, fontWeight: 900, margin: '10px 0' }}>Prima accedi come giocatore</div>
      <div style={{ opacity: 0.6, fontSize: 14 }}>Inquadra il QR “Entra &amp; gioca” sulla TV per ricevere le fiche, poi riscansiona il QR di questa postazione.</div>
    </div></Center>
  );
  if (err) return <Center>{err}</Center>;
  if (!st || !me) return <Center>Mi siedo al tavolo…</Center>;
  const t = st.table;
  const feltS = Math.max(22, Math.min(30, (typeof window !== 'undefined' ? window.innerWidth : 360) / 14));

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: seatColor(Number(me.seatNo)), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>{me.seatNo}</span>
          <div><div style={{ fontWeight: 900 }}>{me.nickname}</div><div style={{ opacity: 0.5, fontSize: 12 }}>{t.name} · Giro #{t.round}</div></div>
        </div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, opacity: 0.5 }}>fiche</div><div style={{ fontSize: 22, fontWeight: 900, color: GOLD }}><AnimatedNumber value={myBalance} /></div></div>
      </div>

      {t.phase === 'betting' ? (
        <>
          <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>Scegli la fiche, poi tocca il tappeto per piazzarla</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[5, 25, 100, 500].map(c => (
              <motion.button whileTap={{ scale: 0.9 }} key={c} onClick={() => setChip(c)} disabled={c > myBalance}
                style={{ width: 54, height: 54, borderRadius: '50%', border: chip === c ? '3px solid #fff' : '2px solid #ffffff33', background: seatColor(Number(me.seatNo)), color: '#fff', fontWeight: 900, fontSize: 14, cursor: 'pointer', opacity: c > myBalance ? 0.3 : 1, boxShadow: chip === c ? `0 0 14px ${GOLD}` : 'none' }}>{c}</motion.button>
            ))}
          </div>
          {msg && <div style={{ color: '#f87171', textAlign: 'center', fontWeight: 700 }}>{msg}</div>}
          <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
            <RouletteFelt betsBySpot={Object.fromEntries(Object.entries(groupBets(t.bets)).map(([k, v]) => [k, v]))} onPlace={place} s={feltS} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff0a', borderRadius: 12, padding: '10px 14px' }}>
            <div>Sul tappeto: <b style={{ color: GOLD }}>{myTotal}</b> fiche <span style={{ opacity: 0.5 }}>({myBets.length})</span></div>
            <button onClick={undo} disabled={myBets.length === 0} style={{ ...btn('#ffffff22'), opacity: myBets.length === 0 ? 0.4 : 1 }}>↶ Annulla</button>
          </div>
        </>
      ) : (
        <ResultPanel t={t} myBets={myBets} myBalance={myBalance} />
      )}
    </div>
  );
}
function groupBets(bets: GameTableState['table']['bets']): Record<string, { seatNo: number; amount: number }[]> {
  const m: Record<string, { seatNo: number; amount: number }[]> = {};
  for (const b of bets) { const k = spotOf(b.kind, b.numbers); (m[k] ??= []).push({ seatNo: b.seatNo, amount: b.amount }); }
  return m;
}
function ResultPanel({ t, myBets, myBalance }: { t: GameTableState['table']; myBets: GameTableState['table']['bets']; myBalance: number }) {
  const r = t.result?.number ?? null;
  const won = r == null ? 0 : myBets.reduce((a, b) => a + (spotWinsOutside(b.kind, r) || b.numbers.includes(r) ? b.amount * ((({ straight: 35, split: 17, red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1, dozen1: 2, dozen2: 2, dozen3: 2, col1: 2, col2: 2, col3: 2 } as Record<string, number>)[b.kind] ?? 0) + 1) : 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 20 }}>
      <div style={{ opacity: 0.6 }}>È uscito</div>
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 15 }}
        style={{ width: 120, height: 120, borderRadius: '50%', background: r != null ? numColor(r) : '#333', border: `4px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 900, boxShadow: `0 0 30px ${GOLD}66` }}>{r}</motion.div>
      {myBets.length > 0 && (
        won > 0
          ? <div style={{ color: '#4ade80', fontWeight: 900, fontSize: 24, textAlign: 'center' }}>🎉 Hai vinto {won} fiche!</div>
          : <div style={{ color: '#f87171', fontWeight: 900, fontSize: 20, textAlign: 'center' }}>Niente stavolta</div>
      )}
      <div style={{ opacity: 0.5 }}>fiche ora: <b style={{ color: GOLD }}>{myBalance}</b></div>
      <div style={{ opacity: 0.45, fontSize: 13, textAlign: 'center', marginTop: 10 }}>Aspetta il <b>nuovo giro</b> dal tavolo per puntare di nuovo</div>
    </div>
  );
}

// ── Scanner QR (BarcodeDetector nativo, fallback: codice manuale) ───────────────
function QrScanner({ onResult, onClose }: { onResult: (v: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    if (!BD) { setErr('Scanner non supportato — usa il codice'); return; }
    const detector = new BD({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try { const codes = await detector.detect(videoRef.current); if (codes[0]?.rawValue) { onResult(codes[0].rawValue); return; } } catch { /**/ }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch { setErr('Camera non accessibile — usa il codice'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onResult]);
  return (
    <div style={{ width: '100%' }}>
      {err ? <div style={{ color: '#f87171', textAlign: 'center', padding: 12 }}>{err}</div>
        : <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 16, border: `3px solid ${GOLD}`, aspectRatio: '1', objectFit: 'cover' }} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={manual} onChange={e => setManual(e.target.value)} placeholder="codice giocatore" style={{ ...inp, textTransform: 'uppercase', letterSpacing: '0.1em' }} onKeyDown={e => e.key === 'Enter' && onResult(manual)} />
        <button onClick={() => onResult(manual)} style={btn(GOLD)}>OK</button>
        <button onClick={onClose} style={btn('#ffffff22')}>✕</button>
      </div>
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #ffffff26', background: '#ffffff11', color: '#fff', fontSize: 16, minWidth: 0 };
const btn = (c: string): React.CSSProperties => ({ padding: '12px 16px', borderRadius: 10, border: 'none', background: c, color: c.startsWith('#ff') || c === GOLD || c === '#4ade80' ? '#150c02' : '#fff', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 });

function PlayersList({ players }: { players: Player[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
      {players.map((p, i) => (
        <motion.div key={p.id} layout transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: i < 3 ? `${GOLD}14` : '#ffffff08', boxShadow: i === 0 ? `0 0 18px ${GOLD}33` : 'none' }}>
          <span style={{ width: 22, fontWeight: 900, color: i === 0 ? '#FCD34D' : '#ffffff66' }}>{i + 1}</span>
          <PlayerAvatar nickname={p.nickname} avatarUrl={p.avatarUrl} size={34} ring={i < 3 ? ['#FCD34D', '#CBD5E1', '#D97706'][i] : undefined} />
          <span style={{ flex: 1, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname}</span>
          <span style={{ fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={p.fishBalance} /></span>
        </motion.div>
      ))}
      {players.length === 0 && <div style={{ opacity: 0.4 }}>Nessun giocatore</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: '#ffffff08', border: '1px solid #ffffff14', borderRadius: 18, padding: 18 }}>
    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 15, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>{children}</div>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: BG, color: '#fff', padding: 'clamp(14px,2.5vw,28px)', fontFamily: "'Outfit',system-ui,sans-serif" }}>{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 20, padding: 20, textAlign: 'center' }}>{children}</div>;
}

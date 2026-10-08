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

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
const numColor = (n: number) => n === 0 ? '#1f8a4c' : RED_NUMS.has(n) ? '#c0392b' : '#1a1a1a';
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
function MasterView({ sessionId }: { sessionId: string }) {
  const state = useCasinoState(sessionId);
  const [busy, setBusy] = useState(false);
  const [showDealerQr, setShowDealerQr] = useState(false);
  const addTable = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/tables`, {}); } finally { setBusy(false); } };
  if (!state) return <Center>Carico…</Center>;

  // Primo ingresso: nessun tavolo ⇒ wizard "quanti dealer + fiche iniziali".
  if (state.tables.length === 0) return <SetupWizard sessionId={sessionId} />;

  const tvUrl = state.tvCode ? `${ORIGIN}gestione/casino?code=${state.tvCode}` : '';
  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div><CasinoWordmark size={34} /><div style={{ opacity: 0.55, fontSize: 14, marginTop: 4 }}>{state.session.name} · Regia Master</div></div>
        <BrandBar h={24} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 20 }}>
        <Card title="Cassa & accessi">
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 'clamp(40px,6vw,72px)', fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={state.cassaTotale} /></div>
            <div style={{ opacity: 0.5 }}>fiche in gioco · {state.players.length} giocatori · start {state.startFish}</div>
          </div>
          {tvUrl && (
            <a href={tvUrl} target="_blank" rel="noreferrer" style={{ ...btn(GOLD), display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>📺 Apri la TV (QR + classifica) ↗</a>
          )}
          <div style={{ marginTop: 10, textAlign: 'center', background: '#ffffff0a', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.5 }}>QR iscrizione giocatori</div>
            <div style={{ background: '#fff', display: 'inline-block', padding: 8, borderRadius: 10, margin: '8px 0' }}>
              <QRCodeSVG value={`${ORIGIN}gestione/casino?code=${state.session.joinCode}`} size={120} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '0.2em', color: GOLD }}>{state.session.joinCode}</div>
          </div>
          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, opacity: 0.6 }}>
            🔑 Codice regia (per rientrare): <b style={{ color: GOLD, letterSpacing: '0.15em' }}>{state.session.masterCode}</b>
          </div>
        </Card>

        <Card title={`Tavoli & dealer (${state.tables.length})`}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={addTable} disabled={busy} style={{ ...btn(GOLD), flex: 1 }}>+ Aggiungi tavolo</button>
            <button onClick={() => setShowDealerQr(s => !s)} style={{ ...btn('#ffffff22') }}>{showDealerQr ? 'Nascondi QR' : '📷 Mostra QR dealer'}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.tables.map(t => {
              const pt = state.perTable.find(x => x.tableId === t.id);
              return (
                <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#ffffff0a', borderRadius: 12, padding: 10 }}>
                  {showDealerQr && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 2 }}>QR DEALER</div>
                      <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}>
                        <QRCodeSVG value={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} size={56} />
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{t.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>codice {t.dealerCode} · {pt?.players ?? 0} giocatori</div>
                    <a href={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 4, color: GOLD, fontSize: 13, fontWeight: 800 }}>🎰 Apri banco dealer ↗</a>
                  </div>
                  <div style={{ fontWeight: 900, color: GOLD }}>{pt?.total ?? 0}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <GameTablesCard sessionId={sessionId} />

        <Card title="Classifica serata">
          <PlayersList players={state.standings} />
        </Card>
      </div>
    </Shell>
  );
}

// Banco "Tavoli": crea tavoli da gioco interattivi (roulette) per l'80".
function GameTablesCard({ sessionId }: { sessionId: string }) {
  const [tables, setTables] = useState<GameTableState['table'][]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`${API}/gestione/casino/sessions/${sessionId}/game-tables`).then(r => r.ok ? r.json() : null).then(d => { if (d) setTables(d.tables); }).catch(() => {}), [sessionId]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  const create = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/game-tables`, { type: 'roulette', seats: 8 }); await load(); } finally { setBusy(false); } };
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

function SetupWizard({ sessionId }: { sessionId: string }) {
  const [dealers, setDealers] = useState(3);
  const [startFish, setStartFish] = useState(500);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/setup`, { dealers, startFish }); } finally { setBusy(false); } };
  return (
    <Center>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <CasinoWordmark size={38} />
        <div style={{ opacity: 0.6, margin: '8px 0 26px', fontSize: 15 }}>Prepariamo la serata</div>

        <div style={{ background: '#ffffff08', border: '1px solid #ffffff14', borderRadius: 20, padding: 22, textAlign: 'left' }}>
          <label style={{ fontWeight: 800, fontSize: 14, opacity: 0.85 }}>Quanti dealer (tavoli)?</label>
          <div style={{ display: 'flex', gap: 8, margin: '10px 0 6px' }}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <motion.button whileTap={{ scale: 0.92 }} key={n} onClick={() => setDealers(n)}
                style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: `2px solid ${dealers === n ? GOLD : '#ffffff22'}`, background: dealers === n ? `${GOLD}22` : 'transparent', color: dealers === n ? GOLD : '#fff', fontWeight: 900, fontSize: 20, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</motion.button>
            ))}
          </div>
          <div style={{ fontSize: 12, opacity: 0.45, marginBottom: 20 }}>Ognuno riceve un QR dealer per aprire il proprio banco.</div>

          <label style={{ fontWeight: 800, fontSize: 14, opacity: 0.85 }}>Fiche iniziali per giocatore</label>
          <div style={{ display: 'flex', gap: 8, margin: '10px 0 6px' }}>
            {[300, 500, 1000, 2000].map(n => (
              <motion.button whileTap={{ scale: 0.92 }} key={n} onClick={() => setStartFish(n)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `2px solid ${startFish === n ? GOLD : '#ffffff22'}`, background: startFish === n ? `${GOLD}22` : 'transparent', color: startFish === n ? GOLD : '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</motion.button>
            ))}
          </div>
          <div style={{ fontSize: 12, opacity: 0.45 }}>Ogni ospite parte con queste fiche appena fa il login.</div>
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={go} disabled={busy} style={{ ...btn(GOLD), width: '100%', padding: 18, fontSize: 18, marginTop: 20 }}>{busy ? '…' : `Apri ${dealers} ${dealers === 1 ? 'tavolo' : 'tavoli'} 🎰`}</motion.button>
      </div>
    </Center>
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
        style={{ position: 'relative', border: '1px solid #ffffff2e', color: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: onPlace ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: hit ? `3px solid ${GOLD}` : 'none', outlineOffset: -2, boxShadow: hit ? `0 0 ${s * 0.4}px ${GOLD}` : 'none', ...style }}>
        {label}
        <ChipStack bets={betsBySpot[spot] ?? []} s={s} />
      </button>
    );
  };
  const outside: React.CSSProperties = { background: '#0a2a1e', fontSize: s * 0.3 };
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `${s * 1.05}px repeat(12, ${s}px) ${s * 1.25}px`, gridAutoRows: 'min-content', background: '#07372a', padding: s * 0.18, borderRadius: s * 0.3, border: `${Math.max(2, s * 0.08)}px solid ${GOLD}`, boxShadow: '0 20px 60px #000a' }}>
      {/* 0 */}
      {cell('straight', [0], <span style={{ fontSize: s * 0.42 }}>0</span>, { gridColumn: '1', gridRow: '1 / span 3', background: numColor(0), fontSize: s * 0.42 }, 'z0')}
      {/* numeri */}
      {FELT_ROWS.map((rowArr, r) => rowArr.map((n, c) => cell('straight', [n], <span style={{ fontSize: s * 0.4 }}>{n}</span>, { gridColumn: String(c + 2), gridRow: String(r + 1), background: numColor(n), height: s }, `n${n}`)))}
      {/* colonne 2:1 */}
      {['col3', 'col2', 'col1'].map((k, r) => cell(k, [], <span style={{ fontSize: s * 0.26 }}>2:1</span>, { gridColumn: '14', gridRow: String(r + 1), ...outside }, k))}
      {/* dozzine */}
      {cell('dozen1', [], '1ª 12', { gridColumn: '2 / span 4', gridRow: '4', height: s * 0.8, ...outside }, 'd1')}
      {cell('dozen2', [], '2ª 12', { gridColumn: '6 / span 4', gridRow: '4', height: s * 0.8, ...outside }, 'd2')}
      {cell('dozen3', [], '3ª 12', { gridColumn: '10 / span 4', gridRow: '4', height: s * 0.8, ...outside }, 'd3')}
      {/* esterne basse */}
      {cell('low', [], '1-18', { gridColumn: '2 / span 2', gridRow: '5', height: s * 0.9, ...outside }, 'low')}
      {cell('even', [], 'PARI', { gridColumn: '4 / span 2', gridRow: '5', height: s * 0.9, ...outside }, 'even')}
      {cell('red', [], '◆', { gridColumn: '6 / span 2', gridRow: '5', height: s * 0.9, ...outside, background: '#c0392b', fontSize: s * 0.42 }, 'red')}
      {cell('black', [], '◆', { gridColumn: '8 / span 2', gridRow: '5', height: s * 0.9, ...outside, background: '#1a1a1a', fontSize: s * 0.42 }, 'black')}
      {cell('odd', [], 'DISPARI', { gridColumn: '10 / span 2', gridRow: '5', height: s * 0.9, ...outside, fontSize: s * 0.24 }, 'odd')}
      {cell('high', [], '19-36', { gridColumn: '12 / span 2', gridRow: '5', height: s * 0.9, ...outside }, 'high')}
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

// Ruota dall'alto: gira a ogni nuovo risultato, poi rivela il numero al centro.
function RouletteWheel({ result, size = 300 }: { result: number | null; size?: number }) {
  const [angle, setAngle] = useState(0);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (result != null && result !== prev.current) {
      prev.current = result;
      setAngle(a => a + 360 * 5 + Math.floor(Math.random() * 360));
    }
  }, [result]);
  const ring = `conic-gradient(${Array.from({ length: 37 }, (_, i) => {
    const col = i === 0 ? '#1f8a4c' : i % 2 ? '#c0392b' : '#1a1a1a';
    const a0 = (i * 360 / 37).toFixed(2), a1 = ((i + 1) * 360 / 37).toFixed(2);
    return `${col} ${a0}deg ${a1}deg`;
  }).join(',')})`;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <motion.div animate={{ rotate: angle }} transition={{ duration: 3.2, ease: [0.17, 0.67, 0.2, 1] }}
        style={{ width: '100%', height: '100%', borderRadius: '50%', background: ring, border: `${size * 0.03}px solid ${GOLD}`, boxShadow: `0 0 ${size * 0.12}px ${GOLD}55, inset 0 0 ${size * 0.1}px #000` }} />
      <div style={{ position: 'absolute', top: -size * 0.02, left: '50%', transform: 'translateX(-50%)', color: GOLD, fontSize: size * 0.12, lineHeight: 1 }}>▼</div>
      <div style={{ position: 'absolute', inset: '26%', borderRadius: '50%', background: 'radial-gradient(circle,#2a1c06,#0a0602)', border: `${size * 0.012}px solid ${GOLD}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {result != null ? (
          <motion.div key={result} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 2.9, type: 'spring', stiffness: 260, damping: 16 }}
            style={{ width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: numColor(result), display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff', boxShadow: `0 0 ${size * 0.08}px ${GOLD}` }}>
            <span style={{ fontSize: size * 0.16, fontWeight: 900, color: '#fff' }}>{result}</span>
          </motion.div>
        ) : <span style={{ fontSize: size * 0.09, fontWeight: 900, color: GOLD, opacity: 0.8 }}>🎡</span>}
      </div>
    </div>
  );
}

function SeatBadge({ no, seat, bet, vw }: { no: number; seat: SeatInfo; bet: number; vw: number }) {
  const sz = Math.min(100, Math.max(60, vw / 16));
  if (seat.playerId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: sz + 20 }}>
        <div style={{ position: 'relative' }}>
          <PlayerAvatar nickname={seat.nickname ?? '?'} avatarUrl={seat.avatarUrl} size={sz} ring={seatColor(no)} />
          <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', background: seatColor(no), color: '#fff', fontWeight: 900, fontSize: sz * 0.2, padding: '1px 8px', borderRadius: 10, border: '2px solid #0a0602' }}>{no}</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: sz * 0.2, maxWidth: sz + 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seat.nickname}</div>
        <div style={{ fontSize: sz * 0.18, opacity: 0.6 }}>💰 {seat.balance ?? 0}</div>
        {bet > 0 && <div style={{ fontWeight: 900, color: GOLD, fontSize: sz * 0.22 }}>punta {bet}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: sz + 20, opacity: 0.9 }}>
      <div style={{ background: '#fff', padding: 5, borderRadius: 10, border: `2px solid ${seatColor(no)}` }}>
        <QRCodeSVG value={`${ORIGIN}gestione/casino?seat=${seat.code}`} size={sz} />
      </div>
      <div style={{ fontSize: sz * 0.2, fontWeight: 800, opacity: 0.7 }}>Posto {no}</div>
      <div style={{ fontSize: sz * 0.16, opacity: 0.45 }}>scansiona per sederti</div>
    </div>
  );
}

// ── Display 80": la roulette vista dall'alto, girabile ──────────────────────────
function RouletteTableView({ displayCode }: { displayCode: string }) {
  const [st, setSt] = useState<GameTableState | null>(null);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/table/${displayCode}`).then(r => r.ok ? r.json() : null).then(d => { if (alive && d) setSt(d); }).catch(() => {});
    pull(); const t = setInterval(pull, 900); return () => { alive = false; clearInterval(t); };
  }, [displayCode]);
  if (!st) return <Center>Carico il tavolo…</Center>;
  const t = st.table;
  const betsBySpot: Record<string, { seatNo: number; amount: number }[]> = {};
  for (const b of t.bets) { const k = spotOf(b.kind, b.numbers); (betsBySpot[k] ??= []).push({ seatNo: b.seatNo, amount: b.amount }); }
  const seatNos = Object.keys(t.seats).map(Number).sort((a, b) => a - b);
  // Il tappeto occupa ~14.3 celle in larghezza: lo dimensiono sulla colonna
  // disponibile (schermo − colonna ruota − margini) così non viene mai tagliato.
  const feltS = Math.min(90, Math.max(26, Math.floor((vw - 540) / 15)));
  const spin = async () => { setBusy(true); try { await api(`/gestione/casino/table/spin`, { displayCode }); } finally { setBusy(false); } };
  const next = async () => { setBusy(true); try { await api(`/gestione/casino/table/next`, { displayCode }); } finally { setBusy(false); } };
  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", padding: 'clamp(14px,1.6vw,28px)', display: 'flex', flexDirection: 'column', gap: 'clamp(10px,1.4vw,22px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div><CasinoWordmark size={Math.min(52, Math.max(28, vw / 26))} /><div style={{ opacity: 0.6, marginTop: 4, fontWeight: 700, fontSize: 'clamp(13px,1.3vw,20px)' }}>🎡 {t.name} · Giro #{t.round}</div></div>
        <BrandBar h={Math.min(28, Math.max(18, vw / 60))} presented />
      </div>

      {/* Sedie */}
      <div style={{ display: 'flex', gap: 'clamp(8px,1vw,18px)', justifyContent: 'center', flexWrap: 'wrap' }}>
        {seatNos.map(no => <SeatBadge key={no} no={no} seat={t.seats[String(no)]!} bet={st.betsBySeat[String(no)] ?? 0} vw={vw} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px,460px) 1fr', gap: 'clamp(14px,2vw,32px)', alignItems: 'center', flex: 1, minHeight: 0 }}>
        {/* Ruota + controlli */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <RouletteWheel result={t.phase !== 'betting' ? t.result?.number ?? null : null} size={Math.min(420, Math.max(220, vw / 3.4))} />
          {t.phase === 'betting'
            ? <motion.button whileTap={{ scale: 0.96 }} onClick={spin} disabled={busy || t.bets.length === 0} style={{ ...btn(GOLD), padding: '18px 40px', fontSize: 24, opacity: t.bets.length === 0 ? 0.5 : 1 }}>🎲 GIRA</motion.button>
            : <motion.button whileTap={{ scale: 0.96 }} onClick={next} disabled={busy} style={{ ...btn(GOLD), padding: '18px 40px', fontSize: 24 }}>↻ NUOVO GIRO</motion.button>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 360 }}>
            {t.history.slice(0, 12).map((h, i) => (
              <span key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: numColor(h), border: `2px solid ${i === 0 ? GOLD : '#ffffff22'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>{h}</span>
            ))}
          </div>
          <div style={{ opacity: 0.55, fontSize: 13, fontWeight: 700 }}>{t.phase === 'betting' ? `Puntate aperte · ${t.bets.length} sul tappeto` : 'È uscito il numero — nuovo giro per ripartire'}</div>
        </div>
        {/* Tappeto */}
        <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
          <RouletteFelt betsBySpot={betsBySpot} s={feltS} result={t.phase !== 'betting' ? t.result?.number ?? null : null} />
        </div>
      </div>
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

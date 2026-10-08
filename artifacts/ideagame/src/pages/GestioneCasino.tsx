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
  const code = (params.get('code') ?? '').toUpperCase();
  if (playerCode) return <PlayerView code={playerCode.toUpperCase()} />;
  return <CasinoResolver code={code} />;
}

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
function EventiMark({ h = 26, framed = false }: { h?: number; framed?: boolean }) {
  const [ok, setOk] = useState(true);
  if (ok) return <img src={`${import.meta.env.BASE_URL || '/'}ideaeventi-logo.png`} alt="IDEAeventi" onError={() => setOk(false)} style={{ height: h, objectFit: 'contain', display: 'block' }} />;
  // Fallback tipografico finché l'utente non carica /ideaeventi-logo.png.
  return (
    <span style={{ fontWeight: 900, fontSize: h * 0.62, letterSpacing: '0.02em', lineHeight: 1 }}>
      <span style={{ color: framed ? '#150c02' : '#fff' }}>IDEA</span><span style={{ color: framed ? '#C98A10' : GOLD }}>eventi</span>
    </span>
  );
}
function BrandBar({ h = 26, dim = 1, framed = false }: { h?: number; dim?: number; framed?: boolean }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: h * 0.6, opacity: dim }}>
      <img src={`${import.meta.env.BASE_URL || '/'}logo.png`} alt="IDEAgame" style={{ height: h, objectFit: 'contain', display: 'block' }} />
      <span style={{ color: framed ? '#00000033' : '#ffffff33', fontWeight: 300, fontSize: h * 0.9 }}>×</span>
      <EventiMark h={h} framed={framed} />
    </div>
  );
  if (!framed) return inner;
  // Su maxi-schermo: "presented by" su pill chiara, così i loghi staccano sul fondo scuro.
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: h * 0.42, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.4, marginBottom: h * 0.18 }}>presented by</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: h * 0.6, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: `${h * 0.32}px ${h * 0.7}px` }}>
        <img src={`${import.meta.env.BASE_URL || '/'}logo.png`} alt="IDEAgame" style={{ height: h, objectFit: 'contain', display: 'block' }} />
        <span style={{ color: '#00000026', fontWeight: 300, fontSize: h * 0.9 }}>×</span>
        <EventiMark h={h} framed />
      </div>
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
        <BrandBar h={Math.min(34, Math.max(20, vw / 50))} framed />
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

        <Card title="Classifica serata">
          <PlayersList players={state.standings} />
        </Card>
      </div>
    </Shell>
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

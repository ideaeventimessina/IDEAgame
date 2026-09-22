/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — BURRACO (frontend) ──────────────────────────────────
   Un'unica pagina che serve i tre ruoli in base ai parametri URL:
   ?table=CODICE  → schermo del TAVOLO (telefono): inserisce il punteggio manche.
   ?code=CODICE   → risolto come MASTER (regia) o TV/classifica pubblica.
   Sync via polling 2s (robusto). QR generati con qrcode.react. ─────────────── */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

// Numero che "sale" con un tween quando cambia (punteggi, totali). Niente dipendenze.
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
const GREEN = '#34D399';

type Pair = { id: string; name: string; player1: string; player2: string; totalScore: number };
type Assignment = { id: string; roundNumber: number; tableNumber: number; tableCode: string; pairAId: string | null; pairBId: string | null; scoreA: number | null; scoreB: number | null; submitted: boolean };
type State = { session: { id: string; name: string; status: string; currentRound: number; joinCode: string; masterCode: string }; pairs: Pair[]; assignments: Assignment[]; standings: Pair[] };

const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

export default function GestioneBurraco() {
  const params = new URLSearchParams(window.location.search);
  const tableCode = params.get('table');
  const code = params.get('code') ?? '';

  if (tableCode) return <BurracoTable code={tableCode.toUpperCase()} />;
  return <BurracoResolver code={code.toUpperCase()} />;
}

// ── Risolve il codice → Master o TV ────────────────────────────────────────────
function BurracoResolver({ code }: { code: string }) {
  const [res, setRes] = useState<{ sessionId: string; isMaster: boolean } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!code) { setErr('Nessun codice'); return; }
    fetch(`${API}/gestione/burraco/resolve/${code}`).then(r => r.ok ? r.json() : Promise.reject()).then(setRes).catch(() => setErr('Serata non trovata'));
  }, [code]);
  if (err) return <Center>{err}</Center>;
  if (!res) return <Center>Carico…</Center>;
  return res.isMaster ? <BurracoMaster sessionId={res.sessionId} /> : <BurracoTV sessionId={res.sessionId} />;
}

function useBurracoState(sessionId: string, ms = 2000) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/burraco/sessions/${sessionId}`).then(r => r.ok ? r.json() : null).then(s => { if (alive && s) setState(s); }).catch(() => {});
    pull(); const t = setInterval(pull, ms);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, ms]);
  return [state, setState] as const;
}

const pairLabel = (p: Pair | undefined) => p ? (p.name || `${p.player1} & ${p.player2}` || 'Coppia') : '—';

// ══════════════════ MASTER (regia) ══════════════════
function BurracoMaster({ sessionId }: { sessionId: string }) {
  const [state] = useBurracoState(sessionId);
  const [p1, setP1] = useState(''); const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const pairs = state?.pairs ?? [];
  const round = state?.session.currentRound ?? 0;
  const pairById = useMemo(() => Object.fromEntries(pairs.map(p => [p.id, p])), [pairs]);

  const addPair = async () => {
    if (!p1.trim() && !p2.trim()) return;
    setBusy(true);
    try { await api(`/gestione/burraco/sessions/${sessionId}/pairs`, { player1: p1, player2: p2 }); setP1(''); setP2(''); }
    finally { setBusy(false); }
  };
  const genRound = async () => { setBusy(true); try { await api(`/gestione/burraco/sessions/${sessionId}/generate-round`); } finally { setBusy(false); } };
  const delPair = async (id: string) => { await api(`/gestione/burraco/sessions/${sessionId}/pairs/${id}`, {}, 'DELETE'); };

  if (!state) return <Center>Carico…</Center>;
  const allSubmitted = state.assignments.length > 0 && state.assignments.every(a => a.submitted || a.pairBId === null);

  return (
    <Shell title={`🃏 ${state.session.name} — Regia`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 20 }}>
        {/* Coppie */}
        <Card title={`Coppie iscritte (${pairs.length})`}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={p1} onChange={e => setP1(e.target.value)} placeholder="Giocatore 1" style={{ ...inp, flex: '1 1 120px' }} />
            <input value={p2} onChange={e => setP2(e.target.value)} placeholder="Giocatore 2" style={{ ...inp, flex: '1 1 120px' }} onKeyDown={e => e.key === 'Enter' && addPair()} />
            <button onClick={addPair} disabled={busy} style={{ ...btn(GREEN), flex: '0 0 auto' }}>+</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {pairs.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff0a', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ opacity: 0.4, width: 22 }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 700 }}>{pairLabel(p)}</span>
                <button onClick={() => delPair(p.id)} style={{ ...btn('#f8717133'), color: '#f87171', padding: '4px 8px' }}>✕</button>
              </div>
            ))}
            {pairs.length === 0 && <div style={{ opacity: 0.4 }}>Aggiungi almeno 2 coppie</div>}
          </div>
          <button onClick={genRound} disabled={busy || pairs.length < 2}
            style={{ ...btn(GREEN), width: '100%', marginTop: 14, padding: '14px', fontSize: 17, opacity: (!allSubmitted && round > 0) ? 0.55 : 1 }}>
            {round === 0 ? '▶ Genera Manche 1' : allSubmitted ? `▶ Genera Manche ${round + 1}` : `Manche ${round} in corso…`}
          </button>
        </Card>

        {/* Tavoli manche corrente */}
        <Card title={round > 0 ? `Manche ${round} — tavoli` : 'Tavoli'}>
          {round === 0 && <div style={{ opacity: 0.5 }}>Genera la prima manche per creare i tavoli e i QR.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.assignments.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: a.submitted ? '#34d39914' : '#ffffff0a', border: `1px solid ${a.submitted ? GREEN + '55' : '#ffffff1a'}`, borderRadius: 12, padding: 10 }}>
                <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}>
                  <QRCodeSVG value={`${ORIGIN}gestione/burraco?table=${a.tableCode}`} size={64} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>Tavolo {a.tableNumber} · {a.tableCode} · <a href={`${ORIGIN}gestione/burraco?table=${a.tableCode}`} target="_blank" rel="noreferrer" style={{ color: GREEN }}>apri ↗</a></div>
                  <div style={{ fontWeight: 800 }}>{pairLabel(pairById[a.pairAId ?? ''])}</div>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>vs</div>
                  <div style={{ fontWeight: 800 }}>{a.pairBId ? pairLabel(pairById[a.pairBId]) : '⏸ Riposo (bye)'}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 60 }}>
                  {a.submitted ? <span style={{ color: GREEN, fontWeight: 900 }}>{a.scoreA} · {a.scoreB}</span> : <span style={{ opacity: 0.4 }}>in attesa</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Classifica */}
        <Card title="Classifica live">
          <Standings standings={state.standings} />
          <div style={{ marginTop: 14, textAlign: 'center', background: '#ffffff0a', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.5 }}>Schermo TV / classifica pubblica — codice</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.2em', color: GREEN }}>{state.session.joinCode}</div>
            <a href={`${ORIGIN}gestione/burraco?code=${state.session.joinCode}`} target="_blank" rel="noreferrer" style={{ color: '#9CA3AF', fontSize: 13 }}>apri schermo TV ↗</a>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>🔑 Codice regia (per rientrare): <b style={{ color: GREEN, letterSpacing: '0.15em' }}>{state.session.masterCode}</b></div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ══════════════════ TV / classifica pubblica ══════════════════
function BurracoTV({ sessionId }: { sessionId: string }) {
  const [state] = useBurracoState(sessionId);
  if (!state) return <Center>Carico…</Center>;
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#0f3d2e,#050d0a 65%)', color: '#fff', padding: 'clamp(16px,3vw,40px)', fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 'clamp(24px,4vw,44px)', fontWeight: 900 }}>🃏 {state.session.name}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ opacity: 0.6, fontSize: 14 }}>Manche {state.session.currentRound}</div>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {state.standings.map((p, i) => (
          <motion.div key={p.id} layout
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ layout: { type: 'spring', stiffness: 380, damping: 34 }, delay: Math.min(i * 0.05, 0.5), duration: 0.4 }}
            style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 'clamp(10px,1.6vw,20px) 24px', marginBottom: 10, borderRadius: 16, background: i < 3 ? `${GREEN}18` : '#ffffff0a', border: `2px solid ${i < 3 ? GREEN + '66' : '#ffffff12'}`, boxShadow: i === 0 ? `0 0 34px ${GREEN}44` : 'none' }}>
            <motion.div
              animate={i === 0 ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={i === 0 ? { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } : { duration: 0.2 }}
              style={{ fontSize: 'clamp(24px,3vw,40px)', fontWeight: 900, width: 60, textAlign: 'center', color: i === 0 ? '#FCD34D' : i === 1 ? '#CBD5E1' : i === 2 ? '#D97706' : '#ffffff55' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</motion.div>
            <div style={{ flex: 1, fontSize: 'clamp(20px,2.6vw,34px)', fontWeight: 800 }}>{pairLabel(p)}</div>
            <div style={{ fontSize: 'clamp(26px,3.4vw,46px)', fontWeight: 900, color: GREEN, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={p.totalScore} /></div>
          </motion.div>
        ))}
        {state.standings.length === 0 && <Center>In attesa delle coppie…</Center>}
      </div>
    </div>
  );
}

// ══════════════════ TAVOLO (telefono) ══════════════════
function BurracoTable({ code }: { code: string }) {
  const [data, setData] = useState<{ assignment: Assignment; pairA: Pair | null; pairB: Pair | null; sessionName: string; round: number } | null>(null);
  const [err, setErr] = useState('');
  const [sa, setSa] = useState(''); const [sb, setSb] = useState('');
  const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/gestione/burraco/table/${code}`).then(r => r.ok ? r.json() : Promise.reject(r)).then(d => { setData(d); if (d.assignment.submitted) setDone(true); }).catch(async r => { const e = await r?.json?.().catch(() => ({})); setErr(e?.error || 'Tavolo non trovato'); });
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (sa === '' || sb === '') return;
    setBusy(true);
    try {
      const r = await api(`/gestione/burraco/assignments/${data!.assignment.id}/score`, { scoreA: Number(sa), scoreB: Number(sb) });
      if (r.ok) setDone(true); else setErr(r.error || 'Errore invio');
    } finally { setBusy(false); }
  };

  if (err) return <Center>{err}</Center>;
  if (!data) return <Center>Carico tavolo…</Center>;
  if (done) return <Center><div style={{ textAlign: 'center' }}><div style={{ fontSize: 64 }}>✅</div><div style={{ fontSize: 24, fontWeight: 900, color: GREEN }}>Punteggio inviato!</div><div style={{ opacity: 0.6, marginTop: 8 }}>Guarda la classifica sullo schermo</div></div></Center>;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#0f3d2e,#050d0a 65%)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 20, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ opacity: 0.6 }}>{data.sessionName} · Manche {data.round}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>Punteggio della manche</div>
      <ScoreInput color="#60A5FA" label={pairLabel(data.pairA ?? undefined)} value={sa} onChange={setSa} />
      <div style={{ fontSize: 20, fontWeight: 900, opacity: 0.4 }}>VS</div>
      {data.pairB
        ? <ScoreInput color="#F472B6" label={pairLabel(data.pairB)} value={sb} onChange={setSb} />
        : <div style={{ opacity: 0.5 }}>Coppia in riposo</div>}
      <motion.button whileTap={{ scale: 0.96 }} onClick={submit} disabled={busy || sa === '' || (!!data.pairB && sb === '')} style={{ ...btn(GREEN), width: '100%', maxWidth: 360, padding: 18, fontSize: 20, marginTop: 8 }}>
        {busy ? '…' : 'Invia punteggio'}
      </motion.button>
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #ffffff26', background: '#ffffff11', color: '#fff', fontSize: 15, minWidth: 0 };
const btn = (c: string): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 10, border: 'none', background: c, color: '#04150e', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 });

function ScoreInput({ color, label, value, onChange }: { color: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: 360, background: `${color}18`, border: `2px solid ${color}`, borderRadius: 18, padding: 16, textAlign: 'center' }}>
      <div style={{ fontWeight: 800, marginBottom: 8, color }}>{label}</div>
      <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
        style={{ width: '100%', textAlign: 'center', fontSize: 44, fontWeight: 900, background: 'transparent', border: 'none', color: '#fff', outline: 'none' }} />
    </div>
  );
}
function Standings({ standings }: { standings: Pair[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {standings.map((p, i) => (
        <motion.div key={p.id} layout transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: i < 3 ? `${GREEN}14` : '#ffffff08' }}>
          <span style={{ width: 26, fontWeight: 900, color: i === 0 ? '#FCD34D' : '#ffffff66' }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700 }}>{pairLabel(p)}</span>
          <span style={{ fontWeight: 900, color: GREEN, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={p.totalScore} /></span>
        </motion.div>
      ))}
      {standings.length === 0 && <div style={{ opacity: 0.4 }}>Nessuna coppia</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: '#ffffff08', border: '1px solid #ffffff14', borderRadius: 18, padding: 18 }}>
    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 15, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
    {children}
  </div>;
}
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#0f3d2e,#050d0a 70%)', color: '#fff', padding: 'clamp(14px,2.5vw,28px)', fontFamily: "'Outfit',system-ui,sans-serif" }}>
    <div style={{ fontSize: 'clamp(20px,3vw,32px)', fontWeight: 900, marginBottom: 20 }}>{title}</div>
    {children}
  </div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050d0a', color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 20, padding: 20, textAlign: 'center' }}>{children}</div>;
}

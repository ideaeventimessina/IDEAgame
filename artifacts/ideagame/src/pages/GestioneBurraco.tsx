/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — BURRACO (frontend) ──────────────────────────────────
   Dashboard regia (sidebar + pannelli) fedele al mockup IDEA EVENTI BURRACO.
   Ruoli via URL:
   ?table=CODICE  → schermo del TAVOLO (telefono): inserisce il punteggio manche.
   ?code=CODICE   → MASTER (dashboard) oppure TV/classifica pubblica.
   Sync via polling 2s. ─────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

/* ── Palette (dal mockup) ── */
const GOLD = '#E8B24C';
const GOLD_GRAD = 'linear-gradient(180deg,#F4CE72,#CE9633)';
const GREEN = '#34D399';
const INK = '#07140f';
const PANEL = 'rgba(255,255,255,0.035)';
const BORDER = 'rgba(255,255,255,0.09)';
const MUTED = 'rgba(255,255,255,0.55)';
const APP_BG = 'radial-gradient(ellipse at 60% -10%, #114a35, #08221a 55%, #061812 100%)';

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
const ASSET = (import.meta.env.BASE_URL as string) || '/';

type BConfig = { totalRounds?: number; prizes?: { pos: string; prize: string }[]; roundStartedAt?: string; paused?: boolean; pausedElapsed?: number };
type Pair = { id: string; name: string; player1: string; player2: string; totalScore: number };
type Assignment = { id: string; roundNumber: number; tableNumber: number; tableCode: string; pairAId: string | null; pairBId: string | null; scoreA: number | null; scoreB: number | null; submitted: boolean };
type State = { session: { id: string; name: string; status: string; currentRound: number; joinCode: string; masterCode: string; config?: BConfig }; pairs: Pair[]; assignments: Assignment[]; standings: Pair[] };

const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

export default function GestioneBurraco() {
  const params = new URLSearchParams(window.location.search);
  const tableCode = params.get('table');
  const code = params.get('code') ?? '';
  if (tableCode) return <BurracoTable code={tableCode.toUpperCase()} />;
  return <BurracoResolver code={code.toUpperCase()} />;
}

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
  return state;
}

const pairLabel = (p?: Pair) => p ? (p.name || `${p.player1} & ${p.player2}` || 'Coppia') : '—';

/* ══════════════════ LOGO ══════════════════ */
function BurracoLogo({ h = 96 }: { h?: number }) {
  const [ok, setOk] = useState(true);
  if (ok) return <img src={`${ASSET}ideaeventi-burraco-logo.png`} alt="IDEA EVENTI BURRACO" onError={() => setOk(false)} style={{ width: '100%', maxHeight: h, objectFit: 'contain', display: 'block' }} />;
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontWeight: 900, fontSize: h * 0.2, color: '#fff' }}>IDEA <span style={{ color: GOLD }}>EVENTI</span></div>
      <div style={{ fontWeight: 900, fontSize: h * 0.34, color: GOLD, letterSpacing: '0.06em', textShadow: `0 2px 10px ${GOLD}66` }}>BURRACO</div>
    </div>
  );
}

/* ══════════════════ ICONE (linea, come il mockup) ══════════════════ */
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    home: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M15 20a6 6 0 0 1 6 0" /></>,
    table: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M12 9v9" /></>,
    rounds: <path d="M4 12a8 8 0 1 1 2.3 5.6M4 20v-4h4" />,
    chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    trophy: <><path d="M6 4h12v3a6 6 0 0 1-12 0z" /><path d="M9 14h6M10 18h4M12 14v4" /><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3" /></>,
    gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8S10 3 7.5 4.5 10 8 12 8zM12 8s2-5 4.5-3.5S14 8 12 8z" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    play: <path d="M7 5l12 7-12 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    doc: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4M9 13h6M9 17h6" /></>,
    monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    check: <path d="M20 6L9 17l-5-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
}

/* ══════════════════ MASTER — DASHBOARD ══════════════════ */
type Section = 'panoramica' | 'iscritti' | 'tavoli' | 'turni' | 'punteggi' | 'classifica' | 'premi' | 'impostazioni';
const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'panoramica', label: 'Panoramica', icon: 'home' },
  { id: 'iscritti', label: 'Iscritti e coppie', icon: 'users' },
  { id: 'tavoli', label: 'Tavoli', icon: 'table' },
  { id: 'turni', label: 'Turni', icon: 'rounds' },
  { id: 'punteggi', label: 'Punteggi', icon: 'chart' },
  { id: 'classifica', label: 'Classifica', icon: 'trophy' },
  { id: 'premi', label: 'Quote e premi', icon: 'gift' },
  { id: 'impostazioni', label: 'Impostazioni', icon: 'gear' },
];

function BurracoMaster({ sessionId }: { sessionId: string }) {
  const state = useBurracoState(sessionId);
  const [section, setSection] = useState<Section>('panoramica');
  const [scoreFor, setScoreFor] = useState<Assignment | null>(null);
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < 900 : false);
  useEffect(() => { const r = () => setNarrow(window.innerWidth < 900); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);

  const pairById = useMemo(() => Object.fromEntries((state?.pairs ?? []).map(p => [p.id, p])), [state]);
  if (!state) return <Center>Carico…</Center>;

  const cfg = state.session.config ?? {};
  const round = state.session.currentRound;
  const allSubmitted = state.assignments.length > 0 && state.assignments.every(a => a.submitted || a.pairBId === null);
  const totalRounds = cfg.totalRounds ?? 4;

  const genRound = async () => { await api(`/gestione/burraco/sessions/${sessionId}/generate-round`); };
  const setConfig = async (patch: BConfig) => { await api(`/gestione/burraco/sessions/${sessionId}/config`, patch); };

  return (
    <div style={{ minHeight: '100vh', background: APP_BG, color: '#F3F6F4', fontFamily: "'Outfit',system-ui,sans-serif", display: 'flex', flexDirection: narrow ? 'column' : 'row' }}>
      <style>{`@media (max-width: 1040px){.burraco-grid{grid-template-columns:1fr !important;}}`}</style>
      {/* SIDEBAR */}
      <aside style={{ width: narrow ? '100%' : 248, flexShrink: 0, background: 'rgba(0,0,0,0.3)', borderRight: narrow ? 'none' : `1px solid ${BORDER}`, borderBottom: narrow ? `1px solid ${BORDER}` : 'none', padding: narrow ? '12px 10px' : '20px 14px', display: 'flex', flexDirection: narrow ? 'row' : 'column', alignItems: narrow ? 'center' : 'stretch', gap: narrow ? 8 : 6, position: narrow ? 'sticky' : 'static', top: 0, zIndex: 20, overflowX: narrow ? 'auto' : 'visible' }}>
        {!narrow && <div style={{ padding: '6px 10px 18px' }}><BurracoLogo h={118} /></div>}
        {narrow && <div style={{ width: 54, flexShrink: 0 }}><BurracoLogo h={46} /></div>}
        {NAV.map(n => {
          const active = section === n.id;
          return (
            <button key={n.id} onClick={() => setSection(n.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: narrow ? '8px 12px' : '11px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap',
                background: active ? 'rgba(52,211,153,0.14)' : 'transparent', color: active ? '#fff' : MUTED, boxShadow: active ? `inset 3px 0 0 ${GOLD}` : 'none' }}>
              <span style={{ color: active ? GREEN : 'currentColor', display: 'flex' }}><Icon name={n.icon} size={20} /></span>
              {!narrow && n.label}
            </button>
          );
        })}
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(14px,2vw,28px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Header state={state} onAddPair={() => setSection('iscritti')} section={section} />
        {section === 'panoramica' && <Panoramica state={state} pairById={pairById} round={round} totalRounds={totalRounds} allSubmitted={allSubmitted} cfg={cfg} genRound={genRound} setConfig={setConfig} onScore={setScoreFor} goClassifica={() => setSection('classifica')} goTavoli={() => setSection('tavoli')} />}
        {section === 'iscritti' && <Iscritti sessionId={sessionId} pairs={state.pairs} />}
        {section === 'tavoli' && <TavoliSezione state={state} pairById={pairById} round={round} onScore={setScoreFor} />}
        {section === 'turni' && <Turni round={round} totalRounds={totalRounds} allSubmitted={allSubmitted} genRound={genRound} setConfig={setConfig} />}
        {section === 'punteggi' && <Punteggi state={state} pairById={pairById} onScore={setScoreFor} />}
        {section === 'classifica' && <ClassificaPiena standings={state.standings} />}
        {section === 'premi' && <Premi cfg={cfg} setConfig={setConfig} standings={state.standings} />}
        {section === 'impostazioni' && <Impostazioni state={state} totalRounds={totalRounds} setConfig={setConfig} />}
      </main>

      <AnimatePresence>
        {scoreFor && <ScoreModal a={scoreFor} pairById={pairById} onClose={() => setScoreFor(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Header({ state, onAddPair, section }: { state: State; onAddPair: () => void; section: Section }) {
  const live = state.session.status === 'playing';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'clamp(26px,3.4vw,42px)', fontWeight: 900, margin: 0, letterSpacing: '-0.01em' }}>{state.session.name}</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(52,211,153,0.14)', color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />{live ? 'IN CORSO' : state.session.status === 'ended' ? 'CONCLUSA' : 'LOBBY'}
          </span>
        </div>
        <div style={{ color: MUTED, marginTop: 4, fontSize: 16 }}>Torneo a coppie · Sala principale</div>
      </div>
      {section !== 'impostazioni' && <GoldButton onClick={onAddPair}><Icon name="plus" size={18} /> Aggiungi coppia</GoldButton>}
    </div>
  );
}

/* ── PANORAMICA ── */
function Panoramica({ state, pairById, round, totalRounds, allSubmitted, cfg, genRound, setConfig, onScore, goClassifica, goTavoli }:
  { state: State; pairById: Record<string, Pair>; round: number; totalRounds: number; allSubmitted: boolean; cfg: BConfig; genRound: () => void; setConfig: (p: BConfig) => void; onScore: (a: Assignment) => void; goClassifica: () => void; goTavoli: () => void }) {
  const tables = state.assignments;
  const shown = tables.slice(0, 4);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 20, alignItems: 'start' }} className="burraco-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
          <Stat icon="users" value={state.pairs.length * 2} label="Giocatori" />
          <Stat icon="users" value={state.pairs.length} label="Coppie" />
          <Stat icon="table" value={tables.length} label="Tavoli" />
          <Stat icon="clock" value={`${round || 0}`} suffix={` di ${totalRounds}`} label="Turno" />
        </div>
        {/* Tavoli */}
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Tavoli {round > 0 ? `· Turno ${round}` : ''}</h2>
          </div>
          {round === 0
            ? <Empty text="Genera il primo turno per creare i tavoli e i QR." />
            : <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 14 }}>
                {shown.map(a => <TableCard key={a.id} a={a} pairById={pairById} onScore={onScore} />)}
              </div>
              {tables.length > 4 && <button onClick={goTavoli} style={{ ...ghostBtn, width: '100%', marginTop: 14, justifyContent: 'center' }}><Icon name="table" size={18} /> Visualizza tutti gli {tables.length} tavoli <Icon name="chevron" size={16} /></button>}
            </>}
        </Panel>
      </div>

      {/* RAIL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <TurnTimer cfg={cfg} round={round} totalRounds={totalRounds} allSubmitted={allSubmitted} genRound={genRound} setConfig={setConfig} />
        <Panel>
          <RailHead icon="chart" title="Classifica provvisoria" onMore={goClassifica} />
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', rowGap: 10, columnGap: 8, alignItems: 'center', marginTop: 6 }}>
            <div style={{ color: MUTED, fontSize: 12 }}>#</div><div style={{ color: MUTED, fontSize: 12 }}>Coppia</div><div style={{ color: MUTED, fontSize: 12, textAlign: 'right' }}>Punti</div>
            {state.standings.slice(0, 3).map((p, i) => (
              <RankRow key={p.id} i={i} label={pairLabel(p)} value={p.totalScore} />
            ))}
          </div>
          {state.standings.length === 0 && <Empty text="Ancora nessun punteggio." />}
          <button onClick={goClassifica} style={{ ...ghostBtn, width: '100%', marginTop: 14, justifyContent: 'center', fontSize: 14 }}>Apri classifica <Icon name="chevron" size={15} /></button>
        </Panel>
        <Panel>
          <RailHead icon="clock" title="Ultime attività" />
          <Attivita state={state} pairById={pairById} />
        </Panel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button onClick={() => exportPdf(state)} style={{ ...ghostBtn, justifyContent: 'center' }}><Icon name="doc" size={17} /> Esporta PDF</button>
          <a href={`${ORIGIN}gestione/burraco?code=${state.session.joinCode}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn, justifyContent: 'center', textDecoration: 'none' }}><Icon name="monitor" size={17} /> Schermo pubblico</a>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, suffix }: { icon: string; value: number | string; label: string; suffix?: string }) {
  return (
    <Panel pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(52,211,153,0.14)', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={22} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}{suffix && <span style={{ fontSize: 16, fontWeight: 800, color: MUTED }}>{suffix}</span>}</div>
          <div style={{ color: MUTED, fontSize: 14 }}>{label}</div>
        </div>
      </div>
    </Panel>
  );
}

function TableCard({ a, pairById, onScore }: { a: Assignment; pairById: Record<string, Pair>; onScore: (a: Assignment) => void }) {
  const bye = a.pairBId === null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${a.submitted ? GREEN + '55' : BORDER}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Tavolo {a.tableNumber}</div>
        {a.submitted
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GOLD, fontSize: 13, fontWeight: 800, background: 'rgba(232,178,76,0.12)', border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '4px 10px' }}><Icon name="check" size={14} /> Risultato ricevuto</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GREEN, fontSize: 13, fontWeight: 800, background: 'rgba(52,211,153,0.12)', border: `1px solid ${GREEN}44`, borderRadius: 999, padding: '4px 10px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN }} /> In gioco</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PairBlock label={pairLabel(pairById[a.pairAId ?? ''])} score={a.submitted ? a.scoreA : null} />
        <div style={{ color: MUTED, fontWeight: 900, fontSize: 13, flexShrink: 0 }}>VS</div>
        {bye ? <PairBlock label="Riposo" bye /> : <PairBlock label={pairLabel(pairById[a.pairBId ?? ''])} score={a.submitted ? a.scoreB : null} />}
      </div>
      {!bye && (
        <button onClick={() => onScore(a)} style={{ ...goldBtnStyle, width: '100%', marginTop: 14, justifyContent: 'center' }}>
          <Icon name="doc" size={17} /> {a.submitted ? 'Modifica risultato' : 'Inserisci risultato'} <Icon name="chevron" size={15} />
        </button>
      )}
    </div>
  );
}
function PairBlock({ label, score, bye }: { label: string; score?: number | null; bye?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', opacity: bye ? 0.5 : 1 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(52,211,153,0.14)', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}><Icon name="users" size={20} /></div>
      <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      {score != null && <div style={{ color: GOLD, fontWeight: 900, fontSize: 18 }}>{score}</div>}
    </div>
  );
}

function TurnTimer({ cfg, round, totalRounds, allSubmitted, genRound, setConfig }:
  { cfg: BConfig; round: number; totalRounds: number; allSubmitted: boolean; genRound: () => void; setConfig: (p: BConfig) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const paused = !!cfg.paused;
  let elapsed = cfg.pausedElapsed ?? 0;
  if (!paused && cfg.roundStartedAt) elapsed = Math.max(0, Math.floor((now - new Date(cfg.roundStartedAt).getTime()) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(elapsed % 60).padStart(2, '0');

  const togglePause = () => {
    if (paused) setConfig({ paused: false, roundStartedAt: new Date(Date.now() - (cfg.pausedElapsed ?? 0) * 1000).toISOString() });
    else setConfig({ paused: true, pausedElapsed: elapsed });
  };
  const closeTurn = () => setConfig({ paused: true, pausedElapsed: elapsed });
  const canGen = round === 0 || allSubmitted || paused;

  return (
    <Panel>
      <div style={{ color: MUTED, fontSize: 14, fontWeight: 700 }}>Tempo del turno</div>
      <div style={{ fontSize: 'clamp(44px,6vw,64px)', fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05, textShadow: `0 2px 20px ${GOLD}33` }}>{mm}:{ss}</div>
      {round > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <button onClick={togglePause} style={{ ...ghostBtn, justifyContent: 'center' }}><Icon name={paused ? 'play' : 'pause'} size={16} /> {paused ? 'Riprendi' : 'Pausa'}</button>
          <button onClick={closeTurn} style={{ ...ghostBtn, justifyContent: 'center' }}><Icon name="check" size={16} /> Chiudi turno</button>
        </div>
      )}
      <button onClick={genRound} disabled={!canGen} style={{ ...goldBtnStyle, width: '100%', marginTop: 10, justifyContent: 'center', padding: '14px', fontSize: 16, opacity: canGen ? 1 : 0.5 }}>
        <Icon name="play" size={17} /> {round === 0 ? 'Genera Turno 1' : round >= totalRounds ? 'Genera turno extra' : 'Genera prossimo turno'}
      </button>
    </Panel>
  );
}

function RankRow({ i, label, value }: { i: number; label: string; value: number }) {
  const col = ['#F4CE72', '#CBD5E1', '#D9872E'][i] ?? MUTED;
  return (
    <>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: col, color: '#1a1205', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontWeight: 900, color: GOLD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={value} /></div>
    </>
  );
}

function Attivita({ state, pairById }: { state: State; pairById: Record<string, Pair> }) {
  const acts = state.assignments.filter(a => a.submitted).slice(-4).reverse();
  if (acts.length === 0 && state.pairs.length === 0) return <Empty text="Nessuna attività." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
      {acts.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: GREEN, display: 'flex' }}><Icon name="check" size={18} /></span>
          <div style={{ flex: 1, fontSize: 14 }}>Tavolo {a.tableNumber} · risultato confermato <span style={{ color: MUTED }}>({pairLabel(pairById[a.pairAId ?? ''])} {a.scoreA}·{a.scoreB})</span></div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: GREEN, display: 'flex' }}><Icon name="users" size={18} /></span>
        <div style={{ flex: 1, fontSize: 14 }}>{state.pairs.length} coppie iscritte</div>
      </div>
    </div>
  );
}

/* ── ISCRITTI E COPPIE ── */
function Iscritti({ sessionId, pairs }: { sessionId: string; pairs: Pair[] }) {
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [busy, setBusy] = useState(false);
  const add = async () => { if (!p1.trim() && !p2.trim()) return; setBusy(true); try { await api(`/gestione/burraco/sessions/${sessionId}/pairs`, { player1: p1, player2: p2 }); setP1(''); setP2(''); } finally { setBusy(false); } };
  const del = async (id: string) => { await api(`/gestione/burraco/sessions/${sessionId}/pairs/${id}`, {}, 'DELETE'); };
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Iscritti e coppie ({pairs.length})</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={p1} onChange={e => setP1(e.target.value)} placeholder="Giocatore 1" style={{ ...inp, flex: '1 1 160px' }} />
        <input value={p2} onChange={e => setP2(e.target.value)} placeholder="Giocatore 2" style={{ ...inp, flex: '1 1 160px' }} onKeyDown={e => e.key === 'Enter' && add()} />
        <GoldButton onClick={add} disabled={busy}><Icon name="plus" size={18} /> Aggiungi coppia</GoldButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 12 }}>
        {pairs.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(52,211,153,0.14)', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="users" size={19} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pairLabel(p)}</div><div style={{ color: MUTED, fontSize: 12 }}>#{i + 1} · {p.totalScore} pt</div></div>
            <button onClick={() => del(p.id)} style={{ background: 'rgba(248,113,113,0.14)', color: '#f87171', border: 'none', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
          </div>
        ))}
        {pairs.length === 0 && <Empty text="Aggiungi almeno 2 coppie per iniziare." />}
      </div>
    </Panel>
  );
}

/* ── TAVOLI (tutti) ── */
function TavoliSezione({ state, pairById, round, onScore }: { state: State; pairById: Record<string, Pair>; round: number; onScore: (a: Assignment) => void }) {
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Tavoli {round > 0 ? `· Turno ${round}` : ''}</h2>
      {round === 0 ? <Empty text="Genera un turno dalla sezione Turni." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 14 }}>
          {state.assignments.map(a => (
            <div key={a.id}>
              <TableCard a={a} pairById={pairById} onScore={onScore} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '0 4px' }}>
                <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}><QRCodeSVG value={`${ORIGIN}gestione/burraco?table=${a.tableCode}`} size={48} /></div>
                <div style={{ fontSize: 12, color: MUTED }}>codice {a.tableCode}<br /><a href={`${ORIGIN}gestione/burraco?table=${a.tableCode}`} target="_blank" rel="noreferrer" style={{ color: GOLD }}>apri tavolo ↗</a></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── TURNI ── */
function Turni({ round, totalRounds, allSubmitted, genRound, setConfig }: { round: number; totalRounds: number; allSubmitted: boolean; genRound: () => void; setConfig: (p: BConfig) => void }) {
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Turni</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: GOLD }}>{round}<span style={{ fontSize: 22, color: MUTED }}> di {totalRounds}</span></div>
        <div style={{ color: MUTED }}>{round === 0 ? 'Nessun turno generato' : allSubmitted ? 'Tutti i risultati ricevuti — pronto per il prossimo' : 'Turno in corso'}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <GoldButton onClick={genRound} disabled={!(round === 0 || allSubmitted)}><Icon name="play" size={17} /> {round === 0 ? 'Genera Turno 1' : 'Genera prossimo turno'}</GoldButton>
        <label style={{ color: MUTED, display: 'flex', alignItems: 'center', gap: 8 }}>Turni totali
          <input type="number" min={1} defaultValue={totalRounds} onBlur={e => setConfig({ totalRounds: Math.max(1, Number(e.target.value) || totalRounds) })} style={{ ...inp, width: 70 }} />
        </label>
      </div>
    </Panel>
  );
}

/* ── PUNTEGGI ── */
function Punteggi({ state, pairById, onScore }: { state: State; pairById: Record<string, Pair>; onScore: (a: Assignment) => void }) {
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Punteggi · Turno {state.session.currentRound}</h2>
      {state.assignments.length === 0 ? <Empty text="Nessun tavolo attivo." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.assignments.filter(a => a.pairBId !== null).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${a.submitted ? GREEN + '44' : BORDER}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, width: 70 }}>Tav. {a.tableNumber}</div>
              <div style={{ flex: 1, minWidth: 0 }}>{pairLabel(pairById[a.pairAId ?? ''])} <span style={{ color: MUTED }}>vs</span> {pairLabel(pairById[a.pairBId ?? ''])}</div>
              <div style={{ color: GOLD, fontWeight: 900, width: 80, textAlign: 'right' }}>{a.submitted ? `${a.scoreA}·${a.scoreB}` : '—'}</div>
              <button onClick={() => onScore(a)} style={{ ...goldBtnStyle }}>{a.submitted ? 'Modifica' : 'Inserisci'}</button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── CLASSIFICA PIENA ── */
function ClassificaPiena({ standings }: { standings: Pair[] }) {
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Classifica</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {standings.map((p, i) => (
          <motion.div key={p.id} layout transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 14, background: i < 3 ? 'rgba(232,178,76,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i < 3 ? GOLD + '44' : BORDER}` }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: ['#F4CE72', '#CBD5E1', '#D9872E'][i] ?? 'rgba(255,255,255,0.1)', color: i < 3 ? '#1a1205' : '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <div style={{ flex: 1, fontWeight: 800, fontSize: 17 }}>{pairLabel(p)}</div>
            <div style={{ fontWeight: 900, color: GOLD, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={p.totalScore} /></div>
          </motion.div>
        ))}
        {standings.length === 0 && <Empty text="Nessuna coppia iscritta." />}
      </div>
    </Panel>
  );
}

/* ── QUOTE E PREMI ── */
function Premi({ cfg, setConfig, standings }: { cfg: BConfig; setConfig: (p: BConfig) => void; standings: Pair[] }) {
  const prizes = cfg.prizes ?? [{ pos: '1º posto', prize: '' }, { pos: '2º posto', prize: '' }, { pos: '3º posto', prize: '' }];
  const [local, setLocal] = useState(prizes);
  const save = () => setConfig({ prizes: local });
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Quote e premi</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
        {local.map((pr, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: ['#F4CE72', '#CBD5E1', '#D9872E'][i] ?? 'rgba(255,255,255,0.1)', color: '#1a1205', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
            <div style={{ color: MUTED, width: 130 }}>{pr.pos}{standings[i] ? ` · ${pairLabel(standings[i])}` : ''}</div>
            <input value={pr.prize} onChange={e => setLocal(l => l.map((x, j) => j === i ? { ...x, prize: e.target.value } : x))} placeholder="Premio / quota" style={{ ...inp, flex: 1 }} />
          </div>
        ))}
        <GoldButton onClick={save}><Icon name="check" size={17} /> Salva premi</GoldButton>
      </div>
    </Panel>
  );
}

/* ── IMPOSTAZIONI ── */
function Impostazioni({ state, totalRounds, setConfig }: { state: State; totalRounds: number; setConfig: (p: BConfig) => void }) {
  const end = async () => { if (confirm('Terminare la serata?')) await api(`/gestione/burraco/sessions/${state.session.id}/end`); };
  return (
    <Panel>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 16px' }}>Impostazioni</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
        <Row label="Turni totali"><input type="number" min={1} defaultValue={totalRounds} onBlur={e => setConfig({ totalRounds: Math.max(1, Number(e.target.value) || totalRounds) })} style={{ ...inp, width: 90 }} /></Row>
        <Row label="Codice regia (rientro)"><b style={{ color: GOLD, letterSpacing: '0.12em' }}>{state.session.masterCode}</b></Row>
        <Row label="Codice TV / pubblico"><b style={{ color: GREEN, letterSpacing: '0.12em' }}>{state.session.joinCode}</b></Row>
        <Row label="Schermo pubblico"><a href={`${ORIGIN}gestione/burraco?code=${state.session.joinCode}`} target="_blank" rel="noreferrer" style={{ color: GOLD }}>apri TV ↗</a></Row>
        <button onClick={end} style={{ background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 12, padding: '12px 16px', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>Termina serata</button>
      </div>
    </Panel>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}><span style={{ color: MUTED }}>{label}</span>{children}</div>;
}

/* ── MODALE RISULTATO ── */
function ScoreModal({ a, pairById, onClose }: { a: Assignment; pairById: Record<string, Pair>; onClose: () => void }) {
  const [sa, setSa] = useState(a.scoreA != null ? String(a.scoreA) : '');
  const [sb, setSb] = useState(a.scoreB != null ? String(a.scoreB) : '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (sa === '' || sb === '') return; setBusy(true); setErr('');
    try { const r = await api(`/gestione/burraco/assignments/${a.id}/score`, { scoreA: Number(sa), scoreB: Number(sb) }); if (!r.ok) setErr(r.error || 'Errore'); else onClose(); }
    finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <motion.div initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()}
        style={{ background: '#0c2a1f', border: `1px solid ${GOLD}44`, borderRadius: 20, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 30px 80px #000a' }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Tavolo {a.tableNumber} — risultato</div>
        <div style={{ color: MUTED, marginBottom: 18, fontSize: 14 }}>Inserisci i punti della manche</div>
        <ScoreField color="#60A5FA" label={pairLabel(pairById[a.pairAId ?? ''])} value={sa} onChange={setSa} />
        <div style={{ textAlign: 'center', color: MUTED, fontWeight: 900, margin: '10px 0' }}>VS</div>
        <ScoreField color="#F472B6" label={pairLabel(pairById[a.pairBId ?? ''])} value={sb} onChange={setSb} />
        {err && <div style={{ color: '#f87171', marginTop: 10, fontWeight: 700 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }}>Annulla</button>
          <button onClick={submit} disabled={busy || sa === '' || sb === ''} style={{ ...goldBtnStyle, flex: 2, justifyContent: 'center', padding: '14px' }}>{busy ? '…' : 'Conferma risultato'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
function ScoreField({ color, label, value, onChange }: { color: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ background: `${color}14`, border: `2px solid ${color}`, borderRadius: 14, padding: 12, textAlign: 'center' }}>
      <div style={{ fontWeight: 800, color, marginBottom: 4, fontSize: 14 }}>{label}</div>
      <input type="number" inputMode="numeric" autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder="0" style={{ width: '100%', textAlign: 'center', fontSize: 38, fontWeight: 900, background: 'transparent', border: 'none', color: '#fff', outline: 'none' }} />
    </div>
  );
}

/* ══════════════════ TV / classifica pubblica ══════════════════ */
function BurracoTV({ sessionId }: { sessionId: string }) {
  const state = useBurracoState(sessionId, 1500);
  if (!state) return <Center>Carico…</Center>;
  return (
    <div style={{ minHeight: '100vh', background: APP_BG, color: '#fff', padding: 'clamp(16px,3vw,44px)', fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div><div style={{ width: 230, maxWidth: '60vw' }}><BurracoLogo h={90} /></div></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'clamp(22px,3vw,40px)', fontWeight: 900 }}>{state.session.name}</div>
          <div style={{ color: MUTED }}>Turno {state.session.currentRound} di {state.session.config?.totalRounds ?? 4}</div>
        </div>
      </div>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {state.standings.map((p, i) => (
          <motion.div key={p.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ layout: { type: 'spring', stiffness: 380, damping: 34 }, delay: Math.min(i * 0.05, 0.5) }}
            style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 'clamp(10px,1.6vw,20px) 24px', marginBottom: 10, borderRadius: 16, background: i < 3 ? 'rgba(232,178,76,0.1)' : 'rgba(255,255,255,0.04)', border: `2px solid ${i < 3 ? GOLD + '66' : '#ffffff12'}`, boxShadow: i === 0 ? `0 0 34px ${GOLD}44` : 'none' }}>
            <motion.div animate={i === 0 ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={i === 0 ? { repeat: Infinity, duration: 1.8 } : { duration: 0.2 }}
              style={{ fontSize: 'clamp(24px,3vw,40px)', fontWeight: 900, width: 60, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] ?? <span style={{ color: '#ffffff55' }}>{i + 1}</span>}</motion.div>
            <div style={{ flex: 1, fontSize: 'clamp(20px,2.6vw,34px)', fontWeight: 800 }}>{pairLabel(p)}</div>
            <div style={{ fontSize: 'clamp(26px,3.4vw,46px)', fontWeight: 900, color: GOLD, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={p.totalScore} /></div>
          </motion.div>
        ))}
        {state.standings.length === 0 && <Center>In attesa delle coppie…</Center>}
      </div>
    </div>
  );
}

/* ══════════════════ TAVOLO (telefono) ══════════════════ */
function BurracoTable({ code }: { code: string }) {
  const [data, setData] = useState<{ assignment: Assignment; pairA: Pair | null; pairB: Pair | null; sessionName: string; round: number } | null>(null);
  const [err, setErr] = useState(''); const [sa, setSa] = useState(''); const [sb, setSb] = useState('');
  const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch(`${API}/gestione/burraco/table/${code}`).then(r => r.ok ? r.json() : Promise.reject(r)).then(d => { setData(d); if (d.assignment.submitted) setDone(true); }).catch(async r => { const e = await r?.json?.().catch(() => ({})); setErr(e?.error || 'Tavolo non trovato'); }); }, [code]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => { if (sa === '' || sb === '') return; setBusy(true); try { const r = await api(`/gestione/burraco/assignments/${data!.assignment.id}/score`, { scoreA: Number(sa), scoreB: Number(sb) }); if (r.ok) setDone(true); else setErr(r.error || 'Errore invio'); } finally { setBusy(false); } };
  if (err) return <Center>{err}</Center>;
  if (!data) return <Center>Carico tavolo…</Center>;
  if (done) return <Center><div style={{ textAlign: 'center' }}><div style={{ fontSize: 64 }}>✅</div><div style={{ fontSize: 24, fontWeight: 900, color: GOLD }}>Punteggio inviato!</div><div style={{ color: MUTED, marginTop: 8 }}>Guarda la classifica sullo schermo</div></div></Center>;
  return (
    <div style={{ minHeight: '100vh', background: APP_BG, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 20, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ width: 200 }}><BurracoLogo h={80} /></div>
      <div style={{ color: MUTED }}>{data.sessionName} · Turno {data.round} · Tavolo {data.assignment.tableNumber}</div>
      <ScoreField color="#60A5FA" label={pairLabel(data.pairA ?? undefined)} value={sa} onChange={setSa} />
      <div style={{ fontSize: 20, fontWeight: 900, color: MUTED }}>VS</div>
      {data.pairB ? <ScoreField color="#F472B6" label={pairLabel(data.pairB)} value={sb} onChange={setSb} /> : <div style={{ color: MUTED }}>Coppia in riposo</div>}
      <motion.button whileTap={{ scale: 0.96 }} onClick={submit} disabled={busy || sa === '' || (!!data.pairB && sb === '')} style={{ ...goldBtnStyle, width: '100%', maxWidth: 360, padding: 18, fontSize: 20, justifyContent: 'center' }}>{busy ? '…' : 'Invia punteggio'}</motion.button>
    </div>
  );
}

/* ── export PDF (stampa classifica) ── */
function exportPdf(state: State) {
  const rows = state.standings.map((p, i) => `<tr><td>${i + 1}</td><td>${pairLabel(p)}</td><td style="text-align:right">${p.totalScore}</td></tr>`).join('');
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<html><head><title>${state.session.name} — Classifica</title><style>body{font-family:system-ui;padding:40px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:10px 8px;border-bottom:1px solid #ddd;font-size:16px}th{text-align:left;color:#666}</style></head><body><h1>${state.session.name}</h1><div>Torneo a coppie · Turno ${state.session.currentRound}</div><table><thead><tr><th>#</th><th>Coppia</th><th style="text-align:right">Punti</th></tr></thead><tbody>${rows}</tbody></table><script>print()</script></body></html>`);
  w.document.close();
}

/* ══════════════════ UI helpers ══════════════════ */
const inp: React.CSSProperties = { padding: '11px 13px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, minWidth: 0, fontFamily: 'inherit' };
const goldBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 11, border: 'none', background: GOLD_GRAD, color: '#231503', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 11, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 };
function GoldButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ ...goldBtnStyle, opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}
function Panel({ children, pad = 20 }: { children: React.ReactNode; pad?: number }) {
  return <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 18, padding: pad }}>{children}</div>;
}
function RailHead({ icon, title, onMore }: { icon: string; title: string; onMore?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 900, fontSize: 16 }}><span style={{ color: GOLD, display: 'flex' }}><Icon name={icon} size={18} /></span>{title}</div>
      {onMore && <button onClick={onMore} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', display: 'flex' }}><Icon name="chevron" size={18} /></button>}
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div style={{ color: MUTED, padding: '12px 2px' }}>{text}</div>; }
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: INK, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 20, padding: 20, textAlign: 'center' }}>{children}</div>;
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { useGameAudio } from '@/hooks/useGameAudio';
import { useListSystemSettings } from '@workspace/api-client-react';
import {
  ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium,
  SocketBadge, FlashOverlay, NeonTimerBar, NeonTitle, ARENA,
} from '@/components/JonnyWorldTheme';
import { RISATE_MISSIONS, type RisateState } from '@/data/risate-missions';

const CHALLENGE_IMAGES: Record<string, string> = {
  sfida:    '/challenges/sfida.png',
  domanda:  '/challenges/domanda.png',
  mimo:     '/challenges/mimo.png',
  ballo:    '/challenges/ballo.png',
  veloce:   '/challenges/veloce.png',
  coppia:   '/challenges/coppia.png',
  reazione: '/challenges/reazione.png',
  fantasia: '/challenges/fantasia.png',
};

interface PercorsoStep {
  id: string; title: string; description: string; challengeType: string;
  points: number; timeLimit: number; optionalMediaUrl: string | null; orderIndex: number;
}
interface PercorsoTeam { id: string; name: string; color: string; score: number; }
interface PercorsoFlash { text: string; type: 'score' | 'step' | 'end'; }
interface PercorsoVoteEntry { voterId: string; score: number; }
interface PercorsoState {
  setId: string; setName: string; steps: PercorsoStep[];
  currentStepIdx: number; teams: PercorsoTeam[];
  status: 'idle' | 'running' | 'ended';
  lastFlash: PercorsoFlash | null; timerStartedAt: string | null;
  performingTeamIds: string[];
  votingOpen: boolean;
  votes: Record<string, PercorsoVoteEntry[]>;
}

const CHALLENGE_CONFIG: Record<string, { label: string; color: string }> = {
  sfida:    { label: 'Sfida',     color: '#F5B642' },
  domanda:  { label: 'Domanda',   color: '#60a5fa' },
  mimo:     { label: 'Mimo',      color: '#a78bfa' },
  ballo:    { label: 'Ballo',     color: '#f472b6' },
  veloce:   { label: 'Veloce',    color: '#34d399' },
  coppia:   { label: 'Coppia',    color: '#fb923c' },
  reazione: { label: 'Reazione',  color: '#f87171' },
  fantasia: { label: 'Fantasia',  color: '#c084fc' },
};
function getChallengeConfig(type: string) {
  return CHALLENGE_CONFIG[type] ?? { label: type, color: '#F5B642' };
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

function useTimer(timerStartedAt: string | null, timeLimit: number) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  useEffect(() => {
    if (!timerStartedAt) { setTimeLeft(timeLimit); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(timerStartedAt).getTime()) / 1000;
      setTimeLeft(Math.max(0, timeLimit - elapsed));
    };
    update();
    const i = setInterval(update, 250);
    return () => clearInterval(i);
  }, [timerStartedAt, timeLimit]);
  return timeLeft;
}

const T = ARENA.percorso;

/* ══════════════════════════════════════════════════════════════════════════
   RISATE BOARD TV — Missioni Improvvise v2 (event mode projector)
══════════════════════════════════════════════════════════════════════════ */

const RISATE_PHASE_LABELS: Record<string, { label: string; color: string }> = {
  mission_intro: { label: '📋 Presentazione',      color: '#60A5FA' },
  booking:       { label: '🙋 Prenotazioni',        color: '#34D399' },
  public_choice: { label: '🗳️ Scelta del Pubblico', color: '#A78BFA' },
  active:        { label: '⚡ In Gioco!',            color: '#F5B642' },
  voting:        { label: '⭐ Votazione',            color: '#FB923C' },
  result:        { label: '🏆 Risultati',            color: '#34D399' },
};

function RisateBoardTV({ rs, eventId, connected, on }: {
  rs: RisateState;
  eventId: string;
  connected: boolean;
  on: <T>(event: string, cb: (d: T) => void) => () => void;
}) {
  const [state, setState] = useState<RisateState>(rs);

  useEffect(() => { setState(rs); }, [rs]);

  useEffect(() => {
    if (!eventId) return;
    const unsub = on<{ state: RisateState }>('path:state_update', ({ state: s }) => {
      if ((s as unknown as { version?: number }).version === 2) setState(s);
    });
    return unsub;
  }, [eventId, on]);

  const mission = RISATE_MISSIONS[state.missionIndex >= 0 ? state.missionIndex : 0];
  const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);
  const phaseInfo = RISATE_PHASE_LABELS[state.phase] ?? { label: state.phase, color: '#60A5FA' };

  if (state.status === 'ended' || (state.status === 'idle' && state.missionIndex > 9)) {
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={state.teams} winnerName={sortedTeams[0]?.name ?? null} onHome={() => {}} />
        <SocketBadge connected={connected} />
      </ArenaBg>
    );
  }

  return (
    <ArenaBg theme={T}>
      <SocketBadge connected={connected} />

      {/* Flash overlay for reactions */}
      {state.lastFlash && <FlashOverlay flash={state.lastFlash.text} color={T.accent} />}

      {/* Header */}
      <ArenaHeader theme={T}
        right={
          <div className="flex items-center gap-3">
            <div className="rounded-xl px-3 py-1 text-xs font-black uppercase tracking-widest"
              style={{ background: `${phaseInfo.color}25`, border: `1px solid ${phaseInfo.color}50`, color: phaseInfo.color }}>
              {phaseInfo.label}
            </div>
            <div className="text-xs text-white/40">Missione {state.missionIndex + 1}/10</div>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="rounded-full transition-all"
                  style={{
                    width: i === state.missionIndex ? 18 : 7, height: 7,
                    background: i < state.missionIndex ? T.accent : i === state.missionIndex ? T.accent : 'rgba(255,255,255,0.15)',
                  }} />
              ))}
            </div>
          </div>
        }
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center overflow-hidden">
        {mission && (
          <motion.div key={`${state.missionIndex}-${state.phase}`}
            initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-4 max-w-2xl">

            <div className="text-8xl drop-shadow-2xl">{mission.emoji}</div>
            <NeonTitle text={mission.title} color={T.accent} className="text-5xl" />
            <div className="text-xl text-white/60 leading-relaxed max-w-lg">{mission.subtitle}</div>

            {/* public_choice options */}
            {state.phase === 'public_choice' && state.publicChoiceOptions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {state.publicChoiceOptions.map(opt => (
                  <div key={opt} className="rounded-2xl px-6 py-3 text-lg font-black"
                    style={state.publicChoice === opt
                      ? { background: `linear-gradient(135deg,${T.accent},#059669)`, color: '#000', boxShadow: `0 0 30px ${T.accent}66` }
                      : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)' }}>
                    {opt}
                  </div>
                ))}
              </div>
            )}

            {/* Active mission 1: current question */}
            {state.phase === 'active' && mission.questions && (
              <motion.div key={state.questionIndex} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="rounded-3xl px-8 py-4 text-2xl font-black text-white max-w-xl"
                style={{ background: 'rgba(245,182,66,0.12)', border: '3px solid rgba(245,182,66,0.4)' }}>
                ❓ {mission.questions[state.questionIndex] ?? '— Fine domande —'}
                <div className="text-sm font-normal text-white/45 mt-2">Errori: {state.errorCount}/2</div>
              </motion.div>
            )}

            {/* Bookings display */}
            {state.bookings.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3 mt-1">
                {state.bookings.map(b => (
                  <motion.div key={b.playerId} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="rounded-2xl px-5 py-2.5 text-base font-black"
                    style={{ background: `${T.accent}18`, border: `2px solid ${T.accent}45` }}>
                    <span style={{ color: T.accent }}>{b.role}</span>
                    <span className="text-white/50 mx-1.5">→</span>
                    <span className="text-white">{b.nickname}</span>
                  </motion.div>
                ))}
                {state.phase === 'booking' && Array.from({ length: Math.max(0, mission.playerCount - state.bookings.length) }, (_, i) => (
                  <div key={`slot-${i}`} className="rounded-2xl px-5 py-2.5 text-base font-bold"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.3)' }}>
                    {mission.roles[state.bookings.length + i] ?? '?'} · libero
                  </div>
                ))}
              </div>
            )}

            {/* Voting: live stars */}
            {state.phase === 'voting' && state.bookings.length > 0 && (
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {state.bookings.map(b => {
                  const vs = state.votes[b.playerId] ?? [];
                  const avg = vs.length > 0 ? vs.reduce((s, v) => s + v.score, 0) / vs.length : 0;
                  return (
                    <div key={b.playerId} className="rounded-2xl px-5 py-3 min-w-[160px]"
                      style={{ background: 'rgba(245,182,66,0.1)', border: '1.5px solid rgba(245,182,66,0.3)' }}>
                      <div className="text-base font-black text-white">{b.nickname}</div>
                      <div className="text-2xl text-yellow-400 mt-1">{'⭐'.repeat(Math.round(avg)) || '—'}</div>
                      <div className="text-xs text-white/40 mt-0.5">{avg > 0 ? avg.toFixed(1) : '0'} ({vs.length} voti)</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Result text */}
            {state.phase === 'result' && state.missionResult && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-3xl px-8 py-5 text-2xl font-black text-white text-center max-w-xl"
                style={{ background: `${T.accent}15`, border: `2.5px solid ${T.accent}45` }}>
                {state.missionResult.text}
              </motion.div>
            )}

            {/* Public reactions stream */}
            {state.phase === 'active' && state.publicEvents.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-lg">
                {state.publicEvents.slice(-8).map((ev, i) => (
                  <motion.div key={`${ev.ts}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="rounded-xl px-3 py-1 text-sm font-bold"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {ev.emoji} {ev.nickname}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Score bar */}
      {state.teams.length > 0 && (
        <ArenaScoreBar teams={state.teams} accent={T.accent} />
      )}
    </ArenaBg>
  );
}

export default function GamePercorso() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId    = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [state, setState]   = useState<PercorsoState | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash]   = useState<PercorsoFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const { playLoop, stopLoop, playStinger } = useGameAudio('percorso-a-risate', { autoLoop: 'lobby_loop' });
  const { data: settingsRows = [] } = useListSystemSettings();
  const musicPaths = (() => {
    const r = settingsRows.find(r => r.key === 'tenant.settings');
    if (r && typeof r.value === 'object' && r.value !== null) {
      const v = r.value as { musicPaths?: Record<string, string> };
      return v.musicPaths ?? {};
    }
    return {} as Record<string, string>;
  })();

  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);

  const showFlash = useCallback((f: PercorsoFlash, ms = 2800, stinger?: string) => {
    if (stinger) void playStinger(stinger);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  }, [playStinger]);

  const fetchState = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await apiFetch(`/percorso/sessions/${sessionId}/state`) as PercorsoState;
      setState(s);
      if (!eventId && eventIdParam) setEventId(eventIdParam);
    } catch { /* silent */ }
  }, [sessionId, eventId, eventIdParam]);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetchState().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchState, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, fetchState]);

  useEffect(() => {
    if (eventId || !sessionId) return;
    apiFetch(`/sessions/${sessionId}`)
      .then((s: unknown) => { if ((s as { eventId?: string }).eventId) setEventId((s as { eventId: string }).eventId); })
      .catch(() => {});
  }, [sessionId, eventId]);

  const prevChallengeType = useRef<string | null>(null);
  useEffect(() => {
    const ct = state?.status === 'running'
      ? (state.steps[state.currentStepIdx]?.challengeType ?? null)
      : null;
    if (!ct || ct === prevChallengeType.current) return;
    prevChallengeType.current = ct;
    const slotKey = `percorso-${ct}`;
    const customPath = musicPaths[slotKey];
    if (!customPath) return;
    const audio = new Audio(`/api/storage${customPath}`);
    audio.loop = true;
    stopLoop(true);
    audio.play().catch(() => {});
    return () => { audio.pause(); };
  }, [state?.currentStepIdx, state?.status, musicPaths, stopLoop]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: PercorsoState }>('path:started',       ({ state: s }) => { setState(s); showFlash({ text: 'Percorso iniziato!', type: 'step' }, 2800, 'score_stinger'); }),
      on<{ state: PercorsoState }>('path:step_changed',  ({ state: s }) => { setState(s); if (s.lastFlash) showFlash(s.lastFlash, 2800, 'transition_whoosh'); }),
      on<{ state: PercorsoState; points: number }>('path:score_updated', ({ state: s }) => { setState(s); if (s.lastFlash) showFlash(s.lastFlash, 2800, 'score_stinger'); }),
      on<{ state: PercorsoState }>('path:ended',         ({ state: s }) => { setState(s); showFlash({ text: 'Fine percorso!', type: 'end' }, 5000, 'winner_stinger'); }),
      on<{ state: PercorsoState }>('path:performing_set',({ state: s }) => setState(s)),
      on<{ state: PercorsoState }>('path:voting_opened', ({ state: s }) => { setState(s); showFlash({ text: '🗳️ Votazione aperta!', type: 'step' }, 2500); }),
      on<{ state: PercorsoState }>('path:vote_cast',     ({ state: s }) => setState(s)),
      on<{ state: PercorsoState }>('path:voting_closed', ({ state: s }) => { setState(s); showFlash({ text: '🗳️ Votazione chiusa!', type: 'step' }, 2500); }),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on, showFlash]);

  const currentStep = state && state.currentStepIdx >= 0 ? state.steps[state.currentStepIdx] ?? null : null;
  const cfg         = currentStep ? getChallengeConfig(currentStep.challengeType) : null;
  const timeLeft    = useTimer(state?.timerStartedAt ?? null, currentStep?.timeLimit ?? 30);
  const timerPct    = currentStep ? (timeLeft / currentStep.timeLimit) * 100 : 0;
  const timerColor  = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';
  const sortedTeams = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];

  if (loading) return <ArenaBg theme={T}><JonnyWaitingScreen theme={T} label="Caricamento…" /></ArenaBg>;

  if (!state) return (
    <ArenaBg theme={T}>
      <JonnyWaitingScreen theme={T}
        subtitle={sessionId ? 'Percorso non inizializzato' : 'Parametri mancanti'}
        label="URL: /percorso-risate?s=SESSION_ID&e=EVENT_ID" />
    </ArenaBg>
  );

  // ── v2 Risate Missioni Improvvise ─────────────────────────────────────────
  if ((state as unknown as { version?: number }).version === 2) {
    const rs = state as unknown as RisateState;
    return <RisateBoardTV rs={rs} eventId={eventId} connected={connected} on={on} />;
  }

  if (state.status === 'ended') {
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={state.teams} winnerName={sortedTeams[0]?.name ?? null} onHome={() => navigate('/')} />
      </ArenaBg>
    );
  }

  return (
    <ArenaBg theme={T}>
      {/* Timer bar at very top */}
      {state.status === 'running' && currentStep && (
        <NeonTimerBar pct={timerPct} color={timerColor} />
      )}

      {/* Flash overlay */}
      <FlashOverlay flash={flash?.text ?? null} color={flash?.type === 'score' ? '#F5B642' : T.accent} />

      {/* Header */}
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} title="Torna al parco"
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition-all"
              style={{ borderColor: `${T.accent}44`, background: `${T.accent}12` }}>
              <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
            </button>
            <div>
              <div className="text-xs uppercase tracking-[0.3em]" style={{ color: `${T.accent}88` }}>Percorso a Risate</div>
              <div className="text-sm font-black text-white/80">{state.setName}</div>
            </div>
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            {state.status === 'running' && (
              <div className="text-right">
                <div className="text-xs text-white/40">Sfida</div>
                <div className="text-display text-xl font-black tabular-nums" style={{ color: T.accent }}>
                  {state.currentStepIdx + 1}/{state.steps.length}
                </div>
              </div>
            )}
            <SocketBadge connected={connected} />
          </div>
        }
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 overflow-hidden">
        <AnimatePresence mode="wait">

          {/* IDLE */}
          {state.status === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-8 text-center">
              <NeonTitle text={state.setName} color={T.accent} size="lg" className="text-center" />
              <div className="text-xl text-white/50">{state.steps.length} sfide pronte</div>
              <motion.img src="/jonny-master.jpg" alt="Jonny"
                style={{ height: 160, mixBlendMode: 'multiply', filter: `drop-shadow(0 8px 32px ${T.glow}77)` }}
                animate={{ y: [0, -12, 0] }} transition={{ duration: 3, repeat: Infinity }} />
              <motion.div className="rounded-2xl border px-6 py-2.5 text-sm font-bold"
                style={{ borderColor: `${T.accent}44`, background: `${T.accent}10`, color: T.accent }}
                animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.2, repeat: Infinity }}>
                In attesa dell'animatore…
              </motion.div>
            </motion.div>
          )}

          {/* RUNNING */}
          {state.status === 'running' && currentStep && cfg && (
            <motion.div key={`step-${state.currentStepIdx}`}
              initial={{ opacity: 0, scale: 0.88, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              className="flex w-full max-w-5xl flex-col items-center gap-6 text-center">

              {/* Layout: illustration left, content right on wide screens */}
              <div className="flex w-full max-w-5xl items-start gap-8">

                {/* AI challenge illustration */}
                {CHALLENGE_IMAGES[currentStep.challengeType] && (
                  <motion.div
                    key={`img-${currentStep.challengeType}`}
                    initial={{ opacity: 0, x: -30, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="hidden sm:flex shrink-0 flex-col items-center gap-3"
                  >
                    <img
                      src={CHALLENGE_IMAGES[currentStep.challengeType]}
                      alt={cfg.label}
                      className="w-44 h-44 object-contain rounded-3xl"
                      style={{ filter: `drop-shadow(0 0 32px ${cfg.color}66)` }}
                    />
                  </motion.div>
                )}

                {/* Text content */}
                <div className="flex flex-1 flex-col items-center sm:items-start gap-5 text-center sm:text-left">
                  {/* Challenge type badge */}
                  <div className="flex items-center gap-4 rounded-2xl border-2 px-7 py-3"
                    style={{ borderColor: `${cfg.color}55`, background: `${cfg.color}12` }}>
                    <span className="text-display text-2xl font-black tracking-wide" style={{ color: cfg.color }}>{cfg.label}</span>
                    <div className="h-4 w-px bg-white/20" />
                    <span className="text-lg text-white/50 font-bold">{currentStep.points} pt</span>
                  </div>

                  {/* Challenge title */}
                  <div className="text-display font-black leading-tight text-white"
                    style={{ fontSize: 'clamp(2.5rem, 6vw, 5.5rem)', textShadow: `0 0 60px ${cfg.color}44` }}>
                    {currentStep.title}
                  </div>

                  {/* Description */}
                  {currentStep.description && (
                    <div className="max-w-3xl text-xl sm:text-2xl leading-relaxed text-white/55">
                      {currentStep.description}
                    </div>
                  )}

                  {/* Optional media (admin-picked) */}
                  {currentStep.optionalMediaUrl && (
                    <img src={currentStep.optionalMediaUrl} alt=""
                      className="max-h-48 w-auto rounded-2xl border object-contain shadow-2xl"
                      style={{ borderColor: `${cfg.color}33` }} />
                  )}
                </div>
              </div>

              {/* Timer */}
              <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                <div className="text-display text-5xl font-black tabular-nums" style={{ color: timerColor }}>
                  {Math.ceil(timeLeft)}s
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <motion.div className="h-full rounded-r-full"
                    animate={{ width: `${timerPct}%` }} transition={{ duration: 0.15 }}
                    style={{ background: timerColor, boxShadow: `0 0 12px ${timerColor}88` }} />
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Step progress dots */}
      {state.status === 'running' && state.steps.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-2 shrink-0">
          {state.steps.map((_, i) => (
            <div key={i} className="rounded-full transition-all duration-300"
              style={{
                width: i === state.currentStepIdx ? 24 : 8,
                height: 8,
                background: i < state.currentStepIdx ? T.accent :
                            i === state.currentStepIdx ? T.accent : 'rgba(255,255,255,0.18)',
                boxShadow: i === state.currentStepIdx ? `0 0 8px ${T.accent}88` : 'none',
              }} />
          ))}
        </div>
      )}

      {/* Performing teams + vote overlay */}
      {state.status === 'running' && state.performingTeamIds.length >= 2 && (
        <div className="absolute top-16 right-4 z-20 flex flex-col items-end gap-2">
          {/* Performing badge */}
          <div className="rounded-2xl border border-yellow-500/40 bg-black/70 px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-400/70 mb-1">🎭 In esibizione</div>
            <div className="flex flex-col gap-1">
              {state.performingTeamIds.map(tid => {
                const team = state.teams.find(t => t.id === tid);
                return (
                  <div key={tid} className="flex items-center gap-1.5 text-xs font-bold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: team?.color }} />
                    <span className="text-white">{team?.name ?? tid}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live vote tally */}
          {state.votingOpen && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl border border-purple-500/50 bg-black/80 px-3 py-2 backdrop-blur-sm min-w-[140px]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-1.5 animate-pulse">
                🗳️ Voto in corso…
              </div>
              {state.performingTeamIds.map(tid => {
                const team = state.teams.find(t => t.id === tid);
                const votes = state.votes[tid] ?? [];
                const avg = votes.length > 0 ? votes.reduce((s, v) => s + v.score, 0) / votes.length : 0;
                return (
                  <div key={tid} className="flex items-center gap-1.5 text-xs mb-1">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: team?.color }} />
                    <span className="flex-1 truncate text-white/80">{team?.name ?? tid}</span>
                    <span className="text-yellow-400 text-[10px]">{'⭐'.repeat(Math.round(avg))}</span>
                    <span className="text-white/40 tabular-nums text-[10px]">{votes.length}</span>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* Vote results after closing */}
          {!state.votingOpen && state.performingTeamIds.some(tid => (state.votes[tid] ?? []).length > 0) && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl border border-green-500/40 bg-black/80 px-3 py-2 backdrop-blur-sm min-w-[140px]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-1.5">
                📊 Risultati voto
              </div>
              {state.performingTeamIds
                .map(tid => {
                  const team = state.teams.find(t => t.id === tid);
                  const votes = state.votes[tid] ?? [];
                  const avg = votes.length > 0 ? votes.reduce((s, v) => s + v.score, 0) / votes.length : 0;
                  return { tid, team, avg, count: votes.length };
                })
                .sort((a, b) => b.avg - a.avg)
                .map(({ tid, team, avg, count }, rank) => (
                  <div key={tid} className="flex items-center gap-1.5 text-xs mb-1">
                    <span className={rank === 0 ? 'text-yellow-400' : 'text-white/40'}>{rank === 0 ? '👑' : `${rank + 1}.`}</span>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: team?.color }} />
                    <span className="flex-1 truncate text-white/80">{team?.name ?? tid}</span>
                    <span className="text-yellow-400 text-[10px]">{avg > 0 ? `⭐${avg.toFixed(1)}` : '—'}</span>
                    <span className="text-white/40 tabular-nums text-[10px]">({count})</span>
                  </div>
                ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Score bar */}
      {state.status === 'running' && state.teams.length > 0 && (
        <ArenaScoreBar teams={state.teams} accent={T.accent} />
      )}
    </ArenaBg>
  );
}

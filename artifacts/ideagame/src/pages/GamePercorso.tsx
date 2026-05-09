import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useGameAudio } from '@/hooks/useGameAudio';
import {
  ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium,
  SocketBadge, FlashOverlay, NeonTimerBar, NeonTitle, ARENA,
} from '@/components/JonnyWorldTheme';

interface PercorsoStep {
  id: string; title: string; description: string; challengeType: string;
  points: number; timeLimit: number; optionalMediaUrl: string | null; orderIndex: number;
}
interface PercorsoTeam { id: string; name: string; color: string; score: number; }
interface PercorsoFlash { text: string; type: 'score' | 'step' | 'end'; }
interface PercorsoState {
  setId: string; setName: string; steps: PercorsoStep[];
  currentStepIdx: number; teams: PercorsoTeam[];
  status: 'idle' | 'running' | 'ended';
  lastFlash: PercorsoFlash | null; timerStartedAt: string | null;
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

  const { playLoop, playStinger } = useGameAudio('percorso-a-risate', { autoLoop: 'lobby_loop' });

  const { connected, on } = useEventSocket(eventId || null);

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

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: PercorsoState }>('path:started',      ({ state: s }) => { setState(s); showFlash({ text: 'Percorso iniziato!', type: 'step' }, 2800, 'score_stinger'); }),
      on<{ state: PercorsoState }>('path:step_changed', ({ state: s }) => { setState(s); if (s.lastFlash) showFlash(s.lastFlash, 2800, 'transition_whoosh'); }),
      on<{ state: PercorsoState; points: number }>('path:score_updated', ({ state: s }) => { setState(s); if (s.lastFlash) showFlash(s.lastFlash, 2800, 'score_stinger'); }),
      on<{ state: PercorsoState }>('path:ended',        ({ state: s }) => { setState(s); showFlash({ text: 'Fine percorso!', type: 'end' }, 5000, 'winner_stinger'); }),
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
              <motion.img src={T.jonny} alt="Jonny"
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

              {/* Challenge type badge */}
              <div className="flex items-center gap-4 rounded-2xl border-2 px-7 py-3"
                style={{ borderColor: `${cfg.color}55`, background: `${cfg.color}12` }}>
                <span className="text-display text-2xl font-black tracking-wide" style={{ color: cfg.color }}>{cfg.label}</span>
                <div className="h-4 w-px bg-white/20" />
                <span className="text-lg text-white/50 font-bold">{currentStep.points} pt</span>
              </div>

              {/* Challenge title */}
              <div className="text-display font-black leading-tight text-white"
                style={{ fontSize: 'clamp(3rem, 8vw, 7rem)', textShadow: `0 0 60px ${cfg.color}44` }}>
                {currentStep.title}
              </div>

              {/* Description */}
              {currentStep.description && (
                <div className="max-w-3xl text-xl sm:text-2xl leading-relaxed text-white/55">
                  {currentStep.description}
                </div>
              )}

              {/* Optional media */}
              {currentStep.optionalMediaUrl && (
                <img src={currentStep.optionalMediaUrl} alt=""
                  className="max-h-64 w-auto rounded-2xl border object-contain shadow-2xl"
                  style={{ borderColor: `${cfg.color}33` }} />
              )}

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

      {/* Score bar */}
      {state.status === 'running' && state.teams.length > 0 && (
        <ArenaScoreBar teams={state.teams} accent={T.accent} />
      )}
    </ArenaBg>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Home, Wifi, WifiOff } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

/* ─── Types ──────────────────────────────────────────────────────────────── */
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

/* ─── Challenge type config ──────────────────────────────────────────────── */
const CHALLENGE_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  sfida:    { emoji: '⚡', label: 'Sfida',      color: '#F5B642', bg: 'rgba(245,182,66,0.15)' },
  domanda:  { emoji: '❓', label: 'Domanda',    color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  mimo:     { emoji: '🎭', label: 'Mimo',       color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  ballo:    { emoji: '💃', label: 'Ballo',      color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  veloce:   { emoji: '🏃', label: 'Veloce',     color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  coppia:   { emoji: '👫', label: 'Coppia',     color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
  reazione: { emoji: '😱', label: 'Reazione',   color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  fantasia: { emoji: '🌟', label: 'Fantasia',   color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
};
function getChallengeConfig(type: string) {
  return CHALLENGE_CONFIG[type] ?? { emoji: '🎯', label: type, color: '#F5B642', bg: 'rgba(245,182,66,0.15)' };
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

/* ─── Timer display ──────────────────────────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function GamePercorso() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [state, setState] = useState<PercorsoState | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash] = useState<PercorsoFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, on } = useEventSocket(eventId || null);

  const showFlash = useCallback((f: PercorsoFlash, ms = 2800) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  }, []);

  const fetchState = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await apiFetch(`/percorso/sessions/${sessionId}/state`) as PercorsoState;
      setState(s);
      if (!eventId && eventIdParam) setEventId(eventIdParam);
    } catch { /* silent */ }
  }, [sessionId, eventId, eventIdParam]);

  // Initial load
  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetchState().finally(() => setLoading(false));
    // Polling fallback (slower when socket is connected)
    pollRef.current = setInterval(fetchState, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, fetchState]);

  // Resolve eventId from session if not in URL
  useEffect(() => {
    if (eventId || !sessionId) return;
    apiFetch(`/sessions/${sessionId}`)
      .then((s: unknown) => { if ((s as { eventId?: string }).eventId) setEventId((s as { eventId: string }).eventId); })
      .catch(() => {});
  }, [sessionId, eventId]);

  // Socket events
  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: PercorsoState }>('path:started', ({ state: s }) => { setState(s); showFlash({ text: '🎉 Percorso iniziato!', type: 'step' }); }),
      on<{ state: PercorsoState }>('path:step_changed', ({ state: s }) => {
        setState(s);
        if (s.lastFlash) showFlash(s.lastFlash);
      }),
      on<{ state: PercorsoState; points: number }>('path:score_updated', ({ state: s }) => {
        setState(s);
        if (s.lastFlash) showFlash(s.lastFlash);
      }),
      on<{ state: PercorsoState }>('path:ended', ({ state: s }) => {
        setState(s);
        showFlash({ text: '🏆 Fine percorso!', type: 'end' }, 5000);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on, showFlash]);

  // Current step
  const currentStep = state && state.currentStepIdx >= 0 ? state.steps[state.currentStepIdx] ?? null : null;
  const cfg = currentStep ? getChallengeConfig(currentStep.challengeType) : null;
  const timeLeft = useTimer(state?.timerStartedAt ?? null, currentStep?.timeLimit ?? 30);
  const timerPct = currentStep ? (timeLeft / currentStep.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';

  // Podium
  const sortedTeams = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];
  const podiumMedals = ['🥇', '🥈', '🥉'];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-display text-2xl font-black text-muted-foreground">Caricamento…</div>
    </div>
  );

  if (!state) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="text-display text-2xl font-black text-muted-foreground">
        {sessionId ? 'Percorso non inizializzato' : 'Parametri mancanti'}
      </div>
      <div className="text-sm text-muted-foreground">URL: /percorso-risate?s=SESSION_ID&amp;e=EVENT_ID</div>
    </div>
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 8%), hsl(248 70% 2%))' }}>

      {/* ── Flash overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.text}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className={`rounded-3xl px-12 py-8 text-center shadow-2xl ${
              flash.type === 'score' ? 'bg-primary/90 text-primary-foreground' :
              flash.type === 'end' ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' :
              'bg-card/90 border border-border text-foreground'
            }`}
              style={{ backdropFilter: 'blur(20px)' }}>
              <div className="text-display text-5xl font-black leading-tight sm:text-7xl">{flash.text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/60 hover:bg-card">
            <Home className="h-4 w-4" />
          </button>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Percorso a Risate</div>
            <div className="text-display text-lg font-black">{state.setName}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Step counter */}
          {state.status === 'running' && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Sfida</div>
              <div className="text-display text-2xl font-black tabular-nums">
                {state.currentStepIdx + 1}/{state.steps.length}
              </div>
            </div>
          )}
          {/* Socket indicator */}
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${connected ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'live' : 'offline'}
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait">

          {/* IDLE — waiting for game to start */}
          {state.status === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-8 text-center">
              <div className="text-[100px] leading-none">🎭</div>
              <div>
                <div className="text-display text-5xl font-black sm:text-7xl">{state.setName}</div>
                <div className="mt-4 text-2xl text-muted-foreground">{state.steps.length} sfide pronte</div>
              </div>
              <div className="rounded-2xl border border-border bg-card/40 px-8 py-4 text-muted-foreground">
                In attesa dell'animatore…
              </div>
            </motion.div>
          )}

          {/* RUNNING — current challenge */}
          {state.status === 'running' && currentStep && cfg && (
            <motion.div key={`step-${state.currentStepIdx}`}
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="flex w-full max-w-5xl flex-col items-center gap-6 text-center"
            >
              {/* Challenge type badge */}
              <div className="flex items-center gap-3 rounded-2xl border px-6 py-3"
                style={{ borderColor: `${cfg.color}50`, background: cfg.bg }}>
                <span className="text-4xl">{cfg.emoji}</span>
                <span className="text-display text-2xl font-black" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="ml-4 text-lg text-muted-foreground">
                  {currentStep.points} pt
                </span>
              </div>

              {/* Challenge title */}
              <div className="text-display text-5xl font-black leading-tight sm:text-7xl lg:text-8xl"
                style={{ textShadow: `0 0 60px ${cfg.color}40` }}>
                {currentStep.title}
              </div>

              {/* Description */}
              {currentStep.description && (
                <div className="max-w-3xl text-2xl leading-relaxed text-muted-foreground sm:text-3xl">
                  {currentStep.description}
                </div>
              )}

              {/* Optional media */}
              {currentStep.optionalMediaUrl && (
                <img src={currentStep.optionalMediaUrl} alt=""
                  className="max-h-64 w-auto rounded-2xl border border-border object-contain shadow-2xl" />
              )}

              {/* Timer bar */}
              <div className="w-full max-w-xl">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-muted-foreground">{currentStep.timeLimit}s totali</span>
                  <span className="text-display text-3xl font-black tabular-nums" style={{ color: timerColor }}>
                    {Math.ceil(timeLeft)}s
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-border/40">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${timerPct}%`, background: timerColor, boxShadow: `0 0 12px ${timerColor}80` }} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ENDED — podium */}
          {state.status === 'ended' && (
            <motion.div key="ended" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
              <div className="text-display text-6xl font-black sm:text-8xl">🏆</div>
              <div className="text-display text-4xl font-black sm:text-6xl">FINE PERCORSO!</div>

              {/* Podium */}
              <div className="w-full space-y-3">
                {sortedTeams.map((tm, i) => (
                  <motion.div key={tm.id}
                    initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className="flex items-center gap-4 rounded-2xl border px-6 py-4"
                    style={{ borderColor: `${tm.color}60`, background: `${tm.color}12` }}>
                    <span className="text-3xl w-10">{podiumMedals[i] ?? `${i + 1}.`}</span>
                    <span className="text-display text-2xl font-black flex-1 text-left" style={{ color: tm.color }}>{tm.name}</span>
                    <span className="text-display text-3xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
                    <span className="text-sm text-muted-foreground">pt</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Team scores bar (always visible when running/ended) ──────── */}
      {(state.status === 'running' || state.status === 'ended') && state.teams.length > 0 && (
        <div className="border-t border-border bg-card/30 px-6 py-4" style={{ backdropFilter: 'blur(10px)' }}>
          <div className="mx-auto flex max-w-5xl items-center justify-center gap-6">
            {[...state.teams].sort((a, b) => b.score - a.score).map((tm, i) => (
              <div key={tm.id} className="flex items-center gap-3">
                <span className="text-lg">{podiumMedals[i] ?? ''}</span>
                <div>
                  <div className="text-xs text-muted-foreground truncate max-w-[100px]">{tm.name}</div>
                  <div className="text-display text-2xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step progress dots (running only) */}
      {state.status === 'running' && state.steps.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {state.steps.map((_, i) => (
            <div key={i} className="rounded-full transition-all"
              style={{
                width: i === state.currentStepIdx ? 24 : 8,
                height: 8,
                background: i < state.currentStepIdx ? '#F5B642' :
                            i === state.currentStepIdx ? '#F5B642' : 'rgba(255,255,255,0.2)',
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

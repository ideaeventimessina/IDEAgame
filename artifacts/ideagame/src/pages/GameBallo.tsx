import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Trophy, Home, Music } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface DanceTeam {
  id: string; name: string; color: string; score: number; energy: number;
}
interface DanceState {
  challengeId: string; challengeName: string; duration: number;
  musicHint: string; difficulty: string;
  teams: DanceTeam[];
  status: 'idle' | 'running' | 'ended';
  startedAt: string | null;
}

/* ─── Config ─────────────────────────────────────────────────────────────── */
const DIFF_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  easy:   { label: 'Facile',  color: '#4ade80', emoji: '🌱' },
  medium: { label: 'Medio',   color: '#fbbf24', emoji: '🔥' },
  hard:   { label: 'Difficile', color: '#f472b6', emoji: '💪' },
};
function getDiff(d: string) {
  return DIFF_CONFIG[d] ?? DIFF_CONFIG['medium']!;
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

/* ─── Countdown hook ─────────────────────────────────────────────────────── */
function useCountdown(startedAt: string | null, duration: number) {
  const [timeLeft, setTimeLeft] = useState(duration);
  useEffect(() => {
    if (!startedAt) { setTimeLeft(duration); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
      setTimeLeft(Math.max(0, duration - elapsed));
    };
    update();
    const i = setInterval(update, 250);
    return () => clearInterval(i);
  }, [startedAt, duration]);
  return timeLeft;
}

/* ─── Energy bar ─────────────────────────────────────────────────────────── */
function EnergyBar({ energy, color }: { energy: number; color: string }) {
  const pulse = energy > 60;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
        animate={{ width: `${energy}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      {pulse && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
    </div>
  );
}

/* ─── Podio ──────────────────────────────────────────────────────────────── */
function Podio({ teams }: { teams: DanceTeam[] }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at top, #1a0533, #0a0a14)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120 }}
        className="text-center mb-8"
      >
        <div className="text-8xl mb-2">🏆</div>
        <div className="text-display text-4xl font-black text-white">Classifica Finale</div>
        <div className="text-xl text-white/60 mt-1">Sfida di Ballo</div>
      </motion.div>

      <div className="w-full max-w-lg space-y-3 px-6">
        {sorted.map((tm, i) => (
          <motion.div
            key={tm.id}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
            className="flex items-center gap-4 rounded-2xl border px-5 py-4"
            style={{
              borderColor: `${tm.color}55`,
              background: `linear-gradient(135deg, ${tm.color}18, transparent)`,
              boxShadow: i === 0 ? `0 0 40px ${tm.color}44` : 'none',
            }}
          >
            <span className="text-3xl">{medals[i] ?? `${i + 1}.`}</span>
            <div className="flex-1 min-w-0">
              <div className="text-display text-xl font-black truncate" style={{ color: tm.color }}>{tm.name}</div>
            </div>
            <div className="text-display text-3xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
          </motion.div>
        ))}
      </div>

      <a href={BASE} className="mt-10 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20">
        <Home className="h-4 w-4" /> Hub
      </a>
    </motion.div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function GameBallo() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventId   = params.get('e') ?? '';

  const [state, setState] = useState<DanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const { connected, on } = useEventSocket(eventId || null);

  const timeLeft = useCountdown(state?.startedAt ?? null, state?.duration ?? 60);
  const diff = getDiff(state?.difficulty ?? 'medium');

  /* ── Fetch state on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    apiFetch(`/dance/sessions/${sessionId}/state`)
      .then((d) => setState(d as DanceState))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  /* ── Socket ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: DanceState }>('dance:started',       ({ state: s }) => setState(s)),
      on<{ state: DanceState }>('dance:motion',        ({ state: s }) => setState(s)),
      on<{ state: DanceState }>('dance:score_updated', ({ state: s }) => setState(s)),
      on<{ state: DanceState }>('dance:ended',         ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [eventId, on]);

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'radial-gradient(ellipse at top, #1a0533, #0a0a14)' }}>
        <div className="text-6xl animate-bounce">💃</div>
      </div>
    );
  }

  const sorted = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, #1a0533 0%, #0a0014 70%)' }}
    >
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-32 top-1/3 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'rgba(168,85,247,0.15)' }}
          animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div
          className="absolute -right-32 top-1/4 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'rgba(245,182,66,0.10)' }}
          animate={{ scale: [1.2, 1, 1.2] }} transition={{ duration: 5, repeat: Infinity }}
        />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💃</div>
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50">Sfida di Ballo</div>
            {state && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="rounded-full border px-2 py-0.5 text-xs font-bold"
                  style={{ color: diff.color, borderColor: `${diff.color}55` }}>
                  {diff.emoji} {diff.label}
                </span>
                {state.musicHint && (
                  <span className="flex items-center gap-1 text-xs text-white/50">
                    <Music className="h-3 w-3" /> {state.musicHint}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${connected ? 'border-green-500/40 text-green-400' : 'border-amber-500/40 text-amber-400'}`}>
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? 'live' : 'riconnessione…'}
        </div>
      </header>

      {/* ── No state ────────────────────────────────────────────────────── */}
      {!state && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="text-8xl">💃</div>
          <div className="text-display text-2xl font-black text-white">In attesa…</div>
          <div className="text-white/50">L'animatore inizializzerà la sfida da LiveControl</div>
        </div>
      )}

      {/* ── Idle ────────────────────────────────────────────────────────── */}
      {state?.status === 'idle' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="text-display text-4xl font-black text-white md:text-6xl">{state.challengeName}</div>
            <div className="mt-3 text-white/50">Preparatevi! Durata: {state.duration}s</div>
          </motion.div>
          <div className="flex gap-4">
            {sorted.map((tm) => (
              <div key={tm.id} className="rounded-xl border px-4 py-2 text-center"
                style={{ borderColor: `${tm.color}55`, background: `${tm.color}15` }}>
                <div className="text-sm font-bold" style={{ color: tm.color }}>{tm.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Running ─────────────────────────────────────────────────────── */}
      {state?.status === 'running' && (
        <div className="relative z-10 flex flex-1 flex-col px-6">
          {/* Challenge title */}
          <motion.div
            className="text-center py-4"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-display text-3xl font-black text-white md:text-5xl">{state.challengeName}</div>
          </motion.div>

          {/* Giant countdown */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <motion.div
              className="relative flex h-48 w-48 items-center justify-center rounded-full md:h-64 md:w-64"
              style={{
                background: `conic-gradient(${diff.color} ${(timeLeft / state.duration) * 360}deg, rgba(255,255,255,0.05) 0deg)`,
                boxShadow: `0 0 60px ${diff.color}44`,
              }}
              animate={{ boxShadow: [`0 0 40px ${diff.color}33`, `0 0 80px ${diff.color}66`, `0 0 40px ${diff.color}33`] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="flex h-40 w-40 items-center justify-center rounded-full bg-black/60 md:h-56 md:w-56">
                <div className="text-display text-6xl font-black text-white md:text-7xl tabular-nums">
                  {Math.ceil(timeLeft)}
                </div>
              </div>
            </motion.div>

            {timeLeft <= 10 && timeLeft > 0 && (
              <motion.div
                className="mt-4 text-display text-2xl font-black"
                style={{ color: diff.color }}
                animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5, repeat: Infinity }}
              >
                ⚡ Forza!
              </motion.div>
            )}
            {timeLeft === 0 && (
              <div className="mt-4 text-display text-2xl font-black text-white">🏁 Tempo!</div>
            )}
          </div>

          {/* Team energy bars */}
          <div className="space-y-3 pb-4">
            {sorted.map((tm) => (
              <div key={tm.id} className="rounded-2xl border p-3"
                style={{ borderColor: `${tm.color}33`, background: `${tm.color}10` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
                    <span className="font-bold text-white text-sm">{tm.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/50">⚡ {tm.energy}%</span>
                    <span className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
                  </div>
                </div>
                <EnergyBar energy={tm.energy} color={tm.color} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ended: podio ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state?.status === 'ended' && <Podio teams={state.teams} />}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { useGameAudio } from '@/hooks/useGameAudio';
import { ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium, SocketBadge, NeonTitle, ARENA } from '@/components/JonnyWorldTheme';

interface DanceTeam { id: string; name: string; color: string; score: number; energy: number; }
interface DanceState {
  challengeId: string; challengeName: string; duration: number;
  musicHint: string; difficulty: string;
  teams: DanceTeam[]; status: 'idle' | 'running' | 'ended'; startedAt: string | null;
}

const DIFF_CONFIG: Record<string, { label: string; color: string }> = {
  easy:   { label: 'Facile',     color: '#4ade80' },
  medium: { label: 'Medio',      color: '#fbbf24' },
  hard:   { label: 'Difficile',  color: '#f472b6' },
};
function getDiff(d: string) { return DIFF_CONFIG[d] ?? DIFF_CONFIG['medium']!; }

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

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

function EnergyBar({ energy, color }: { energy: number; color: string }) {
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <motion.div className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 8px ${color}66` }}
        animate={{ width: `${energy}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }} />
    </div>
  );
}

const T = ARENA.ballo;

export default function GameBallo() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventId   = params.get('e') ?? '';

  const [state, setState] = useState<DanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);
  const { playLoop, playStinger } = useGameAudio('sfida-ballo', { autoLoop: 'lobby_loop' });

  const timeLeft = useCountdown(state?.startedAt ?? null, state?.duration ?? 60);
  const diff = getDiff(state?.difficulty ?? 'medium');

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    apiFetch(`/dance/sessions/${sessionId}/state`)
      .then((d) => setState(d as DanceState))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: DanceState }>('dance:started',       ({ state: s }) => { setState(s); playLoop('round_loop'); }),
      on<{ state: DanceState }>('dance:motion',        ({ state: s }) => setState(s)),
      on<{ state: DanceState }>('dance:score_updated', ({ state: s }) => setState(s)),
      on<{ state: DanceState }>('dance:ended',         ({ state: s }) => { setState(s); playStinger('winner_drop'); }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [eventId, on, playLoop, playStinger]);

  const sorted = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];

  if (loading) {
    return <ArenaBg theme={T}><JonnyWaitingScreen theme={T} label="Caricamento arena…" /></ArenaBg>;
  }

  if (state?.status === 'ended') {
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={state.teams} winnerName={sorted[0]?.name ?? null} onHome={() => { window.location.href = '/'; }} />
      </ArenaBg>
    );
  }

  const timerPct = state ? (timeLeft / state.duration) * 100 : 0;

  return (
    <ArenaBg theme={T}>
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: T.accent }}>{T.title}</span>
            {state && (
              <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
                style={{ color: diff.color, borderColor: `${diff.color}55`, background: `${diff.color}12` }}>
                {diff.label}
              </span>
            )}
            {state?.musicHint && (
              <span className="text-xs text-white/40">{state.musicHint}</span>
            )}
          </div>
        }
        right={<SocketBadge connected={connected} />}
      />

      {/* No state yet */}
      {!state && (
        <JonnyWaitingScreen theme={T} label="L'animatore inizializzerà la sfida da LiveControl" />
      )}

      {/* IDLE */}
      {state?.status === 'idle' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <NeonTitle text={state.challengeName} color={T.accent} size="lg" className="text-center" />
            <div className="mt-3 text-white/45 text-lg">Preparatevi! Durata: {state.duration}s</div>
          </motion.div>
          <motion.img src="/jonny-master.jpg" alt="Jonny"
            style={{ height: 180, mixBlendMode: 'multiply', filter: `drop-shadow(0 8px 32px ${T.glow}77)` }}
            animate={{ y: [0, -12, 0] }} transition={{ duration: 2.8, repeat: Infinity }} />
          <div className="flex gap-3 flex-wrap justify-center">
            {sorted.map((tm) => (
              <div key={tm.id} className="rounded-xl border px-4 py-2 text-center"
                style={{ borderColor: `${tm.color}55`, background: `${tm.color}12` }}>
                <div className="text-sm font-black" style={{ color: tm.color }}>{tm.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RUNNING */}
      {state?.status === 'running' && (
        <div className="relative z-10 flex flex-1 flex-col px-6">
          {/* Challenge title */}
          <motion.div className="text-center py-5"
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
            <NeonTitle text={state.challengeName} color={T.accent} size="md" className="text-center" />
          </motion.div>

          {/* Giant circular countdown */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <motion.div
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: 220, height: 220,
                background: `conic-gradient(${diff.color} ${timerPct * 3.6}deg, rgba(255,255,255,0.04) 0deg)`,
                boxShadow: `0 0 60px ${diff.color}55`,
              }}
              animate={{ boxShadow: [`0 0 40px ${diff.color}33`, `0 0 80px ${diff.color}77`, `0 0 40px ${diff.color}33`] }}
              transition={{ duration: 1.5, repeat: Infinity }}>
              <div className="flex items-center justify-center rounded-full bg-black/65"
                style={{ width: 180, height: 180 }}>
                <div className="text-display text-6xl font-black text-white tabular-nums">{Math.ceil(timeLeft)}</div>
              </div>
            </motion.div>
            {timeLeft <= 10 && timeLeft > 0 && (
              <motion.div className="mt-5 text-display text-2xl font-black" style={{ color: diff.color }}
                animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                Forza!
              </motion.div>
            )}
            {timeLeft === 0 && (
              <div className="mt-5 text-display text-2xl font-black text-white">Tempo!</div>
            )}
          </div>

          {/* Energy bars */}
          <div className="space-y-3 pb-4">
            {sorted.map((tm) => (
              <div key={tm.id} className="rounded-2xl border p-3"
                style={{ borderColor: `${tm.color}30`, background: `${tm.color}10` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
                    <span className="font-black text-white text-sm">{tm.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/40">{tm.energy}%</span>
                    <span className="text-display text-xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
                  </div>
                </div>
                <EnergyBar energy={tm.energy} color={tm.color} />
              </div>
            ))}
          </div>
        </div>
      )}
    </ArenaBg>
  );
}

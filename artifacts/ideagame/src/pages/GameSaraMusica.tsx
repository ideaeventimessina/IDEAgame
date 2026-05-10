import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { Music2, Zap, Clock, Volume2 } from 'lucide-react';
import { useGameAudio } from '@/hooks/useGameAudio';

interface SaraMusicaTrack {
  id: string; title: string; artist: string;
  challengeType: 'indovina' | 'canta' | 'rumore';
  snippetHint: string; audioUrl: string | null;
  durationSeconds: number; points: number;
}
interface SaraMusicaTeam { id: string; name: string; color: string; score: number; }
interface SaraMusicaState {
  setId: string; setName: string;
  currentTrack: SaraMusicaTrack | null;
  activeTeamId: string | null;
  teams: SaraMusicaTeam[];
  status: 'idle' | 'playing' | 'ended';
  trackStartedAt: string | null;
  noiseLevel: number;
  usedTrackIds: string[];
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

const CHALLENGE_LABEL: Record<string, string> = {
  indovina: '🎵 Indovina il brano',
  canta: '🎤 Cantate!',
  rumore: '📣 Fate più rumore!',
};
const CHALLENGE_COLOR: Record<string, string> = {
  indovina: '#8b5cf6',
  canta: '#ec4899',
  rumore: '#f97316',
};

export default function GameSaraMusica() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sessionId = params.get('s') ?? '';
  const eventId = params.get('e') ?? '';

  const [state, setState] = useState<SaraMusicaState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState('');

  const { on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);
  const { playLoop, playStinger } = useGameAudio('saramusica', { autoLoop: 'round_loop' });

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const d = await apiFetch(`/saramusica/sessions/${sessionId}/state`);
    if (d && !d.error) setState(d as SaraMusicaState);
  }, [sessionId]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: SaraMusicaState }>('saramusica:started',       ({ state: s }) => { setState(s); setElapsed(0); }),
      on<{ state: SaraMusicaState }>('saramusica:track_changed', ({ state: s }) => { setState(s); setElapsed(0); setFlash(''); }),
      on<{ state: SaraMusicaState }>('saramusica:noise',         ({ state: s }) => setState(s)),
      on<{ state: SaraMusicaState }>('saramusica:score_updated', ({ state: s }) => {
        setState(s);
        setFlash('⭐ Punti assegnati!');
        setTimeout(() => setFlash(''), 3000);
      }),
      on<{ state: SaraMusicaState }>('saramusica:ended', ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  useEffect(() => {
    if (!state?.trackStartedAt || state.status !== 'playing') { setElapsed(0); return; }
    const update = () => setElapsed((Date.now() - new Date(state.trackStartedAt!).getTime()) / 1000);
    update();
    const i = setInterval(update, 250);
    return () => clearInterval(i);
  }, [state?.trackStartedAt, state?.status]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(248_70%_4%)]">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
          className="text-display text-xl font-black text-muted-foreground">Caricamento…</motion.div>
      </div>
    );
  }

  const sortedTeams = [...(state.teams ?? [])].sort((a, b) => b.score - a.score);
  const activeTeam = state.teams.find(t => t.id === state.activeTeamId);
  const track = state.currentTrack;
  const challengeColor = CHALLENGE_COLOR[track?.challengeType ?? 'indovina'] ?? '#8b5cf6';
  const timeLeft = track ? Math.max(0, track.durationSeconds - elapsed) : 0;
  const progressPct = track ? Math.min(100, (elapsed / track.durationSeconds) * 100) : 0;
  const noisePct = Math.max(0, Math.min(100, state.noiseLevel));

  /* ── ENDED ── */
  if (state.status === 'ended') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 bg-[hsl(248_70%_4%)] px-12 text-white">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 120 }}
          className="text-6xl">🏆</motion.div>
        <div className="text-display text-4xl font-black text-center">SaraMusica — Fine!</div>
        <div className="w-full max-w-lg space-y-4">
          {sortedTeams.map((tm, i) => (
            <motion.div key={tm.id} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="flex items-center gap-4 rounded-2xl border px-6 py-4"
              style={{ borderColor: `${tm.color}55`, background: `${tm.color}15` }}>
              <span className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
              <span className="flex-1 text-display text-xl font-black" style={{ color: tm.color }}>{tm.name}</span>
              <span className="text-display text-3xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  /* ── IDLE ── */
  if (state.status === 'idle' || !track) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[hsl(248_70%_4%)] text-white">
        <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}
          className="text-8xl">🎵</motion.div>
        <div className="text-display text-4xl font-black text-center" style={{ color: '#a78bfa' }}>SaraMusica</div>
        <div className="text-lg text-muted-foreground">{state.setName}</div>
        <div className="text-sm text-muted-foreground/60 animate-pulse">In attesa dell'animatore…</div>
        {sortedTeams.length > 0 && (
          <div className="mt-8 flex gap-8">
            {sortedTeams.map(tm => (
              <div key={tm.id} className="text-center">
                <div className="text-display text-3xl font-black" style={{ color: tm.color }}>{tm.score}</div>
                <div className="text-sm text-muted-foreground mt-1">{tm.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── PLAYING ── */
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[hsl(248_70%_4%)] text-white select-none">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 opacity-25 transition-all duration-1000"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${challengeColor} 0%, transparent 65%)` }} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-10 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Music2 className="h-6 w-6" style={{ color: challengeColor }} />
          <span className="text-display text-xl font-black tracking-widest uppercase opacity-80">SaraMusica</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{state.setName}</span>
          <span className="opacity-40">·</span>
          <span>{state.usedTrackIds.length} usate</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-10 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div className="h-full rounded-full transition-colors duration-500"
          animate={{ width: `${progressPct}%` }} transition={{ duration: 0.25 }}
          style={{ background: progressPct > 66 ? '#ef4444' : progressPct > 33 ? '#eab308' : challengeColor }} />
      </div>

      {/* Flash */}
      <AnimatePresence>
        {flash && (
          <motion.div key={flash} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-auto mt-3 rounded-2xl border px-8 py-2 text-center text-xl font-black"
            style={{ borderColor: `${challengeColor}55`, background: `${challengeColor}20`, color: challengeColor }}>
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="relative z-10 flex flex-1 min-h-0 gap-8 px-10 py-6">

        {/* Left — Challenge */}
        <div className="flex flex-[3] flex-col justify-center gap-6">

          {/* Challenge badge */}
          <motion.div key={track.id + '-badge'} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="inline-flex items-center gap-3 rounded-2xl px-5 py-2.5 text-xl font-black"
              style={{ background: `${challengeColor}25`, border: `2px solid ${challengeColor}`, color: challengeColor }}>
              {CHALLENGE_LABEL[track.challengeType]}
              <span className="ml-2 text-lg opacity-80">+{track.points} pt</span>
            </div>
          </motion.div>

          {/* Active team spotlight */}
          {activeTeam && (
            <motion.div key={activeTeam.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4">
              <div className="h-5 w-5 rounded-full" style={{ background: activeTeam.color }} />
              <div className="text-display text-2xl font-black" style={{ color: activeTeam.color }}>
                {activeTeam.name}
              </div>
            </motion.div>
          )}

          {/* Track title — revealed only for canta/rumore, hidden for indovina */}
          {track.challengeType !== 'indovina' ? (
            <motion.div key={track.id + '-title'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-display text-6xl font-black leading-tight">{track.title}</div>
              <div className="mt-2 text-2xl text-muted-foreground font-bold">{track.artist}</div>
            </motion.div>
          ) : (
            <motion.div key={track.id + '-hint'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-display text-3xl font-black text-muted-foreground">❓ ❓ ❓</div>
              {track.snippetHint && (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-8 py-5">
                  <div className="text-2xl font-bold italic text-center text-white/90">"{track.snippetHint}"</div>
                </div>
              )}
            </motion.div>
          )}

          {/* Timer */}
          <div className="flex items-center gap-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
              <motion.div className="h-full rounded-full"
                animate={{ width: `${progressPct}%` }} transition={{ duration: 0.25 }}
                style={{ background: progressPct > 75 ? '#ef4444' : progressPct > 40 ? '#eab308' : '#22c55e' }} />
            </div>
            <span className="text-display text-3xl font-black tabular-nums w-16 text-right">{Math.ceil(timeLeft)}s</span>
          </div>

          {/* Noise bar (shown for rumore/canta) */}
          {(track.challengeType === 'rumore' || track.challengeType === 'canta') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Volume2 className="h-4 w-4" /> Energia
              </div>
              <div className="relative h-8 rounded-full bg-white/10 overflow-hidden">
                <motion.div className="absolute inset-y-0 left-0 rounded-full"
                  animate={{ width: `${noisePct}%` }} transition={{ duration: 0.1 }}
                  style={{ background: noisePct > 70 ? '#22c55e' : noisePct > 35 ? '#eab308' : '#f97316' }} />
                <div className="absolute inset-0 flex items-center justify-end pr-4">
                  <span className="text-display text-lg font-black">{Math.round(noisePct)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right — Scores */}
        <div className="flex flex-[1] flex-col gap-3 justify-center min-w-[220px]">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Classifica
          </div>
          {sortedTeams.map((tm, i) => (
            <motion.div key={tm.id}
              animate={tm.id === state.activeTeamId ? { scale: [1, 1.03, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all"
              style={{
                borderColor: tm.id === state.activeTeamId ? tm.color : `${tm.color}44`,
                background: tm.id === state.activeTeamId ? `${tm.color}20` : `${tm.color}0d`,
                boxShadow: tm.id === state.activeTeamId ? `0 0 16px ${tm.color}44` : undefined,
              }}>
              <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
              <span className="flex-1 text-sm font-bold truncate" style={{ color: tm.id === state.activeTeamId ? tm.color : undefined }}>
                {tm.name}
              </span>
              <span className="text-display text-xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

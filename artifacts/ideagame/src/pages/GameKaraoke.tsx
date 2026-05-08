import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { Mic, Music, Users, Clock } from 'lucide-react';

interface KaraokeTrack {
  id: string; title: string; artist: string; lyricSnippet: string;
  audioUrl: string | null; durationSeconds: number; points: number;
  category: string; difficulty: string;
}
interface KaraokeBooking {
  id: string; playerId: string; nickname: string; teamId: string;
  teamName: string; teamColor: string;
  status: 'waiting' | 'active' | 'completed' | 'skipped'; orderIndex: number;
}
interface KaraokeTeam { id: string; name: string; color: string; score: number; }
interface KaraokeState {
  setId: string; setName: string; currentTrack: KaraokeTrack | null;
  bookings: KaraokeBooking[];
  teams: KaraokeTeam[];
  status: 'idle' | 'singing' | 'ended';
  trackStartedAt: string | null; usedTrackIds: string[];
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

const DIFF_COLOR: Record<string, string> = {
  easy: '#22c55e', medium: '#eab308', hard: '#ef4444',
};
const CAT_EMOJI: Record<string, string> = {
  pop: '🎤', rock: '🎸', dance: '💃', classica: '🎻',
  anni80: '📼', anni90: '💿', italiana: '🇮🇹', internazionale: '🌍',
};

export default function GameKaraoke() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sessionId = params.get('s') ?? '';
  const eventId = params.get('e') ?? '';

  const [state, setState] = useState<KaraokeState | null>(null);
  const [flashMsg, setFlashMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const { on } = useEventSocket(eventId || null);

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const d = await apiFetch(`/karaoke/sessions/${sessionId}/state`);
    if (d && !d.error) setState(d as KaraokeState);
  }, [sessionId]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: KaraokeState }>('karaoke:started',               ({ state: s }) => { setState(s); setFlashMsg(''); }),
      on<{ state: KaraokeState }>('karaoke:track_changed',          ({ state: s }) => { setState(s); setFlashMsg(''); setElapsed(0); }),
      on<{ state: KaraokeState }>('karaoke:booking_added',          ({ state: s }) => setState(s)),
      on<{ state: KaraokeState }>('karaoke:booking_removed',        ({ state: s }) => setState(s)),
      on<{ state: KaraokeState }>('karaoke:active_singer_changed',  ({ state: s }) => {
        setState(s);
        const p = s.bookings.find(b => b.status === 'active');
        if (p) { setFlashMsg(`🎤 ${p.nickname} sale sul palco!`); setTimeout(() => setFlashMsg(''), 4000); }
      }),
      on<{ state: KaraokeState }>('karaoke:score_updated',          ({ state: s }) => {
        setState(s);
        setFlashMsg('⭐ Punti assegnati!');
        setTimeout(() => setFlashMsg(''), 3000);
      }),
      on<{ state: KaraokeState }>('karaoke:ended',                  ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  // Elapsed timer
  useEffect(() => {
    if (!state?.trackStartedAt || state.status !== 'singing') { setElapsed(0); return; }
    const update = () => setElapsed((Date.now() - new Date(state.trackStartedAt!).getTime()) / 1000);
    update();
    const i = setInterval(update, 500);
    return () => clearInterval(i);
  }, [state?.trackStartedAt, state?.status]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(248_70%_4%)]">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
          className="text-display text-xl font-black text-muted-foreground">
          Caricamento…
        </motion.div>
      </div>
    );
  }

  const bookings = state.bookings ?? [];
  const activeSinger = bookings.find(b => b.status === 'active');
  const waitingQueue = bookings.filter(b => b.status === 'waiting').sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedTeams = [...(state.teams ?? [])].sort((a, b) => b.score - a.score);
  const track = state.currentTrack;
  const progressPct = track ? Math.min(100, (elapsed / track.durationSeconds) * 100) : 0;
  const timeLeft = track ? Math.max(0, track.durationSeconds - elapsed) : 0;

  /* ── ENDED screen ── */
  if (state.status === 'ended') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 bg-[hsl(248_70%_4%)] px-12 text-white">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 120 }}
          className="text-6xl">🏆</motion.div>
        <div className="text-display text-4xl font-black text-center">Karaoke Battle — Fine!</div>
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

  /* ── IDLE screen ── */
  if (state.status === 'idle' || !track) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[hsl(248_70%_4%)] text-white">
        <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 2.5 }}
          className="text-7xl">🎤</motion.div>
        <div className="text-display text-3xl font-black text-center text-primary">Karaoke Battle</div>
        <div className="text-lg text-muted-foreground">{state.setName}</div>
        <div className="text-sm text-muted-foreground/60 animate-pulse">In attesa dell'animatore…</div>
        {sortedTeams.length > 0 && (
          <div className="mt-8 flex gap-6">
            {sortedTeams.map(tm => (
              <div key={tm.id} className="text-center">
                <div className="text-display text-2xl font-black" style={{ color: tm.color }}>{tm.score}</div>
                <div className="text-xs text-muted-foreground mt-1">{tm.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── SINGING screen ── */
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[hsl(248_70%_4%)] text-white select-none">

      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(ellipse at 50% 0%, #ec4899 0%, transparent 60%)` }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-10 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Mic className="h-6 w-6 text-pink-400" />
          <div className="text-display text-xl font-black tracking-widest uppercase opacity-80">
            Karaoke Battle
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Music className="h-4 w-4" />
          <span>{state.setName}</span>
          <span className="opacity-40">·</span>
          <span>{state.usedTrackIds.length} / {state.usedTrackIds.length + waitingQueue.length + (activeSinger ? 1 : 0)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-10 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div className="h-full rounded-full bg-pink-500"
          animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }} />
      </div>

      {/* Flash message */}
      <AnimatePresence>
        {flashMsg && (
          <motion.div key={flashMsg} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-auto mt-3 rounded-2xl border border-pink-500/40 bg-pink-500/15 px-8 py-2 text-center text-xl font-black text-pink-300">
            {flashMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 min-h-0 gap-8 px-10 py-6">

        {/* Left — Track info + Lyrics */}
        <div className="flex flex-[3] flex-col justify-center gap-6">

          {/* Track header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{CAT_EMOJI[track.category] ?? '🎵'}</span>
              <span className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest border"
                style={{ color: DIFF_COLOR[track.difficulty], borderColor: `${DIFF_COLOR[track.difficulty]}55`, background: `${DIFF_COLOR[track.difficulty]}15` }}>
                {track.difficulty}
              </span>
              <span className="ml-auto text-display text-2xl font-black text-pink-400">+{track.points} pt</span>
            </div>
            <motion.div key={track.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-display text-5xl font-black leading-tight text-white">
              {track.title}
            </motion.div>
            <div className="mt-2 text-2xl text-muted-foreground font-bold">{track.artist}</div>
          </div>

          {/* Lyrics */}
          {track.lyricSnippet && (
            <motion.div key={`lyrics-${track.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6">
              <div className="text-2xl font-bold leading-relaxed text-white/90 italic text-center">
                "{track.lyricSnippet}"
              </div>
            </motion.div>
          )}

          {/* Timer */}
          <div className="flex items-center gap-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
              <motion.div className="h-full rounded-full transition-colors"
                animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }}
                style={{ background: progressPct > 66 ? '#22c55e' : progressPct > 33 ? '#eab308' : '#ef4444' }} />
            </div>
            <span className="text-display text-xl font-black tabular-nums w-12 text-right">{Math.ceil(timeLeft)}s</span>
          </div>
        </div>

        {/* Right — Singer + Queue + Scores */}
        <div className="flex flex-[1] flex-col gap-4 min-w-[240px]">

          {/* Active singer */}
          <div className="rounded-2xl border-2 border-pink-500/60 bg-pink-500/10 px-5 py-4">
            <div className="text-xs uppercase tracking-widest text-pink-400 mb-2 flex items-center gap-2">
              <Mic className="h-3.5 w-3.5" /> Cantante
            </div>
            {activeSinger ? (
              <motion.div key={activeSinger.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-black text-background"
                    style={{ background: activeSinger.teamColor }}>
                    {activeSinger.nickname[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-display text-lg font-black">{activeSinger.nickname}</div>
                    <div className="text-xs text-muted-foreground">{activeSinger.teamName}</div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Nessuno selezionato</div>
            )}
          </div>

          {/* Waiting queue */}
          {waitingQueue.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 space-y-2">
              <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> In coda ({waitingQueue.length})
              </div>
              {waitingQueue.slice(0, 5).map((b, i) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.teamColor }} />
                  <span className="font-bold truncate">{b.nickname}</span>
                </div>
              ))}
              {waitingQueue.length > 5 && (
                <div className="text-xs text-muted-foreground">+{waitingQueue.length - 5} altri…</div>
              )}
            </div>
          )}

          {/* Team scores */}
          <div className="space-y-2 mt-auto">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Classifica</div>
            {sortedTeams.map((tm, i) => (
              <div key={tm.id} className="flex items-center gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: `${tm.color}44`, background: `${tm.color}11` }}>
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
                <span className="flex-1 text-sm font-bold truncate">{tm.name}</span>
                <span className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

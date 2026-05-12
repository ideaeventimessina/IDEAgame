import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { Mic, Users, Clock } from 'lucide-react';
import {
  ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium,
  SocketBadge, NeonTimerBar, ARENA,
} from '@/components/JonnyWorldTheme';
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

const T = ARENA.karaoke;

export default function GameKaraoke() {
  const params    = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sessionId = params.get('s') ?? '';
  const eventId   = params.get('e') ?? '';

  const [state, setState]     = useState<KaraokeState | null>(null);
  const [flashMsg, setFlashMsg] = useState('');
  const [elapsed, setElapsed]   = useState(0);
  // Chrome/desktop blocks autoplay until user gesture — operator must click once on the PC
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const d = await apiFetch(`/karaoke/sessions/${sessionId}/state`);
    if (d && !d.error) setState(d as KaraokeState);
  }, [sessionId]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: KaraokeState }>('karaoke:started',              ({ state: s }) => { setState(s); setFlashMsg(''); }),
      on<{ state: KaraokeState }>('karaoke:track_changed',         ({ state: s }) => { setState(s); setFlashMsg(''); setElapsed(0); }),
      on<{ state: KaraokeState }>('karaoke:booking_added',         ({ state: s }) => setState(s)),
      on<{ state: KaraokeState }>('karaoke:booking_removed',       ({ state: s }) => setState(s)),
      on<{ state: KaraokeState }>('karaoke:active_singer_changed', ({ state: s }) => {
        setState(s);
        const p = s.bookings.find(b => b.status === 'active');
        if (p) { setFlashMsg(`${p.nickname} sale sul palco!`); setTimeout(() => setFlashMsg(''), 4000); }
      }),
      on<{ state: KaraokeState }>('karaoke:score_updated', ({ state: s }) => {
        setState(s);
        setFlashMsg('Punti assegnati!');
        setTimeout(() => setFlashMsg(''), 3000);
      }),
      on<{ state: KaraokeState }>('karaoke:ended', ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  useEffect(() => {
    if (!state?.trackStartedAt || state.status !== 'singing') { setElapsed(0); return; }
    const update = () => setElapsed((Date.now() - new Date(state.trackStartedAt!).getTime()) / 1000);
    update();
    const i = setInterval(update, 500);
    return () => clearInterval(i);
  }, [state?.trackStartedAt, state?.status]);

  // When track changes and audio is already unlocked, force-play the video
  useEffect(() => {
    if (!audioUnlocked || !videoRef.current) return;
    const v = videoRef.current;
    v.load();
    void v.play().catch(() => {/* ignore if src not ready yet */});
  }, [state?.currentTrack?.id, audioUnlocked]);

  // Unlock handler: user clicks overlay → play a silent audio to unlock the audio context,
  // then immediately play the actual video if present
  const handleUnlock = () => {
    setAudioUnlocked(true);
    if (videoRef.current) {
      videoRef.current.muted = false;
      void videoRef.current.play().catch(() => {});
    }
  };

  if (!state) {
    return (
      <ArenaBg theme={T}>
        {!audioUnlocked && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={handleUnlock}>
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2 }}
              className="flex flex-col items-center gap-4">
              <div className="text-6xl">🔊</div>
              <div className="text-display text-3xl font-black text-white text-center">
                Clicca per attivare<br />l'audio del proiettore
              </div>
              <div className="text-sm text-white/50 text-center max-w-xs">
                Apri questa pagina sul <strong className="text-white/80">PC della regia</strong> e clicca una volta per sbloccare l'audio
              </div>
            </motion.div>
          </div>
        )}
        <JonnyWaitingScreen theme={T} label="Caricamento…" />
      </ArenaBg>
    );
  }

  if (state.status === 'ended') {
    const sorted = [...state.teams].sort((a, b) => b.score - a.score);
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={state.teams} winnerName={sorted[0]?.name ?? null} onHome={() => { window.location.href = '/'; }} />
      </ArenaBg>
    );
  }

  const bookings     = state.bookings ?? [];
  const activeSinger = bookings.find(b => b.status === 'active');
  const waitingQueue = bookings.filter(b => b.status === 'waiting').sort((a, b) => a.orderIndex - b.orderIndex);
  const track        = state.currentTrack;
  const progressPct  = track ? Math.min(100, (elapsed / track.durationSeconds) * 100) : 0;
  const timeLeft     = track ? Math.max(0, track.durationSeconds - elapsed) : 0;
  const progColor    = progressPct < 33 ? '#ef4444' : progressPct < 66 ? '#eab308' : '#22c55e';

  /* IDLE */
  if (state.status === 'idle' || !track) {
    return (
      <ArenaBg theme={T}>
        {!audioUnlocked && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
            onClick={handleUnlock}>
            <motion.div animate={{ scale: [1, 1.07, 1] }} transition={{ repeat: Infinity, duration: 2 }}
              className="flex flex-col items-center gap-4">
              <div className="text-6xl">🔊</div>
              <div className="text-display text-3xl font-black text-white text-center">
                Clicca per attivare<br />l'audio del proiettore
              </div>
              <div className="text-sm text-white/50 text-center max-w-xs">
                Apri questa pagina sul <strong className="text-white/80">PC della regia</strong> e clicca una volta
              </div>
            </motion.div>
          </div>
        )}
        <ArenaHeader theme={T} right={<SocketBadge connected={connected} />} />
        <JonnyWaitingScreen theme={T} subtitle={state.setName} label="In attesa dell'animatore…" />
        {state.teams.length > 0 && (
          <ArenaScoreBar teams={state.teams} accent={T.accent} />
        )}
      </ArenaBg>
    );
  }

  /* SINGING */
  return (
    <ArenaBg theme={T}>
      {/* Progress bar */}
      <NeonTimerBar pct={100 - progressPct} color={T.accent} />

      {/* Header */}
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <Mic className="h-4 w-4" style={{ color: T.accent }} />
            <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: T.accent }}>{T.title}</span>
            <span className="text-xs text-white/35">{state.setName}</span>
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">{state.usedTrackIds.length} brani usati</span>
            <SocketBadge connected={connected} />
          </div>
        }
      />

      {/* Flash */}
      <AnimatePresence>
        {flashMsg && (
          <motion.div key={flashMsg} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-auto mt-2 shrink-0 rounded-2xl border px-6 py-2 text-center text-lg font-black"
            style={{ borderColor: `${T.accent}55`, background: `${T.accent}15`, color: T.accent }}>
            {flashMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main — two-column on desktop */}
      <div className="flex flex-1 min-h-0 gap-6 px-8 py-5 overflow-hidden">

        {/* Left: Track info + YouTube + Lyrics */}
        <div className="flex flex-[3] flex-col justify-center gap-5">

          {/* Track header */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest"
                style={{ color: DIFF_COLOR[track.difficulty] ?? '#888', borderColor: `${DIFF_COLOR[track.difficulty] ?? '#888'}55`, background: `${DIFF_COLOR[track.difficulty] ?? '#888'}12` }}>
                {track.difficulty}
              </span>
              <span className="ml-auto text-display text-2xl font-black" style={{ color: T.accent }}>+{track.points} pt</span>
            </div>
            <motion.div key={track.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-display font-black leading-tight text-white"
              style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', textShadow: `0 0 40px ${T.glow}44` }}>
              {track.title}
            </motion.div>
            <div className="mt-2 text-xl text-white/50 font-bold">{track.artist}</div>
          </div>

          {/* Video/audio — plays ONLY here on the projector (PC) */}
          {track.audioUrl && (() => {
            const src = track.audioUrl.startsWith('/objects/')
              ? `/api/storage${track.audioUrl}`
              : track.audioUrl;
            return (
              <motion.div key={`vid-${track.id}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
                className="w-full rounded-2xl overflow-hidden border relative"
                style={{ borderColor: `${T.accent}25`, maxHeight: '280px' }}>
                <video
                  ref={videoRef}
                  key={src}
                  src={src}
                  muted={!audioUnlocked}
                  autoPlay={audioUnlocked}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  style={{ maxHeight: '280px' }}
                />
                {!audioUnlocked && (
                  <div className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                    onClick={handleUnlock}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-4xl">🔊</div>
                      <div className="text-white font-black text-sm">Clicca per attivare l'audio</div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })()}

          {/* Lyrics (show only if no audio/video attached) */}
          {track.lyricSnippet && !track.audioUrl && (
            <motion.div key={`lyrics-${track.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="rounded-3xl border px-8 py-6"
              style={{ borderColor: `${T.accent}25`, background: `${T.accent}08` }}>
              <div className="text-xl sm:text-2xl font-bold leading-relaxed text-white/80 italic text-center">
                "{track.lyricSnippet}"
              </div>
            </motion.div>
          )}

          {/* Timer */}
          <div className="flex items-center gap-4">
            <Clock className="h-4 w-4 text-white/35" />
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div className="h-full rounded-full"
                animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }}
                style={{ background: progColor, boxShadow: `0 0 10px ${progColor}66` }} />
            </div>
            <span className="text-display text-xl font-black tabular-nums w-14 text-right" style={{ color: progColor }}>
              {Math.ceil(timeLeft)}s
            </span>
          </div>
        </div>

        {/* Right: Singer + Queue + Scores */}
        <div className="flex flex-[1] flex-col gap-3 min-w-[200px] max-w-[260px]">

          {/* Active singer */}
          <div className="rounded-2xl border-2 px-4 py-4 shrink-0"
            style={{ borderColor: `${T.accent}77`, background: `${T.accent}10` }}>
            <div className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: `${T.accent}88` }}>
              <Mic className="h-3 w-3" /> Cantante
            </div>
            {activeSinger ? (
              <motion.div key={activeSinger.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-black text-black"
                    style={{ background: activeSinger.teamColor }}>
                    {activeSinger.nickname[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-display text-base font-black text-white">{activeSinger.nickname}</div>
                    <div className="text-xs text-white/40">{activeSinger.teamName}</div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="text-sm text-white/35 italic">Nessuno selezionato</div>
            )}
          </div>

          {/* Queue */}
          {waitingQueue.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/04 px-4 py-3 space-y-2 overflow-hidden">
              <div className="text-xs uppercase tracking-widest text-white/35 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> In coda ({waitingQueue.length})
              </div>
              {waitingQueue.slice(0, 5).map((b, i) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-white/30 w-4">{i + 1}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.teamColor }} />
                  <span className="font-bold text-white/70 truncate">{b.nickname}</span>
                </div>
              ))}
              {waitingQueue.length > 5 && (
                <div className="text-xs text-white/30">+{waitingQueue.length - 5} altri…</div>
              )}
            </div>
          )}

          {/* Scores */}
          <div className="mt-auto space-y-2">
            <div className="text-xs uppercase tracking-widest text-white/30 mb-1">Classifica</div>
            {[...state.teams].sort((a, b) => b.score - a.score).map((tm, i) => (
              <div key={tm.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
                style={{ borderColor: `${tm.color}44`, background: `${tm.color}10`, boxShadow: i === 0 ? `0 0 12px ${tm.color}22` : 'none' }}>
                <span className="text-xs text-white/30 w-4">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: tm.color }} />
                <span className="flex-1 text-sm font-bold text-white/70 truncate">{tm.name}</span>
                <span className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ArenaBg>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium, SocketBadge, NeonTimerBar, ARENA } from '@/components/JonnyWorldTheme';
import { useGameAudio } from '@/hooks/useGameAudio';

interface WordBackCard {
  id: string; word: string; hint: string | null; category: string;
  difficulty: string; points: number; timeLimit: number;
}
interface WordBackBooking {
  id: string; playerId: string; nickname: string; teamId: string;
  teamName: string; teamColor: string;
  status: 'waiting' | 'active' | 'completed' | 'skipped';
  orderIndex: number;
}
interface WordBackTeam { id: string; name: string; color: string; score: number; }
interface WordBackState {
  setId: string; setName: string; currentCard: WordBackCard | null;
  bookings: WordBackBooking[];
  teams: WordBackTeam[];
  status: 'idle' | 'running' | 'revealed' | 'ended';
  timerStartedAt: string | null; usedCardIds: string[];
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

const T = ARENA.wordback;

export default function GameWordBack() {
  const params    = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sessionId = params.get('s') ?? '';
  const eventId   = params.get('e') ?? '';

  const [state, setState] = useState<WordBackState | null>(null);
  const [flashMsg, setFlashMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);

  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);
  const { playLoop, playStinger } = useGameAudio('parola-alle-spalle', { autoLoop: 'lobby_loop' });

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const d = await apiFetch(`/word-back/sessions/${sessionId}/state`);
    if (d) setState(d as WordBackState);
  }, [sessionId]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: WordBackState }>('wordback:started',              ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:card_changed',          ({ state: s }) => { setState(s); setFlashMsg(''); }),
      on<{ state: WordBackState }>('wordback:booking_added',         ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:booking_removed',       ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:active_player_changed', ({ state: s }) => {
        setState(s);
        const p = s.bookings.find(b => b.status === 'active');
        if (p) setFlashMsg(`Tocca a ${p.nickname}!`);
      }),
      on<{ state: WordBackState }>('wordback:timer_started',         ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:timer_stopped',         ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:score_updated',         ({ state: s }) => {
        setState(s);
        setFlashMsg('Parola indovinata!');
        setTimeout(() => setFlashMsg(''), 2800);
      }),
      on<{ state: WordBackState }>('wordback:ended', ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  useEffect(() => {
    if (!state?.timerStartedAt || !state.currentCard) { setTimeLeft(0); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(state.timerStartedAt!).getTime()) / 1000;
      const left = Math.max(0, state.currentCard!.timeLimit - elapsed);
      setTimeLeft(left);
      if (left <= 0) setFlashMsg(prev => prev || 'Tempo scaduto!');
    };
    update();
    const i = setInterval(update, 500);
    return () => clearInterval(i);
  }, [state?.timerStartedAt, state?.currentCard]);

  if (!state) {
    return (
      <ArenaBg theme={T}>
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
  const activePlayer = bookings.find(b => b.status === 'active');
  const waitingQueue = bookings.filter(b => b.status === 'waiting');
  const sortedTeams  = [...state.teams].sort((a, b) => b.score - a.score);
  const timerPct     = state.currentCard && state.timerStartedAt
    ? Math.max(0, (timeLeft / state.currentCard.timeLimit) * 100) : 0;
  const timerColor   = timerPct > 50 ? '#22c55e' : timerPct > 20 ? '#eab308' : '#ef4444';
  const diffColor    = state.currentCard ? (DIFF_COLOR[state.currentCard.difficulty] ?? '#888') : T.accent;

  return (
    <ArenaBg theme={T}>
      {/* Timer bar */}
      {state.timerStartedAt && <NeonTimerBar pct={timerPct} color={timerColor} />}

      {/* Header */}
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: T.accent }}>{T.title}</span>
            {state.setName && <span className="text-xs text-white/35">{state.setName}</span>}
          </div>
        }
        right={<SocketBadge connected={connected} />}
      />

      {/* Flash */}
      <AnimatePresence>
        {flashMsg && (
          <motion.div key={flashMsg} initial={{ opacity: 0, scale: 0.85, y: -15 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }} className="absolute top-20 left-1/2 z-50 -translate-x-1/2 w-full max-w-lg px-4 pointer-events-none">
            <div className="rounded-3xl border-2 px-8 py-4 text-center text-display text-2xl font-black"
              style={{ borderColor: `${T.accent}77`, background: `${T.accent}18`, color: T.accent, backdropFilter: 'blur(14px)', boxShadow: `0 0 40px ${T.glow}44` }}>
              {flashMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex flex-1 flex-col items-center justify-center px-10 gap-6 overflow-hidden">

        {/* IDLE */}
        {state.status === 'idle' && (
          <JonnyWaitingScreen theme={T} subtitle="Chi vuole mimare? Prenota dal telefono!" label="In attesa dell'animatore…" />
        )}

        {/* RUNNING / REVEALED */}
        {(state.status === 'running' || state.status === 'revealed') && (
          <div className="flex flex-col items-center gap-6 w-full text-center">
            {/* Metadata */}
            {state.currentCard && (
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <div className="rounded-full border border-white/20 bg-white/08 px-4 py-1 text-sm font-bold uppercase tracking-widest text-white/60">
                  {state.currentCard.category}
                </div>
                <div className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest"
                  style={{ borderColor: `${diffColor}55`, color: diffColor, background: `${diffColor}12` }}>
                  {state.currentCard.difficulty}
                </div>
                <div className="text-sm font-black" style={{ color: T.accent }}>{state.currentCard.points} pt</div>
              </div>
            )}

            {/* THE WORD */}
            <AnimatePresence mode="wait">
              {state.currentCard && (
                <motion.div key={state.currentCard.id}
                  initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.15 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="text-center">
                  <div className="text-display font-black leading-none select-none"
                    style={{
                      fontSize: 'clamp(4rem, 12vw, 9rem)',
                      color: state.status === 'revealed' ? '#F5B642' : 'white',
                      textShadow: state.status === 'revealed'
                        ? '0 0 60px #F5B64266, 0 0 120px #F5B64233'
                        : `0 0 40px ${T.glow}22`,
                    }}>
                    {state.currentCard.word}
                  </div>
                  {state.currentCard.hint && (
                    <div className="mt-4 text-lg text-white/45 italic">{state.currentCard.hint}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timer big number */}
            {state.timerStartedAt && (
              <div className="text-display text-6xl font-black tabular-nums" style={{ color: timerColor }}>
                {Math.ceil(timeLeft)}s
              </div>
            )}

            {/* Active player */}
            {activePlayer && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 rounded-2xl border px-6 py-3"
                style={{ borderColor: `${activePlayer.teamColor}44`, background: `${activePlayer.teamColor}12`, backdropFilter: 'blur(12px)' }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-black text-display font-black text-lg"
                  style={{ background: activePlayer.teamColor }}>
                  {activePlayer.nickname[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Protagonista</div>
                  <div className="text-display text-xl font-black" style={{ color: activePlayer.teamColor }}>
                    {activePlayer.nickname}
                  </div>
                </div>
                <div className="rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: `${activePlayer.teamColor}55`, color: activePlayer.teamColor, background: `${activePlayer.teamColor}12` }}>
                  {activePlayer.teamName}
                </div>
              </motion.div>
            )}

            {!activePlayer && (
              <div className="text-lg text-white/35 italic">Chi vuole mimare? Prenota dal telefono!</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: queue + scores */}
      <div className="flex items-end justify-between px-8 pb-4 gap-6 shrink-0">
        {/* Queue */}
        <div className="flex-1">
          {waitingQueue.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: `${T.accent}66` }}>Prossimi</div>
              <div className="flex flex-wrap gap-2">
                {waitingQueue.slice(0, 5).map((b, i) => (
                  <div key={b.id} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/08 px-3 py-1.5">
                    <span className="text-xs text-white/40 font-bold">{i + 1}</span>
                    <div className="h-3.5 w-3.5 rounded-full" style={{ background: b.teamColor }} />
                    <span className="text-sm font-bold text-white/80">{b.nickname}</span>
                  </div>
                ))}
                {waitingQueue.length > 5 && (
                  <div className="flex items-center rounded-xl border border-white/15 bg-white/08 px-3 py-1.5 text-sm text-white/45">
                    +{waitingQueue.length - 5} altri
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Scores */}
        <div className="flex gap-3">
          {sortedTeams.map((tm, i) => (
            <div key={tm.id} className="flex flex-col items-center gap-1 rounded-2xl border px-4 py-2.5"
              style={{ borderColor: `${tm.color}${i === 0 ? '66' : '30'}`, background: `${tm.color}12`, boxShadow: i === 0 ? `0 0 16px ${tm.color}33` : 'none' }}>
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: tm.color }} />
              <div className="text-xs font-bold text-white/55 truncate max-w-[70px] text-center">{tm.name}</div>
              <div className="text-display text-2xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
            </div>
          ))}
        </div>
      </div>
    </ArenaBg>
  );
}

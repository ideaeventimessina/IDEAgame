import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';

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
const CATEGORY_EMOJI: Record<string, string> = {
  animali: '🐾', oggetti: '📦', film: '🎬', personaggi: '🎭',
  azioni: '⚡', mestieri: '👷', eventi: '🎉', 'parole assurde': '🤪',
};

export default function GameWordBack() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sessionId = params.get('s') ?? '';
  const eventId = params.get('e') ?? '';

  const [state, setState] = useState<WordBackState | null>(null);
  const [flashMsg, setFlashMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);

  const { on } = useEventSocket(eventId || null);

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const d = await apiFetch(`/word-back/sessions/${sessionId}/state`);
    if (d) setState(d as WordBackState);
  }, [sessionId]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: WordBackState }>('wordback:started', ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:card_changed', ({ state: s }) => { setState(s); setFlashMsg(''); }),
      on<{ state: WordBackState }>('wordback:booking_added', ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:booking_removed', ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:active_player_changed', ({ state: s }) => {
        setState(s);
        const p = s.bookings.find(b => b.status === 'active');
        if (p) setFlashMsg(`È il turno di ${p.nickname}!`);
      }),
      on<{ state: WordBackState }>('wordback:timer_started', ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:timer_stopped', ({ state: s }) => setState(s)),
      on<{ state: WordBackState }>('wordback:score_updated', ({ state: s }) => {
        setState(s);
        setFlashMsg('Parola indovinata! 🎉');
        setTimeout(() => setFlashMsg(''), 3000);
      }),
      on<{ state: WordBackState }>('wordback:ended', ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  // Timer countdown
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
      <div className="flex h-screen items-center justify-center bg-[hsl(248_70%_4%)]">
        <div className="text-display text-xl font-black text-muted-foreground animate-pulse">
          Caricamento…
        </div>
      </div>
    );
  }

  const bookings = state.bookings ?? [];
  const activePlayer = bookings.find(b => b.status === 'active');
  const waitingQueue = bookings.filter(b => b.status === 'waiting');
  const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);
  const timerPct = state.currentCard && state.timerStartedAt
    ? Math.max(0, (timeLeft / state.currentCard.timeLimit) * 100)
    : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 20 ? '#eab308' : '#ef4444';

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[hsl(248_70%_4%)] text-white select-none">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-10 pt-6 pb-2">
        <div className="text-display text-xl font-black tracking-widest opacity-60 uppercase">
          Parola alle Spalle
        </div>
        <div className="text-xs font-bold uppercase tracking-widest opacity-40">{state.setName}</div>
      </div>

      {/* ── Timer bar ── */}
      {state.timerStartedAt && (
        <div className="mx-10 h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div className="h-full rounded-full"
            animate={{ width: `${timerPct}%` }}
            transition={{ duration: 0.5 }}
            style={{ background: timerColor }}
          />
        </div>
      )}

      {/* ── Main word area ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-10 gap-6">

        {/* Flash message */}
        <AnimatePresence>
          {flashMsg && (
            <motion.div
              key={flashMsg}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-50 rounded-3xl border border-primary/60 bg-primary/20 px-8 py-4 text-display text-2xl font-black text-primary backdrop-blur-md text-center"
            >
              {flashMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {state.status === 'idle' && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🎮</div>
            <div className="text-display text-3xl font-black text-muted-foreground">
              In attesa dell'animatore…
            </div>
            <div className="text-lg text-muted-foreground">
              Chi vuole mimare? Tocca il telefono per prenotarti!
            </div>
          </div>
        )}

        {(state.status === 'running' || state.status === 'revealed') && (
          <>
            {/* Category badge */}
            {state.currentCard && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">{CATEGORY_EMOJI[state.currentCard.category] ?? '🎯'}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1 text-sm font-bold uppercase tracking-widest text-white/70">
                  {state.currentCard.category}
                </span>
                <span className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest"
                  style={{ borderColor: `${DIFF_COLOR[state.currentCard.difficulty]}60`, color: DIFF_COLOR[state.currentCard.difficulty], background: `${DIFF_COLOR[state.currentCard.difficulty]}15` }}>
                  {state.currentCard.difficulty}
                </span>
                <span className="text-sm font-bold text-primary">{state.currentCard.points} pt</span>
              </div>
            )}

            {/* THE WORD — giant */}
            <AnimatePresence mode="wait">
              {state.currentCard && (
                <motion.div
                  key={state.currentCard.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="text-center"
                >
                  <div className="text-display font-black leading-none"
                    style={{ fontSize: 'clamp(4rem, 12vw, 9rem)', color: state.status === 'revealed' ? '#f5b642' : 'white',
                      textShadow: state.status === 'revealed' ? '0 0 60px #f5b64266' : '0 4px 40px rgba(0,0,0,0.5)' }}>
                    {state.currentCard.word}
                  </div>
                  {state.currentCard.hint && (
                    <div className="mt-4 text-lg text-white/50 italic">💡 {state.currentCard.hint}</div>
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
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 backdrop-blur-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-background text-display font-black"
                  style={{ background: activePlayer.teamColor }}>
                  {activePlayer.nickname[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-sm text-white/60 uppercase tracking-widest font-bold">Protagonista</div>
                  <div className="text-display text-xl font-black" style={{ color: activePlayer.teamColor }}>
                    {activePlayer.nickname}
                  </div>
                </div>
                <div className="ml-2 rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: `${activePlayer.teamColor}60`, color: activePlayer.teamColor, background: `${activePlayer.teamColor}15` }}>
                  {activePlayer.teamName}
                </div>
              </motion.div>
            )}

            {!activePlayer && (
              <div className="text-lg text-white/40 italic">
                Chi vuole mimare? Prenota dal telefono! 📱
              </div>
            )}
          </>
        )}

        {state.status === 'ended' && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🏆</div>
            <div className="text-display text-4xl font-black text-primary">Gioco terminato!</div>
            <div className="text-lg text-muted-foreground">Classifica finale</div>
          </div>
        )}
      </div>

      {/* ── Bottom: queue + scores ── */}
      <div className="flex items-end justify-between px-10 pb-6 gap-6">

        {/* Queue — next mimes */}
        <div className="flex-1">
          {waitingQueue.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Prossimi mimi</div>
              <div className="flex flex-wrap gap-2">
                {waitingQueue.slice(0, 5).map((b, i) => (
                  <div key={b.id} className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5">
                    <span className="text-xs text-white/50 font-bold">{i + 1}</span>
                    <div className="h-4 w-4 rounded-full" style={{ background: b.teamColor }} />
                    <span className="text-sm font-bold">{b.nickname}</span>
                  </div>
                ))}
                {waitingQueue.length > 5 && (
                  <div className="flex items-center rounded-xl border border-white/20 bg-white/10 px-3 py-1.5">
                    <span className="text-sm text-white/50">+{waitingQueue.length - 5} altri</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {waitingQueue.length === 0 && state.status === 'running' && (
            <div className="text-sm text-white/30 italic">Nessun mimo in attesa — prenota dal telefono!</div>
          )}
        </div>

        {/* Team scores */}
        <div className="flex gap-4">
          {sortedTeams.map((tm, i) => (
            <div key={tm.id} className="flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/10 px-5 py-3">
              <div className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
              <div className="text-xs font-bold text-white/60 truncate max-w-[80px] text-center">{i === 0 ? '👑 ' : ''}{tm.name}</div>
              <div className="text-display text-2xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

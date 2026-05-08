import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Trophy, Clock, BarChart3, Users } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface QuizzoneState {
  sessionId: string;
  packId?: string;
  roundIndex?: number;
  type?: string;
  questionText?: string;
  answers?: string[];
  timeLimit?: number;
  points?: number;
  difficulty?: string;
  questionStartedAt?: string;
  totalRounds?: number;
  hasQuestion: boolean;
  status: string;
  responseCount?: number;
}

interface RevealState {
  roundIndex: number;
  correctAnswer: number;
  explanation: string;
  scores: { teamId: string; name: string; color: string; roundPoints: number; total: number }[];
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Scelta multipla',
  true_false: 'Vero/Falso',
  image_compare: 'Confronto',
  guess_who: 'Indovina chi',
  fast_answer: 'Risposta rapida',
  bonus_final: '🏆 Bonus Finale',
};

const DIFF_COLORS: Record<string, string> = {
  easy: '#22c55e',
  medium: '#eab308',
  hard: '#ef4444',
};

const LETTER = ['A', 'B', 'C', 'D', 'E'];

export default function GameQuizzone() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [state, setState] = useState<QuizzoneState | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [responseCount, setResponseCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, on } = useEventSocket(eventId || null);

  // Start countdown from questionStartedAt + timeLimit
  const startCountdown = useCallback((questionStartedAt: string, timeLimit: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const update = () => {
      const elapsed = (Date.now() - new Date(questionStartedAt).getTime()) / 1000;
      const left = Math.max(0, timeLimit - elapsed);
      setTimeLeft(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    };
    update();
    timerRef.current = setInterval(update, 200);
  }, []);

  // Fetch state from API
  const fetchState = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await apiFetch(`/quizzone/sessions/${sessionId}/state`) as QuizzoneState & { status: string };
      setState(s);
      if (s.status === 'ended') setGameEnded(true);
      if (!eventId && eventIdParam) setEventId(eventIdParam);
      if (s.hasQuestion && s.questionStartedAt && s.timeLimit && !reveal) {
        startCountdown(s.questionStartedAt, s.timeLimit);
      }
      if (s.responseCount !== undefined) setResponseCount(s.responseCount);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sessionId, eventId, eventIdParam, reveal, startCountdown]);

  useEffect(() => { void fetchState(); }, [fetchState]);

  // Socket events
  useEffect(() => {
    if (!sessionId) return;

    const unsubs = [
      on<QuizzoneState & { sessionId: string }>('quiz:question', (data) => {
        if (data.sessionId !== sessionId) return;
        setReveal(null);
        setState(prev => ({ ...prev!, ...data, hasQuestion: true }));
        if (data.questionStartedAt && data.timeLimit) {
          startCountdown(data.questionStartedAt, data.timeLimit);
        }
        setResponseCount(0);
      }),
      on<{ sessionId: string; roundIndex: number; correctAnswer: number; explanation: string; scores: RevealState['scores'] }>
        ('quiz:reveal', (data) => {
          if (data.sessionId !== sessionId) return;
          setReveal({ roundIndex: data.roundIndex, correctAnswer: data.correctAnswer, explanation: data.explanation, scores: data.scores });
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeLeft(0);
        }),
      on<{ count: number; sessionId: string }>('quiz:answer_received', (data) => {
        if (data.sessionId !== sessionId) return;
        setResponseCount(data.count);
      }),
      on<{ sessionId: string }>('quiz:ended', (data) => {
        if (data.sessionId !== sessionId) return;
        setGameEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }),
    ];
    return () => { unsubs.forEach(u => u()); };
  }, [sessionId, on, startCountdown]);

  // Polling fallback
  useEffect(() => {
    pollRef.current = setInterval(() => { void fetchState(); }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const timerPct = state?.timeLimit ? (timeLeft / state.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-lg">Caricamento Quizzone…</div>
      </div>
    );
  }

  // Game ended → Final podium
  if (gameEnded) {
    const sorted = [...(reveal?.scores ?? [])].sort((a, b) => b.total - a.total);
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 p-8"
           style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 10%), hsl(248 70% 3%))' }}>
        <div className="text-center">
          <div className="text-display text-5xl font-black text-primary">🏆 Fine Quiz</div>
          <div className="text-muted-foreground mt-2 text-xl">Classifica finale</div>
        </div>
        <div className="flex items-end gap-6">
          {sorted.slice(0, 3).map((team, i) => {
            const heights = ['h-48', 'h-40', 'h-32'];
            const medals = ['🥇', '🥈', '🥉'];
            const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd on screen
            const displayIdx = podiumOrder.indexOf(i);
            return (
              <motion.div key={team.teamId}
                initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: (displayIdx) * 0.2 + 0.3 }}
                style={{ order: podiumOrder[i] }}
                className={`flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 pt-4 sm:px-10 sm:pt-6 ${heights[i]}`}>
                <div className="text-4xl">{medals[i]}</div>
                <div className="text-display text-2xl font-black" style={{ color: team.color }}>{team.name}</div>
                <div className="text-display text-4xl font-black text-white">{team.total}</div>
                <div className="text-xs text-muted-foreground">punti</div>
              </motion.div>
            );
          })}
        </div>
        <button onClick={() => navigate('/')}
          className="mt-4 rounded-xl border border-border px-8 py-3 text-muted-foreground hover:bg-card">
          Torna alla home
        </button>
      </div>
    );
  }

  // Waiting for first question
  if (!state?.hasQuestion) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8"
           style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 10%), hsl(248 70% 3%))' }}>
        <div className="text-display text-6xl font-black">
          <span className="text-primary">QUIZ</span><span className="text-white">ZONE</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground text-xl">
          {connected ? <Wifi className="h-5 w-5 text-green-400" /> : <WifiOff className="h-5 w-5 text-amber-400 animate-pulse" />}
          In attesa dell&apos;animatore…
        </div>
      </div>
    );
  }

  const { type = 'multiple_choice', questionText = '', answers = [], timeLimit = 30,
          points = 100, difficulty = 'medium', roundIndex = 0, totalRounds = 20 } = state;

  return (
    <div className="h-screen flex flex-col overflow-hidden"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 10%), hsl(248 70% 3%))' }}>

      {/* ─── Timer bar ─────────────────────────────────────────────────────── */}
      <div className="h-2 w-full bg-border/30 flex-shrink-0">
        <motion.div className="h-full rounded-r-full transition-none"
          animate={{ width: `${timerPct}%` }} transition={{ duration: 0.1 }}
          style={{ background: timerColor }} />
      </div>

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className={`rounded-full border px-3 py-1 text-sm font-bold text-${TYPE_LABELS[type] ? 'primary' : 'muted-foreground'} border-primary/30 bg-primary/10`}>
            {TYPE_LABELS[type] ?? type}
          </span>
          <span className="text-xs text-muted-foreground" style={{ color: DIFF_COLORS[difficulty] ?? '#888' }}>
            {difficulty}
          </span>
        </div>

        <div className="flex items-center gap-6">
          {/* Response count */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {responseCount} risposte
          </div>
          {/* Points */}
          <div className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-bold text-primary">{points} pt</span>
          </div>
          {/* Timer */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-display text-3xl font-black tabular-nums"
              style={{ color: timerColor }}>{Math.ceil(timeLeft)}</span>
          </div>
          {/* Round */}
          <span className="text-sm text-muted-foreground">
            {roundIndex + 1}/{totalRounds}
          </span>
          {/* Socket */}
          {connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-amber-400 animate-pulse" />}
        </div>
      </div>

      {/* ─── Question ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 pb-8 sm:gap-8 sm:px-12">
        <AnimatePresence mode="wait">
          <motion.div key={`q-${roundIndex}`}
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-center max-w-5xl">
            <div className="text-display text-4xl font-black leading-tight text-white md:text-5xl lg:text-6xl">
              {questionText}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ─── Answers ─────────────────────────────────────────────────────── */}
        {type !== 'fast_answer' && (
          <div className={`grid w-full max-w-5xl gap-4 ${answers.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {answers.map((ans, i) => {
              const isRevealed = reveal !== null && reveal.roundIndex === roundIndex;
              const isCorrect = isRevealed && i === reveal!.correctAnswer;
              const isWrong = isRevealed && i !== reveal!.correctAnswer;

              const bg = isCorrect
                ? 'border-green-400 bg-green-400/20'
                : isWrong
                ? 'border-border/30 bg-white/3 opacity-40'
                : 'border-white/15 bg-white/5 hover:bg-white/8';

              return (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className={`relative flex items-center gap-5 rounded-2xl border-2 px-8 py-6 transition-all ${bg}`}>
                  <span className="text-display text-3xl font-black text-white/50">{LETTER[i]}</span>
                  <span className="text-display text-2xl font-bold text-white leading-snug">{ans}</span>
                  {isCorrect && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute right-6 text-4xl">✅</motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {type === 'fast_answer' && (
          <div className="rounded-2xl border-2 border-yellow-400/30 bg-yellow-400/5 px-5 py-5 text-center sm:px-12 sm:py-6">
            <div className="text-display text-2xl font-bold text-yellow-400">Risposta libera — microfono!</div>
          </div>
        )}

        {/* ─── Post-reveal: explanation + scoreboard ───────────────────────── */}
        <AnimatePresence>
          {reveal && reveal.roundIndex === roundIndex && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl space-y-4">
              {reveal.explanation && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-center text-muted-foreground italic">
                  {reveal.explanation}
                </div>
              )}
              {/* Mini scoreboard */}
              {reveal.scores.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/3 px-8 py-5">
                  <div className="flex items-center gap-2 mb-4 text-xs uppercase tracking-widest text-muted-foreground">
                    <Trophy className="h-3.5 w-3.5" /> Classifica parziale
                  </div>
                  <div className="flex gap-6 justify-center flex-wrap">
                    {[...reveal.scores].sort((a, b) => b.total - a.total).map(t => (
                      <div key={t.teamId} className="text-center">
                        <div className="h-3 w-3 rounded-full mx-auto mb-1" style={{ background: t.color }} />
                        <div className="text-display text-2xl font-black" style={{ color: t.color }}>{t.total}</div>
                        <div className="text-xs text-muted-foreground">{t.name}</div>
                        {t.roundPoints > 0 && (
                          <div className="text-xs text-green-400 font-bold">+{t.roundPoints}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

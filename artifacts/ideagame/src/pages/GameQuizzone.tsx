import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, BarChart3 } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { useGameAudio } from '@/hooks/useGameAudio';
import { ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium, SocketBadge, FlashOverlay, NeonTimerBar, ARENA } from '@/components/JonnyWorldTheme';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface QuizzoneState {
  sessionId: string; packId?: string; roundIndex?: number; type?: string;
  questionText?: string; answers?: string[]; timeLimit?: number; points?: number;
  difficulty?: string; questionStartedAt?: string; totalRounds?: number;
  hasQuestion: boolean; status: string; responseCount?: number;
}
interface RevealState {
  roundIndex: number; correctAnswer: number; explanation: string;
  scores: { teamId: string; name: string; color: string; roundPoints: number; total: number }[];
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Scelta multipla', true_false: 'Vero / Falso',
  image_compare: 'Confronto', guess_who: 'Indovina chi',
  fast_answer: 'Risposta rapida', bonus_final: 'Bonus Finale',
};
const DIFF_COLORS: Record<string, string> = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };
const LETTER = ['A', 'B', 'C', 'D', 'E'];
const T = ARENA.quizzone;

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
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);
  const { playLoop, playStinger } = useGameAudio('quizzone', { autoLoop: 'lobby_loop' });

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

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<QuizzoneState & { sessionId: string }>('quiz:question', (data) => {
        setReveal(null);
        setState(prev => ({ ...prev!, ...data, hasQuestion: true }));
        if (data.questionStartedAt && data.timeLimit) startCountdown(data.questionStartedAt, data.timeLimit);
        setResponseCount(0);
        setGameEnded(false);
        playLoop('tension_loop');
      }),
      on<{ sessionId: string }>('quiz:started', () => {
        setState(prev => prev ? { ...prev, status: 'running' } : null);
      }),
      on<{ sessionId: string; roundIndex: number; correctAnswer: number; explanation: string; scores: RevealState['scores'] }>(
        'quiz:reveal', (data) => {
          setReveal({ roundIndex: data.roundIndex, correctAnswer: data.correctAnswer, explanation: data.explanation, scores: data.scores });
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeLeft(0);
          playStinger('score_stinger');
          playLoop('round_loop');
        }),
      on<{ count: number; sessionId: string }>('quiz:answer_received', (data) => {
        setResponseCount(data.count);
      }),
      on<{ sessionId: string }>('quiz:ended', () => {
        setGameEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
        playStinger('winner_stinger');
      }),
      // Also handle force-end from LiveControl (PATCH session → status:ended emits game:ended)
      on('game:ended', () => {
        setGameEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }),
    ];
    return () => { unsubs.forEach(u => u()); };
  }, [eventId, on, startCountdown]);

  useEffect(() => {
    pollRef.current = setInterval(() => { void fetchState(); }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const timerPct   = state?.timeLimit ? (timeLeft / state.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';

  if (loading) {
    return (
      <ArenaBg theme={T}>
        <JonnyWaitingScreen theme={T} label="Caricamento arena…" />
      </ArenaBg>
    );
  }

  if (gameEnded) {
    const scores = [...(reveal?.scores ?? [])].sort((a, b) => b.total - a.total);
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={scores.map(s => ({ id: s.teamId, name: s.name, color: s.color, score: s.total }))}
          winnerName={scores[0]?.name ?? null} onHome={() => navigate('/')} />
      </ArenaBg>
    );
  }

  if (!state?.hasQuestion) {
    return (
      <ArenaBg theme={T}>
        <ArenaHeader theme={T} right={<SocketBadge connected={connected} />} />
        <JonnyWaitingScreen theme={T} label="In attesa dell'animatore…" />
      </ArenaBg>
    );
  }

  const { type = 'multiple_choice', questionText = '', answers = [], timeLimit = 30,
          points = 100, difficulty = 'medium', roundIndex = 0, totalRounds = 20 } = state;

  return (
    <ArenaBg theme={T}>
      {/* Timer bar */}
      <NeonTimerBar pct={timerPct} color={timerColor} />

      {/* Header */}
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <span className="rounded-full border px-3 py-1 text-xs font-black"
              style={{ color: T.accent, borderColor: `${T.accent}44`, background: `${T.accent}12` }}>
              {TYPE_LABELS[type] ?? type}
            </span>
            <span className="text-xs font-bold" style={{ color: DIFF_COLORS[difficulty] ?? '#888' }}>{difficulty}</span>
          </div>
        }
        right={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-white/50">
              <Users className="h-3.5 w-3.5" /> {responseCount}
            </div>
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1"
              style={{ borderColor: `${T.accent}44`, background: `${T.accent}12` }}>
              <BarChart3 className="h-3 w-3" style={{ color: T.accent }} />
              <span className="text-sm font-black" style={{ color: T.accent }}>{points} pt</span>
            </div>
            <div className="text-display font-black tabular-nums text-2xl" style={{ color: timerColor }}>
              {Math.ceil(timeLeft)}
            </div>
            <span className="text-xs text-white/35">{roundIndex + 1}/{totalRounds}</span>
            <SocketBadge connected={connected} />
          </div>
        }
      />

      {/* Question */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-6 sm:gap-8 sm:px-12 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={`q-${roundIndex}`}
            initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-center max-w-5xl w-full">
            <div className="text-display text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl xl:text-6xl"
              style={{ textShadow: `0 0 40px ${T.accent}33` }}>
              {questionText}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Answers — pointer-events-none: TV/projector is display-only, not interactive */}
        {type !== 'fast_answer' && (
          <div className="grid w-full max-w-5xl gap-3 grid-cols-2 pointer-events-none select-none">
            {answers.map((ans, i) => {
              const isRevealed = reveal !== null && reveal.roundIndex === roundIndex;
              const isCorrect  = isRevealed && i === reveal!.correctAnswer;
              const isWrong    = isRevealed && i !== reveal!.correctAnswer;
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className="relative flex items-center gap-4 rounded-2xl border-2 px-6 py-5 transition-all"
                  style={{
                    borderColor: isCorrect ? '#22c55e' : isWrong ? 'rgba(255,255,255,0.05)' : `${T.accent}33`,
                    background: isCorrect ? 'rgba(34,197,94,0.15)' : isWrong ? 'rgba(255,255,255,0.02)' : `${T.accent}0a`,
                    opacity: isWrong ? 0.35 : 1,
                    boxShadow: isCorrect ? '0 0 30px rgba(34,197,94,0.3)' : 'none',
                  }}>
                  <span className="text-display text-2xl font-black" style={{ color: T.accent, opacity: 0.6 }}>{LETTER[i]}</span>
                  <span className="text-display text-xl font-bold text-white leading-snug">{ans}</span>
                  {isCorrect && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute right-5 text-3xl font-black text-green-400">✓</motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {type === 'fast_answer' && (
          <div className="rounded-2xl border-2 px-8 py-5 text-center"
            style={{ borderColor: `${T.accent}55`, background: `${T.accent}10` }}>
            <div className="text-display text-2xl font-black" style={{ color: T.accent }}>Risposta libera — microfono!</div>
          </div>
        )}

        {/* Post-reveal scores */}
        <AnimatePresence>
          {reveal && reveal.roundIndex === roundIndex && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl space-y-3">
              {reveal.explanation && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-center text-muted-foreground italic text-sm">
                  {reveal.explanation}
                </div>
              )}
              {reveal.scores.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
                  <div className="flex gap-6 justify-center flex-wrap">
                    {[...reveal.scores].sort((a, b) => b.total - a.total).map(t => (
                      <div key={t.teamId} className="text-center">
                        <div className="h-2.5 w-2.5 rounded-full mx-auto mb-1" style={{ background: t.color }} />
                        <div className="text-display text-2xl font-black" style={{ color: t.color }}>{t.total}</div>
                        <div className="text-xs text-muted-foreground">{t.name}</div>
                        {t.roundPoints > 0 && <div className="text-xs text-green-400 font-bold">+{t.roundPoints}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ArenaBg>
  );
}

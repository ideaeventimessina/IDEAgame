import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { useT, useI18n, LOCALES } from '@/i18n';
import { useEventSocket } from '@/hooks/useEventSocket';

interface EventInfo { id: string; name: string; joinCode: string; brandColor: string }
interface TeamInfo { id: string; name: string; color: string }
interface PlayerInfo { id: string; nickname: string; avatarColor: string; teamId: string | null; eventId: string }
interface GameState { sessionId: string | null; currentRound: number; totalRounds: number; status: 'idle' | 'running' | 'paused' | 'ended'; gameSlug: string | null }
interface CoppieCard { pos: number; cardId: string; pairId: string; imageUrl: string; label: string; flipped: boolean; matched: boolean; matchedBy: string | null; }
interface CoppieTeamState { id: string; name: string; color: string; score: number; }
interface CoppieBoardState {
  cards: CoppieCard[]; teams: CoppieTeamState[];
  mode: string; currentTeamIdx: number; flipping: number[];
  locked: boolean; status: string; winner: string | null;
  matchCount: number; totalPairs: number;
}
interface QuizzoneQuestion {
  sessionId: string;
  roundIndex: number;
  type: string;
  questionText: string;
  answers: string[];
  timeLimit: number;
  points: number;
  difficulty: string;
  questionStartedAt: string;
  totalRounds: number;
}
interface QuizzoneReveal {
  roundIndex: number;
  correctAnswer: number;
  explanation: string;
  scores: { teamId: string; name: string; color: string; roundPoints: number; total: number }[];
}

type Step = 'loading' | 'join' | 'joining' | 'play' | 'error';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

export default function Player() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const joinCodeFromUrl = searchParams.get('e')?.toUpperCase() ?? '';

  const [step, setStep] = useState<Step>(joinCodeFromUrl ? 'loading' : 'join');
  const [error, setError] = useState('');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [nick, setNick] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [gameState, setGameState] = useState<GameState>({ sessionId: null, currentRound: 0, totalRounds: 1, status: 'idle', gameSlug: null });
  const [buzzed, setBuzzed] = useState(false);
  const [coppieBoard, setCoppieBoard] = useState<CoppieBoardState | null>(null);
  const [quizzoneQuestion, setQuizzoneQuestion] = useState<QuizzoneQuestion | null>(null);
  const [quizzoneReveal, setQuizzoneReveal] = useState<QuizzoneReveal | null>(null);

  const { connected, on, emit } = useEventSocket(event?.id ?? null);

  const fetchEvent = useCallback(async (code: string) => {
    setStep('loading'); setError('');
    try {
      const data = await apiFetch(`/events/by-code/${encodeURIComponent(code)}`) as { event: EventInfo; teams: TeamInfo[] };
      setEvent(data.event); setTeams(data.teams);
      if (data.teams.length > 0) setSelectedTeam(data.teams[0]!.id);
      setStep('join');
    } catch (e) { setError((e as Error).message); setStep('error'); }
  }, []);

  useEffect(() => { if (joinCodeFromUrl) fetchEvent(joinCodeFromUrl); }, [joinCodeFromUrl, fetchEvent]);

  useEffect(() => {
    if (!event) return;
    const extractBoard = (data: unknown): CoppieBoardState =>
      ((data as { board?: CoppieBoardState }).board ?? data) as CoppieBoardState;

    const unsubs = [
      on<{ session: { id: string; currentRound: number; totalRounds: number; status: string; gameSlug: string } }>('game:started', ({ session }) => {
        setGameState({ sessionId: session.id, currentRound: session.currentRound, totalRounds: session.totalRounds, status: 'running', gameSlug: session.gameSlug });
        setBuzzed(false);
        setQuizzoneQuestion(null);
        setQuizzoneReveal(null);
      }),
      on<{ session: { id: string; currentRound: number; totalRounds: number; gameSlug: string } }>('game:resumed', ({ session }) => {
        setGameState(p => ({ ...p, status: 'running', currentRound: session.currentRound, totalRounds: session.totalRounds }));
      }),
      on<{ session: { currentRound: number; totalRounds: number } }>('round:changed', ({ session }) => {
        if (session) {
          setGameState(p => ({ ...p, currentRound: session.currentRound, totalRounds: session.totalRounds }));
          setBuzzed(false);
        }
      }),
      on('game:paused', () => setGameState(p => ({ ...p, status: 'paused' }))),
      on('game:ended', () => setGameState(p => ({ ...p, status: 'ended' }))),
      on('coppie:state',   (d) => setCoppieBoard(extractBoard(d))),
      on('coppie:flip',    (d) => setCoppieBoard(extractBoard(d))),
      on('coppie:match',   (d) => setCoppieBoard(extractBoard(d))),
      on('coppie:mismatch',(d) => setCoppieBoard(extractBoard(d))),
      on('coppie:end',     (d) => setCoppieBoard(extractBoard(d))),
      on<QuizzoneQuestion>('quiz:question', (data) => {
        setQuizzoneQuestion(data);
        setQuizzoneReveal(null);
        setBuzzed(false);
        setGameState(p => ({ ...p, status: 'running', sessionId: data.sessionId }));
      }),
      on<QuizzoneReveal & { sessionId: string }>('quiz:reveal', (data) => {
        setQuizzoneReveal(data);
      }),
      on<{ sessionId: string }>('quiz:ended', () => {
        setGameState(p => ({ ...p, status: 'ended' }));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [event, on]);

  useEffect(() => {
    if (!connected || !player || !event) return;
    emit('player:register', { playerId: player.id, eventId: event.id });
  }, [connected, player, event, emit]);

  // On join: fetch current quizzone state if session already running
  useEffect(() => {
    if (!player || !gameState.sessionId || gameState.gameSlug !== 'quizzone') return;
    apiFetch(`/quizzone/sessions/${gameState.sessionId}/state`)
      .then((s: unknown) => {
        const state = s as { hasQuestion: boolean; questionText?: string; answers?: string[]; type?: string; timeLimit?: number; points?: number; difficulty?: string; questionStartedAt?: string; roundIndex?: number; totalRounds?: number; sessionId?: string; revealed?: boolean; correctAnswer?: number; explanation?: string; scores?: QuizzoneReveal['scores'] };
        if (state.hasQuestion && state.questionText) {
          setQuizzoneQuestion({
            sessionId: state.sessionId ?? gameState.sessionId!,
            roundIndex: state.roundIndex ?? 0,
            type: state.type ?? 'multiple_choice',
            questionText: state.questionText,
            answers: state.answers ?? [],
            timeLimit: state.timeLimit ?? 30,
            points: state.points ?? 100,
            difficulty: state.difficulty ?? 'medium',
            questionStartedAt: state.questionStartedAt ?? new Date().toISOString(),
            totalRounds: state.totalRounds ?? 1,
          });
        }
      })
      .catch(() => {});
  }, [player, gameState.sessionId, gameState.gameSlug]);

  const handleJoin = async () => {
    if (!event || !nick.trim()) return;
    setStep('joining'); setError('');
    try {
      const p = await apiFetch(`/events/${event.id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick.trim(), teamId: selectedTeam || null }),
      }) as PlayerInfo;
      setPlayer(p); setStep('play');
    } catch (e) { setError((e as Error).message); setStep('join'); }
  };

  const myTeam = player?.teamId ? teams.find(t => t.id === player.teamId) : teams.find(t => t.id === selectedTeam) ?? teams[0];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 12%), hsl(248 70% 4%))' }}>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-display font-black">I</div>
          <div className="text-display text-lg font-black">{t('app.title')}</div>
        </div>
        <div className="flex items-center gap-2">
          {step === 'play' && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs">
              {connected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400" />}
              <span className={connected ? 'text-green-400' : 'text-amber-400'}>{connected ? 'online' : 'riconnessione…'}</span>
            </div>
          )}
          <select value={locale} onChange={e => setLocale(e.target.value as 'it' | 'en' | 'es' | 'fr')}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs">
            {LOCALES.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {step === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-muted-foreground">Recupero evento…</div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-6">
            <AlertTriangle className="h-14 w-14 text-destructive" />
            <div className="text-center">
              <div className="text-display text-xl font-black text-destructive">Errore</div>
              <div className="mt-2 text-muted-foreground">{error}</div>
            </div>
            <button onClick={() => joinCodeFromUrl ? fetchEvent(joinCodeFromUrl) : setStep('join')}
              className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 font-bold hover:bg-card">
              <RefreshCw className="h-4 w-4" /> Riprova
            </button>
          </motion.div>
        )}

        {(step === 'join' || step === 'joining') && event && (
          <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col">
            <div className="text-display text-4xl font-black">{t('play.title')}</div>
            <div className="mt-1 text-muted-foreground">{event.name}</div>
            {error && <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

            <label className="mt-8 block text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.nickname')}</label>
            <input value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Marco" maxLength={24}
              className="mt-2 w-full rounded-2xl border border-border bg-card px-5 py-4 text-2xl font-bold text-foreground outline-none focus:border-primary" />

            {teams.length > 0 && (
              <>
                <div className="mt-8 text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.team')}</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {teams.map(tm => (
                    <button key={tm.id} onClick={() => setSelectedTeam(tm.id)}
                      className="rounded-2xl border-2 px-4 py-5 text-left transition-all"
                      style={{ borderColor: tm.color, background: selectedTeam === tm.id ? `${tm.color}22` : 'transparent',
                               opacity: selectedTeam === tm.id ? 1 : 0.7, transform: selectedTeam === tm.id ? 'scale(1.02)' : 'scale(1)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full" style={{ background: tm.color }} />
                        <div className="text-display text-lg font-bold">{tm.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button disabled={!nick.trim() || step === 'joining'} onClick={handleJoin}
              className="mt-auto flex w-full items-center justify-center gap-3 rounded-3xl bg-primary py-5 text-2xl font-black text-primary-foreground disabled:opacity-40">
              {step === 'joining' && <Loader2 className="h-6 w-6 animate-spin" />}
              {t('play.join')}
            </button>
          </motion.div>
        )}

        {step === 'play' && player && (
          <motion.div key="play" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-background text-display font-black"
                   style={{ background: player.avatarColor }}>{player.nickname[0]?.toUpperCase()}</div>
              <div>
                <div className="text-display text-lg font-bold">{player.nickname}</div>
                <div className="text-xs text-muted-foreground">{myTeam?.name ?? 'Nessuna squadra'}</div>
              </div>
              <div className="ml-auto">{connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-amber-400 animate-pulse" />}</div>
            </div>

            {gameState.status === 'idle' && (
              <div className="mt-8 flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="text-xl font-bold">In attesa dell&apos;animatore…</div>
                <div className="text-sm text-muted-foreground">Il gioco inizierà a breve</div>
              </div>
            )}

            {gameState.status === 'paused' && (
              <div className="mt-8 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-6 py-5 text-center">
                <div className="text-display text-xl font-black text-amber-400">⏸ Pausa</div>
                <div className="mt-1 text-sm text-muted-foreground">Il gioco è in pausa</div>
              </div>
            )}

            {gameState.status === 'ended' && (
              <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/10 px-6 py-5 text-center">
                <div className="text-display text-xl font-black text-primary">🏆 Gioco terminato!</div>
              </div>
            )}

            {gameState.status === 'running' && (
              <>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2 text-sm">
                  <span className="text-muted-foreground capitalize">{gameState.gameSlug?.replace(/-/g, ' ') ?? '—'}</span>
                  <span className="font-bold">Round {gameState.currentRound}/{gameState.totalRounds}</span>
                </div>

                {gameState.gameSlug === 'gioco-coppie' ? (
                  <CoppiePhoneController
                    board={coppieBoard}
                    sessionId={gameState.sessionId}
                    teamId={player.teamId}
                    teamColor={myTeam?.color ?? '#8B5CF6'}
                    onBoardUpdate={setCoppieBoard}
                  />
                ) : gameState.gameSlug === 'quizzone' ? (
                  <QuizzonePhoneController
                    question={quizzoneQuestion}
                    reveal={quizzoneReveal}
                    sessionId={gameState.sessionId}
                    playerId={player.id}
                    teamColor={myTeam?.color ?? '#8B5CF6'}
                  />
                ) : (
                  <>
                    <motion.button onClick={() => setBuzzed(true)} animate={buzzed ? { scale: [1, 0.92, 1] } : {}} disabled={buzzed}
                      className="mt-6 flex aspect-square w-full items-center justify-center rounded-full text-display text-5xl font-black text-background shadow-2xl disabled:opacity-60"
                      style={{ background: `radial-gradient(circle at 35% 30%, ${myTeam?.color ?? '#8B5CF6'}, #1a1535 95%)`, boxShadow: `0 20px 60px ${myTeam?.color ?? '#8B5CF6'}66` }}>
                      <Zap className="mr-3 h-12 w-12" />
                      {buzzed ? 'Inviato!' : t('play.buzzer')}
                    </motion.button>
                    {buzzed && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-primary">
                        <Check className="h-5 w-5" /> {t('play.waiting')}
                        <button onClick={() => setBuzzed(false)} className="ml-auto text-xs text-muted-foreground underline">reset</button>
                      </motion.div>
                    )}
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Quizzone Phone Controller ─────────────────────────────────────────────────

const LETTER = ['A', 'B', 'C', 'D', 'E'];
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Scelta multipla',
  true_false: 'Vero/Falso',
  image_compare: 'Confronto',
  guess_who: 'Indovina chi',
  fast_answer: 'Risposta rapida',
  bonus_final: '🏆 Bonus Finale',
};

function QuizzonePhoneController({ question, reveal, sessionId, playerId, teamColor }: {
  question: QuizzoneQuestion | null;
  reveal: QuizzoneReveal | null;
  sessionId: string | null;
  playerId: string;
  teamColor: string;
}) {
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when new question arrives
  useEffect(() => {
    if (!question) return;
    setMyAnswer(null);
    setSubmitted(false);
    setSubmitError('');

    // Countdown
    if (timerRef.current) clearInterval(timerRef.current);
    const update = () => {
      const elapsed = (Date.now() - new Date(question.questionStartedAt).getTime()) / 1000;
      const left = Math.max(0, question.timeLimit - elapsed);
      setTimeLeft(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    };
    update();
    timerRef.current = setInterval(update, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [question?.roundIndex, question?.questionStartedAt, question?.timeLimit]);

  const submitAnswer = async (answerIdx: number) => {
    if (!sessionId || submitted || submitting || !question) return;
    if (timeLeft <= 0) { setSubmitError('Tempo scaduto!'); return; }
    setSubmitting(true);
    setMyAnswer(answerIdx);
    try {
      await apiFetch(`/quizzone/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, selectedAnswer: answerIdx }),
      });
      setSubmitted(true);
      setSubmitError('');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('già risposto') || msg.includes('alreadyAnswered')) {
        setSubmitted(true);
      } else if (msg.includes('tempo') || msg.includes('rivelata')) {
        setSubmitError('Troppo tardi!');
        setMyAnswer(null);
      } else {
        setSubmitError(msg);
        setMyAnswer(null);
      }
    } finally { setSubmitting(false); }
  };

  if (!question) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Attendi la prossima domanda…</div>
      </div>
    );
  }

  const timerPct = question.timeLimit > 0 ? (timeLeft / question.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';
  const isRevealed = reveal !== null && reveal.roundIndex === question.roundIndex;
  const amICorrect = isRevealed && myAnswer !== null && myAnswer === reveal!.correctAnswer;
  const amIWrong = isRevealed && myAnswer !== null && myAnswer !== reveal!.correctAnswer;
  const didntAnswer = isRevealed && myAnswer === null && !submitted;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* Type badge + timer */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2">
        <span className="text-xs font-bold text-primary">{TYPE_LABELS[question.type] ?? question.type}</span>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" style={{ color: timerColor }} />
          <span className="text-display font-black tabular-nums text-sm" style={{ color: timerColor }}>
            {Math.ceil(timeLeft)}s
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{question.roundIndex + 1}/{question.totalRounds}</span>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${timerPct}%`, background: timerColor }} />
      </div>

      {/* Question text */}
      <div className="rounded-2xl border border-border bg-card/40 px-4 py-4">
        <div className="text-display text-lg font-black leading-snug">{question.questionText}</div>
        <div className="mt-1 text-xs text-muted-foreground">{question.points} pt • {question.difficulty}</div>
      </div>

      {/* Reveal result banner */}
      <AnimatePresence>
        {isRevealed && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl border px-5 py-4 text-center font-black text-lg ${
              amICorrect
                ? 'border-green-500/50 bg-green-500/15 text-green-400'
                : amIWrong
                ? 'border-red-500/50 bg-red-500/15 text-red-400'
                : didntAnswer
                ? 'border-border bg-card/60 text-muted-foreground'
                : 'border-border bg-card/60 text-muted-foreground'
            }`}>
            {amICorrect ? '✅ Esatto! +' + question.points : amIWrong ? '❌ Sbagliato' : '⏱ Non hai risposto'}
            {isRevealed && reveal!.explanation && (
              <div className="mt-2 text-xs font-normal text-muted-foreground italic">{reveal!.explanation}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer buttons */}
      {question.type === 'fast_answer' ? (
        <div className="rounded-2xl border-2 border-yellow-400/30 bg-yellow-400/5 px-5 py-6 text-center">
          <div className="text-display text-xl font-bold text-yellow-400">Risposta vocale!</div>
          <div className="mt-1 text-sm text-muted-foreground">Alzati e rispondi ad alta voce</div>
        </div>
      ) : (
        <div className={`grid gap-3 ${question.answers.length <= 2 ? 'grid-cols-1' : 'grid-cols-1'}`}>
          {question.answers.map((ans, i) => {
            const isCorrectAnswer = isRevealed && i === reveal!.correctAnswer;
            const isMyWrongAnswer = isRevealed && myAnswer === i && i !== reveal!.correctAnswer;
            const isSelected = myAnswer === i && !isRevealed;

            let bg = 'border-white/15 bg-white/5';
            if (isCorrectAnswer) bg = 'border-green-400 bg-green-400/20';
            else if (isMyWrongAnswer) bg = 'border-red-400/50 bg-red-400/10';
            else if (isSelected) bg = 'border-primary/70 bg-primary/15';
            else if (isRevealed) bg = 'border-border/30 bg-white/2 opacity-40';

            const disabled = submitted || submitting || timeLeft <= 0 || isRevealed;

            return (
              <motion.button key={i}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                disabled={disabled}
                onClick={() => submitAnswer(i)}
                className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all active:scale-97 disabled:cursor-default ${bg}`}>
                <span className="text-display text-xl font-black text-white/60 w-6 flex-shrink-0">{LETTER[i]}</span>
                <span className="text-display text-lg font-bold text-white leading-snug flex-1">{ans}</span>
                {isCorrectAnswer && <span className="text-xl flex-shrink-0">✅</span>}
                {isMyWrongAnswer && <span className="text-xl flex-shrink-0">❌</span>}
                {isSelected && submitting && <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />}
                {isSelected && !submitting && !isRevealed && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Submitted / error */}
      <AnimatePresence>
        {submitted && !isRevealed && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-primary text-sm font-bold">
            <Check className="h-4 w-4" /> Risposta inviata! Attendi il reveal…
          </motion.div>
        )}
        {submitError && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm font-bold">
            {submitError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scores after reveal */}
      {isRevealed && reveal!.scores.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Classifica parziale</div>
          <div className="space-y-1.5">
            {[...reveal!.scores].sort((a, b) => b.total - a.total).map((s, rank) => (
              <div key={s.teamId} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-4">{rank + 1}.</span>
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-sm font-bold flex-1 truncate">{s.name}</span>
                {s.roundPoints > 0 && <span className="text-xs text-green-400 font-bold">+{s.roundPoints}</span>}
                <span className="text-display font-black text-sm" style={{ color: s.color }}>{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coppie Phone Controller (unchanged) ──────────────────────────────────────

function CoppiePhoneController({ board, sessionId, teamId, teamColor, onBoardUpdate }: {
  board: CoppieBoardState | null;
  sessionId: string | null;
  teamId: string | null;
  teamColor: string;
  onBoardUpdate: (b: CoppieBoardState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'match' | 'mismatch' } | null>(null);

  useEffect(() => {
    if (!sessionId || board) return;
    const url = `${BASE}api/coppie/sessions/${sessionId}/board`.replace(/\/\//g, '/');
    fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b) onBoardUpdate(b as CoppieBoardState); })
      .catch(() => {});
  }, [sessionId, board, onBoardUpdate]);

  if (!board) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Attendi che l&apos;animatore inizializzi il gioco…</div>
      </div>
    );
  }

  if (board.status === 'ended') {
    const winner = board.winner ? board.teams.find(t => t.id === board.winner) : null;
    return (
      <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 px-6 py-5 text-center">
        <div className="text-display text-2xl font-black text-primary">
          🏆 {winner ? `Vince ${winner.name}!` : 'Pareggio!'}
        </div>
        <div className="mt-3 flex justify-center gap-4">
          {board.teams.map(t => (
            <div key={t.id} className="text-center">
              <div className="text-display text-2xl font-black" style={{ color: t.color }}>{t.score}</div>
              <div className="text-xs text-muted-foreground">{t.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentTeam = board.teams[board.currentTeamIdx];
  const isMyTurn = board.mode === 'teams' ? currentTeam?.id === teamId : true;

  async function flip(pos: number) {
    if (!sessionId || !teamId || busy || board?.locked) return;
    if (!isMyTurn) { setActionMsg({ text: 'Non è il tuo turno', type: 'mismatch' }); setTimeout(() => setActionMsg(null), 1500); return; }
    setBusy(true);
    try {
      const url = `${BASE}api/coppie/sessions/${sessionId}/flip`.replace(/\/\//g, '/');
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos, teamId }),
      });
      if (r.ok) {
        const newBoard = await r.json() as CoppieBoardState;
        onBoardUpdate(newBoard);
        if (newBoard.locked && newBoard.flipping.length === 2) {
          setActionMsg({ text: 'Coppia sbagliata…', type: 'mismatch' });
          setTimeout(() => setActionMsg(null), 1400);
          setTimeout(async () => {
            const u = `${BASE}api/coppie/sessions/${sessionId}/unflip`.replace(/\/\//g, '/');
            const ur = await fetch(u, { method: 'POST', credentials: 'include' });
            if (ur.ok) onBoardUpdate(await ur.json() as CoppieBoardState);
          }, 1500);
        } else if (newBoard.flipping.length === 0 && newBoard.matchCount > (board?.matchCount ?? 0)) {
          setActionMsg({ text: '🎉 Coppia trovata!', type: 'match' });
          setTimeout(() => setActionMsg(null), 1800);
        }
      } else {
        const body = await r.json().catch(() => ({})) as { error?: string };
        if (body.error?.includes('turno')) setActionMsg({ text: 'Non è il tuo turno', type: 'mismatch' });
        else setActionMsg({ text: body.error ?? 'Errore', type: 'mismatch' });
        setTimeout(() => setActionMsg(null), 1500);
      }
    } catch { /* silent */ }
    finally { setBusy(false); }
  }

  const cols = board.cards.length <= 12 ? 4 : board.cards.length <= 20 ? 5 : 6;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 transition-all ${
        isMyTurn ? 'border border-green-500/40 bg-green-500/10' : 'border border-border bg-card/60'
      }`}>
        {isMyTurn ? (
          <>
            <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
              className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="font-bold text-green-400 text-sm">
              {board.locked ? 'Attendi…' : 'È il tuo turno! Scegli una carta.'}
            </span>
          </>
        ) : (
          <>
            <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: currentTeam?.color }} />
            <span className="text-sm text-muted-foreground">
              Turno di <span className="font-bold" style={{ color: currentTeam?.color }}>{currentTeam?.name}</span>
            </span>
          </>
        )}
        <div className="ml-auto text-xs text-muted-foreground">{board.matchCount}/{board.totalPairs}</div>
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {board.cards.map(card => {
          const isFlipped = card.flipped || card.matched;
          const matchedTeam = card.matchedBy ? board.teams.find(t => t.id === card.matchedBy) : null;
          const tappable = isMyTurn && !board.locked && !card.matched && !card.flipped && !busy;
          return (
            <button
              key={card.pos}
              disabled={!tappable}
              onClick={() => flip(card.pos)}
              className={`relative aspect-square rounded-lg border overflow-hidden flex items-center justify-center transition-all select-none ${
                tappable ? 'active:scale-90 cursor-pointer' : 'cursor-default'
              }`}
              style={{
                borderColor: matchedTeam ? matchedTeam.color : board.flipping.includes(card.pos) ? teamColor : 'rgba(255,255,255,0.1)',
                background: isFlipped
                  ? (matchedTeam ? `${matchedTeam.color}22` : `${teamColor}22`)
                  : tappable ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
              }}
            >
              {isFlipped && card.imageUrl ? (
                <img src={card.imageUrl} alt={card.label} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-black text-muted-foreground/40">{card.pos + 1}</span>
              )}
              {card.matched && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="text-base">✓</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {actionMsg && (
          <motion.div key="action" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl px-4 py-3 text-center text-sm font-black ${
              actionMsg.type === 'match'
                ? 'border border-green-500/40 bg-green-500/10 text-green-400'
                : 'border border-amber-400/40 bg-amber-400/10 text-amber-400'
            }`}>
            {actionMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        {board.teams.map(t => (
          <div key={t.id} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 flex-1 justify-center transition-all ${
            t.id === currentTeam?.id && board.status === 'playing' ? 'border-white/20 bg-white/5' : 'border-border/20 bg-card/30'
          }`}>
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
            <span className="text-xs font-bold truncate max-w-[60px]">{t.name}</span>
            <span className="text-display font-black text-sm ml-auto" style={{ color: t.color }}>{t.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

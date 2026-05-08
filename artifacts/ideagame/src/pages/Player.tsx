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
interface ActiveSession { id: string; status: string; gameSlug: string; currentRound: number; totalRounds: number }
interface PercorsoStepInfo { id: string; title: string; description: string; challengeType: string; points: number; timeLimit: number; optionalMediaUrl: string | null; }
interface PercorsoTeamInfo { id: string; name: string; color: string; score: number; }
interface PercorsoStateP {
  setId: string; setName: string; steps: PercorsoStepInfo[];
  currentStepIdx: number; teams: PercorsoTeamInfo[];
  status: 'idle' | 'running' | 'ended';
  lastFlash: { text: string; type: string } | null; timerStartedAt: string | null;
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
  const [percorsoStateP, setPercorsoStateP] = useState<PercorsoStateP | null>(null);

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

  // ─── Detect active session when player enters play step ──────────────────
  const fetchActiveSession = useCallback(async (eventId: string, playerId: string) => {
    try {
      const session = await apiFetch(`/events/${eventId}/active-session`) as ActiveSession | null;
      if (!session) return;
      setGameState({
        sessionId: session.id,
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
        status: session.status as GameState['status'],
        gameSlug: session.gameSlug,
      });
      // If coppie board is already initialized, fetch its state
      if (session.gameSlug === 'gioco-coppie') {
        const boardData = await apiFetch(`/coppie/sessions/${session.id}/board`).catch(() => null) as { board?: CoppieBoardState } | CoppieBoardState | null;
        if (boardData) {
          const board = (boardData as { board?: CoppieBoardState }).board ?? boardData as CoppieBoardState;
          setCoppieBoard(board);
        }
      }
      // If percorso is running, fetch current state
      if (session.gameSlug === 'percorso-a-risate') {
        const ps = await apiFetch(`/percorso/sessions/${session.id}/state`).catch(() => null) as PercorsoStateP | null;
        if (ps) setPercorsoStateP(ps);
      }
      // If quizzone is running, fetch current state
      if (session.gameSlug === 'quizzone') {
        const state = await apiFetch(`/quizzone/sessions/${session.id}/state`).catch(() => null) as {
          hasQuestion?: boolean; questionText?: string; answers?: string[]; type?: string;
          timeLimit?: number; points?: number; difficulty?: string; questionStartedAt?: string;
          roundIndex?: number; totalRounds?: number; sessionId?: string;
          revealed?: boolean; correctAnswer?: number; explanation?: string;
          scores?: QuizzoneReveal['scores'];
        } | null;
        if (state?.hasQuestion && state.questionText) {
          setQuizzoneQuestion({
            sessionId: state.sessionId ?? session.id,
            roundIndex: state.roundIndex ?? 0,
            type: state.type ?? 'multiple_choice',
            questionText: state.questionText,
            answers: state.answers ?? [],
            timeLimit: state.timeLimit ?? 30,
            points: state.points ?? 100,
            difficulty: state.difficulty ?? 'medium',
            questionStartedAt: state.questionStartedAt ?? new Date().toISOString(),
            totalRounds: state.totalRounds ?? session.totalRounds,
          });
          if (state.revealed && state.correctAnswer !== undefined) {
            setQuizzoneReveal({
              roundIndex: state.roundIndex ?? 0,
              correctAnswer: state.correctAnswer,
              explanation: state.explanation ?? '',
              scores: state.scores ?? [],
            });
          }
        }
      }
      void playerId; // used for registration below
    } catch { /* silent */ }
  }, []);

  // Detect active session on mount when player enters play step
  useEffect(() => {
    if (step !== 'play' || !event || !player) return;
    void fetchActiveSession(event.id, player.id);
  }, [step, event?.id, player?.id, fetchActiveSession]);

  // Re-detect on socket reconnect (catches mid-game joins)
  useEffect(() => {
    if (!connected || step !== 'play' || !event || !player) return;
    void fetchActiveSession(event.id, player.id);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setCoppieBoard(null);
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
      on<{ state: PercorsoStateP }>('path:started', ({ state }) => {
        setPercorsoStateP(state);
        setGameState(p => ({ ...p, status: 'running' }));
      }),
      on<{ state: PercorsoStateP }>('path:step_changed', ({ state }) => setPercorsoStateP(state)),
      on<{ state: PercorsoStateP }>('path:score_updated', ({ state }) => setPercorsoStateP(state)),
      on<{ state: PercorsoStateP }>('path:ended', ({ state }) => {
        setPercorsoStateP(state);
        setGameState(p => ({ ...p, status: 'ended' }));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [event, on]);

  useEffect(() => {
    if (!connected || !player || !event) return;
    emit('player:register', { playerId: player.id, eventId: event.id });
  }, [connected, player, event, emit]);

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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-x-hidden px-5 pt-6"
         style={{
           background: 'radial-gradient(ellipse at top, hsl(248 70% 12%), hsl(248 70% 4%))',
           paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))',
         }}>
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

        {(step === 'join' || step === 'joining') && !event && (
          <motion.div key="enter-code" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-display text-3xl font-black">Unisciti all'evento</div>
                <div className="mt-2 text-sm text-muted-foreground">Inserisci il codice ricevuto dall'animatore</div>
              </div>
              <div className="w-full">
                <input
                  value={nick}
                  onChange={e => setNick(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nick.trim()) { const c = nick.trim(); setNick(''); fetchEvent(c); } }}
                  placeholder="ES. SORR40"
                  maxLength={10}
                  className="w-full rounded-2xl border border-border bg-card px-5 py-5 text-center text-3xl font-black tracking-[0.3em] text-foreground outline-none focus:border-primary"
                />
              </div>
              {error && <div className="w-full rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">{error}</div>}
            </div>
            {/* Sticky CTA — always visible above DemoSwitcher */}
            <div className="sticky bottom-24 pt-4 pb-2"
                 style={{ background: 'linear-gradient(to bottom, transparent, hsl(248 70% 4%) 40%)' }}>
              <button
                onClick={() => { const c = nick.trim(); if (c) { setNick(''); fetchEvent(c); } }}
                disabled={!nick.trim()}
                className="w-full rounded-2xl bg-primary py-5 text-lg font-black text-primary-foreground shadow-[0_0_30px_rgba(245,182,66,0.35)] disabled:opacity-40 hover:opacity-90"
              >
                Entra
              </button>
            </div>
          </motion.div>
        )}

        {(step === 'join' || step === 'joining') && event && (
          <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col">
            {/* Scrollable content area */}
            <div className="flex-1">
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
                  <div className="mt-3 grid grid-cols-2 gap-3 pb-4">
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
            </div>

            {/* Sticky CTA — sempre visibile sopra il DemoSwitcher */}
            <div className="sticky bottom-24 pt-6 pb-2"
                 style={{ background: 'linear-gradient(to bottom, transparent, hsl(248 70% 4%) 40%)' }}>
              <button disabled={!nick.trim() || step === 'joining'} onClick={handleJoin}
                className="flex w-full items-center justify-center gap-3 rounded-3xl bg-primary py-5 text-2xl font-black text-primary-foreground shadow-[0_0_30px_rgba(245,182,66,0.25)] disabled:opacity-40">
                {step === 'joining' && <Loader2 className="h-6 w-6 animate-spin" />}
                {t('play.join')}
              </button>
            </div>
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
                <div className="mt-2 text-sm text-muted-foreground">Controlla il proiettore per la classifica</div>
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
                ) : gameState.gameSlug === 'percorso-a-risate' ? (
                  <PercorsoPhoneController
                    state={percorsoStateP}
                    teamId={player.teamId}
                    teamColor={myTeam?.color ?? '#8B5CF6'}
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
                      className="mx-auto mt-6 flex aspect-square w-full max-w-[260px] items-center justify-center rounded-full text-display text-5xl font-black text-background shadow-2xl disabled:opacity-60"
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
        <div className={`rounded-2xl border border-border bg-card/60 px-4 py-4 text-center ${submitted ? 'opacity-60' : ''}`}>
          {submitted
            ? <div className="text-green-400 font-bold">✓ Risposta registrata</div>
            : <div className="text-muted-foreground text-sm">Risposta libera — digita sul proiettore</div>}
        </div>
      ) : (
        <div className="grid gap-2.5">
          {question.answers.map((ans, i) => {
            const isSelected = myAnswer === i;
            const showCorrect = isRevealed && i === reveal!.correctAnswer;
            const showWrong = isRevealed && isSelected && i !== reveal!.correctAnswer;
            return (
              <motion.button key={i}
                onClick={() => void submitAnswer(i)}
                disabled={submitted || submitting || timeLeft <= 0 || isRevealed}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left font-bold transition-all disabled:cursor-not-allowed ${
                  showCorrect
                    ? 'border-green-500 bg-green-500/20 text-green-300'
                    : showWrong
                    ? 'border-red-500 bg-red-500/15 text-red-400'
                    : isSelected && !isRevealed
                    ? 'border-primary bg-primary/20 text-primary'
                    : isRevealed
                    ? 'border-border/40 opacity-40'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/10'
                }`}
                style={isSelected && !isRevealed ? { borderColor: teamColor, background: `${teamColor}20` } : {}}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current text-display text-sm font-black opacity-70">
                  {LETTER[i]}
                </span>
                <span className="text-base leading-snug">{ans}</span>
                {submitting && isSelected && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
              </motion.button>
            );
          })}
        </div>
      )}

      {submitError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
          {submitError}
        </div>
      )}

      {submitted && !isRevealed && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-sm font-bold text-primary">
          ✓ Risposta inviata — attendi la rivelazione
        </motion.div>
      )}
    </div>
  );
}

// ─── Percorso Phone Controller ──────────────────────────────────────────────────

const PERCORSO_EMOJIS: Record<string, string> = {
  sfida: '⚡', domanda: '❓', mimo: '🎭', ballo: '💃',
  veloce: '🏃', coppia: '👫', reazione: '😱', fantasia: '🌟',
};

function PercorsoPhoneController({ state, teamId, teamColor }: {
  state: PercorsoStateP | null;
  teamId: string | null;
  teamColor: string;
}) {
  if (!state) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">In attesa del percorso…</div>
      </div>
    );
  }

  const myTeam = state.teams.find(t => t.id === teamId);
  const currentStep = state.currentStepIdx >= 0 ? state.steps[state.currentStepIdx] ?? null : null;
  const emoji = currentStep ? (PERCORSO_EMOJIS[currentStep.challengeType] ?? '🎯') : null;
  const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);

  // Timer countdown
  const [timeLeft, setTimeLeft] = useState(currentStep?.timeLimit ?? 30);
  useEffect(() => {
    if (!state.timerStartedAt || !currentStep) { setTimeLeft(currentStep?.timeLimit ?? 30); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(state.timerStartedAt!).getTime()) / 1000;
      setTimeLeft(Math.max(0, currentStep.timeLimit - elapsed));
    };
    update();
    const i = setInterval(update, 500);
    return () => clearInterval(i);
  }, [state.timerStartedAt, state.currentStepIdx, currentStep?.timeLimit]);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2 text-xs">
        <span className="font-bold" style={{ color: myTeam?.color ?? teamColor }}>{myTeam?.name ?? '—'}</span>
        <span className="font-bold tabular-nums" style={{ color: myTeam?.color ?? teamColor }}>{myTeam?.score ?? 0} pt</span>
        <span className={`font-bold ${state.status === 'running' ? 'text-green-400' : state.status === 'ended' ? 'text-primary' : 'text-muted-foreground'}`}>
          {state.status === 'idle' ? '⏳ Attesa' : state.status === 'running' ? '⚡ In corso' : '🏁 Fine'}
        </span>
      </div>

      {/* Idle */}
      {state.status === 'idle' && (
        <div className="mt-4 rounded-2xl border border-border bg-card/40 px-6 py-6 text-center">
          <div className="text-4xl mb-3">🎭</div>
          <div className="text-display text-xl font-black">{state.setName}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            L'animatore sta per iniziare il percorso…
          </div>
        </div>
      )}

      {/* Running — current challenge */}
      {state.status === 'running' && currentStep && (
        <>
          {/* Step counter */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sfida {state.currentStepIdx + 1}/{state.steps.length}</span>
            <span className="tabular-nums">{Math.ceil(timeLeft)}s</span>
          </div>

          {/* Timer bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
            <div className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${currentStep.timeLimit > 0 ? (timeLeft / currentStep.timeLimit) * 100 : 0}%`,
                background: timeLeft / currentStep.timeLimit > 0.5 ? '#22c55e' : timeLeft / currentStep.timeLimit > 0.25 ? '#eab308' : '#ef4444',
              }} />
          </div>

          {/* Challenge card */}
          <motion.div
            key={state.currentStepIdx}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/30 bg-primary/10 px-5 py-5 text-center">
            <div className="text-4xl mb-2">{emoji}</div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: teamColor }}>
              {currentStep.challengeType} • {currentStep.points} pt
            </div>
            <div className="text-display text-xl font-black leading-snug">{currentStep.title}</div>
            {currentStep.description && (
              <div className="mt-2 text-sm text-muted-foreground">{currentStep.description}</div>
            )}
          </motion.div>

          {/* Optional media */}
          {currentStep.optionalMediaUrl && (
            <img src={currentStep.optionalMediaUrl} alt="" className="w-full max-h-40 rounded-xl object-contain border border-border" />
          )}
        </>
      )}

      {/* Ended */}
      {state.status === 'ended' && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-5 py-5 text-center">
          <div className="text-display text-xl font-black text-primary">🏆 Fine percorso!</div>
          <div className="mt-3 space-y-1.5">
            {sortedTeams.map((tm, i) => (
              <div key={tm.id} className="flex items-center justify-between text-sm">
                <span style={{ color: tm.color }}>{i === 0 ? '👑 ' : `${i + 1}. `}{tm.name}</span>
                <span className="font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team scores */}
      {state.teams.length > 0 && (
        <div className="flex gap-2">
          {sortedTeams.map(tm => (
            <div key={tm.id} className={`flex-1 rounded-xl border px-3 py-2 text-center ${tm.id === teamId ? 'border-opacity-80' : 'border-border opacity-60'}`}
              style={{ borderColor: tm.id === teamId ? tm.color : undefined }}>
              <div className="text-[10px] text-muted-foreground truncate">{tm.name}</div>
              <div className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Coppie Phone Controller ────────────────────────────────────────────────────

function CoppiePhoneController({ board, sessionId, teamId, teamColor, onBoardUpdate }: {
  board: CoppieBoardState | null;
  sessionId: string | null;
  teamId: string | null;
  teamColor: string;
  onBoardUpdate: (b: CoppieBoardState) => void;
}) {
  const [flipping, setFlipping] = useState<number | null>(null);
  const [flipError, setFlipError] = useState('');

  if (!board) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">In attesa del board…</div>
      </div>
    );
  }

  const myTeamInBoard = board.teams.find(t => t.id === teamId);
  const currentTeam = board.teams[board.currentTeamIdx];
  const isMyTurn = board.mode !== 'teams' || currentTeam?.id === teamId;
  const cols = board.cards.length <= 12 ? 4 : board.cards.length <= 20 ? 5 : 6;

  const handleFlip = async (pos: number) => {
    if (!sessionId || !teamId || board.locked || board.status !== 'playing') return;
    if (!isMyTurn) { setFlipError('Non è il tuo turno!'); setTimeout(() => setFlipError(''), 2000); return; }
    const card = board.cards[pos];
    if (!card || card.matched || card.flipped) return;
    setFlipping(pos);
    setFlipError('');
    try {
      const result = await apiFetch(`/coppie/sessions/${sessionId}/flip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos, teamId }),
      }) as { board: CoppieBoardState } | CoppieBoardState;
      const updated = (result as { board?: CoppieBoardState }).board ?? result as CoppieBoardState;
      onBoardUpdate(updated);
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes('bloccata') && !msg.includes('turno')) setFlipError(msg);
    } finally { setFlipping(null); }
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2 text-xs">
        <span className="font-bold" style={{ color: myTeamInBoard?.color ?? teamColor }}>{myTeamInBoard?.name ?? '—'}</span>
        <span className="text-muted-foreground">{board.matchCount}/{board.totalPairs} coppie</span>
        <span className={`font-bold ${isMyTurn ? 'text-green-400' : 'text-muted-foreground'}`}>
          {board.status === 'ended' ? '🏆 Fine!' : isMyTurn ? '⚡ Tuo turno' : `Turno: ${currentTeam?.name ?? '—'}`}
        </span>
      </div>

      {/* Not my turn notice */}
      {!isMyTurn && board.status === 'playing' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-400">
          Aspetta il tuo turno — sta giocando {currentTeam?.name}
        </div>
      )}

      {/* Win overlay */}
      {board.status === 'ended' && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-4 text-center">
          <div className="text-display text-xl font-black text-primary">🏆 Gioco terminato!</div>
          <div className="mt-2 space-y-1">
            {[...board.teams].sort((a, b) => b.score - a.score).map((tm, i) => (
              <div key={tm.id} className="flex items-center justify-between text-sm">
                <span style={{ color: tm.color }}>{i === 0 ? '👑 ' : ''}{tm.name}</span>
                <span className="font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini grid */}
      {board.status === 'playing' && (
        <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {board.cards.map((card) => {
            const isFlipping = flipping === card.pos;
            const isFlipped = card.flipped || card.matched;
            const isMatched = card.matched;
            return (
              <motion.button
                key={card.pos}
                onClick={() => void handleFlip(card.pos)}
                disabled={isFlipped || board.locked || !isMyTurn || board.status !== 'playing'}
                whileTap={{ scale: 0.92 }}
                className={`relative aspect-square rounded-lg border-2 transition-all ${
                  isMatched
                    ? 'border-green-500/60 bg-green-500/20 opacity-60'
                    : isFlipped
                    ? 'border-primary/60 bg-primary/20'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-primary/10'
                } disabled:cursor-not-allowed`}
              >
                {isFlipping && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                )}
                {isFlipped && !isFlipping && (
                  <div className="absolute inset-0 flex items-center justify-center p-0.5">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt="" className="h-full w-full rounded object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-center leading-tight">{card.label}</span>
                    )}
                  </div>
                )}
                {!isFlipped && !isFlipping && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Team scores */}
      <div className="flex gap-2">
        {board.teams.map(tm => (
          <div key={tm.id} className={`flex-1 rounded-xl border px-3 py-2 text-center transition-all ${
            currentTeam?.id === tm.id ? 'border-opacity-80' : 'border-border opacity-60'
          }`} style={{ borderColor: currentTeam?.id === tm.id ? tm.color : undefined }}>
            <div className="text-[10px] text-muted-foreground truncate">{tm.name}</div>
            <div className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
          </div>
        ))}
      </div>

      {flipError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {flipError}
        </div>
      )}
    </div>
  );
}

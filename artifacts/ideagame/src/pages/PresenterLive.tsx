import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, Clock, Wifi, WifiOff, Mic2, Play, Users,
  ChevronRight, Eye, Trophy, RotateCcw, Zap, ListChecks,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useEventSocket } from '@/hooks/useEventSocket';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/([^:])\/\//g, '$1/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) {
    const err = new Error('AUTH_REQUIRED') as Error & { authRequired?: boolean };
    err.authRequired = true;
    throw err;
  }
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
  return body;
}

interface LiveEvent {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  enabledGames?: string[];
}
interface Player {
  id: string;
  nickname?: string;
  name?: string;
  isConnected?: boolean;
  avatarColor?: string;
}
interface ActiveSession {
  id: string;
  gameSlug: string;
  currentRound: number;
  totalRounds: number;
  status: string;
  gameSettings?: Record<string, unknown>;
}
interface QuizzoneQuestion {
  sessionId: string;
  roundIndex: number;
  totalRounds: number;
  type?: string;
  questionText: string;
  answers: string[];
  points?: number;
  timeLimit?: number;
  questionStartedAt?: string;
}
interface QuizzoneRevealData {
  roundIndex: number;
  correctAnswer: number;
  explanation?: string;
}

const GAME_LABELS: Record<string, string> = {
  quizzone: 'Quizzone',
  'gioco-coppie': 'Gioco delle Coppie',
  'gioco-delle-coppie': 'Gioco delle Coppie',
  'percorso-a-risate': 'Percorso a Risate',
  'adult-only': 'Adult Only',
  'sfida-ballo': 'Sfida di Ballo',
  'parola-alle-spalle': 'Parola alle Spalle',
  'karaoke-battle': 'Karaoke Battle',
  'freestyle-battle': 'Freestyle Battle',
  saramusica: 'SaraMusica',
};

const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E'];
const ANSWER_COLORS = [
  'border-blue-400/40 bg-blue-400/10 text-blue-200',
  'border-rose-400/40 bg-rose-400/10 text-rose-200',
  'border-green-400/40 bg-green-400/10 text-green-200',
  'border-amber-400/40 bg-amber-400/10 text-amber-200',
  'border-purple-400/40 bg-purple-400/10 text-purple-200',
];
const ANSWER_CORRECT = 'border-green-400 bg-green-400/25 text-green-100 ring-1 ring-green-400';

export default function PresenterLive() {
  const [, navigate] = useLocation();

  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [connected, setConnected] = useState(false);
  const [dashboardLive, setDashboardLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [quizzoneQuestion, setQuizzoneQuestion] = useState<QuizzoneQuestion | null>(null);
  const [quizzoneRevealed, setQuizzoneRevealed] = useState(false);
  const [quizzoneReveal, setQuizzoneReveal] = useState<QuizzoneRevealData | null>(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { on } = useEventSocket(event?.id ?? null);

  // ── polling: event state ────────────────────────────────────────────────────
  const refreshEvent = useCallback(async () => {
    try {
      const state = await apiFetch('/events/public/live-state') as { event: LiveEvent | null; players: Player[] };
      setEvent(state.event);
      setPlayers(Array.isArray(state.players) ? state.players : []);
      if (!state.event) { setDashboardLive(false); setActiveSession(null); }
      setConnected(true);
    } catch (e) {
      setConnected(false);
      if ((e as { authRequired?: boolean })?.authRequired) {
        navigate(`/login?next=${encodeURIComponent('/presenter')}`);
      }
    }
  }, [navigate]);

  useEffect(() => {
    void refreshEvent();
    const id = setInterval(refreshEvent, 1500);
    return () => clearInterval(id);
  }, [refreshEvent]);

  // ── polling: active session ─────────────────────────────────────────────────
  const refreshSession = useCallback(async (eventId: string) => {
    try {
      const sessions = await apiFetch(`/events/${eventId}/sessions`) as ActiveSession[];
      const running = Array.isArray(sessions)
        ? sessions.find(s => s.status === 'running') ?? sessions.find(s => s.status !== 'ended') ?? null
        : null;
      if (running) {
        setActiveSession(running);
        // If it's quizzone and we don't have a question yet, fetch state
        if (running.gameSlug === 'quizzone' && !quizzoneQuestion) {
          try {
            const state = await apiFetch(`/quizzone/sessions/${running.id}/state`) as {
              hasQuestion?: boolean; questionText?: string; answers?: string[];
              roundIndex?: number; totalRounds?: number; revealed?: boolean;
              questionStartedAt?: string; timeLimit?: number; type?: string;
              points?: number; sessionId?: string; packId?: string;
            };
            if (state.hasQuestion && state.questionText) {
              setQuizzoneQuestion({
                sessionId: state.sessionId ?? running.id,
                roundIndex: state.roundIndex ?? 0,
                totalRounds: state.totalRounds ?? running.totalRounds,
                type: state.type,
                questionText: state.questionText,
                answers: state.answers ?? [],
                points: state.points,
                timeLimit: state.timeLimit,
                questionStartedAt: state.questionStartedAt,
              });
              setQuizzoneRevealed(state.revealed ?? false);
            }
          } catch { /* silent */ }
        }
      }
    } catch { /* silent */ }
  }, [quizzoneQuestion]);

  useEffect(() => {
    if (!event?.id) return;
    void refreshSession(event.id);
    const id = setInterval(() => { void refreshSession(event!.id); }, 4000);
    return () => clearInterval(id);
  }, [event?.id, refreshSession]);

  // ── timer countdown ─────────────────────────────────────────────────────────
  const startTimer = useCallback((questionStartedAt: string, timeLimit: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const update = () => {
      const elapsed = (Date.now() - new Date(questionStartedAt).getTime()) / 1000;
      setTimeLeft(Math.max(0, timeLimit - elapsed));
    };
    update();
    timerRef.current = setInterval(update, 300);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!event?.id) return;
    const unsubs = [
      on<{ slug: string; sessionId: string; eventId: string }>('hub:start-game', () => {
        setGameEnded(false);
        setQuizzoneQuestion(null);
        setQuizzoneReveal(null);
        setQuizzoneRevealed(false);
        if (timerRef.current) clearInterval(timerRef.current);
        void refreshSession(event.id);
      }),
      on<{ session: { id: string; gameSlug: string; currentRound: number; totalRounds: number; status: string } }>('game:started', ({ session }) => {
        setActiveSession(prev => ({ ...(prev ?? { gameSettings: {} }), ...session }));
        setGameEnded(false);
      }),
      on<{ session: unknown }>('game:ended', () => {
        setGameEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }),
      on<QuizzoneQuestion>('quiz:question', (data) => {
        setQuizzoneQuestion(data);
        setQuizzoneReveal(null);
        setQuizzoneRevealed(false);
        setGameEnded(false);
        if (data.questionStartedAt && data.timeLimit) startTimer(data.questionStartedAt, data.timeLimit);
        setActiveSession(prev => prev ? { ...prev, currentRound: data.roundIndex + 1, status: 'running' } : prev);
      }),
      on<QuizzoneRevealData & { sessionId: string }>('quiz:reveal', (data) => {
        setQuizzoneReveal(data);
        setQuizzoneRevealed(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
      }),
      on('quiz:ended', () => {
        setGameEnded(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }),
    ];
    return () => unsubs.forEach(u => u?.());
  }, [event?.id, on, startTimer, refreshSession]);

  // ── actions ─────────────────────────────────────────────────────────────────
  const handleAuthError = (e: unknown) => {
    if ((e as { authRequired?: boolean })?.authRequired) {
      navigate(`/login?next=${encodeURIComponent('/presenter')}`);
      return true;
    }
    return false;
  };

  const showDashboard = async () => {
    if (!event?.id) return;
    setBusy(true);
    try {
      await apiFetch(`/panic/events/${event.id}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'hub:phase', payload: { phase: 'gameboard' } }),
      });
      setDashboardLive(true);
    } catch (e) { if (!handleAuthError(e)) console.error(e); }
    finally { setBusy(false); }
  };

  const startGame = async (slug: string) => {
    if (!event?.id) return;
    setBusy(true); setMsg('');
    try {
      const sessions = await apiFetch(`/events/${event.id}/sessions`) as Array<{ id: string; gameSlug: string; status: string }>;
      const existing = Array.isArray(sessions)
        ? sessions.find(s => s.gameSlug === slug && s.status !== 'ended')
        : null;
      const session = existing ?? await apiFetch(`/events/${event.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: slug, totalRounds: slug === 'quizzone' ? 20 : 1 }),
      }) as { id: string };
      await apiFetch(`/panic/events/${event.id}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'hub:start-game',
          payload: { slug, sessionId: session.id, eventId: event.id },
        }),
      });
    } catch (e) { if (!handleAuthError(e)) console.error(e); }
    finally { setBusy(false); }
  };

  const handleNextQuestion = async () => {
    if (!activeSession || busy || !quizzoneQuestion) return;
    const packId = (activeSession.gameSettings as { packId?: string })?.packId;
    if (!packId) return;
    const nextRound = quizzoneQuestion.roundIndex + 1;
    if (nextRound >= quizzoneQuestion.totalRounds) return;
    setBusy(true); setMsg('');
    try {
      await apiFetch(`/quizzone/sessions/${activeSession.id}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, roundIndex: nextRound }),
      });
    } catch (e) { if (!handleAuthError(e)) { setMsg('Errore domanda successiva'); } }
    finally { setBusy(false); }
  };

  const handleReveal = async () => {
    if (!activeSession || busy || quizzoneRevealed) return;
    setBusy(true); setMsg('');
    try {
      await apiFetch(`/quizzone/sessions/${activeSession.id}/reveal`, { method: 'POST' });
    } catch (e) { if (!handleAuthError(e)) { setMsg('Errore reveal'); } }
    finally { setBusy(false); }
  };

  const handleEndQuizzone = async () => {
    if (!activeSession || busy) return;
    if (!window.confirm('Terminare il Quizzone e mostrare il podio?')) return;
    setBusy(true); setMsg('');
    try {
      await apiFetch(`/quizzone/sessions/${activeSession.id}/end`, { method: 'POST' });
      setActiveSession(null);
      setQuizzoneQuestion(null);
      setQuizzoneReveal(null);
      setQuizzoneRevealed(false);
      setGameEnded(false);
    } catch (e) { if (!handleAuthError(e)) { setMsg('Errore fine partita'); } }
    finally { setBusy(false); }
  };

  const handleBackToGames = () => {
    setActiveSession(null);
    setQuizzoneQuestion(null);
    setQuizzoneReveal(null);
    setQuizzoneRevealed(false);
    setGameEnded(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── derived ─────────────────────────────────────────────────────────────────
  const isLastRound = quizzoneQuestion
    ? quizzoneQuestion.roundIndex + 1 >= quizzoneQuestion.totalRounds
    : false;

  const timerPct = quizzoneQuestion?.timeLimit
    ? Math.min(100, (timeLeft / quizzoneQuestion.timeLimit) * 100)
    : 0;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#eab308' : '#ef4444';

  // ── render: no event ────────────────────────────────────────────────────────
  if (!event) {
    return (
      <div className="min-h-screen select-none px-5 py-6 text-white"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
        <button onClick={() => navigate('/cockpit')} className="mb-8 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70">
          <ArrowLeft className="h-4 w-4" /> Cockpit
        </button>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
          <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-amber-400/35 bg-amber-400/10">
            <Clock className="h-10 w-10 text-amber-300" />
          </div>
          <div className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">Presentatore in attesa</div>
          <h1 className="mt-3 text-3xl font-black">Aspetto la Regia</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">La regia deve avviare un evento live.</p>
          <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
            {connected ? <Wifi className="h-3.5 w-3.5 text-green-400" /> : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
            {connected ? 'Collegato' : 'Disconnesso'}
          </div>
        </div>
      </div>
    );
  }

  // ── render: quizzone active ─────────────────────────────────────────────────
  if (activeSession?.gameSlug === 'quizzone' && (quizzoneQuestion || gameEnded)) {
    const packTitle = (activeSession.gameSettings as { packTitle?: string })?.packTitle ?? 'Quizzone';
    const round = quizzoneQuestion ? quizzoneQuestion.roundIndex + 1 : activeSession.currentRound;
    const total = quizzoneQuestion?.totalRounds ?? activeSession.totalRounds;

    return (
      <div className="min-h-screen select-none pb-8 text-white"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #1a0535 0%, #0d0220 55%, #040110 100%)' }}>
        {/* header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <button onClick={handleBackToGames} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/60">
            <ArrowLeft className="inline h-4 w-4" /> Giochi
          </button>
          <div className="flex items-center gap-2 text-sm font-black text-amber-300">
            <Mic2 className="h-4 w-4" />
            PRESENTATORE
          </div>
          {connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
        </div>

        {/* pack + round badge */}
        <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-2.5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-violet-300/80">Quizzone</div>
            <div className="text-sm font-black text-white">{packTitle}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">Round</div>
            <div className="text-2xl font-black tabular-nums text-amber-300">{round}<span className="text-sm text-white/40">/{total}</span></div>
          </div>
        </div>

        {gameEnded ? (
          /* ── game ended ── */
          <div className="mx-4 mt-6 flex flex-col items-center gap-4 rounded-3xl border border-amber-400/25 bg-amber-400/10 px-5 py-8 text-center">
            <Trophy className="h-12 w-12 text-amber-300" />
            <div className="text-xl font-black">Quizzone completato!</div>
            <p className="text-sm text-white/60">Il podio è visibile sul proiettore.</p>
            <button
              onClick={handleBackToGames}
              className="mt-2 w-full rounded-2xl bg-amber-400 px-5 py-3 text-base font-black text-black"
            >
              <RotateCcw className="mr-2 inline h-4 w-4" />
              Nuovo gioco
            </button>
          </div>
        ) : quizzoneQuestion ? (
          <>
            {/* timer bar */}
            {!quizzoneRevealed && quizzoneQuestion.timeLimit && (
              <div className="mx-4 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/50">Tempo</span>
                  <span className="tabular-nums text-sm font-black" style={{ color: timerColor }}>{Math.ceil(timeLeft)}s</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${timerPct}%`, background: timerColor }} />
                </div>
              </div>
            )}

            {/* question */}
            <div className="mx-4 mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                {quizzoneQuestion.type && (
                  <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                    {quizzoneQuestion.type}
                  </span>
                )}
                {quizzoneQuestion.points && (
                  <span className="rounded-lg bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    {quizzoneQuestion.points}pt
                  </span>
                )}
                {quizzoneRevealed && (
                  <span className="ml-auto rounded-lg bg-green-400/15 px-2 py-0.5 text-[10px] font-bold text-green-300">
                    ✓ Rivelata
                  </span>
                )}
              </div>
              <p className="text-base font-bold leading-snug">{quizzoneQuestion.questionText}</p>
            </div>

            {/* answers */}
            <div className="mx-4 mb-4 grid gap-2">
              {quizzoneQuestion.answers.map((ans, i) => {
                const isCorrect = quizzoneRevealed && quizzoneReveal?.correctAnswer === i;
                return (
                  <div key={i}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${isCorrect ? ANSWER_CORRECT : ANSWER_COLORS[i] ?? ANSWER_COLORS[0]}`}>
                    <span className="mt-0.5 shrink-0 text-xs opacity-70">{ANSWER_LABELS[i]}</span>
                    <span className="leading-snug">{ans}</span>
                    {isCorrect && <span className="ml-auto shrink-0 text-green-300">✓</span>}
                  </div>
                );
              })}
            </div>

            {quizzoneRevealed && quizzoneReveal?.explanation && (
              <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                <span className="font-bold text-white/90">Spiegazione: </span>
                {quizzoneReveal.explanation}
              </div>
            )}

            {/* action buttons */}
            <div className="mx-4 flex flex-col gap-2">
              {!quizzoneRevealed ? (
                <button
                  onClick={handleReveal}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-4 text-base font-black text-black disabled:opacity-40"
                >
                  <Eye className="h-5 w-5" />
                  {busy ? 'Attendere...' : 'Rivela risposta'}
                </button>
              ) : isLastRound ? (
                <button
                  onClick={handleEndQuizzone}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-4 text-base font-black text-black disabled:opacity-40"
                >
                  <Trophy className="h-5 w-5" />
                  {busy ? 'Attendere...' : 'Fine — mostra podio'}
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-4 text-base font-black text-black disabled:opacity-40"
                >
                  <ChevronRight className="h-5 w-5" />
                  {busy ? 'Attendere...' : `Domanda ${quizzoneQuestion.roundIndex + 2} →`}
                </button>
              )}
              <button
                onClick={handleEndQuizzone}
                disabled={busy}
                className="rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white/60 disabled:opacity-40"
              >
                Termina partita
              </button>
            </div>

            {msg && <p className="mx-4 mt-3 text-center text-sm text-red-300">{msg}</p>}
          </>
        ) : (
          <div className="mx-4 mt-6 flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-5 py-8 text-center">
            <ListChecks className="h-10 w-10 text-violet-300" />
            <div className="text-base font-black">Quizzone avviato</div>
            <p className="text-sm text-white/55">In attesa della prima domanda dalla Regia...</p>
          </div>
        )}
      </div>
    );
  }

  // ── render: game selection / lobby ──────────────────────────────────────────
  const enabledGames = Array.isArray(event.enabledGames) && event.enabledGames.length > 0
    ? event.enabledGames
    : ['quizzone'];

  return (
    <div className="min-h-screen select-none px-4 py-5 text-white"
      style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
      <header className="mb-5 flex items-center justify-between">
        <button onClick={() => navigate('/cockpit')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70">
          <ArrowLeft className="inline h-4 w-4" /> Cockpit
        </button>
        <div className="flex items-center gap-2 text-sm font-black text-amber-300">
          <Mic2 className="h-4 w-4" />
          PRESENTATORE
        </div>
        {connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
      </header>

      <div className="rounded-2xl border border-green-500/25 bg-green-500/10 px-4 py-3">
        <div className="text-[10px] uppercase tracking-widest text-green-300/80">Evento live</div>
        <div className="mt-1 text-xl font-black">{event.name}</div>
        <div className="mt-1 text-xs text-white/50">Codice {event.joinCode}</div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-300" />
          <div className="text-sm font-black">Giocatori collegati: {players.length}</div>
        </div>

        {players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-white/55">
            In attesa che i giocatori entrino dal QR code.
          </div>
        ) : (
          <div className="grid gap-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="h-3 w-3 rounded-full" style={{ background: p.avatarColor ?? '#F5B642' }} />
                <span className="flex-1 font-bold">{p.nickname ?? p.name ?? 'Giocatore'}</span>
                <span className={p.isConnected === false ? 'text-red-300 text-xs' : 'text-green-300 text-xs'}>
                  {p.isConnected === false ? 'offline' : 'online'}
                </span>
              </div>
            ))}
          </div>
        )}

        {!dashboardLive ? (
          <button
            onClick={showDashboard}
            disabled={busy}
            className="mt-5 w-full rounded-2xl bg-primary px-5 py-4 text-base font-black text-primary-foreground disabled:opacity-40"
          >
            <Play className="mr-2 inline h-5 w-5" />
            {busy ? 'Avvio...' : 'Avvia partita'}
          </button>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <div className="text-xs font-black uppercase tracking-widest text-amber-300">Scegli gioco</div>
            </div>
            <div className="grid gap-2">
              {enabledGames.map((slug) => (
                <button
                  key={slug}
                  onClick={() => startGame(slug)}
                  disabled={busy}
                  className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-left font-black text-amber-100 disabled:opacity-40 active:bg-amber-400/20"
                >
                  {GAME_LABELS[slug] ?? slug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

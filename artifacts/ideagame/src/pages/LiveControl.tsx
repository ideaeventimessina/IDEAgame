import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Pause, Play, SkipForward, Plus, Minus,
  Power, MonitorOff, X, Loader2, Wifi, WifiOff, ExternalLink,
  Sparkles, Eye, EyeOff, CheckCircle2, Clock, BarChart3, Users,
  ChevronRight, Zap, AlertTriangle, PlusCircle, Trophy,
} from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import {
  useListEvents,
  useListGameSessions, getListGameSessionsQueryKey,
  useCreateGameSession,
  useUpdateGameSession,
  useListTeams, getListTeamsQueryKey,
  useListCardSets,
  useRecordScore,
  useGetScoreboard, getGetScoreboardQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface QuizRound {
  orderIndex: number;
  type: string;
  questionText: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  points: number;
  timeLimit: number;
  optionalMediaIds: string[];
}

interface QuizPack {
  id: string;
  title: string;
  themePrompt: string;
  language: string;
  difficulty: string;
  totalRounds: number;
  status: string;
  generatedJson: QuizRound[] | null;
}

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Scelta multipla',
  true_false: 'Vero/Falso',
  image_compare: 'Confronta',
  guess_who: 'Indovina chi',
  fast_answer: 'Risposta rapida',
  bonus_final: '🏆 Bonus Finale',
};
const TYPE_COLORS: Record<string, string> = {
  multiple_choice: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  true_false: 'text-green-400 border-green-400/30 bg-green-400/10',
  image_compare: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  guess_who: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  fast_answer: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  bonus_final: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
};

const PERCORSO_CHALLENGE_EMOJIS: Record<string, string> = {
  sfida: '⚡', domanda: '❓', mimo: '🎭', ballo: '💃',
  veloce: '🏃', coppia: '👫', reazione: '😱', fantasia: '🌟',
};

interface PercorsoPathSet { id: string; name: string; description: string; }
interface PercorsoStepState {
  id: string; title: string; description: string; challengeType: string;
  points: number; timeLimit: number; optionalMediaUrl: string | null;
}
interface PercorsoStateLC {
  setId: string; setName: string; steps: PercorsoStepState[];
  currentStepIdx: number; teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'running' | 'ended';
  lastFlash: { text: string; type: string } | null; timerStartedAt: string | null;
}

export default function LiveControl() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);
  const [gameSlug, setGameSlug] = useState('quizzone');
  const [totalRounds, setTotalRounds] = useState(5);
  const [black, setBlack] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);

  // Coppie init state
  const [coppieCardSetId, setCoppieCardSetId] = useState('');
  const [coppieDifficulty, setCoppieDifficulty] = useState('medium');
  const [coppieMode, setCoppieMode] = useState('teams');
  const [coppieBusy, setCoppieBusy] = useState(false);
  const [coppieMsg, setCoppieMsg] = useState('');

  // Percorso a Risate state
  const [percorsoSets, setPercorsoSets] = useState<PercorsoPathSet[]>([]);
  const [selectedPercorsoSetId, setSelectedPercorsoSetId] = useState('');
  const [percorsoState, setPercorsoState] = useState<PercorsoStateLC | null>(null);
  const [percorsoBusy, setPercorsoBusy] = useState(false);
  const [percorsoMsg, setPercorsoMsg] = useState('');

  // Quizzone control state
  const [quizPacks, setQuizPacks] = useState<QuizPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [packDetail, setPackDetail] = useState<QuizPack | null>(null);
  const [quizzoneRoundIdx, setQuizzoneRoundIdx] = useState(0);
  const [quizzoneRevealed, setQuizzoneRevealed] = useState(false);
  const [quizzoneActive, setQuizzoneActive] = useState(false);
  const [quizzoneResponseCount, setQuizzoneResponseCount] = useState(0);
  const [quizzoneBusy, setQuizzoneBusy] = useState(false);
  const [quizzoneMsg, setQuizzoneMsg] = useState('');
  const [revealAnswer, setRevealAnswer] = useState(false);
  const pollResponseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: cardSets = [] } = useListCardSets();
  const { connected: socketConnected, on } = useEventSocket(selectedEventId || null);
  const { data: events = [] } = useListEvents();
  const { data: sessions = [] } = useListGameSessions(selectedEventId, {
    query: { queryKey: getListGameSessionsQueryKey(selectedEventId), enabled: !!selectedEventId, refetchInterval: 5000 },
  });
  const { data: teams = [] } = useListTeams(selectedEventId, {
    query: { queryKey: getListTeamsQueryKey(selectedEventId), enabled: !!selectedEventId },
  });
  const { data: scoreboardRows = [] } = useGetScoreboard(selectedEventId, {
    query: { queryKey: getGetScoreboardQueryKey(selectedEventId), enabled: !!selectedEventId, refetchInterval: socketConnected ? false : 8000 },
  });

  const createSession = useCreateGameSession();
  const updateSession = useUpdateGameSession();
  const recordScore = useRecordScore();

  const session = sessions.find(s => s.id === selectedSessionId);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0]!.id);
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) setSelectedSessionId(sessions[0]!.id);
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (timerPaused || session?.status !== 'running') return undefined;
    const i = setInterval(() => setTime(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [timerPaused, session?.status]);

  useEffect(() => {
    if (!selectedEventId) return;
    const unsubs = [
      on('score:updated', () => {
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on('team:updated', () => qc.invalidateQueries({ queryKey: getListTeamsQueryKey(selectedEventId) })),
      on('game:started', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:ended', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:paused', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on<{ count: number }>('quiz:answer_received', ({ count }) => {
        setQuizzoneResponseCount(count);
      }),
      on('quiz:reveal', () => {
        setQuizzoneRevealed(true);
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on<{ state: PercorsoStateLC }>('path:started', ({ state }) => setPercorsoState(state)),
      on<{ state: PercorsoStateLC }>('path:step_changed', ({ state }) => setPercorsoState(state)),
      on<{ state: PercorsoStateLC }>('path:score_updated', ({ state }) => {
        setPercorsoState(state);
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on<{ state: PercorsoStateLC }>('path:ended', ({ state }) => setPercorsoState(state)),
    ];
    return () => unsubs.forEach(u => u());
  }, [selectedEventId, on, qc]);

  // Load quiz packs when quizzone session is active
  useEffect(() => {
    if (session?.gameSlug !== 'quizzone') return;
    setLoadingPacks(true);
    apiFetch('/quiz-packs')
      .then((data) => {
        const packs = (data as QuizPack[]).filter(p => p.status === 'approved' || p.status === 'generated');
        setQuizPacks(packs);
      })
      .catch(() => setQuizPacks([]))
      .finally(() => setLoadingPacks(false));
  }, [session?.gameSlug, session?.id]);

  // Load full pack detail when selectedPackId changes
  useEffect(() => {
    if (!selectedPackId) { setPackDetail(null); return; }
    apiFetch(`/quiz-packs/${selectedPackId}`)
      .then(d => setPackDetail(d as QuizPack))
      .catch(() => setPackDetail(null));
  }, [selectedPackId]);

  // Load percorso sets when percorso session is active
  useEffect(() => {
    if (session?.gameSlug !== 'percorso-a-risate') return;
    apiFetch('/percorso/sets')
      .then(d => setPercorsoSets(d as PercorsoPathSet[]))
      .catch(() => setPercorsoSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync percorso state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'percorso-a-risate' || !session?.id) return;
    apiFetch(`/percorso/sessions/${session.id}/state`)
      .then(d => setPercorsoState(d as PercorsoStateLC))
      .catch(() => setPercorsoState(null));
  }, [session?.gameSlug, session?.id]);

  // Poll response count when question is active and not revealed
  useEffect(() => {
    if (!session?.id || !quizzoneActive || quizzoneRevealed) {
      if (pollResponseRef.current) clearInterval(pollResponseRef.current);
      return;
    }
    const poll = async () => {
      try {
        const s = await apiFetch(`/quizzone/sessions/${session.id}/state`) as { responseCount?: number };
        if (s.responseCount !== undefined) setQuizzoneResponseCount(s.responseCount);
      } catch { /* silent */ }
    };
    void poll();
    pollResponseRef.current = setInterval(poll, 2500);
    return () => { if (pollResponseRef.current) clearInterval(pollResponseRef.current); };
  }, [session?.id, quizzoneActive, quizzoneRevealed]);

  // Reset quizzone state when session changes
  useEffect(() => {
    setQuizzoneRoundIdx(0);
    setQuizzoneRevealed(false);
    setQuizzoneActive(false);
    setQuizzoneResponseCount(0);
    setRevealAnswer(false);
    setQuizzoneMsg('');
  }, [session?.id]);

  // Reset percorso state when session changes
  useEffect(() => {
    setSelectedPercorsoSetId('');
    setPercorsoState(null);
    setPercorsoMsg('');
  }, [session?.id]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  const confirm = (dialog: ConfirmDialog) => setConfirmDialog(dialog);

  const handleCreateSession = () => withBusy(async () => {
    const s = await createSession.mutateAsync({ id: selectedEventId, data: { gameSlug, totalRounds } }) as { id: string };
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setSelectedSessionId(s.id);
    setShowNewSession(false);
  });

  const handleStart = () => withBusy(async () => {
    if (!session) return;
    await updateSession.mutateAsync({ id: session.id, data: { status: 'running' } });
    await apiFetch(`/sessions/${session.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    const tl = packDetail?.generatedJson?.[0]?.timeLimit ?? 30;
    setTime(tl);
    setTimerPaused(false);
  });

  const handlePause = () => withBusy(async () => {
    if (!session) return;
    const newStatus = session.status === 'paused' ? 'running' : 'paused';
    await updateSession.mutateAsync({ id: session.id, data: { status: newStatus } });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setTimerPaused(newStatus === 'paused');
  });

  const handleNextRound = () => withBusy(async () => {
    if (!session) return;
    const roundsRes = await apiFetch(`/sessions/${session.id}/rounds`) as Array<{ id: string; status: string }>;
    const running = roundsRes.find(r => r.status === 'running');
    if (running) {
      await apiFetch(`/rounds/${running.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
    }
    await apiFetch(`/sessions/${session.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    const nextIdx = session.currentRound;
    const nextRound = packDetail?.generatedJson?.[nextIdx];
    setTime(nextRound?.timeLimit ?? 30);
    setTimerPaused(false);
    setRevealAnswer(false);
  });

  const handleEnd = () => {
    confirm({
      title: 'Termina gioco',
      message: 'Vuoi terminare questa sessione di gioco? I punteggi verranno salvati e potrai vedere il podio.',
      confirmLabel: 'Termina e vai al podio',
      danger: true,
      onConfirm: () => withBusy(async () => {
        if (!session) return;
        await updateSession.mutateAsync({ id: session.id, data: { status: 'ended' } });
        qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
        navigate(`/scoreboard?e=${selectedEventId}`);
      }),
    });
  };

  const handleScore = (teamId: string, delta: number) => withBusy(async () => {
    if (!session) return;
    await recordScore.mutateAsync({ id: selectedEventId, data: { teamId, gameSlug: session.gameSlug, round: session.currentRound, points: delta } });
    qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
  });

  // ─── Percorso handlers ─────────────────────────────────────────────────────

  const handlePercorsoInit = async () => {
    if (!session || !selectedPercorsoSetId || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedPercorsoSetId }),
      }) as PercorsoStateLC;
      setPercorsoState(s);
      setPercorsoMsg('✓ Percorso inizializzato!');
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoNext = async () => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/next`, { method: 'POST' }) as PercorsoStateLC;
      setPercorsoState(s);
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoSkip = async () => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/skip`, { method: 'POST' }) as PercorsoStateLC;
      setPercorsoState(s);
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoScore = async (teamId: string, points: number) => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true);
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as PercorsoStateLC;
      setPercorsoState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoEnd = () => {
    confirm({
      title: 'Fine Percorso',
      message: 'Vuoi terminare il percorso e andare al podio?',
      confirmLabel: 'Fine → Podio',
      danger: false,
      onConfirm: async () => {
        if (!session || percorsoBusy) return;
        setPercorsoBusy(true); setPercorsoMsg('');
        try {
          await apiFetch(`/percorso/sessions/${session.id}/end`, { method: 'POST' });
          setPercorsoState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setPercorsoMsg((e as Error).message); }
        finally { setPercorsoBusy(false); }
      },
    });
  };

  // ─── Quizzone control handlers ─────────────────────────────────────────────

  const handleQuizzoneStartQuestion = async (roundIdx: number) => {
    if (!session || !selectedPackId || quizzoneBusy) return;
    setQuizzoneBusy(true); setQuizzoneMsg(''); setError('');
    try {
      await apiFetch(`/quizzone/sessions/${session.id}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: selectedPackId, roundIndex: roundIdx }),
      });
      const round = packDetail?.generatedJson?.[roundIdx];
      setTime(round?.timeLimit ?? 30);
      setTimerPaused(false);
      setQuizzoneRoundIdx(roundIdx);
      setQuizzoneRevealed(false);
      setQuizzoneActive(true);
      setQuizzoneResponseCount(0);
      setRevealAnswer(false);
      setQuizzoneMsg(`✓ Domanda ${roundIdx + 1} inviata!`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setQuizzoneBusy(false); }
  };

  const handleQuizzoneReveal = async () => {
    if (!session || quizzoneBusy || !quizzoneActive) return;
    setQuizzoneBusy(true); setQuizzoneMsg(''); setError('');
    try {
      await apiFetch(`/quizzone/sessions/${session.id}/reveal`, { method: 'POST' });
      setQuizzoneRevealed(true);
      setRevealAnswer(true);
      setQuizzoneMsg('✓ Risposta rivelata!');
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) {
      setError((e as Error).message);
    } finally { setQuizzoneBusy(false); }
  };

  const handleQuizzoneEnd = () => {
    confirm({
      title: 'Fine Quizzone',
      message: 'Vuoi terminare il quiz e andare al podio? I punteggi sono già salvati.',
      confirmLabel: 'Fine quiz → Podio',
      danger: false,
      onConfirm: async () => {
        if (!session || quizzoneBusy) return;
        setQuizzoneBusy(true); setError('');
        try {
          await apiFetch(`/quizzone/sessions/${session.id}/end`, { method: 'POST' });
          qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
          setQuizzoneActive(false);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) {
          setError((e as Error).message);
        } finally { setQuizzoneBusy(false); }
      },
    });
  };

  // Current pack round data
  const rounds = packDetail?.generatedJson ?? [];
  const currentRound = rounds[quizzoneRoundIdx] ?? null;
  const totalPackRounds = rounds.length;
  const accentColor = '#8B5CF6';

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      {/* Blackout overlay */}
      {black && <div className="fixed inset-0 z-50 bg-black" onClick={() => setBlack(false)} />}

      {/* ── Confirm dialog ───────────────────────────────────────────────── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${confirmDialog.danger ? 'text-destructive' : 'text-amber-400'}`} />
              <div className="text-display font-black">{confirmDialog.title}</div>
            </div>
            <div className="text-sm text-muted-foreground">{confirmDialog.message}</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-secondary/30">
                Annulla
              </button>
              <button
                onClick={() => { setConfirmDialog(null); confirmDialog.onConfirm(); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black ${confirmDialog.danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="rounded-full border border-border p-2 hover-elevate"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Cockpit animatore</div>
            {socketConnected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400 animate-pulse" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/scoreboard?e=${selectedEventId}`)}
              disabled={!selectedEventId}
              title="Vai al podio"
              className="rounded-full border border-border p-2 hover-elevate disabled:opacity-40">
              <Trophy className="h-4 w-4" />
            </button>
            <button onClick={() => setBlack(b => !b)}
              className={`rounded-full border p-2 ${black ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border hover-elevate'}`}>
              <MonitorOff className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {/* Event & session selector */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Evento</div>
            <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedSessionId(''); setShowNewSession(false); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">— seleziona evento —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} ({ev.joinCode})</option>)}
            </select>
          </div>

          {selectedEventId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Sessione di gioco</div>
                {sessions.length > 0 && (
                  <button onClick={() => setShowNewSession(s => !s)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <PlusCircle className="h-3 w-3" /> Nuova sessione
                  </button>
                )}
              </div>

              {/* New session form */}
              {(sessions.length === 0 || showNewSession) && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={gameSlug} onChange={e => setGameSlug(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      <option value="quizzone">Quizzone</option>
                      <option value="gioco-coppie">Gioco delle coppie</option>
                      <option value="percorso-a-risate">Percorso a risate</option>
                      <option value="hot-or-not">Hot or Not</option>
                      <option value="indovina-titolo">Indovina il titolo</option>
                      <option value="festa-segreti">Festa dei segreti</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setTotalRounds(r => Math.max(1, r - 1))} className="rounded-lg border border-border p-2 hover-elevate"><Minus className="h-3 w-3" /></button>
                      <span className="flex-1 text-center text-sm font-bold">{totalRounds} rnd</span>
                      <button onClick={() => setTotalRounds(r => r + 1)} className="rounded-lg border border-border p-2 hover-elevate"><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateSession} disabled={busy}
                      className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crea sessione
                    </button>
                    {showNewSession && (
                      <button onClick={() => setShowNewSession(false)} className="rounded-xl border border-border px-4 py-3 text-sm hover:bg-secondary/30">
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Session selector */}
              {sessions.length > 0 && !showNewSession && (
                <select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.gameSlug} — {s.status} ({s.currentRound}/{s.totalRounds})</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Game controls */}
        {session && (
          <div className="rounded-3xl border-2 p-6 space-y-4" style={{ borderColor: accentColor, background: `${accentColor}10` }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Gioco</div>
                <div className="text-display text-xl font-black capitalize" style={{ color: accentColor }}>{session.gameSlug.replace(/-/g, ' ')}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Stato</div>
                <div className={`text-sm font-bold ${session.status === 'running' ? 'text-green-400' : session.status === 'paused' ? 'text-amber-400' : session.status === 'ended' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {session.status}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Round</div>
                <div className="text-display text-5xl font-black">{session.currentRound}/{session.totalRounds}</div>
              </div>
              <div className="relative grid h-36 w-36 place-items-center rounded-full border-8 border-primary/30">
                <div className="absolute inset-2 rounded-full border-8 transition-all" style={{ borderColor: accentColor, opacity: time > 0 ? 1 : 0.3 }} />
                <div className="text-display text-5xl font-black tabular-nums">{time}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setTime(t => t + 10)} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">+10s</button>
              {session.status === 'idle' ? (
                <button onClick={handleStart} disabled={busy}
                  className="rounded-xl bg-green-500 py-3 text-sm font-black text-background hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Avvia
                </button>
              ) : (
                <button onClick={handlePause} disabled={busy || session.status === 'ended'}
                  className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : session.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {session.status === 'paused' ? 'Riprendi' : 'Pausa'}
                </button>
              )}
              <button onClick={() => setTime(t => Math.max(0, t - 10))} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">−10s</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleNextRound} disabled={busy || session.status !== 'running'}
                className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />} Prossimo round
              </button>
              <button onClick={handleEnd} disabled={busy || session.status === 'ended'}
                className="rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Termina
              </button>
            </div>
          </div>
        )}

        {/* ─── Quizzone AI panel ─────────────────────────────────────── */}
        {session?.gameSlug === 'quizzone' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Quizzone AI — Controllo Live</div>
              <a href={`${BASE}quizzone?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Proiettore
              </a>
            </div>

            {/* Pack selector */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Quiz pack</div>
              {loadingPacks ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
                </div>
              ) : quizPacks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                  Nessun quiz pack approvato. Generane uno in <span className="font-bold text-primary">Admin → Quiz AI</span>.
                </div>
              ) : (
                <select value={selectedPackId}
                  onChange={e => { setSelectedPackId(e.target.value); setQuizzoneRoundIdx(0); setQuizzoneActive(false); setQuizzoneRevealed(false); }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— seleziona pack —</option>
                  {quizPacks.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.totalRounds} round, {p.language.toUpperCase()})</option>
                  ))}
                </select>
              )}
            </div>

            {packDetail && (
              <>
                {/* Status badge */}
                <div className="flex items-center gap-2 text-xs">
                  {quizzoneActive ? (
                    quizzoneRevealed ? (
                      <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 font-bold text-green-400">
                        ✓ Risposta rivelata
                      </span>
                    ) : (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                        ⚡ Domanda attiva
                      </span>
                    )
                  ) : (
                    <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                      In attesa…
                    </span>
                  )}
                  {quizzoneActive && !quizzoneRevealed && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {quizzoneResponseCount} risposte
                    </span>
                  )}
                  {quizzoneMsg && (
                    <span className={`ml-auto font-bold ${quizzoneMsg.startsWith('✓') ? 'text-green-400' : 'text-destructive'}`}>
                      {quizzoneMsg}
                    </span>
                  )}
                </div>

                {/* Current round card */}
                {currentRound && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${TYPE_COLORS[currentRound.type] ?? 'text-muted-foreground border-border bg-card'}`}>
                        {TYPE_LABELS[currentRound.type] ?? currentRound.type}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{currentRound.timeLimit}s</span>
                        <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{currentRound.points}pt</span>
                        <span className={currentRound.difficulty === 'easy' ? 'text-green-400' : currentRound.difficulty === 'hard' ? 'text-red-400' : 'text-yellow-400'}>
                          {currentRound.difficulty}
                        </span>
                        <span className="text-muted-foreground/60">D{quizzoneRoundIdx + 1}/{totalPackRounds}</span>
                      </div>
                    </div>

                    <div className="text-sm font-bold leading-snug">{currentRound.questionText}</div>

                    <div className="space-y-1.5">
                      {currentRound.answers.map((a, i) => {
                        const isCorrect = i === currentRound.correctAnswer;
                        const showCorrect = revealAnswer && isCorrect;
                        return (
                          <div key={i}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
                              showCorrect
                                ? 'border-green-500/50 bg-green-500/15 font-bold text-green-300'
                                : revealAnswer && !isCorrect
                                ? 'border-border/40 opacity-50'
                                : 'border-border bg-background/50'
                            }`}>
                            <span className="font-black w-4 text-center opacity-60">{String.fromCharCode(65 + i)}</span>
                            <span className="flex-1">{a}</span>
                            {showCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setRevealAnswer(v => !v)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
                        revealAnswer
                          ? 'border border-green-500/40 bg-green-500/10 text-green-400'
                          : 'border border-border text-muted-foreground hover:bg-card'
                      }`}>
                      {revealAnswer ? <><EyeOff className="h-3.5 w-3.5" /> Nascondi anteprima</> : <><Eye className="h-3.5 w-3.5" /> Anteprima risposta</>}
                    </button>

                    {revealAnswer && currentRound.explanation && (
                      <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground italic">
                        {currentRound.explanation}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Main action buttons ───────────────────────────── */}
                <div className="space-y-2">
                  {(!quizzoneActive || quizzoneRevealed) && (
                    <button
                      disabled={!selectedPackId || quizzoneBusy || session.status === 'ended' || quizzoneRoundIdx >= totalPackRounds}
                      onClick={() => {
                        const nextIdx = quizzoneRevealed ? quizzoneRoundIdx + 1 : quizzoneRoundIdx;
                        void handleQuizzoneStartQuestion(nextIdx);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      {quizzoneRevealed
                        ? quizzoneRoundIdx + 1 >= totalPackRounds
                          ? 'Fine pack'
                          : `Domanda ${quizzoneRoundIdx + 2}/${totalPackRounds}`
                        : `Avvia domanda ${quizzoneRoundIdx + 1}/${totalPackRounds}`}
                    </button>
                  )}

                  {quizzoneActive && !quizzoneRevealed && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => void handleQuizzoneReveal()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-black text-background disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      Rivela risposta ({quizzoneResponseCount} ricevute)
                    </button>
                  )}

                  {quizzoneRevealed && quizzoneRoundIdx + 1 < totalPackRounds && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => void handleQuizzoneStartQuestion(quizzoneRoundIdx + 1)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary py-3 text-sm font-black text-primary disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                      Prossima domanda ({quizzoneRoundIdx + 2}/{totalPackRounds})
                    </button>
                  )}

                  {(quizzoneRevealed || quizzoneActive) && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => handleQuizzoneEnd()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      Fine quiz → Podio
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {rounds.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Avanzamento</span>
                      <span>{quizzoneRoundIdx + (quizzoneActive ? 1 : 0)}/{rounds.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-0.5 pt-0.5">
                      {rounds.map((_, i) => (
                        <div key={i}
                          className={`h-1.5 flex-1 min-w-[4px] rounded-full transition-all ${
                            i < quizzoneRoundIdx ? 'bg-primary/50' :
                            i === quizzoneRoundIdx && quizzoneActive ? 'bg-primary' :
                            'bg-border'
                          }`} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Scores */}
        {session && teams.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Punteggi live</div>
            <div className="space-y-2">
              {teams.map(tm => {
                const entry = scoreboardRows.find(r => r.teamId === tm.id);
                const total = entry?.total ?? 0;
                return (
                  <div key={tm.id} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: tm.color }} />
                    <div className="flex-1 truncate font-bold">{tm.name}</div>
                    <button onClick={() => handleScore(tm.id, -1)} disabled={busy || session.status !== 'running'}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border hover-elevate disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                    <div className="w-14 text-center text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>{total}</div>
                    <button onClick={() => handleScore(tm.id, 1)} disabled={busy || session.status !== 'running'}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border hover-elevate disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coppie init panel */}
        {session?.gameSlug === 'gioco-coppie' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Inizializza Board Coppie</div>
            {coppieMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${coppieMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {coppieMsg}
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Deck di carte</div>
              <select value={coppieCardSetId} onChange={e => setCoppieCardSetId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <option value="">— seleziona deck —</option>
                {cardSets.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Difficoltà</div>
                <select value={coppieDifficulty} onChange={e => setCoppieDifficulty(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="easy">Facile (6 coppie)</option>
                  <option value="medium">Medio (10 coppie)</option>
                  <option value="hard">Difficile (15 coppie)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Modalità</div>
                <select value={coppieMode} onChange={e => setCoppieMode(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="teams">Squadre</option>
                  <option value="individual">Individuale</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={!coppieCardSetId || coppieBusy}
                onClick={async () => {
                  setCoppieBusy(true); setCoppieMsg('');
                  try {
                    await apiFetch(`/coppie/sessions/${session.id}/init`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cardSetId: coppieCardSetId, difficulty: coppieDifficulty, mode: coppieMode, teamIds: [] }),
                    });
                    setCoppieMsg('✓ Board inizializzata!');
                  } catch (e) { setCoppieMsg((e as Error).message); }
                  finally { setCoppieBusy(false); }
                }}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {coppieBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {coppieMsg.startsWith('✓') ? 'Ricomincia' : 'Inizializza'}
              </button>
              <a
                href={`${BASE}coppie?s=${session.id}&e=${selectedEventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:bg-secondary/30"
              >
                <ExternalLink className="h-4 w-4" /> Board
              </a>
            </div>
          </div>
        )}

        {/* ─── Percorso a Risate panel ───────────────────────────────── */}
        {session?.gameSlug === 'percorso-a-risate' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎭</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Percorso a Risate</div>
              <a href={`${BASE}percorso-risate?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Proiettore
              </a>
            </div>

            {percorsoMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${percorsoMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {percorsoMsg}
              </div>
            )}

            {/* Status */}
            {percorsoState && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  percorsoState.status === 'running' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                  percorsoState.status === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {percorsoState.status === 'idle' ? 'In attesa' : percorsoState.status === 'running' ? '⚡ In corso' : '🏁 Terminato'}
                </span>
                {percorsoState.status !== 'idle' && (
                  <span className="text-muted-foreground">
                    Sfida {Math.max(0, percorsoState.currentStepIdx + 1)}/{percorsoState.steps.length}
                  </span>
                )}
              </div>
            )}

            {/* Current step preview */}
            {percorsoState?.status === 'running' && percorsoState.currentStepIdx >= 0 && (() => {
              const step = percorsoState.steps[percorsoState.currentStepIdx];
              if (!step) return null;
              return (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{PERCORSO_CHALLENGE_EMOJIS[step.challengeType] ?? '🎯'}</span>
                    <span className="text-xs font-bold text-primary capitalize">{step.challengeType}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{step.points} pt</span>
                  </div>
                  <div className="text-sm font-bold leading-snug">{step.title}</div>
                  {step.description && <div className="text-xs text-muted-foreground">{step.description}</div>}
                </div>
              );
            })()}

            {/* Init: no state yet */}
            {!percorsoState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Set sfide</div>
                  <select value={selectedPercorsoSetId} onChange={e => setSelectedPercorsoSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona set —</option>
                    {percorsoSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button disabled={!selectedPercorsoSetId || percorsoBusy}
                  onClick={() => void handlePercorsoInit()}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza
                </button>
              </>
            )}

            {/* Idle: ready to start */}
            {percorsoState?.status === 'idle' && (
              <>
                <div className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  Set: <span className="font-bold text-foreground">{percorsoState.setName}</span> — {percorsoState.steps.length} sfide
                </div>
                <button onClick={() => void handlePercorsoNext()} disabled={percorsoBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-black text-background disabled:opacity-40">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Inizia il percorso!
                </button>
              </>
            )}

            {/* Running controls */}
            {percorsoState?.status === 'running' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void handlePercorsoNext()}
                    disabled={percorsoBusy || percorsoState.currentStepIdx >= percorsoState.steps.length - 1}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
                    {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                    Avanti
                  </button>
                  <button onClick={() => void handlePercorsoSkip()}
                    disabled={percorsoBusy || percorsoState.currentStepIdx >= percorsoState.steps.length - 1}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-40">
                    ⏭ Salta
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti</div>
                  {percorsoState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handlePercorsoScore(tm.id, pts)} disabled={percorsoBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <button onClick={handlePercorsoEnd} disabled={percorsoBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine percorso → Podio
                </button>
              </>
            )}

            {/* Ended */}
            {percorsoState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Percorso terminato
              </div>
            )}
          </div>
        )}

        {!session && sessions.length === 0 && selectedEventId && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-sm">
            Crea una sessione di gioco per iniziare
          </div>
        )}
      </div>
    </div>
  );
}

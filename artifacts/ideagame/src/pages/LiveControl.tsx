import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Pause, Play, SkipForward, Plus, Minus,
  Power, MonitorOff, X, Loader2, Wifi, WifiOff, ExternalLink,
  Sparkles, Eye, EyeOff, CheckCircle2, Clock, BarChart3,
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

export default function LiveControl() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [gameSlug, setGameSlug] = useState('quizzone');
  const [totalRounds, setTotalRounds] = useState(5);
  const [black, setBlack] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);

  // Coppie init state
  const [coppieCardSetId, setCoppieCardSetId] = useState('');
  const [coppieDifficulty, setCoppieDifficulty] = useState('medium');
  const [coppieMode, setCoppieMode] = useState('teams');
  const [coppieBusy, setCoppieBusy] = useState(false);
  const [coppieMsg, setCoppieMsg] = useState('');

  // Quizzone AI pack state
  const [quizPacks, setQuizPacks] = useState<QuizPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [packDetail, setPackDetail] = useState<QuizPack | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

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
      on('score:updated', () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) })),
      on('team:updated', () => qc.invalidateQueries({ queryKey: getListTeamsQueryKey(selectedEventId) })),
      on('game:started', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:ended', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:paused', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
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
  }, [session?.gameSlug]);

  // Load full pack detail when selectedPackId changes
  useEffect(() => {
    if (!selectedPackId) { setPackDetail(null); return; }
    apiFetch(`/quiz-packs/${selectedPackId}`)
      .then(d => setPackDetail(d as QuizPack))
      .catch(() => setPackDetail(null));
  }, [selectedPackId]);

  // Reset reveal when round changes
  useEffect(() => { setRevealAnswer(false); }, [session?.currentRound]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  const handleCreateSession = () => withBusy(async () => {
    const s = await createSession.mutateAsync({ id: selectedEventId, data: { gameSlug, totalRounds } }) as { id: string };
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setSelectedSessionId(s.id);
  });

  const handleStart = () => withBusy(async () => {
    if (!session) return;
    await updateSession.mutateAsync({ id: session.id, data: { status: 'running' } });
    await apiFetch(`/sessions/${session.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setTime(packDetail?.generatedJson?.[0]?.timeLimit ?? 30);
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
    // Auto-set timer from next pack round
    const nextIdx = session.currentRound; // after POST, currentRound will increment
    const nextRound = packDetail?.generatedJson?.[nextIdx];
    setTime(nextRound?.timeLimit ?? 30);
    setTimerPaused(false);
    setRevealAnswer(false);
  });

  const handleEnd = () => withBusy(async () => {
    if (!session) return;
    await updateSession.mutateAsync({ id: session.id, data: { status: 'ended' } });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    navigate('/scoreboard');
  });

  const handleScore = (teamId: string, delta: number) => withBusy(async () => {
    if (!session) return;
    await recordScore.mutateAsync({ id: selectedEventId, data: { teamId, gameSlug: session.gameSlug, round: session.currentRound, points: delta } });
    qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
  });

  // Current pack round (0-indexed, session.currentRound is 1-indexed)
  const currentRoundIdx = Math.max(0, (session?.currentRound ?? 1) - 1);
  const rounds = packDetail?.generatedJson ?? [];
  const currentRound = rounds[currentRoundIdx] ?? null;

  const accentColor = '#8B5CF6';

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      {black && <div className="fixed inset-0 z-50 bg-black" onClick={() => setBlack(false)} />}
      <div className="mx-auto max-w-md space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="rounded-full border border-border p-2 hover-elevate"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Cockpit animatore</div>
            {socketConnected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400 animate-pulse" />}
          </div>
          <button onClick={() => setBlack(b => !b)}
            className={`rounded-full border p-2 ${black ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border hover-elevate'}`}>
            <MonitorOff className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {/* Event & session selector */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Evento</div>
            <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedSessionId(''); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">— seleziona evento —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} ({ev.joinCode})</option>)}
            </select>
          </div>

          {selectedEventId && (
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Sessione di gioco</div>
              {sessions.length === 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={gameSlug} onChange={e => setGameSlug(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      <option value="quizzone">Quizzone</option>
                      <option value="percorso-a-risate">Percorso a risate</option>
                      <option value="gioco-coppie">Gioco delle coppie</option>
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
                  <button onClick={handleCreateSession} disabled={busy}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crea sessione
                  </button>
                </div>
              ) : (
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
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Quiz AI</div>
              <div className="ml-auto text-xs text-muted-foreground/50">salvato offline</div>
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
                <select value={selectedPackId} onChange={e => { setSelectedPackId(e.target.value); setRevealAnswer(false); }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— seleziona pack —</option>
                  {quizPacks.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.totalRounds} round, {p.language.toUpperCase()})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Current round card */}
            {packDetail && session && currentRound && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                {/* Round meta */}
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
                  </div>
                </div>

                {/* Question */}
                <div className="text-sm font-bold leading-snug">{currentRound.questionText}</div>

                {/* Answers */}
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

                {/* Reveal button */}
                <button onClick={() => setRevealAnswer(v => !v)}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all ${
                    revealAnswer
                      ? 'border border-green-500/40 bg-green-500/10 text-green-400'
                      : 'bg-primary text-primary-foreground hover:opacity-90'
                  }`}>
                  {revealAnswer ? <><EyeOff className="h-4 w-4" /> Nascondi risposta</> : <><Eye className="h-4 w-4" /> Rivela risposta</>}
                </button>

                {/* Explanation (only when revealed) */}
                {revealAnswer && currentRound.explanation && (
                  <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground italic">
                    {currentRound.explanation}
                  </div>
                )}
              </div>
            )}

            {/* Progress through pack */}
            {packDetail && rounds.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Avanzamento pack</span>
                  <span>{currentRoundIdx + 1}/{rounds.length}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${((currentRoundIdx + 1) / rounds.length) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {rounds.map((r, i) => (
                    <div key={i}
                      className={`h-1.5 flex-1 min-w-[6px] rounded-full transition-all ${
                        i < currentRoundIdx ? 'bg-primary/40' :
                        i === currentRoundIdx ? 'bg-primary' :
                        'bg-border'
                      }`} />
                  ))}
                </div>
              </div>
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
            {coppieMsg.startsWith('✓') && (
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
                    setCoppieMsg('✓ Board resettata!');
                  } catch (e) { setCoppieMsg((e as Error).message); }
                  finally { setCoppieBusy(false); }
                }}
                className="w-full rounded-xl border border-destructive/40 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                ↺ Reset board (nuova partita)
              </button>
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

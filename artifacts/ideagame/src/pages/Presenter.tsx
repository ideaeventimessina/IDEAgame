import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SkipForward, Pause, Play, Plus, Minus, Trophy, Mic2,
  MonitorPlay, Loader2, WifiOff, Wifi,
  ArrowLeft, RotateCcw, Users, Clock, Siren,
} from 'lucide-react';
import { useAuth } from '@/auth/roles';
import { useEventSocket } from '@/hooks/useEventSocket';
import {
  useListEvents, useListTeams, useGetScoreboard,
  getListTeamsQueryKey, getGetScoreboardQueryKey,
  useListGameSessions, getListGameSessionsQueryKey,
  useUpdateGameSession,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAudioOrchestrator } from '@/contexts/AudioOrchestrator';
import { MissingLoopBanner } from '@/components/MissingLoopBanner';
import { VolumeFab } from '@/components/VolumeFab';
import { PanicPanel } from '@/components/PanicPanel';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

const SLUG_LABELS: Record<string, string> = {
  'percorso-a-risate': 'Percorso a Risate',
  'gioco-coppie': 'Gioco delle Coppie',
  'quizzone': 'Quizzone',
  'adult-only': 'Adult Only',
  'sfida-ballo': 'Sfida di Ballo',
  'parola-alle-spalle': 'Parola alle Spalle',
  'karaoke-battle': 'Karaoke Battle',
  'freestyle-battle': 'Freestyle Battle',
  'saramusica': 'Sara Musica',
};

const SLUG_EMOJI: Record<string, string> = {
  'percorso-a-risate': '🎲',
  'gioco-coppie': '🃏',
  'quizzone': '❓',
  'adult-only': '🔥',
  'sfida-ballo': '💃',
  'parola-alle-spalle': '🔤',
  'karaoke-battle': '🎤',
  'freestyle-battle': '⭐',
  'saramusica': '🎵',
};

interface ActiveSession {
  id: string;
  gameSlug: string;
  status: string;
  currentRound: number;
  totalRounds: number;
}

export default function Presenter() {
  const [, navigate] = useLocation();
  const { user, role, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) navigate('/login');
  }, [isLoading, user, navigate]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { projectorActive, setActiveGameSlug } = useAudioOrchestrator();

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [scoreDelta, setScoreDelta] = useState<Record<string, number>>({});
  const [addingScore, setAddingScore] = useState(false);

  const { data: events = [] } = useListEvents();

  const projectorUrl = selectedEventId ? `${window.location.origin}${BASE}?e=${events.find(e => e.id === selectedEventId)?.joinCode ?? ''}`.replace(/([^:])\/\//g, '$1/') : `${window.location.origin}${BASE}`;
  const liveEvents = events.filter(e => e.status === 'live');
  const liveEvent = liveEvents[0] ?? null;
  const { data: sessions = [] } = useListGameSessions(selectedEventId, {
    query: {
      queryKey: getListGameSessionsQueryKey(selectedEventId),
      enabled: !!selectedEventId,
      refetchInterval: 1000,
    },
  });
  const { data: teams = [] } = useListTeams(selectedEventId, {
    query: { queryKey: getListTeamsQueryKey(selectedEventId), enabled: !!selectedEventId },
  });
  const { data: scoreboardRows = [] } = useGetScoreboard(selectedEventId, {
    query: {
      queryKey: getGetScoreboardQueryKey(selectedEventId),
      enabled: !!selectedEventId,
      refetchInterval: 8000,
    },
  });

  const updateSession = useUpdateGameSession();
  const { connected, on, emit } = useEventSocket(selectedEventId || null);

  // Redirect if not admin
  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  // Presentatore: si aggancia solo all'evento live deciso dalla regia.
  useEffect(() => {
    if (liveEvent?.id && selectedEventId !== liveEvent.id) {
      setSelectedEventId(liveEvent.id);
      setSelectedSessionId('');
      setActiveSession(null);
    }
    if (!liveEvent && selectedEventId) {
      setSelectedEventId('');
      setSelectedSessionId('');
      setActiveSession(null);
    }
  }, [liveEvent?.id, selectedEventId]);

  // Auto-select running session
  useEffect(() => {
    if (!sessions.length) { setSelectedSessionId(''); setActiveSession(null); return; }
    const running = sessions.find(s => s.status === 'running') ?? sessions[0];
    if (running && running.id !== selectedSessionId) {
      setSelectedSessionId(running.id);
    }
  }, [sessions]);

  // Sync active session object
  useEffect(() => {
    if (!selectedSessionId) { setActiveSession(null); return; }
    const s = sessions.find(s => s.id === selectedSessionId);
    if (s) setActiveSession({
      id: s.id,
      gameSlug: s.gameSlug,
      status: s.status,
      currentRound: s.currentRound ?? 0,
      totalRounds: s.totalRounds ?? 1,
    });
    else setActiveSession(null);
  }, [selectedSessionId, sessions]);

  // Socket: refresh sessions on game events
  useEffect(() => {
    if (!selectedEventId) return;
    const refreshSessions = () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    const unsubs = [
      on('game:session_created', refreshSessions),
      on('game:started', refreshSessions),
      on('game:resumed', refreshSessions),
      on('game:paused', refreshSessions),
      on('game:ended', refreshSessions),
      on('round:changed', refreshSessions),
      on('score:updated', () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) })),
    ];
    return () => { unsubs.forEach(u => u?.()); };
  }, [selectedEventId, on, qc]);

  // Audio: transition game music when active session changes
  useEffect(() => {
    if (!projectorActive) return;
    const slug = activeSession?.status === 'running' ? activeSession.gameSlug : null;
    setActiveGameSlug(slug);
  }, [activeSession?.gameSlug, activeSession?.status, projectorActive, setActiveGameSlug]);

  const handlePause = useCallback(async () => {
    if (!activeSession || sessionBusy) return;
    setSessionBusy(true);
    try {
      const newStatus = activeSession.status === 'running' ? 'paused' : 'running';
      await updateSession.mutateAsync({
        id: activeSession.id,
        data: { status: newStatus },
      });
      qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    } catch (e) {
      toast({ title: 'Errore', description: (e as Error).message, variant: 'destructive' });
    } finally { setSessionBusy(false); }
  }, [activeSession, sessionBusy, updateSession, qc, selectedEventId, toast]);

  const handleNext = useCallback(async () => {
    if (!activeSession || sessionBusy) return;
    setSessionBusy(true);
    try {
      if (activeSession.gameSlug === 'percorso-a-risate') {
        await apiFetch(`/percorso/sessions/${activeSession.id}/next`, { method: 'POST' });
      } else if (activeSession.gameSlug === 'quizzone') {
        await apiFetch(`/quizzone/sessions/${activeSession.id}/next`, { method: 'POST' });
      } else {
        await updateSession.mutateAsync({
          id: activeSession.id,
          data: { currentRound: (activeSession.currentRound ?? 0) + 1 },
        });
      }
      qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
      toast({ title: 'Avanzato al prossimo round' });
    } catch (e) {
      toast({ title: 'Errore', description: (e as Error).message, variant: 'destructive' });
    } finally { setSessionBusy(false); }
  }, [activeSession, sessionBusy, updateSession, qc, selectedEventId, toast]);

  const adjustScore = (teamId: string, delta: number) => {
    setScoreDelta(prev => ({ ...prev, [teamId]: (prev[teamId] ?? 0) + delta }));
  };

  const commitScores = useCallback(async () => {
    const entries = Object.entries(scoreDelta).filter(([, d]) => d !== 0);
    if (!entries.length || !selectedEventId || !activeSession) return;
    setAddingScore(true);
    try {
      await Promise.all(entries.map(([teamId, pts]) =>
        apiFetch('/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: selectedEventId,
            teamId,
            gameSlug: activeSession.gameSlug,
            points: pts,
            round: activeSession.currentRound ?? 0,
          }),
        })
      ));
      setScoreDelta({});
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      toast({ title: `Punteggi aggiornati` });
    } catch (e) {
      toast({ title: 'Errore punteggi', description: (e as Error).message, variant: 'destructive' });
    } finally { setAddingScore(false); }
  }, [scoreDelta, selectedEventId, activeSession, qc, toast]);

  const selectedEvent = liveEvent;
  const hasPendingScore = Object.values(scoreDelta).some(d => d !== 0);

  const statusColor = activeSession?.status === 'running'
    ? '#00F5A0' : activeSession?.status === 'paused' ? '#F5B642' : '#666';

  if (user && !selectedEventId) {
    return (
      <div className="min-h-screen select-none px-5 py-6 text-white"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
        <button
          onClick={() => navigate('/cockpit')}
          className="mb-8 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Cockpit
        </button>

        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
          <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-amber-400/35 bg-amber-400/10">
            <Clock className="h-10 w-10 text-amber-300" />
          </div>
          <div className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">Presentatore in attesa</div>
          <h1 className="mt-3 text-3xl font-black">Aspetto la Regia</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Quando la regia crea e avvia un evento live, questo telefono si collega automaticamente alla serata.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
            {connected ? <Wifi className="h-3.5 w-3.5 text-green-400" /> : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
            Collegamento pronto
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen select-none"
      style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-white/10 backdrop-blur-md"
        style={{ background: 'rgba(6,2,19,0.85)' }}>
        <button
          onClick={() => navigate('/cockpit')}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Cockpit
        </button>

        <div className="flex items-center gap-2">
          <Mic2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-black text-primary">PRESENTATORE</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {connected
              ? <Wifi className="h-3.5 w-3.5 text-green-400" />
              : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4 pb-24">

        <MissingLoopBanner />

        {/* Live event badge */}
        <div className="rounded-2xl border border-green-500/25 bg-green-500/10 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-green-300/80 mb-0.5">Evento live agganciato dalla regia</div>
          <div className="font-black text-base">{selectedEvent?.name ?? 'Evento live'}</div>
          <div className="mt-1 text-xs text-white/50">{selectedEvent?.joinCode ? `Codice ${selectedEvent.joinCode}` : 'Controllo presentatore attivo'}</div>
        </div>

        {/* Active session card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Sessione attiva</div>
                {activeSession ? (
                  <>
                    <div className="text-xl font-black flex items-center gap-2">
                      <span>{SLUG_EMOJI[activeSession.gameSlug] ?? '🎮'}</span>
                      <span>{SLUG_LABELS[activeSession.gameSlug] ?? activeSession.gameSlug}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
                      <span className="text-xs font-bold capitalize" style={{ color: statusColor }}>
                        {activeSession.status === 'running' ? 'In corso' : activeSession.status === 'paused' ? 'In pausa' : activeSession.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Round {(activeSession.currentRound ?? 0) + 1}/{activeSession.totalRounds}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm mt-1">Nessuna sessione in corso</div>
                )}
              </div>
              {sessions.length > 1 && (
                <select
                  value={selectedSessionId}
                  onChange={e => setSelectedSessionId(e.target.value)}
                  className="text-xs bg-secondary/60 border border-border rounded-lg px-2 py-1 max-w-[120px]"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {SLUG_EMOJI[s.gameSlug] ?? '🎮'} {s.status === 'running' ? '▶' : s.status === 'paused' ? '⏸' : '⏹'} {SLUG_LABELS[s.gameSlug]?.slice(0, 10) ?? s.gameSlug}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Main controls */}
          {activeSession && (
            <div className="px-4 pb-4 flex gap-3">
              {/* Pause/Resume */}
              <button
                onClick={handlePause}
                disabled={sessionBusy || activeSession.status === 'ended'}
                className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl py-5 border border-white/10 transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: activeSession.status === 'running'
                    ? 'rgba(245,182,66,0.15)' : 'rgba(0,245,160,0.15)',
                  borderColor: activeSession.status === 'running'
                    ? 'rgba(245,182,66,0.4)' : 'rgba(0,245,160,0.4)',
                }}
              >
                {sessionBusy ? <Loader2 className="h-6 w-6 animate-spin" /> :
                  activeSession.status === 'running'
                    ? <Pause className="h-6 w-6" style={{ color: '#F5B642' }} />
                    : <Play className="h-6 w-6" style={{ color: '#00F5A0' }} />
                }
                <span className="text-xs font-bold">
                  {activeSession.status === 'running' ? 'Pausa' : 'Riprendi'}
                </span>
              </button>

              {/* Next */}
              <button
                onClick={handleNext}
                disabled={sessionBusy || activeSession.status === 'ended'}
                className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl py-5 border border-white/10 bg-primary/15 border-primary/40 transition-all active:scale-95 disabled:opacity-40"
              >
                {sessionBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <SkipForward className="h-6 w-6 text-primary" />}
                <span className="text-xs font-bold text-primary">Avanti</span>
              </button>
            </div>
          )}
        </div>

        {/* Score board — per team quick +/- */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-black">Punteggi</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {teams.length} squadre
            </div>
          </div>

          <div className="px-3 pb-3 space-y-2">
            {teams.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground">Nessuna squadra</div>
            )}
            {teams.map(team => {
              const sb = scoreboardRows.find(r => r.teamId === team.id);
              const total = (sb?.total ?? 0);
              const delta = scoreDelta[team.id] ?? 0;
              return (
                <div key={team.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
                  style={{ borderColor: `${team.color ?? '#F5B642'}30`, background: `${team.color ?? '#F5B642'}08` }}>
                  {/* Color dot + name */}
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ background: team.color ?? '#F5B642' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{team.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {total} pt
                      {delta !== 0 && (
                        <span className={`ml-1 font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* +/- controls */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustScore(team.id, -1)}
                      className="h-9 w-9 rounded-xl bg-secondary/60 flex items-center justify-center text-lg font-black active:scale-90 transition-transform">
                      <Minus className="h-4 w-4" />
                    </button>
                    <button onClick={() => adjustScore(team.id, 1)}
                      className="h-9 w-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="h-4 w-4 text-primary" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirm scores button */}
          <AnimatePresence>
            {hasPendingScore && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="px-3 pb-3">
                <div className="flex gap-2">
                  <button onClick={() => setScoreDelta({})}
                    className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                    <RotateCcw className="h-4 w-4 inline mr-1" />Annulla
                  </button>
                  <button onClick={commitScores} disabled={addingScore}
                    className="flex-1 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground active:scale-95 transition-transform disabled:opacity-50">
                    {addingScore ? <Loader2 className="h-4 w-4 inline animate-spin" /> : null}
                    {' '}Conferma punti
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scoreboard */}
        {scoreboardRows.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-black">Classifica</span>
            </div>
            <div className="space-y-1.5">
              {[...scoreboardRows]
                .sort((a, b) => b.total - a.total)
                .map((row, i) => {
                  const team = teams.find(t => t.id === row.teamId);
                  return (
                    <div key={row.teamId}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/5">
                      <span className="text-display text-sm font-black w-5 text-muted-foreground">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </span>
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: team?.color ?? '#888' }} />
                      <span className="flex-1 text-sm font-bold truncate">{row.teamName}</span>
                      <span className="text-display text-base font-black tabular-nums" style={{ color: team?.color ?? '#F5B642' }}>
                        {row.total}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Go to scoreboard */}
        {selectedEventId && (
          <button
            onClick={() => navigate(`/scoreboard?e=${selectedEventId}`)}
            className="w-full rounded-2xl border border-primary/30 bg-primary/10 py-4 font-bold text-primary text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
            <MonitorPlay className="h-4 w-4" /> Vai al Podio
          </button>
        )}

      </div>

      {/* Volume FAB — fixed floating, always accessible */}
      <button
        onClick={() => setPanicOpen(true)}
        className="fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-xl border border-red-400 bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-white shadow-2xl active:scale-95"
        title="Pannello Emergenza"
      >
        <Siren className="h-4 w-4 text-red-300" />
        EMERGENZA
      </button>

      <PanicPanel
        open={panicOpen}
        onClose={() => setPanicOpen(false)}
        eventId={selectedEventId}
        joinCode={events.find(e => e.id === selectedEventId)?.joinCode ?? ''}
        joinUrl={events.find(e => e.id === selectedEventId)?.joinCode ? `${window.location.origin}${BASE}play?e=${events.find(e => e.id === selectedEventId)?.joinCode}`.replace(/([^:])\/\//g, '$1/') : ''}
        projectorUrl={projectorUrl}
        session={activeSession ? { id: activeSession.id, gameSlug: activeSession.gameSlug, status: activeSession.status } : undefined}
      />

      <VolumeFab emit={emit} on={on} />
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Pause, Play, SkipForward, Plus, Minus,
  Power, MonitorOff, X, Loader2, Wifi, WifiOff, ExternalLink,
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
    setTime(30); setTimerPaused(false);
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
    setTime(30); setTimerPaused(false);
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

        {!session && sessions.length === 0 && selectedEventId && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-sm">
            Crea una sessione di gioco per iniziare
          </div>
        )}
      </div>
    </div>
  );
}

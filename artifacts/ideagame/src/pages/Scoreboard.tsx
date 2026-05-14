import { motion } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Crown, TrendingUp, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useT } from '@/i18n';
import {
  useGetCurrentEvent,
  useGetScoreboard, getGetScoreboardQueryKey,
} from '@workspace/api-client-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

interface PublicScoreRow { teamId: string; teamName: string; color: string; total: number }

export default function Scoreboard() {
  const t = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const eventIdFromUrl = urlParams.get('e') ?? '';
  const joinCodeFromUrl = urlParams.get('c') ?? '';

  const { data: currentEvent } = useGetCurrentEvent();
  const eventId = eventIdFromUrl || currentEvent?.id || '';
  const eventName = currentEvent?.name ?? (eventIdFromUrl ? 'Evento' : '');

  const { connected: socketConnected, on } = useEventSocket(eventId || null);

  // Public scoreboard (by join code, no auth required)
  const [publicRows, setPublicRows] = useState<PublicScoreRow[] | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);

  const fetchPublic = useCallback(async (code: string) => {
    setPublicLoading(true);
    try {
      const url = `${BASE}api/events/by-code/${code}/scoreboard`.replace(/\/\//g, '/');
      const r = await fetch(url);
      if (r.ok) setPublicRows(await r.json() as PublicScoreRow[]);
    } catch { /* silent */ }
    finally { setPublicLoading(false); }
  }, []);

  useEffect(() => {
    if (joinCodeFromUrl) void fetchPublic(joinCodeFromUrl);
  }, [joinCodeFromUrl, fetchPublic]);

  useEffect(() => {
    if (!joinCodeFromUrl) return;
    const unsubs = [
      on('score:updated', () => void fetchPublic(joinCodeFromUrl)),
      on('team:updated',  () => void fetchPublic(joinCodeFromUrl)),
    ];
    return () => unsubs.forEach(u => u());
  }, [joinCodeFromUrl, on, fetchPublic]);

  // Projector navigation: respond to commands from regia
  useEffect(() => {
    if (!eventId) return;
    const target = joinCodeFromUrl ? `/?e=${joinCodeFromUrl}` : '/';
    const unsubs = [
      // Regia sends "go-hub" after showing podium — return projector to waiting screen
      on('projector:go-hub', () => navigate(target)),
      // If the event is ended/deleted while projector is on scoreboard
      on('event:ended', () => navigate(target)),
      // Safety: if another game starts while on scoreboard, follow it
      on<{ slug: string; sessionId: string; eventId: string }>('hub:start-game', ({ slug, sessionId, eventId: eid }) => {
        const SLUG_TO_BOARD: Record<string, string> = {
          'percorso-a-risate': '/percorso-risate',
          'gioco-delle-coppie': '/coppie',
          'gioco-coppie': '/coppie',
          'quizzone': '/quizzone',
        };
        const boardPath = SLUG_TO_BOARD[slug];
        if (boardPath) navigate(`${boardPath}?s=${sessionId}&e=${eid}`);
      }),
    ];
    return () => unsubs.forEach(u => u?.());
  }, [eventId, joinCodeFromUrl, on, navigate]);

  // Auth scoreboard (requires session)
  const { data: authRows = [], isLoading: authLoading } = useGetScoreboard(eventId, {
    query: {
      queryKey: getGetScoreboardQueryKey(eventId),
      enabled: !!eventId && !joinCodeFromUrl,
      refetchInterval: socketConnected ? false : 8000,
    },
  });

  useEffect(() => {
    if (!eventId || joinCodeFromUrl) return;
    const unsubs = [
      on('score:updated', () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(eventId) })),
      on('team:updated',  () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(eventId) })),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, joinCodeFromUrl, on, qc]);

  const rows: PublicScoreRow[] = joinCodeFromUrl
    ? (publicRows ?? [])
    : authRows.map(r => ({ teamId: r.teamId, teamName: r.teamName, color: r.color, total: r.total }));

  const isLoading = joinCodeFromUrl ? publicLoading : authLoading;

  const max = rows[0]?.total ?? 1;
  const podium = rows.slice(0, 3);

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 sm:px-10 sm:py-5">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 hover-elevate">
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="font-bold text-sm sm:text-base">{t('game.back')}</span>
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="text-display text-2xl font-black uppercase tracking-tight sm:text-5xl">{t('scoreboard.title')}</div>
          {socketConnected
            ? <Wifi className="h-4 w-4 text-green-400 sm:h-5 sm:w-5" />
            : <WifiOff className="h-4 w-4 text-amber-400 animate-pulse sm:h-5 sm:w-5" />}
        </div>
        <div className="hidden text-sm text-muted-foreground sm:block">{eventName}</div>
      </header>

      <div className="flex-1 overflow-y-auto pb-4">
      {!eventId ? (
        <div className="mx-4 mt-8 rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground sm:mx-auto sm:mt-16 sm:max-w-xl">
          Nessun evento selezionato.
        </div>
      ) : isLoading ? (
        <div className="grid place-items-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="mx-4 mt-8 rounded-2xl border border-border bg-card/60 p-8 text-center text-muted-foreground sm:mx-auto sm:mt-16 sm:max-w-xl">
          Nessun punteggio registrato per questo evento.
        </div>
      ) : (
        <>
          {/* Podium — responsive */}
          <section className="mx-auto mt-4 grid max-w-2xl grid-cols-3 items-end gap-2 px-4 sm:mt-6 sm:max-w-6xl sm:gap-8 sm:px-10">
            {[1, 0, 2].map((idx, col) => {
              const tm = podium[idx];
              if (!tm) return <div key={col} />;
              const heights = ['h-28 sm:h-[220px]', 'h-40 sm:h-[320px]', 'h-20 sm:h-[180px]'];
              return (
                <motion.div key={tm.teamId}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 + col * 0.2, type: 'spring', stiffness: 90 }}
                  className="text-center"
                >
                  <div className="text-display text-sm font-black text-muted-foreground sm:text-3xl">#{idx + 1}</div>
                  <div className="mx-auto mt-1 flex h-10 w-10 items-center justify-center rounded-full text-display text-base font-black text-background sm:mt-2 sm:h-20 sm:w-20 sm:text-3xl"
                       style={{ background: tm.color }}>
                    {idx === 0 ? <Crown className="h-5 w-5 sm:h-9 sm:w-9" /> : tm.teamName[0]}
                  </div>
                  <div className="mt-1 text-display text-xs font-black sm:mt-3 sm:text-2xl truncate">{tm.teamName}</div>
                  <div className="text-display text-xl font-black tabular-nums sm:text-5xl" style={{ color: tm.color }}>
                    {tm.total.toLocaleString()}
                  </div>
                  <div
                    className={`mx-auto mt-2 w-full rounded-t-2xl ${heights[col]}`}
                    style={{ background: `linear-gradient(180deg, ${tm.color} 0%, ${tm.color}66 100%)` }}
                  />
                </motion.div>
              );
            })}
          </section>

          {/* Bar chart — responsive */}
          <section className="mx-4 mt-8 rounded-2xl border border-border bg-card/60 p-4 sm:mx-auto sm:mt-16 sm:max-w-5xl sm:rounded-3xl sm:p-8 sm:px-10">
            <div className="space-y-3 sm:space-y-4">
              {rows.map((tm, i) => {
                const pct = (tm.total / max) * 100;
                return (
                  <motion.div key={tm.teamId}
                    initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 * i }}
                    className="flex items-center gap-2 sm:gap-5"
                  >
                    <div className="w-6 text-display text-sm font-black text-muted-foreground sm:w-10 sm:text-2xl">#{i + 1}</div>
                    <div className="h-3 w-3 rounded-full flex-shrink-0 sm:h-4 sm:w-4" style={{ background: tm.color }} />
                    <div className="w-20 text-display text-sm font-bold truncate sm:w-40 sm:text-2xl">{tm.teamName}</div>
                    <div className="flex-1 min-w-0">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.1 + i * 0.05, duration: 0.8 }}
                        className="h-4 rounded-full sm:h-6"
                        style={{ background: `linear-gradient(90deg, ${tm.color}, ${tm.color}66)` }}
                      />
                    </div>
                    <div className="w-16 text-right text-display text-sm font-black tabular-nums sm:w-32 sm:text-2xl" style={{ color: tm.color }}>
                      {tm.total.toLocaleString()}
                    </div>
                    <TrendingUp className="hidden h-5 w-5 text-primary sm:block" />
                  </motion.div>
                );
              })}
            </div>
          </section>
        </>
      )}
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Crown, TrendingUp, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useT } from '@/i18n';
import {
  useGetCurrentEvent,
  useGetScoreboard, getGetScoreboardQueryKey,
} from '@workspace/api-client-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useQueryClient } from '@tanstack/react-query';

export default function Scoreboard() {
  const t = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: event } = useGetCurrentEvent();
  const eventId = event?.id ?? '';

  const { connected: socketConnected, on } = useEventSocket(eventId || null);

  const { data: rows = [], isLoading } = useGetScoreboard(eventId, {
    query: {
      queryKey: getGetScoreboardQueryKey(eventId),
      enabled: !!eventId,
      refetchInterval: socketConnected ? false : 8000,
    },
  });

  // Realtime: refetch scoreboard on score/team updates
  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on('score:updated', () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(eventId) })),
      on('team:updated',  () => qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(eventId) })),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on, qc]);
  const max = rows[0]?.total ?? 1;
  const podium = rows.slice(0, 3);

  return (
    <div className="min-h-screen w-full overflow-hidden">
      <header className="flex items-center justify-between px-10 py-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-3 hover-elevate">
          <ArrowLeft className="h-5 w-5" /><span className="font-bold">{t('game.back')}</span>
        </button>
        <div className="text-display text-5xl font-black uppercase tracking-tight">{t('scoreboard.title')}</div>
        <div className="text-sm text-muted-foreground">{event?.name}</div>
      </header>

      {isLoading || !event ? (
        <div className="grid place-items-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-border bg-card/60 p-10 text-center text-muted-foreground">
          Nessun punteggio registrato per questo evento.
        </div>
      ) : (
        <>
          <section className="mx-auto mt-6 grid max-w-6xl grid-cols-3 items-end gap-8 px-10">
            {[1, 0, 2].map((idx, col) => {
              const tm = podium[idx];
              if (!tm) return <div key={col} />;
              const heights = [220, 320, 180];
              return (
                <motion.div key={tm.teamId}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 + col * 0.2, type: 'spring', stiffness: 90 }}
                  className="text-center"
                >
                  <div className="text-display text-3xl text-muted-foreground">#{idx + 1}</div>
                  <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-full text-display text-3xl font-black text-background"
                       style={{ background: tm.color }}>
                    {idx === 0 ? <Crown className="h-9 w-9" /> : tm.teamName[0]}
                  </div>
                  <div className="mt-3 text-display text-2xl font-black">{tm.teamName}</div>
                  <div className="text-display text-5xl font-black tabular-nums" style={{ color: tm.color }}>
                    {tm.total.toLocaleString()}
                  </div>
                  <div
                    className="mx-auto mt-4 w-full rounded-t-2xl"
                    style={{ height: heights[col], background: `linear-gradient(180deg, ${tm.color} 0%, ${tm.color}66 100%)` }}
                  />
                </motion.div>
              );
            })}
          </section>

          <section className="mx-auto mt-16 max-w-5xl rounded-3xl border border-border bg-card/60 p-8 px-10">
            <div className="space-y-4">
              {rows.map((tm, i) => {
                const pct = (tm.total / max) * 100;
                return (
                  <motion.div key={tm.teamId}
                    initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 * i }}
                    className="flex items-center gap-5"
                  >
                    <div className="w-10 text-display text-2xl font-black text-muted-foreground">#{i + 1}</div>
                    <div className="h-4 w-4 rounded-full" style={{ background: tm.color }} />
                    <div className="w-40 text-display text-2xl font-bold">{tm.teamName}</div>
                    <div className="flex-1">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.1 + i * 0.05, duration: 0.8 }}
                        className="h-6 rounded-full"
                        style={{ background: `linear-gradient(90deg, ${tm.color}, ${tm.color}66)` }}
                      />
                    </div>
                    <div className="w-32 text-right text-display text-2xl font-black tabular-nums" style={{ color: tm.color }}>
                      {tm.total.toLocaleString()}
                    </div>
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </motion.div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

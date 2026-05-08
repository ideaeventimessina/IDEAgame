import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Play, Loader2, Wifi, WifiOff } from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { useT } from '@/i18n';
import {
  useGetCurrentEvent, useGetEvent, getGetEventQueryKey,
  useListPlayers, getListPlayersQueryKey,
  useListTeams, getListTeamsQueryKey,
} from '@workspace/api-client-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useQueryClient } from '@tanstack/react-query';

export default function Lobby() {
  const t = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const explicitId = new URLSearchParams(search).get('e') ?? '';

  const { data: explicitEvent } = useGetEvent(explicitId, {
    query: { queryKey: getGetEventQueryKey(explicitId), enabled: !!explicitId },
  });
  const { data: currentEvent, isLoading: evLoading } = useGetCurrentEvent();
  const event = explicitEvent ?? currentEvent;
  const eventId = event?.id ?? '';

  const { connected: socketConnected, on } = useEventSocket(eventId || null);

  const { data: players = [] } = useListPlayers(eventId, {
    query: { queryKey: getListPlayersQueryKey(eventId), enabled: !!eventId, refetchInterval: socketConnected ? false : 10000 },
  });
  const { data: teams = [] } = useListTeams(eventId, {
    query: { queryKey: getListTeamsQueryKey(eventId), enabled: !!eventId },
  });

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on('player:joined', () => qc.invalidateQueries({ queryKey: getListPlayersQueryKey(eventId) })),
      on('player:left',   () => qc.invalidateQueries({ queryKey: getListPlayersQueryKey(eventId) })),
      on('team:updated',  () => qc.invalidateQueries({ queryKey: getListTeamsQueryKey(eventId) })),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on, qc]);

  const connectedPlayers = players.filter(p => p.isConnected);
  const joinUrl = event ? `${window.location.origin}/play?e=${event.joinCode}` : `${window.location.origin}/play`;

  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 sm:px-10 sm:py-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 hover-elevate">
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="font-bold text-sm sm:text-base">{t('game.back')}</span>
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <div className="text-display text-lg font-black tracking-tight sm:text-3xl truncate">{event?.name ?? t('lobby.title')}</div>
          <div className="hidden text-xs text-muted-foreground sm:block">{event?.venue ?? t('lobby.subtitle')}</div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          {eventId && (
            <div className="flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-xs">
              {socketConnected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400 animate-pulse" />}
              <span className={socketConnected ? 'text-green-400' : 'text-amber-400'}>{socketConnected ? 'live' : 'polling'}</span>
            </div>
          )}
        </div>
      </header>

      {(!explicitId && evLoading) ? (
        <div className="grid place-items-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      ) : !event ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/60 p-8 text-center m-4">
          <div className="text-display text-2xl font-black">Nessun evento live</div>
          <div className="mt-2 text-muted-foreground text-sm">Crea un evento e mettilo in stato <code>live</code> per usare la lobby.</div>
          <button onClick={() => navigate('/event-setup')} className="mt-6 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Crea evento</button>
        </div>
      ) : (
        <main className="pb-28">
          {/* ── Mobile / Tablet: stacked layout ── */}
          <div className="lg:hidden px-4 sm:px-6 space-y-5">
            {/* QR compact */}
            <div className="rounded-3xl border border-border bg-card/70 p-5 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <QrPlaceholder text={joinUrl} size={180} />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-3">
                <div className="text-sm uppercase tracking-widest text-muted-foreground">{t('lobby.scan')}</div>
                <div className="text-mono text-3xl font-black text-primary">{event.joinCode}</div>
                <div className="flex items-center justify-center sm:justify-start gap-3">
                  <div className="text-display text-5xl font-black text-primary">{connectedPlayers.length}</div>
                  <div className="text-muted-foreground text-sm leading-tight">{t('hub.players_connected')}</div>
                </div>
                {/* Team pills */}
                {teams.length > 0 && (
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                    {teams.map(tm => (
                      <div key={tm.id} className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: tm.color }} />
                        <span className="font-bold">{tm.name}</span>
                        <span className="text-muted-foreground">{connectedPlayers.filter(p => p.teamId === tm.id).length}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => navigate('/scoreboard')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-lg font-black text-primary-foreground"
                >
                  <Play className="h-5 w-5" /> {t('lobby.start')}
                </button>
              </div>
            </div>

            {/* Player grid */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Giocatori connessi</div>
                <div className="text-display text-2xl font-black text-primary">{connectedPlayers.length}<span className="text-sm text-muted-foreground font-normal">/20</span></div>
              </div>
              {connectedPlayers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-sm">
                  In attesa che i giocatori scansionino il QR…
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {connectedPlayers.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 140 }}
                      className="rounded-2xl border border-border bg-card/60 p-3 text-center"
                    >
                      <div
                        className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full text-display text-xl font-black text-background"
                        style={{ background: p.avatarColor }}
                      >
                        {p.nickname[0]}
                      </div>
                      <div className="text-display text-sm font-bold truncate">{p.nickname}</div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Desktop (≥1024px): QR left | player grid right ── */}
          <div className="hidden lg:grid mx-auto max-w-[1500px] grid-cols-[400px_1fr] gap-12 px-10 pt-2">
            <aside className="rounded-3xl border border-border bg-card/70 p-10">
              <div className="text-center text-display text-2xl font-bold uppercase tracking-widest text-muted-foreground">
                {t('lobby.scan')}
              </div>
              <div className="mt-6 flex justify-center">
                <QrPlaceholder text={joinUrl} size={300} />
              </div>
              <div className="mt-6 text-center">
                <div className="text-mono text-xl text-primary">{event.joinCode}</div>
              </div>
              <button
                onClick={() => navigate('/scoreboard')}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-5 text-2xl font-black text-primary-foreground"
              >
                <Play className="h-6 w-6" /> {t('lobby.start')}
              </button>
            </aside>

            <section>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <div className="text-display text-7xl font-black text-primary">{connectedPlayers.length}<span className="text-3xl text-muted-foreground">/20</span></div>
                  <div className="text-xl text-muted-foreground">{t('hub.players_connected')}</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {teams.map(tm => (
                    <div key={tm.id} className="rounded-2xl border border-border bg-card/60 px-4 py-3">
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: tm.color }} /><span className="font-bold">{tm.name}</span></div>
                      <div className="mt-1 text-mono text-xs text-muted-foreground">
                        {connectedPlayers.filter(p => p.teamId === tm.id).length} players
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 xl:grid-cols-5">
                {connectedPlayers.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
                    In attesa che i giocatori scansionino il QR…
                  </div>
                )}
                {connectedPlayers.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 24, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 140 }}
                    className="rounded-2xl border border-border bg-card/60 p-4 text-center"
                  >
                    <div
                      className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-display text-2xl font-black text-background"
                      style={{ background: p.avatarColor }}
                    >
                      {p.nickname[0]}
                    </div>
                    <div className="text-display text-lg font-bold">{p.nickname}</div>
                  </motion.div>
                ))}
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}

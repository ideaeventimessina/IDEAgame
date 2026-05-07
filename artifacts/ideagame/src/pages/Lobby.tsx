import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { ArrowLeft, Play, Loader2 } from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { useT } from '@/i18n';
import {
  useGetCurrentEvent, useGetEvent, getGetEventQueryKey,
  useListPlayers, getListPlayersQueryKey,
  useListTeams, getListTeamsQueryKey,
} from '@workspace/api-client-react';

export default function Lobby() {
  const t = useT();
  const [, navigate] = useLocation();
  // Read ?e=<id> from URL (allows previewing a specific event right after creation)
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const explicitId = new URLSearchParams(search).get('e') ?? '';

  const { data: explicitEvent } = useGetEvent(explicitId, {
    query: { queryKey: getGetEventQueryKey(explicitId), enabled: !!explicitId },
  });
  const { data: currentEvent, isLoading: evLoading } = useGetCurrentEvent();
  const event = explicitEvent ?? currentEvent;
  const eventId = event?.id ?? '';

  const { data: players = [] } = useListPlayers(eventId, { query: { queryKey: getListPlayersQueryKey(eventId), enabled: !!eventId, refetchInterval: 4000 } });
  const { data: teams = [] } = useListTeams(eventId, { query: { queryKey: getListTeamsQueryKey(eventId), enabled: !!eventId } });
  const connected = players.filter(p => p.isConnected);
  const joinUrl = event ? `${window.location.origin}/play?e=${event.joinCode}` : `${window.location.origin}/play`;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <header className="flex items-center justify-between px-10 py-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-3 hover-elevate">
          <ArrowLeft className="h-5 w-5" /><span className="font-bold">{t('game.back')}</span>
        </button>
        <div className="text-display text-3xl font-black tracking-tight">{event?.name ?? t('lobby.title')}</div>
        <div className="text-muted-foreground">{event?.venue ?? t('lobby.subtitle')}</div>
      </header>

      {(!explicitId && evLoading) ? (
        <div className="grid place-items-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      ) : !event ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/60 p-10 text-center">
          <div className="text-display text-2xl font-black">Nessun evento live</div>
          <div className="mt-2 text-muted-foreground">Crea un evento e mettilo in stato <code>live</code> per usare la lobby.</div>
          <button onClick={() => navigate('/event-setup')} className="mt-6 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Crea evento</button>
        </div>
      ) : (
        <main className="mx-auto grid max-w-[1500px] grid-cols-[440px_1fr] gap-12 px-10">
          <aside className="rounded-3xl border border-border bg-card/70 p-10">
            <div className="text-center text-display text-2xl font-bold uppercase tracking-widest text-muted-foreground">
              {t('lobby.scan')}
            </div>
            <div className="mt-6 flex justify-center">
              <QrPlaceholder text={joinUrl} size={340} />
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
                <div className="text-display text-7xl font-black text-primary">{connected.length}</div>
                <div className="text-xl text-muted-foreground">{t('hub.players_connected')}</div>
              </div>
              <div className="flex flex-wrap gap-3">
                {teams.map(tm => (
                  <div key={tm.id} className="rounded-2xl border border-border bg-card/60 px-4 py-3">
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: tm.color }} /><span className="font-bold">{tm.name}</span></div>
                    <div className="mt-1 text-mono text-xs text-muted-foreground">
                      {connected.filter(p => p.teamId === tm.id).length} players
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 md:grid-cols-5">
              {connected.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
                  In attesa che i giocatori scansionino il QR…
                </div>
              )}
              {connected.map((p, i) => (
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
        </main>
      )}
    </div>
  );
}

import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { ArrowLeft, Play } from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { PLAYERS, TEAMS } from '@/data/mock';
import { useT } from '@/i18n';

export default function Lobby() {
  const t = useT();
  const [, navigate] = useLocation();
  const connected = PLAYERS.filter(p => p.connected);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <header className="flex items-center justify-between px-10 py-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-3 hover-elevate">
          <ArrowLeft className="h-5 w-5" /><span className="font-bold">{t('game.back')}</span>
        </button>
        <div className="text-display text-3xl font-black tracking-tight">{t('lobby.title')}</div>
        <div className="text-muted-foreground">{t('lobby.subtitle')}</div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-[440px_1fr] gap-12 px-10">
        <aside className="rounded-3xl border border-border bg-card/70 p-10">
          <div className="text-center text-display text-2xl font-bold uppercase tracking-widest text-muted-foreground">
            {t('lobby.scan')}
          </div>
          <div className="mt-6 flex justify-center">
            <QrPlaceholder text="https://ideagame.local/play" size={340} />
          </div>
          <div className="mt-6 text-center">
            <div className="text-mono text-xl text-primary">ideagame.local/play</div>
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
            <div className="flex gap-3">
              {TEAMS.map(tm => (
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
    </div>
  );
}

import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Wifi, Users, Radio } from 'lucide-react';
import { Hexagon } from '@/components/Hexagon';
import { GameIcon } from '@/components/GameIcon';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useT } from '@/i18n';
import { GAMES, EVENTS, PLAYERS } from '@/data/mock';

const POSITIONS = [
  { x: -1, y: -1 }, { x: 1, y: -1 },
  { x: -1.6, y: 0 }, { x: 1.6, y: 0 },
  { x: -1, y: 1 }, { x: 1, y: 1 },
];

export default function Hub() {
  const t = useT();
  const [, navigate] = useLocation();
  const liveEvent = EVENTS.find(e => e.status === 'live') ?? EVENTS[0]!;
  const connected = PLAYERS.filter(p => p.connected).length;
  const HEX_SIZE = 280;
  const ORBIT_X = 290;
  const ORBIT_Y = 290;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-10 py-8">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40">
            <span className="text-display text-3xl font-black">I</span>
          </div>
          <div>
            <div className="text-display text-3xl font-black tracking-tight">{t('app.title')}</div>
            <div className="text-sm text-muted-foreground">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm">
            <Wifi className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">{t('hub.network_local')}</span>
            <span className="text-mono text-xs text-foreground/80">192.168.1.42</span>
          </div>
          <LocaleSwitcher />
        </div>
      </header>

      {/* Live banner */}
      <div className="relative z-10 px-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <span className="flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-bold uppercase tracking-widest text-destructive-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />{t('common.live')}
          </span>
          <span className="text-muted-foreground">{t('hub.live_event')}:</span>
          <span className="text-display text-xl font-bold">{liveEvent.name}</span>
          <span className="text-muted-foreground">— {liveEvent.venue}</span>
        </motion.div>
      </div>

      {/* Center: hex grid */}
      <main className="relative mx-auto mt-12 grid max-w-[1500px] grid-cols-[420px_1fr_420px] items-center gap-10 px-10">
        {/* Left: QR */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-center rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-md"
        >
          <div className="mb-4 text-sm uppercase tracking-widest text-muted-foreground">{t('hub.scan_to_join')}</div>
          <QrPlaceholder text="https://ideagame.local/play" size={260} />
          <div className="mt-5 text-center">
            <div className="text-xs text-muted-foreground">{t('hub.local_url')}</div>
            <div className="text-mono text-lg font-bold text-primary">ideagame.local/play</div>
          </div>
          <div className="mt-6 flex w-full items-center justify-between border-t border-border pt-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {t('hub.players_connected')}
            </div>
            <div className="text-display text-3xl font-black text-primary">{connected}</div>
          </div>
        </motion.aside>

        {/* Center: hexagons */}
        <div className="relative mx-auto" style={{ height: 760, width: 760 }}>
          {/* Center hub */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 100 }}
            className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative flex h-[200px] w-[180px] items-center justify-center">
              <div className="absolute inset-0 hex-clip bg-gradient-to-br from-primary via-accent to-primary opacity-90" />
              <div className="absolute inset-1.5 hex-clip bg-background" />
              <div className="relative z-10 text-center">
                <div className="text-display text-5xl font-black text-primary">IDEA</div>
                <div className="text-display text-2xl font-black tracking-widest text-foreground/90">GAME</div>
              </div>
            </div>
          </motion.div>

          {GAMES.map((g, i) => {
            const pos = POSITIONS[i]!;
            return (
              <div
                key={g.id}
                className="absolute"
                style={{
                  left: `calc(50% + ${pos.x * ORBIT_X}px - ${HEX_SIZE / 2}px)`,
                  top: `calc(50% + ${pos.y * ORBIT_Y}px - ${HEX_SIZE * 1.06 / 2}px)`,
                }}
              >
                <Hexagon
                  color={g.accentColor}
                  size={HEX_SIZE}
                  delay={0.05 + i * 0.07}
                  onClick={() => navigate(`/game/${g.slug}`)}
                >
                  <div
                    className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: `${g.accentColor}22`, color: g.accentColor }}
                  >
                    <GameIcon name={g.icon} className="h-9 w-9" />
                  </div>
                  <div className="text-display text-2xl font-black leading-tight" style={{ color: g.accentColor }}>
                    {g.name}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{g.tagline}</div>
                  {g.adultOnly && (
                    <div className="mt-3 rounded-full border border-destructive/60 bg-destructive/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-destructive">
                      18+
                    </div>
                  )}
                </Hexagon>
              </div>
            );
          })}
        </div>

        {/* Right: Live activity */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-md"
        >
          <div className="mb-5 flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground">
            <Radio className="h-4 w-4 text-accent" /> Live
          </div>
          <div className="space-y-3">
            {PLAYERS.filter(p => p.connected).slice(0, 9).map((p, idx) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-3"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-background"
                  style={{ background: p.avatarColor }}
                >
                  {p.nickname[0]}
                </div>
                <div className="text-display text-base font-bold">{p.nickname}</div>
                <div className="ml-auto text-xs text-muted-foreground">joined</div>
              </motion.div>
            ))}
          </div>
          <button
            onClick={() => navigate('/lobby')}
            className="mt-6 w-full rounded-2xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary hover-elevate"
          >
            Open lobby
          </button>
        </motion.aside>
      </main>

      <div className="mt-10 pb-32 text-center">
        <div className="text-display text-2xl uppercase tracking-[0.3em] text-muted-foreground">
          {t('hub.choose_game')}
        </div>
      </div>
    </div>
  );
}

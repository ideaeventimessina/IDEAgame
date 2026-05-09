import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Users, Radio, Loader2, ChevronDown, ChevronUp, Sparkles, SlidersHorizontal, CalendarPlus, Play, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Octagon } from '@/components/Octagon';
import { GameIcon } from '@/components/GameIcon';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { GameIntroOverlay } from '@/components/GameIntroOverlay';
import { useT } from '@/i18n';
import { useListGames, useGetCurrentEvent, useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useLocalMode } from '@/hooks/useLocalMode';

type IconName = Parameters<typeof GameIcon>[0]['name'];

// Slugs that are fully playable (green PRONTO badge)
const READY_SLUGS = new Set([
  'quizzone', 'gioco-coppie', 'gioco-delle-coppie',
  'percorso-a-risate', 'adult-only',
  'sfida-ballo', 'sfida-di-ballo',
  'parola-alle-spalle', 'karaoke-battle', 'saramusica',
  'freestyle-battle',
]);

// Slug → real projector board URL (needs ?s=SESSION_ID&e=EVENT_ID)
const SLUG_TO_BOARD: Record<string, string> = {
  'percorso-a-risate':  '/percorso-risate',
  'gioco-delle-coppie': '/coppie',
  'gioco-coppie':       '/coppie',
  'quizzone':           '/quizzone',
  'adult-only':         '/adult-only',
  'sfida-di-ballo':     '/sfida-ballo',
  'sfida-ballo':        '/sfida-ballo',
  'parola-alle-spalle': '/parola-alle-spalle',
  'karaoke-battle':     '/karaoke-battle',
  'freestyle-battle':   '/freestyle-battle',
  'saramusica':         '/saramusica',
};

type NoSessionState = { name: string; slug: string; accentColor: string; eventId: string | null } | null;

// 3-2-3 orbital layout around center logo
const POSITIONS = [
  { x: -1,   y: -1.15 },
  { x:  0,   y: -1.15 },
  { x:  1,   y: -1.15 },
  { x: -1.5, y:  0    },
  { x:  1.5, y:  0    },
  { x: -1,   y:  1.15 },
  { x:  0,   y:  1.15 },
  { x:  1,   y:  1.15 },
];

// Desktop octagon grid constants — sized to fit 1280×720 projector (16:9)
// cw = 2*(1.5*163+97)+10 = 694 px   ch = 2*(1.15*128+97)+10 = 499 px
const D_OCT = 194;
const D_OX  = 163;
const D_OY  = 128;

// Tablet octagon grid constants — bigger, floating layout
// cw = 2*(1.5*130+77.5)+10 = 555 px   ch = 2*(1.15*126+77.5)+10 = 455 px
const T_OCT = 155;
const T_OX  = 130;
const T_OY  = 126;

function StatusBadge({ slug, size = 'sm' }: { slug: string; size?: 'xs' | 'sm' }) {
  const ready = READY_SLUGS.has(slug);
  const cls = size === 'xs' ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]';
  return ready ? (
    <div className={`rounded-full border border-green-500/60 bg-green-500/15 font-black uppercase tracking-widest text-green-400 ${cls}`}>PRONTO</div>
  ) : (
    <div className={`rounded-full border border-amber-500/60 bg-amber-500/10 font-black uppercase tracking-widest text-amber-400 ${cls}`}>DEMO</div>
  );
}

type IntroGame = { name: string; accentColor: string; icon: string; tagline: string; slug: string };

export default function Hub() {
  const t = useT();
  const [, navigate] = useLocation();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [introGame, setIntroGame] = useState<IntroGame | null>(null);
  const [projectorBlack, setProjectorBlack] = useState(false);
  const [noSessionGame, setNoSessionGame] = useState<NoSessionState>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  // Navigate to a game — READY games NEVER go to /game/:slug mock
  const handleGameClick = async (slug: string, name: string, accentColor: string) => {
    const isReady = READY_SLUGS.has(slug);
    const boardPath = SLUG_TO_BOARD[slug];

    if (!isReady) {
      // Non-ready game → demo preview only
      navigate(`/game/${slug}`);
      return;
    }

    // READY game: always try to open real board, never fall back to /game/:slug
    if (!liveEvent) {
      setNoSessionGame({ name, slug, accentColor, eventId: null });
      return;
    }

    try {
      const res = await fetch(`/api/events/${liveEvent.id}/active-session`);
      const session = res.ok ? await res.json() : null;
      if (session && session.gameSlug === slug && session.status !== 'ended' && boardPath) {
        navigate(`${boardPath}?s=${session.id}&e=${liveEvent.id}`);
      } else {
        setNoSessionGame({ name, slug, accentColor, eventId: liveEvent.id });
      }
    } catch {
      setNoSessionGame({ name, slug, accentColor, eventId: liveEvent.id });
    }
  };

  // Create a fresh session and immediately open the board
  const handleCreateSession = async () => {
    if (!noSessionGame?.eventId) return;
    setCreatingSession(true);
    try {
      const res = await fetch(`/api/events/${noSessionGame.eventId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameSlug: noSessionGame.slug, totalRounds: 1 }),
      });
      if (res.ok) {
        const session = await res.json();
        const boardPath = SLUG_TO_BOARD[noSessionGame.slug];
        setNoSessionGame(null);
        if (boardPath) {
          navigate(`${boardPath}?s=${session.id}&e=${noSessionGame.eventId}`);
        } else {
          navigate('/control');
        }
      } else {
        // Not authenticated → redirect to cockpit
        setNoSessionGame(null);
        navigate('/control');
      }
    } catch {
      setNoSessionGame(null);
      navigate('/control');
    } finally {
      setCreatingSession(false);
    }
  };
  const lan = useLocalMode();

  const { data: games = [], isLoading: gamesLoading } = useListGames();
  const { data: liveEvent, isLoading: eventLoading } = useGetCurrentEvent();
  const { data: players = [] } = useListPlayers(
    liveEvent?.id ?? '',
    { query: { queryKey: getListPlayersQueryKey(liveEvent?.id ?? ''), enabled: !!liveEvent?.id } },
  );
  const { on } = useEventSocket(liveEvent?.id ?? null);

  // Listen for new running sessions → trigger game intro overlay
  useEffect(() => {
    if (!liveEvent?.id) return;
    return on<{ session: { gameSlug: string; status: string } }>('session:updated', (data) => {
      if (data.session.status === 'running') {
        const game = games.find(g => g.slug === data.session.gameSlug);
        if (game) {
          setIntroGame({
            name: game.name,
            accentColor: game.accentColor,
            icon: game.icon,
            tagline: game.tagline ?? '',
            slug: game.slug,
          });
        }
      }
    });
  }, [liveEvent?.id, on, games]);

  // Panic panel: projector commands
  useEffect(() => {
    if (!liveEvent?.id) return;
    const unsubs = [
      on('projector:black',          () => setProjectorBlack(true)),
      on('projector:black-off',      () => setProjectorBlack(false)),
      on('projector:close-overlays', () => { setProjectorBlack(false); setIntroGame(null); }),
      on('projector:go-scoreboard',  (payload: { eventId?: string }) => {
        const eid = payload?.eventId ?? liveEvent.id;
        navigate(`/scoreboard?e=${eid}`);
      }),
    ];
    return () => { unsubs.forEach(u => u?.()); };
  }, [liveEvent?.id, on, navigate]);

  // Canonical 3-2-3 slot order: flagship games first, adult-only last in middle row
  const SLUG_ORDER = [
    'percorso-a-risate',
    'gioco-delle-coppie',
    'quizzone',
    'saramusica',
    'adult-only',
    'sfida-di-ballo',
    'parola-alle-spalle',
    'karaoke-battle',
  ];
  const slugRank = (slug: string) => {
    const i = SLUG_ORDER.indexOf(slug);
    return i === -1 ? 99 : i;
  };
  const sortedGames = [...games].sort((a, b) => slugRank(a.slug) - slugRank(b.slug));
  const visibleGames = liveEvent && Array.isArray(liveEvent.enabledGames) && liveEvent.enabledGames.length > 0
    ? sortedGames.filter(g => (liveEvent.enabledGames as string[]).includes(g.slug)).slice(0, 8)
    : sortedGames.slice(0, 8);

  const joinUrl = `${lan.effectiveOrigin}/play${liveEvent ? `?e=${liveEvent.joinCode}` : ''}`;

  // ── Octagon grid ────────────────────────────────────────────────────────
  function OctGrid({ oct, ox, oy }: { oct: number; ox: number; oy: number }) {
    const cw = Math.ceil(2 * (1.5 * ox + oct / 2)) + 10;
    const ch = Math.ceil(2 * (1.15 * oy + oct / 2)) + 10;
    return (
      <div className="relative mx-auto" style={{ width: cw, height: ch }}>
        {/* Centre logo badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="relative flex items-center justify-center" style={{ width: oct * 0.72, height: oct * 0.72 }}>
            <div className="absolute inset-0 oct-clip bg-gradient-to-br from-primary via-accent to-primary opacity-90" />
            <div className="absolute inset-1.5 oct-clip bg-white" />
            <div className="relative z-10 flex items-center justify-center" style={{ width: oct * 0.52, height: oct * 0.52 }}>
              <img src="/logo.png" alt="IDEA Games" className="w-full h-full object-contain" style={{ padding: oct * 0.04 }} />
            </div>
          </div>
        </motion.div>

        {gamesLoading ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : visibleGames.map((g, i) => {
          const pos = POSITIONS[i] ?? POSITIONS[0]!;
          return (
            <div key={g.id} className="absolute"
              style={{
                left: cw / 2 + pos.x * ox - oct / 2,
                top:  ch / 2 + pos.y * oy - oct / 2,
              }}>
              <Octagon color={g.accentColor} size={oct} delay={i * 0.035}
                onClick={() => handleGameClick(g.slug, g.name, g.accentColor)}>
                <div className="mb-2 flex items-center justify-center rounded-xl"
                  style={{ width: oct * 0.38, height: oct * 0.38, background: `${g.accentColor}22`, color: g.accentColor }}>
                  <GameIcon name={g.icon as IconName} style={{ width: oct * 0.24, height: oct * 0.24 }} />
                </div>
                <div className="text-display font-black leading-tight text-center line-clamp-2"
                  style={{ fontSize: Math.max(11, oct * 0.104), color: g.accentColor }}>
                  {g.name}
                </div>
                <div className="mt-1 flex justify-center">
                  <StatusBadge slug={g.slug} size="xs" />
                </div>
                {g.adultOnly && (
                  <div className="mt-1 rounded-full border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-destructive font-bold uppercase tracking-widest"
                    style={{ fontSize: oct * 0.07 }}>18+</div>
                )}
              </Octagon>
            </div>
          );
        })}
      </div>
    );
  }

  // ── QR panel (only when event is live) ──────────────────────────────────
  function QrPanel({ compact = false }: { compact?: boolean }) {
    if (!liveEvent) return null;
    const qrSize = compact ? 140 : 220;
    return (
      <div className={`flex flex-col items-center rounded-3xl border backdrop-blur-md ${
        lan.localMode ? 'border-orange-500/50 bg-orange-950/30' : 'border-border bg-card/70'
      } ${compact ? 'p-4' : 'p-8'}`}>
        <div className={`uppercase tracking-widest text-muted-foreground ${compact ? 'mb-3 text-xs' : 'mb-4 text-sm'}`}>
          {t('hub.scan_to_join')}
        </div>
        <QrPlaceholder text={joinUrl} size={qrSize} />
        <div className="mt-4 text-center">
          <div className="text-xs text-muted-foreground">{t('hub.local_url')}</div>
          <div className="text-mono text-2xl font-bold text-primary">{liveEvent.joinCode}</div>
        </div>
        {!compact && (
          <div className="mt-6 flex w-full items-center justify-between border-t border-border pt-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {t('hub.players_connected')}
            </div>
            <div className="text-display text-3xl font-black text-primary">{players.length}</div>
          </div>
        )}

        {/* ── LAN / Offline mode toggle ───────────────────────────── */}
        <div className="mt-4 w-full border-t border-border pt-4 space-y-2">
          <button
            onClick={() => lan.setLocalMode(!lan.localMode)}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
              lan.localMode
                ? 'border-orange-500/60 bg-orange-500/15 text-orange-300'
                : 'border-border bg-card/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {lan.localMode
                ? <WifiOff className="h-3.5 w-3.5" />
                : <Wifi className="h-3.5 w-3.5" />
              }
              {lan.localMode ? 'Modalità LAN attiva' : 'Attiva Modalità LAN'}
            </span>
            <span className={`relative h-4 w-7 rounded-full transition-colors ${lan.localMode ? 'bg-orange-500' : 'bg-border'}`}>
              <span className={`absolute top-0 h-4 w-4 rounded-full bg-white shadow transition-transform ${lan.localMode ? 'translate-x-3' : 'translate-x-0'}`} />
            </span>
          </button>

          {lan.localMode && (
            <div className="space-y-1.5">
              {(lan.networkInfo?.localIps ?? []).length > 0 ? (
                (lan.networkInfo?.localIps ?? []).map(ip => (
                  <button
                    key={ip}
                    onClick={() => lan.setSelectedIp(ip)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                      lan.selectedIp === ip
                        ? 'border border-orange-500/50 bg-orange-500/20 text-orange-200'
                        : 'border border-border bg-card/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {ip} {lan.selectedIp === ip ? '✓' : ''}
                  </button>
                ))
              ) : (
                <input
                  value={lan.selectedIp}
                  onChange={e => lan.setSelectedIp(e.target.value)}
                  placeholder="192.168.1.x"
                  className="w-full rounded-lg border border-orange-500/40 bg-card/40 px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                />
              )}
              <div className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-[10px] font-mono text-orange-300 truncate">
                QR → {lan.effectiveOrigin}/play
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── No-event CTA (when no active event) ─────────────────────────────────
  function EventCTA() {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-3xl border border-border bg-card/70 backdrop-blur-md p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <CalendarPlus className="h-4 w-4" /> Nessun evento attivo
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Crea un evento, scegli le sfide e avvia la partita. Il QR code per i partecipanti apparirà automaticamente.
        </p>
        <button onClick={() => navigate('/event-setup')}
          className="w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground hover-elevate">
          ＋ Crea evento
        </button>
        <button onClick={() => navigate('/control')}
          className="w-full rounded-2xl border border-border py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          Apri Cockpit Animatore
        </button>
      </motion.div>
    );
  }

  // ── Player roster ────────────────────────────────────────────────────────
  function RosterPanel() {
    return (
      <div className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-md">
        <div className="mb-4 flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground">
          <Radio className="h-4 w-4 text-accent" /> Live
          <span className="ml-auto text-display text-xl font-black text-primary">{players.length}</span>
        </div>
        <div className="space-y-2.5">
          {players.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              {liveEvent ? 'In attesa di giocatori…' : 'Nessun evento in corso'}
            </div>
          )}
          {players.slice(0, 9).map((p, idx) => (
            <motion.div key={p.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }} className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-background"
                style={{ background: p.avatarColor }}>
                {p.nickname[0]}
              </div>
              <div className="text-display text-sm font-bold truncate">{p.nickname}</div>
              <div className="ml-auto shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
              </div>
            </motion.div>
          ))}
        </div>
        {players.length > 0 && (
          <button onClick={() => navigate('/lobby')}
            className="mt-5 w-full rounded-2xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-bold text-primary hover-elevate">
            Apri lobby
          </button>
        )}
      </div>
    );
  }

  // ── Mobile game card ─────────────────────────────────────────────────────
  function GameCard({ g, i }: { g: typeof visibleGames[0]; i: number }) {
    return (
      <motion.button
        type="button"
        onClick={() => handleGameClick(g.slug, g.name, g.accentColor)}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 + i * 0.06, type: 'spring', stiffness: 120 }}
        whileTap={{ scale: 0.97 }}
        className="relative flex flex-col items-center gap-2 rounded-2xl border bg-card/60 p-4 text-center backdrop-blur-sm hover-elevate"
        style={{ borderColor: `${g.accentColor}44` }}
      >
        <div className="absolute inset-0 rounded-2xl opacity-10"
          style={{ background: `radial-gradient(ellipse at top, ${g.accentColor} 0%, transparent 70%)` }} />
        <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: `${g.accentColor}22`, color: g.accentColor }}>
          <GameIcon name={g.icon as IconName} className="h-7 w-7" />
        </div>
        <div className="relative z-10 text-display text-sm font-black leading-tight"
          style={{ color: g.accentColor }}>{g.name}</div>
        <div className="relative z-10"><StatusBadge slug={g.slug} size="xs" /></div>
        <div className="relative z-10 text-xs text-muted-foreground line-clamp-2">{g.tagline}</div>
        {g.adultOnly && (
          <div className="relative z-10 rounded-full border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-destructive">18+</div>
        )}
      </motion.button>
    );
  }

  // ── Standby screen: nessun evento attivo ─────────────────────────────
  if (!liveEvent) {
    return (
      <div className="relative h-screen w-full overflow-hidden flex flex-col items-center justify-center select-none"
        style={{ background: 'radial-gradient(ellipse 140% 80% at 50% -5%, #1e0a3c 0%, #0d0520 45%, #060310 100%)' }}>

        {/* Star particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 55 }).map((_, i) => {
            const x = (i * 37 + 13) % 100;
            const y = (i * 53 + 9) % 100;
            const sz = 1 + (i % 4) * 0.7;
            return (
              <motion.div key={i} className="absolute rounded-full"
                style={{ left: `${x}%`, top: `${y}%`, width: sz, height: sz, background: '#A78BFA' }}
                animate={{ opacity: [0.1, 0.7, 0.1] }}
                transition={{ duration: 2.5 + (i % 6) * 0.55, delay: -(i * 0.18), repeat: Infinity }} />
            );
          })}
        </div>
        {/* Glow spots */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div style={{ position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: '70%', height: '50%', borderRadius: '50%', background: 'radial-gradient(ellipse, #7C3AED20 0%, transparent 70%)', filter: 'blur(50px)' }} />
          <div style={{ position: 'absolute', bottom: '-5%', left: '10%', width: '35%', height: '35%', borderRadius: '50%', background: 'radial-gradient(ellipse, #F5B64212 0%, transparent 70%)', filter: 'blur(35px)' }} />
          <div style={{ position: 'absolute', bottom: '-5%', right: '10%', width: '35%', height: '35%', borderRadius: '50%', background: 'radial-gradient(ellipse, #F5B64212 0%, transparent 70%)', filter: 'blur(35px)' }} />
        </div>

        {/* Black screen panic overlay */}
        <AnimatePresence>
          {projectorBlack && (
            <motion.div key="projector-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }} className="fixed inset-0 z-[200] bg-black" onClick={() => setProjectorBlack(false)} />
          )}
        </AnimatePresence>

        {/* Jonny's World content */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 text-center px-8">

          {/* JONNY'S WORLD title */}
          <motion.div
            animate={{ filter: ['drop-shadow(0 0 20px #F5B64266)', 'drop-shadow(0 0 50px #F5B64299)', 'drop-shadow(0 0 20px #F5B64266)'] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-display font-black leading-none select-none"
            style={{
              fontSize: 'clamp(2.8rem, 10vw, 8rem)',
              background: 'linear-gradient(135deg, #F5B642 0%, #FFD700 40%, #F5B642 70%, #FFA500 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
            JONNY'S WORLD
          </motion.div>

          {/* Subtitle */}
          <div className="text-sm sm:text-xl font-bold tracking-[0.15em] uppercase"
            style={{ color: '#A78BFA', textShadow: '0 0 20px #A78BFA66' }}>
            Il Parco del Divertimento Intelligente
          </div>

          {/* Jonny mascot */}
          <motion.img src="/jonny/via-nobg.png" alt="Jonny"
            style={{
              height: 'clamp(180px, 32vh, 340px)', width: 'auto', objectFit: 'contain',
              mixBlendMode: 'multiply', filter: 'drop-shadow(0 16px 48px #A78BFA77)',
            }}
            animate={{ y: [0, -18, 0], rotate: [-1.5, 1.5, -1.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />

          {/* Waiting label */}
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.5, repeat: Infinity }}
            className="rounded-2xl border px-6 sm:px-10 py-2.5 sm:py-3 text-xs sm:text-sm font-black tracking-[0.2em] uppercase"
            style={{ borderColor: '#F5B64244', background: '#F5B64210', color: '#F5B642' }}>
            In attesa di un evento…
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 140% 60% at 50% -10%, #1a0a30 0%, #0a0418 45%, #040210 100%)' }}>

      {/* ── No-session dialog (gioco non ancora avviato) ── */}
      <AnimatePresence>
        {noSessionGame && (
          <motion.div
            key="no-session-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setNoSessionGame(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="relative w-full max-w-sm rounded-3xl border bg-card p-7 shadow-2xl"
              style={{ borderColor: `${noSessionGame.accentColor}55` }}
              onClick={e => e.stopPropagation()}
            >
              <button
                className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setNoSessionGame(null)}
              >
                <X className="h-4 w-4" />
              </button>
              {noSessionGame.eventId ? (
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Sessione non avviata</div>
              ) : (
                <div className="mb-1 text-xs uppercase tracking-widest text-amber-400">Nessun evento attivo</div>
              )}
              <div className="text-display text-2xl font-black" style={{ color: noSessionGame.accentColor }}>
                {noSessionGame.name}
              </div>
              {noSessionGame.eventId ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Nessuna sessione attiva per questo gioco. Puoi <strong className="text-foreground">crearla subito</strong> (se sei autenticato) oppure aprire il Cockpit per configurarla.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Per avviare un gioco devi prima <strong className="text-foreground">creare un evento</strong> e avviare una sessione dal Cockpit animatore.
                </p>
              )}
              <div className="mt-5 flex flex-col gap-2">
                {noSessionGame.eventId && (
                  <button
                    onClick={handleCreateSession}
                    disabled={creatingSession}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black hover-elevate disabled:opacity-60"
                    style={{ background: noSessionGame.accentColor, color: '#0a0820' }}
                  >
                    {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {creatingSession ? 'Creazione sessione…' : 'Crea sessione e apri board'}
                  </button>
                )}
                <button
                  onClick={() => { setNoSessionGame(null); navigate('/control'); }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover-elevate"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Apri Cockpit
                </button>
                <button
                  onClick={() => setNoSessionGame(null)}
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Chiudi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game intro overlay (triggered by socket session:updated) ── */}
      <AnimatePresence>
        {introGame && (
          <GameIntroOverlay
            key={`${introGame.slug}-${Date.now()}`}
            name={introGame.name}
            accentColor={introGame.accentColor}
            icon={introGame.icon}
            tagline={introGame.tagline}
            slug={introGame.slug}
            onDone={() => setIntroGame(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="relative z-20 flex shrink-0 items-center justify-between px-4 py-3 sm:px-8 sm:py-4 lg:px-10 lg:py-5">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="flex shrink-0 items-center justify-center rounded-xl bg-white px-2 py-1 shadow-md sm:rounded-2xl sm:px-3 sm:py-1.5">
            <img src="/logo.png" alt="IDEA Games" className="h-8 w-auto object-contain sm:h-11" />
          </div>
          <div className="min-w-0">
            <div className="hidden text-xs text-muted-foreground sm:block sm:text-sm">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {lan.localMode ? (
            <div className="flex items-center gap-1.5 rounded-full border border-orange-500/50 bg-orange-500/15 px-3 py-1.5 text-xs font-bold text-orange-400 sm:px-4 sm:py-2 sm:text-sm">
              <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>LAN</span>
              {!lan.isOnline && <span className="animate-pulse">● OFFLINE</span>}
            </div>
          ) : (
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs sm:flex sm:px-4 sm:py-2 sm:text-sm">
              <Wifi className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
              <span className="text-muted-foreground">{t('hub.network_local')}</span>
            </div>
          )}
          <LocaleSwitcher />
        </div>
      </header>

      {/* ── Live event banner ─────────────────────────────────────── */}
      <div className="relative z-10 shrink-0 px-4 sm:px-8 lg:px-10">
        {liveEvent ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-destructive-foreground sm:px-3 sm:py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {t('common.live')}
            </span>
            <span className="hidden text-muted-foreground sm:block">{t('hub.live_event')}:</span>
            <span className="text-display text-base font-bold sm:text-xl">{liveEvent.name}</span>
            {liveEvent.venue && <span className="hidden text-muted-foreground lg:block">— {liveEvent.venue}</span>}
          </motion.div>
        ) : (
          <div className="text-sm text-muted-foreground italic">Nessun evento in corso</div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          MOBILE  (<768 px): stacked, zero-scroll
          ════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden px-4 pt-3 gap-3 pb-20">

        {/* QR compact / no-event pill */}
        {liveEvent ? (
          <div className="shrink-0 flex items-center gap-4 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-md">
            <QrPlaceholder text={joinUrl} size={90} />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('hub.scan_to_join')}</div>
              <div className="text-mono text-2xl font-black text-primary">{liveEvent.joinCode}</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-display text-xl font-black text-primary">{players.length}</span>
                <span>{t('hub.players_connected')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CalendarPlus className="h-5 w-5 text-primary" />
            </div>
            <p className="flex-1 min-w-0 text-xs text-muted-foreground leading-relaxed">
              Il QR comparirà quando crei e avvii un evento
            </p>
            <button onClick={() => navigate('/control')}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground shrink-0">
              Cockpit
            </button>
          </div>
        )}

        {/* Game cards 2-col */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 mb-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">{t('hub.choose_game')}</div>
          {gamesLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2.5 content-start pb-2">
              {visibleGames.map((g, i) => <GameCard key={g.id} g={g} i={i} />)}
            </div>
          )}
        </div>

        {/* Serata Completa CTA */}
        <motion.button type="button" onClick={() => navigate('/control')}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.97 }}
          className="shrink-0 w-full flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-left hover-elevate">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-display text-sm font-black text-primary">✨ Serata Completa</div>
            <div className="text-xs text-muted-foreground">Percorso · Coppie · Quizzone in sequenza</div>
          </div>
        </motion.button>

        {/* Player roster collapsible */}
        <div className="shrink-0 rounded-2xl border border-border bg-card/70 overflow-hidden">
          <button
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-bold text-muted-foreground"
            onClick={() => setRosterOpen(o => !o)}>
            <span className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-accent" /> Live roster ({players.length})
            </span>
            {rosterOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {rosterOpen && (
            <div className="border-t border-border px-4 pb-3 pt-2.5 space-y-2">
              {players.length === 0 && <div className="text-sm text-muted-foreground">Nessun giocatore ancora.</div>}
              {players.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-background"
                    style={{ background: p.avatarColor }}>{p.nickname[0]}</div>
                  <div className="text-display text-sm font-bold truncate">{p.nickname}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          TABLET  (768 px – 1023 px): full-bleed + floating panels
          ════════════════════════════════════════════════════════════ */}
      <div className="hidden md:relative md:flex md:flex-1 md:min-h-0 md:items-center md:justify-center md:overflow-hidden lg:hidden">

        {/* Left floating panel */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="absolute left-4 top-1/2 z-20 w-[170px] -translate-y-1/2">
          {liveEvent ? <QrPanel compact /> : <EventCTA />}
        </motion.div>

        {/* Centre: octagon game grid */}
        <div className="flex flex-col items-center justify-center">
          {gamesLoading
            ? <Loader2 className="h-8 w-8 animate-spin text-primary" />
            : <OctGrid oct={T_OCT} ox={T_OX} oy={T_OY} />
          }
          <div className="mt-3 text-display text-base uppercase tracking-[0.35em] text-muted-foreground/40">
            {t('hub.choose_game')}
          </div>
        </div>

        {/* Right floating panel */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="absolute right-4 top-1/2 z-20 flex w-[170px] -translate-y-1/2 flex-col gap-2">
          <RosterPanel />
          <button onClick={() => navigate('/control')}
            className="flex w-full items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-left hover-elevate">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div>
              <div className="text-display text-[11px] font-black text-primary">✨ Serata Completa</div>
              <div className="text-[9px] text-muted-foreground">Percorso · Coppie · Quizzone</div>
            </div>
          </button>
        </motion.div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          DESKTOP  (≥1024 px): full-bleed grid + floating side panels
          ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:min-h-0 lg:items-center lg:justify-center">

        {/* ── Left floating panel ── */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          className="absolute left-6 top-1/2 z-20 w-[210px] -translate-y-1/2">
          {liveEvent ? <QrPanel compact /> : <EventCTA />}
        </motion.div>

        {/* ── Centre: big octagon game grid ── */}
        <div className="flex flex-col items-center justify-center">
          {gamesLoading
            ? <Loader2 className="h-10 w-10 animate-spin text-primary" />
            : <OctGrid oct={D_OCT} ox={D_OX} oy={D_OY} />
          }
          <div className="mt-4 text-display text-xl uppercase tracking-[0.38em] text-muted-foreground/40">
            {t('hub.choose_game')}
          </div>
        </div>

        {/* ── Right floating panel ── */}
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          className="absolute right-6 top-1/2 z-20 flex w-[210px] -translate-y-1/2 flex-col gap-3">
          <RosterPanel />
          <button onClick={() => navigate('/control')}
            className="flex w-full items-center gap-2.5 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left hover-elevate">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-display text-xs font-black text-primary">✨ Serata Completa</div>
              <div className="text-[10px] text-muted-foreground">Percorso · Coppie · Quizzone</div>
            </div>
          </button>
        </motion.div>
      </div>

      {/* ── Cockpit flottante — sempre visibile ── */}
      <motion.button type="button" onClick={() => navigate('/control')}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-30 hidden lg:flex items-center gap-2.5 rounded-2xl bg-primary px-5 py-3.5 text-sm font-black text-primary-foreground shadow-2xl shadow-primary/30">
        <SlidersHorizontal className="h-4 w-4" />
        Cockpit Animatore
      </motion.button>

      {/* ── Panic: Black Screen overlay (proiettore) ── */}
      <AnimatePresence>
        {projectorBlack && (
          <motion.div
            key="projector-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] bg-black"
            onClick={() => setProjectorBlack(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

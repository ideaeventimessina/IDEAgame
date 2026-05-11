import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Users, Radio, Loader2, ChevronDown, ChevronUp, Sparkles, SlidersHorizontal, CalendarPlus, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Octagon } from '@/components/Octagon';
import { GameIcon } from '@/components/GameIcon';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { GameIntroOverlay } from '@/components/GameIntroOverlay';
import { useT } from '@/i18n';
import { useListGames, useGetCurrentEvent, getGetCurrentEventQueryKey, useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/auth/roles';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useLocalMode } from '@/hooks/useLocalMode';
// ── Theme-park ambient particles ─────────────────────────────────────────────
const CONFETTI_PALETTE = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6'];

function HubConfetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {Array.from({ length: 22 }).map((_, i) => {
        const color = CONFETTI_PALETTE[i % CONFETTI_PALETTE.length];
        const left  = `${(i * 9.1 + 5) % 100}%`;
        const dur   = 7 + (i % 5) * 1.2;
        const w     = 4 + (i % 4) * 2;
        const h     = i % 3 === 0 ? w : w * 0.4;
        return (
          <motion.div key={i} className="absolute top-0 rounded-sm" style={{ left, width: w, height: h, backgroundColor: color, opacity: 0.6 }}
            animate={{ y: ['0vh', '108vh'], rotate: [0, i % 2 ? 360 : -360], opacity: [0, 0.7, 0.7, 0] }}
            transition={{ duration: dur, delay: -(i * 0.55), repeat: Infinity, ease: 'linear' }} />
        );
      })}
    </div>
  );
}

function HubStars() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {Array.from({ length: 60 }).map((_, i) => {
        const x = (i * 41 + 13) % 100;
        const y = (i * 61 + 7) % 100;
        const sz = 1 + (i % 3) * 0.6;
        const op = 0.12 + (i % 4) * 0.1;
        return (
          <motion.div key={i} className="absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: sz, height: sz, opacity: op }}
            animate={{ opacity: [op * 0.3, op, op * 0.3] }}
            transition={{ duration: 2 + (i % 6) * 0.5, delay: -(i * 0.18), repeat: Infinity }} />
        );
      })}
    </div>
  );
}

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

type IntroGame = { name: string; accentColor: string; icon: string; tagline: string; slug: string; sessionId: string; eventId: string };

type PublicEvent = { id: string; name: string; venue: string; joinCode: string; status: string; brandColor: string; enabledGames: string[] };
type PublicPlayer = { id: string; nickname: string; avatarColor: string; teamId: string; isConnected: boolean };

export default function Hub() {
  const t = useT();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // ── Public (unauthenticated) projector mode ─────────────────────────────
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlCode = urlParams.get('e')?.toUpperCase().trim() ?? null;
  const [inputCode, setInputCode] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(urlCode);
  const [publicEvent, setPublicEvent] = useState<PublicEvent | null>(null);
  const [publicPlayers, setPublicPlayers] = useState<PublicPlayer[]>([]);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Poll public event by join code when not authenticated
  useEffect(() => {
    if (user || !activeCode) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(`/api/events/by-code/${activeCode}`);
        if (!r.ok) {
          if (!cancelled) { setCodeError('Codice non valido o evento non attivo.'); setPublicEvent(null); }
          return;
        }
        const { event } = await r.json() as { event: PublicEvent };
        if (!cancelled) { setPublicEvent(event); setCodeError(null); }
      } catch { /* ignore */ }
    };
    run();
    const id = setInterval(run, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, activeCode]);

  // Poll public players when we have an event
  useEffect(() => {
    if (user || !publicEvent?.id || !activeCode) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(`/api/events/by-code/${activeCode}/players`);
        if (r.ok) { const data = await r.json(); if (!cancelled) setPublicPlayers(data); }
      } catch { /* ignore */ }
    };
    run();
    const id = setInterval(run, 4_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, publicEvent?.id, activeCode]);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [introGame, setIntroGame] = useState<IntroGame | null>(null);
  const [projectorBlack, setProjectorBlack] = useState(false);
  const [noSessionGame, setNoSessionGame] = useState<NoSessionState>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [hubPhase, setHubPhase] = useState<'join' | 'gameboard'>('join');
  const [preloadedThemes, setPreloadedThemes] = useState<Record<string, { id: string; name: string } | null>>({});
  // Audio rimosso dall'Hub — suono solo da LiveControl/admin

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
      if (user) setNoSessionGame({ name, slug, accentColor, eventId: null });
      return;
    }

    try {
      const res = await fetch(`/api/events/${liveEvent.id}/active-session`);
      const session = res.ok ? await res.json() : null;
      if (session && session.gameSlug === slug && session.status !== 'ended' && boardPath) {
        navigate(`${boardPath}?s=${session.id}&e=${liveEvent.id}`);
      } else {
        // Public mode: no create-session option — pass null eventId so dialog shows "ask the animator"
        setNoSessionGame({ name, slug, accentColor, eventId: user ? liveEvent.id : null });
      }
    } catch {
      if (user) setNoSessionGame({ name, slug, accentColor, eventId: liveEvent.id });
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
  // Only fetch authenticated event when logged in — public mode uses publicEvent instead
  const { data: authEvent, isLoading: eventLoading } = useGetCurrentEvent({
    query: { queryKey: getGetCurrentEventQueryKey(), enabled: !!user },
  });
  const liveEvent: PublicEvent | null = user ? (authEvent as PublicEvent ?? null) : publicEvent;
  const liveEventId = liveEvent?.id ?? '';

  const { data: authPlayers = [] } = useListPlayers(
    liveEventId,
    { query: { queryKey: getListPlayersQueryKey(liveEventId), enabled: !!user && !!liveEventId } },
  );
  const players: PublicPlayer[] = user
    ? (authPlayers as PublicPlayer[])
    : publicPlayers;

  const { on, connected } = useEventSocket(liveEventId || null);

  // Keep a ref to games so the active-session effect can read them without
  // re-triggering on every React Query refetch (games is not a dep below).
  const gamesRef = useRef(games);
  useEffect(() => { gamesRef.current = games; }, [games]);

  // On mount and on every socket reconnect: check for an already-running session.
  // This is the primary navigation trigger — it catches game:started events that
  // were emitted while the socket was reconnecting (Socket.IO doesn't replay them).
  useEffect(() => {
    if (!liveEvent?.id || !connected) return;
    let cancelled = false;
    fetch(`/api/events/${liveEvent.id}/active-session`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((session: { id: string; gameSlug: string; status: string } | null) => {
        if (cancelled) return;
        if (!session || session.status !== 'running') {
          setSessionRunning(false);
          if (session?.status === 'ended') setSessionEnded(true);
          return;
        }
        setSessionRunning(true);
        setSessionEnded(false);
        const boardPath = SLUG_TO_BOARD[session.gameSlug];
        if (boardPath) {
          navigate(`${boardPath}?s=${session.id}&e=${liveEvent.id}`);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvent?.id, connected]);

  // Listen for game:started / game:resumed → show intro overlay then navigate
  // Secondary trigger: for sessions that start while the Hub is already connected
  useEffect(() => {
    if (!liveEvent?.id) return;
    const handleGameStarted = (data: { session: { id: string; gameSlug: string; status: string }; eventId: string }) => {
      setSessionRunning(true);
      setSessionEnded(false);
      const game = games.find(g => g.slug === data.session.gameSlug);
      if (game) {
        setIntroGame({
          name: game.name,
          accentColor: game.accentColor,
          icon: game.icon,
          tagline: game.tagline ?? '',
          slug: game.slug,
          sessionId: data.session.id,
          eventId: data.eventId,
        });
      }
    };
    const u1 = on<{ session: { id: string; gameSlug: string; status: string }; eventId: string }>('game:started', handleGameStarted);
    const u2 = on<{ session: { id: string; gameSlug: string; status: string }; eventId: string }>('game:resumed', handleGameStarted);
    return () => { u1?.(); u2?.(); };
  }, [liveEvent?.id, on, games]);

  // Panic panel: projector commands
  useEffect(() => {
    if (!liveEvent?.id) return;
    const unsubs = [
      on('projector:black',          () => setProjectorBlack(true)),
      on('projector:black-off',      () => setProjectorBlack(false)),
      on('projector:close-overlays', () => { setProjectorBlack(false); setIntroGame(null); }),
      on('projector:go-scoreboard',  (payload: { eventId?: string }) => {
        setSessionRunning(false);
        const eid = payload?.eventId ?? liveEvent.id;
        navigate(`/scoreboard?e=${eid}`);
      }),
      on('projector:go-hub', () => { setSessionRunning(false); navigate('/'); }),
      on<{ session: unknown }>('game:ended', () => { setSessionRunning(false); setSessionEnded(true); }),
      on<{ phase: 'join' | 'gameboard' }>('hub:phase', ({ phase }) => setHubPhase(phase)),
      on<{ slug: string; theme: { id: string; name: string } | null }>('hub:game-preloaded', ({ slug, theme }) => {
        setPreloadedThemes(prev => ({ ...prev, [slug]: theme }));
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
        {sessionRunning && (
          <div className={`mt-3 flex w-full items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 ${compact ? 'text-xs' : 'text-xs'}`}>
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
            <span className="text-amber-300 font-semibold">Partita in corso</span>
          </div>
        )}
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

  // ── Join-code entry screen: unauthenticated with no code ─────────────
  if (!user && !activeCode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6"
        style={{ background: 'radial-gradient(ellipse 160% 80% at 50% -5%, #2d0d52 0%, #130628 40%, #060213 100%)' }}>
        <HubStars />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-sm text-center">
          <div className="mx-auto flex items-center justify-center rounded-2xl bg-white px-4 py-2 shadow-xl shadow-black/30" style={{ width: 148 }}>
            <img src="/logo.png" alt="IDEA Games" className="h-14 w-auto object-contain" />
          </div>
          <div className="mt-6 text-display text-3xl font-black">Jonny's World</div>
          <div className="mt-2 text-sm text-muted-foreground">Inserisci il codice evento per visualizzare il proiettore</div>

          <div className="mt-8 space-y-3">
            <input
              value={inputCode}
              onChange={e => { setInputCode(e.target.value.toUpperCase()); setCodeError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && inputCode.trim()) setActiveCode(inputCode.trim()); }}
              placeholder="Es. SORR40"
              maxLength={10}
              className="w-full rounded-2xl border border-primary/40 bg-card/60 px-5 py-4 text-center text-display text-2xl font-black uppercase tracking-[0.3em] text-primary placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/60 backdrop-blur-md"
            />
            {codeError && (
              <div className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{codeError}</div>
            )}
            <button
              onClick={() => { if (inputCode.trim()) setActiveCode(inputCode.trim()); }}
              disabled={!inputCode.trim()}
              className="w-full rounded-2xl bg-primary py-4 text-sm font-black text-primary-foreground hover-elevate disabled:opacity-40"
            >
              Connetti al proiettore →
            </button>
          </div>

          <div className="mt-8 flex items-center gap-3 text-xs text-muted-foreground/60">
            <div className="flex-1 h-px bg-border" />
            oppure
            <div className="flex-1 h-px bg-border" />
          </div>
          <button onClick={() => navigate('/login')}
            className="mt-4 w-full rounded-2xl border border-border py-3.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            Accedi come animatore →
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Public projector: evento live, fase raccolta giocatori ──────────
  if (!user && publicEvent && hubPhase === 'join') {
    const publicJoinUrl = `${lan.effectiveOrigin}/play?e=${publicEvent.joinCode}`;
    return (
      <div className="relative h-screen w-full overflow-hidden select-none flex flex-col"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
        <HubStars />
        <HubConfetti />

        {/* Purple top glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-[30%] z-0"
          style={{ background: 'radial-gradient(ellipse, rgba(120,50,255,0.25) 0%, transparent 70%)', filter: 'blur(60px)' }} />

        {/* Header */}
        <header className="relative z-20 flex shrink-0 items-center justify-between px-8 py-5">
          <div className="flex items-center justify-center rounded-2xl bg-white px-3 py-1.5 shadow-xl">
            <img src="/logo.png" alt="IDEA Games" className="h-10 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-destructive px-3 py-1 text-xs font-black uppercase tracking-widest text-destructive">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-destructive align-middle" />
              LIVE
            </div>
            <div className="text-display text-sm font-bold text-muted-foreground">{publicEvent.name}</div>
            {publicEvent.venue && <div className="hidden sm:block text-xs text-muted-foreground/60">— {publicEvent.venue}</div>}
          </div>
          {/* Player count */}
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-2 backdrop-blur-md">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-display text-xl font-black text-primary">{publicPlayers.length}</span>
            <span className="text-xs text-muted-foreground">connessi</span>
          </div>
        </header>

        {/* Main content — QR gigante + titolo */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 pb-10">

          {/* Title */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-center">
            <div className="text-display text-5xl sm:text-6xl lg:text-7xl font-black leading-none"
              style={{ background: 'linear-gradient(135deg, #F5B642 0%, #fff8e8 50%, #F5B642 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Unisciti alla serata!
            </div>
            <div className="mt-3 text-lg sm:text-xl text-muted-foreground">
              Scansiona il QR o inserisci il codice sul telefono
            </div>
          </motion.div>

          {/* QR + join code centrati */}
          <motion.div initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 140, damping: 18 }}
            className="flex flex-col items-center gap-6">
            {/* QR card */}
            <div className="rounded-3xl p-5 shadow-2xl shadow-black/60"
              style={{ background: 'rgba(16,10,40,0.85)', border: '2px solid rgba(245,182,66,0.4)', backdropFilter: 'blur(20px)' }}>
              <QrPlaceholder text={publicJoinUrl} size={280} />
            </div>

            {/* Join code huge */}
            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground mb-2">codice evento</div>
              <div className="text-display text-6xl sm:text-7xl font-black tracking-[0.15em]"
                style={{ color: '#F5B642', textShadow: '0 0 60px rgba(245,182,66,0.5)' }}>
                {publicEvent.joinCode}
              </div>
              <div className="mt-2 text-sm text-muted-foreground/70">
                vai su <span className="font-black text-foreground">{lan.effectiveOrigin.replace(/^https?:\/\//, '')}/play</span>
              </div>
            </div>
          </motion.div>

          {/* Player avatars live */}
          {publicPlayers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="flex flex-col items-center gap-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground/60">Già connessi</div>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {publicPlayers.slice(0, 20).map((p) => (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-card/60 px-3 py-1.5 text-sm font-bold backdrop-blur-sm"
                    style={{ borderColor: `${p.avatarColor}40` }}>
                    <div className="h-5 w-5 shrink-0 rounded-full text-[10px] font-black flex items-center justify-center text-background"
                      style={{ background: p.avatarColor }}>{p.nickname[0]?.toUpperCase()}</div>
                    {p.nickname}
                  </motion.div>
                ))}
                {publicPlayers.length > 20 && (
                  <div className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground">+{publicPlayers.length - 20}</div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Jonny floating */}
        <div className="pointer-events-none absolute bottom-0 right-12 z-10 select-none hidden lg:block" style={{ width: 200, height: 310 }}>
          <motion.img src="/jonny-master.jpg" alt="Jonny"
            className="w-full h-full object-contain object-bottom"
            style={{ filter: 'drop-shadow(0 0 40px rgba(245,182,66,0.4))' }}
            animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} />
        </div>
      </div>
    );
  }

  // ── Public projector: Game Board phase ────────────────────────────────
  if (!user && publicEvent && hubPhase === 'gameboard') {
    return (
      <div className="relative h-screen w-full overflow-hidden select-none flex flex-col"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
        <HubStars />
        <header className="relative z-20 flex shrink-0 items-center justify-between px-8 py-5">
          <div className="flex items-center justify-center rounded-2xl bg-white px-3 py-1.5 shadow-xl">
            <img src="/logo.png" alt="IDEA Games" className="h-10 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-destructive px-3 py-1 text-xs font-black uppercase tracking-widest text-destructive">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-destructive align-middle" />LIVE
            </div>
            <div className="text-display text-sm font-bold text-muted-foreground">{publicEvent.name}</div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-2 backdrop-blur-md">
            <Users className="h-4 w-4 text-green-400" />
            <span className="text-display text-xl font-black text-green-400">{publicPlayers.length}</span>
            <span className="text-xs text-muted-foreground">pronti</span>
          </div>
        </header>
        <div className="relative z-10 flex flex-1 flex-col min-h-0 overflow-hidden">
          <GameBoardView />
        </div>
      </div>
    );
  }

  // ── Standby screen: nessun evento attivo ─────────────────────────────
  if (!liveEvent) {
    return (
      <div className="relative h-screen w-full overflow-hidden select-none">

        {/* Full-screen hero poster */}
        <motion.img src="/jonny-world-hero.png" alt="Jonny's World"
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{ filter: 'brightness(0.92) saturate(1.1)' }}
          initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }} />

        {/* Subtle dark vignette around edges */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 50%, rgba(4,2,16,0.65) 100%)' }} />

        {/* Bottom fade for badge */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 60%, rgba(4,2,16,0.85) 100%)' }} />

        {/* Black screen panic overlay */}
        <AnimatePresence>
          {projectorBlack && (
            <motion.div key="projector-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }} className="fixed inset-0 z-[200] bg-black" onClick={() => setProjectorBlack(false)} />
          )}
        </AnimatePresence>

        {/* Waiting badge — bottom center */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center pb-8 sm:pb-12">
          <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }}
            className="rounded-2xl border px-8 sm:px-14 py-3 sm:py-4 text-sm sm:text-base font-black tracking-[0.25em] uppercase"
            style={{ borderColor: 'rgba(245,182,66,0.5)', background: 'rgba(4,2,16,0.7)', color: '#F5B642', backdropFilter: 'blur(12px)' }}>
            In attesa di un evento…
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Serata conclusa: sessione terminata, evento ancora live ───────────
  if (liveEvent && sessionEnded) {
    return (
      <div className="relative h-screen w-full overflow-hidden select-none"
        style={{ background: 'radial-gradient(ellipse 160% 80% at 50% -5%, #1a0535 0%, #0a0220 50%, #040110 100%)' }}>
        <HubStars />

        {/* Gold bokeh blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full opacity-10 blur-3xl"
            style={{ background: 'radial-gradient(circle, #F5B642 0%, transparent 70%)' }} />
          <div className="absolute right-1/4 bottom-1/4 h-64 w-64 rounded-full opacity-8 blur-3xl"
            style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }} />
        </div>

        {/* Black screen panic overlay */}
        <AnimatePresence>
          {projectorBlack && (
            <motion.div key="projector-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }} className="fixed inset-0 z-[200] bg-black" onClick={() => setProjectorBlack(false)} />
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
          {/* Trophy */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
            className="text-7xl sm:text-8xl lg:text-9xl select-none">
            🏆
          </motion.div>

          {/* Event name */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="text-xs uppercase tracking-[0.35em] text-muted-foreground mb-2">{liveEvent.name}</div>
            <div className="text-display text-4xl sm:text-5xl lg:text-6xl font-black"
              style={{ background: 'linear-gradient(135deg, #F5B642 0%, #fff8e8 50%, #F5B642 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Grazie a tutti!
            </div>
            <div className="mt-3 text-base sm:text-lg text-muted-foreground">
              La serata è conclusa — a presto! 🎉
            </div>
          </motion.div>

          {/* Scoreboard link */}
          <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            onClick={() => navigate(`/scoreboard?e=${liveEvent.id}`)}
            className="mt-2 rounded-2xl border border-primary/50 bg-primary/10 px-8 py-3 text-sm font-black text-primary backdrop-blur-md hover-elevate">
            Vedi classifica finale →
          </motion.button>

          {/* Soft pulsing badge */}
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 3, repeat: Infinity }}
            className="mt-4 text-xs uppercase tracking-[0.3em] text-muted-foreground/50">
            {user ? 'Avvia una nuova sessione dal Cockpit per ricominciare' : 'In attesa della prossima sessione…'}
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Game Board View (shown when hubPhase === 'gameboard') ─────────────────
  function GameBoardView() {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 lg:px-12 py-4 gap-4">
        <div className="shrink-0 text-xs uppercase tracking-[0.35em] text-muted-foreground/50 text-center">
          L'animatore sceglierà il prossimo gioco dal cockpit
        </div>
        <div className={`flex-1 grid gap-4 lg:gap-6 content-center ${visibleGames.length <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'}`}>
          {visibleGames.map((g, i) => {
            const theme = preloadedThemes[g.slug] ?? null;
            const isReady = theme !== null;
            return (
              <motion.button
                key={g.id}
                type="button"
                onClick={() => handleGameClick(g.slug, g.name, g.accentColor)}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.07, type: 'spring', stiffness: 120, damping: 16 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="relative flex flex-col items-center gap-3 rounded-3xl border-2 p-5 text-center transition-shadow hover:shadow-xl"
                style={{
                  borderColor: isReady ? g.accentColor : 'rgba(255,255,255,0.08)',
                  background: isReady ? `${g.accentColor}18` : 'rgba(255,255,255,0.03)',
                  boxShadow: isReady ? `0 0 40px ${g.accentColor}22` : undefined,
                }}
              >
                <div className="absolute inset-0 rounded-3xl opacity-5"
                  style={{ background: `radial-gradient(ellipse at top, ${g.accentColor} 0%, transparent 70%)` }} />
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: `${g.accentColor}22`, color: g.accentColor }}>
                  <GameIcon name={g.icon as IconName} className="h-9 w-9" />
                </div>
                <div className="relative z-10 text-display text-base lg:text-lg font-black leading-tight" style={{ color: g.accentColor }}>
                  {g.name}
                </div>
                {isReady ? (
                  <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-green-500/50 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    {theme.name}
                  </div>
                ) : (
                  <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/8 px-3 py-1 text-xs font-bold text-amber-400/60">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400/60" />
                    Nessun tema
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 160% 80% at 50% -5%, #2d0d52 0%, #130628 40%, #060213 100%)' }}>

      {/* ── Jonny's World ambient layers ── */}
      <HubStars />
      <HubConfetti />

      {/* ── Jonny floating figure — desktop only ── */}
      <div className="hidden lg:block pointer-events-none absolute bottom-0 right-[235px] z-5 select-none"
        style={{ width: 220, height: 340 }}>
        <motion.img src="/jonny-master.jpg" alt="Jonny"
          className="w-full h-full object-contain object-bottom"
          style={{ filter: 'drop-shadow(0 0 40px rgba(245,182,66,0.45)) drop-shadow(0 20px 60px rgba(100,40,200,0.4))' }}
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-8 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(245,182,66,0.35) 0%, transparent 70%)', filter: 'blur(8px)' }} />
      </div>


      {/* ── Top ambient glow ── */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[35%] z-0"
        style={{ background: 'radial-gradient(ellipse, rgba(120,50,255,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      {/* Bottom-left gold glow */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-[40%] h-[40%] z-0"
        style={{ background: 'radial-gradient(ellipse at bottom left, rgba(245,182,66,0.1) 0%, transparent 70%)', filter: 'blur(40px)' }} />

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
            key={`${introGame.slug}-${introGame.sessionId}`}
            name={introGame.name}
            accentColor={introGame.accentColor}
            icon={introGame.icon}
            tagline={introGame.tagline}
            slug={introGame.slug}
            onDone={() => {
              const boardPath = SLUG_TO_BOARD[introGame.slug];
              setIntroGame(null);
              if (boardPath) {
                navigate(`${boardPath}?s=${introGame.sessionId}&e=${introGame.eventId}`);
              }
            }}
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
          {user && (
            <button onClick={() => navigate('/control')}
              className="hidden lg:flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors sm:px-4 sm:py-2 sm:text-sm">
              <SlidersHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Cockpit
            </button>
          )}
        </div>
      </header>

      {/* ── Live event banner + Gioca con Jonny ──────────────────── */}
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-muted-foreground italic">Nessun evento in corso</div>
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/home')}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-black text-black shadow-lg shadow-primary/30"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Gioca con Jonny — Modalità Home
            </motion.button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          MOBILE  (<768 px): stacked, zero-scroll
          ════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden px-4 pt-3 gap-3 pb-20">

        {/* QR compact / no-event pill — hidden in gameboard phase */}
        {hubPhase === 'join' && liveEvent ? (
          <div className="shrink-0 flex items-center gap-4 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-md">
            <QrPlaceholder text={joinUrl} size={90} />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('hub.scan_to_join')}</div>
              <div className="text-mono text-2xl font-black text-primary">{liveEvent.joinCode}</div>
              {sessionRunning ? (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">Partita in corso</span>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-display text-xl font-black text-primary">{players.length}</span>
                  <span>{t('hub.players_connected')}</span>
                </div>
              )}
            </div>
          </div>
        ) : hubPhase === 'gameboard' && liveEvent ? (
          <div className="shrink-0 flex items-center gap-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-3 backdrop-blur-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/15">
              <Users className="h-5 w-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Giocatori connessi</div>
              <span className="text-display text-2xl font-black text-green-400">{players.length}</span>
            </div>
            <div className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-400">
              🎮 Scegli gioco
            </div>
          </div>
        ) : user ? (
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
        ) : null}

        {/* Game cards 2-col / game board */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {hubPhase !== 'gameboard' && <div className="shrink-0 mb-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">{t('hub.choose_game')}</div>}
          {gamesLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : hubPhase === 'gameboard' ? (
            <GameBoardView />
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2.5 content-start pb-2">
              {visibleGames.map((g, i) => <GameCard key={g.id} g={g} i={i} />)}
            </div>
          )}
        </div>

        {/* Serata Completa CTA — admin only */}
        {user && (
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
        )}

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

        {/* Left floating panel — hidden in gameboard phase */}
        {hubPhase === 'join' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="absolute left-4 top-1/2 z-20 w-[170px] -translate-y-1/2">
            {liveEvent ? <QrPanel compact /> : !liveEvent && user ? <EventCTA /> : (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/home')}
                className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-primary/50 bg-primary/10 p-5 text-center hover-elevate"
              >
                <Sparkles className="h-7 w-7 text-primary" />
                <div>
                  <div className="text-display text-sm font-black text-primary">Gioca con Jonny</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">Modalità Home — senza evento</div>
                </div>
              </motion.button>
            )}
          </motion.div>
        )}

        {/* Centre: octagon game grid OR game board */}
        <div className={`flex flex-col items-center justify-center ${hubPhase === 'gameboard' ? 'w-full' : ''}`}>
          {gamesLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : hubPhase === 'gameboard' ? (
            <GameBoardView />
          ) : (
            <OctGrid oct={T_OCT} ox={T_OX} oy={T_OY} />
          )}
          {hubPhase === 'join' && (
            <div className="mt-3 text-display text-base uppercase tracking-[0.35em] text-muted-foreground/40">
              {t('hub.choose_game')}
            </div>
          )}
        </div>

        {/* Right floating panel */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="absolute right-4 top-1/2 z-20 flex w-[170px] -translate-y-1/2 flex-col gap-2">
          <RosterPanel />
          {user && (
            <button onClick={() => navigate('/control')}
              className="flex w-full items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-left hover-elevate">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div>
                <div className="text-display text-[11px] font-black text-primary">✨ Serata Completa</div>
                <div className="text-[9px] text-muted-foreground">Percorso · Coppie · Quizzone</div>
              </div>
            </button>
          )}
        </motion.div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          DESKTOP  (≥1024 px): full-bleed grid + floating side panels
          ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:min-h-0 lg:items-center lg:justify-center">

        {/* ── Left floating panel — hidden in gameboard phase ── */}
        {hubPhase === 'join' && (
          <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
            className="absolute left-6 top-1/2 z-20 w-[210px] -translate-y-1/2">
            {liveEvent && !sessionRunning ? <QrPanel compact /> : !liveEvent && user ? <EventCTA /> : null}
          </motion.div>
        )}

        {/* ── Centre: big octagon game grid OR game board ── */}
        <div className={`flex flex-col items-center justify-center ${hubPhase === 'gameboard' ? 'w-full' : ''}`}>
          {gamesLoading ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : hubPhase === 'gameboard' ? (
            <GameBoardView />
          ) : (
            <OctGrid oct={D_OCT} ox={D_OX} oy={D_OY} />
          )}
          {hubPhase === 'join' && (
            <div className="mt-4 text-display text-xl uppercase tracking-[0.38em] text-muted-foreground/40">
              {t('hub.choose_game')}
            </div>
          )}
        </div>

        {/* ── Right floating panel ── */}
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          className="absolute right-6 top-1/2 z-20 flex w-[210px] -translate-y-1/2 flex-col gap-3">
          <RosterPanel />
          {user && (
            <button onClick={() => navigate('/control')}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left hover-elevate">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-display text-xs font-black text-primary">✨ Serata Completa</div>
                <div className="text-[10px] text-muted-foreground">Percorso · Coppie · Quizzone</div>
              </div>
            </button>
          )}
        </motion.div>
      </div>


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

import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Home, Mic2, ChevronLeft, Users, Star, Zap, Building2 } from 'lucide-react';
import { AudioManager } from '@/audio/AudioManager';
import { useAuth, canSee } from '@/auth/roles';

/* ── asset helper ─────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

/* ── viewport hook ────────────────────────────── */
function useViewport() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

/* ── mode data ────────────────────────────────── */
interface Mode {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  tags: string[];
  color: string;
  glow: string;
  bgSolid: string;
  border: string;
  cta: string;
  route: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  tagIcons: React.FC<{ size?: number }>[];
}

const MODES: Mode[] = [
  {
    id: 'home',
    title: 'MODALITÀ HOME',
    subtitle: 'Gioca ovunque con i tuoi amici',
    desc: 'Divano, pizzeria, gita. Ovunque ci sia un telefono e voglia di ridere.',
    tags: ['2–20 giocatori', 'Casual & fun', 'Senza allestimento'],
    color: '#F5B642',
    glow: '#FFD040',
    bgSolid: 'rgba(24,10,2,0.88)',
    border: 'rgba(245,182,66,0.55)',
    cta: "ENTRA NELL'ARENA",
    route: '/home-setup',
    Icon: Home,
    tagIcons: [Users, Star, Zap],
  },
  {
    id: 'live',
    title: 'MODALITÀ LIVE',
    subtitle: 'Eventi, matrimoni, aziende e feste',
    desc: "Palco, proiettore, pubblico. Lo show professionale firmato Jonny's World.",
    tags: ['20–200 ospiti', 'Show professionale', 'Con presentatore'],
    color: '#A855F7',
    glow: '#C084FC',
    bgSolid: 'rgba(14,4,34,0.88)',
    border: 'rgba(168,85,247,0.55)',
    cta: 'INIZIA LO SHOW',
    route: '/',
    Icon: Mic2,
    tagIcons: [Building2, Star, Zap],
  },
];

/* ── mode card ────────────────────────────────── */
function ModeCard({
  mode,
  delay,
  compact = false,
  onSelect,
}: {
  mode: Mode;
  delay: number;
  compact?: boolean;
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [, navigate] = useLocation();
  const { Icon, tagIcons: TagIcons } = mode;

  const handleSelect = () => {
    AudioManager.resumeContext();
    if (onSelect) { onSelect(); return; }
    navigate(mode.route);
  };

  const iconSize    = compact ? 52 : 64;
  const iconInner   = compact ? 24 : 29;
  const titleSize   = compact ? '0.88rem' : '1rem';
  const subtitleSize = compact ? '0.7rem' : '0.74rem';
  const descSize    = compact ? '0.63rem' : '0.67rem';
  const tagFontSize = compact ? '0.58rem' : '0.62rem';
  const ctaFontSize = compact ? '0.78rem' : '0.82rem';
  const paddingBottom = compact ? 16 : 20;
  const iconMarginTop = compact ? 16 : 22;
  const tagIconSize = compact ? 9 : 10;

  return (
    <motion.div
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.55, ease: 'easeOut' as const }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={handleSelect}
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderRadius: 22,
        background: mode.bgSolid,
        border: `2px solid ${hovered ? mode.color : mode.border}`,
        boxShadow: hovered
          ? `0 0 50px ${mode.glow}50, 0 0 100px ${mode.glow}1e, inset 0 1px 0 rgba(255,255,255,0.1)`
          : `0 0 22px ${mode.glow}1e, inset 0 1px 0 rgba(255,255,255,0.05)`,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        paddingBottom,
      }}
    >
      {/* radial glow bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 50% at 50% 0%,${mode.color}10 0%,transparent 60%)`,
        pointerEvents: 'none',
      }}/>
      {/* top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg,transparent,${mode.color},transparent)`,
        opacity: hovered ? 1 : 0.45, transition: 'opacity 0.25s',
      }}/>

      {/* icon */}
      <motion.div
        animate={hovered ? { scale: 1.1, y: -2 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          marginTop: iconMarginTop,
          width: iconSize, height: iconSize, borderRadius: '50%',
          background: `radial-gradient(circle,${mode.color}28 0%,${mode.color}0a 70%)`,
          border: `2px solid ${mode.color}88`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 26px ${mode.glow}3c`, flexShrink: 0,
        }}
      >
        <div style={{ color: mode.color, display: 'flex' }}>
          <Icon size={iconInner} strokeWidth={1.5} />
        </div>
      </motion.div>

      <div style={{
        marginTop: 10,
        fontFamily: "'Outfit','Arial Black',sans-serif",
        fontWeight: 900, fontSize: titleSize, letterSpacing: '0.08em',
        color: mode.color, textAlign: 'center', paddingInline: 14, flexShrink: 0,
      }}>{mode.title}</div>

      <div style={{
        marginTop: 4,
        fontFamily: "'Outfit',sans-serif",
        fontWeight: 600, fontSize: subtitleSize,
        color: 'rgba(255,255,255,0.78)',
        textAlign: 'center', paddingInline: 14, lineHeight: 1.35, flexShrink: 0,
      }}>{mode.subtitle}</div>

      <div style={{
        marginTop: 6,
        fontFamily: "'Outfit',sans-serif",
        fontWeight: 400, fontSize: descSize,
        color: 'rgba(255,255,255,0.42)',
        textAlign: 'center', paddingInline: 16, lineHeight: 1.45, flexShrink: 0,
      }}>{mode.desc}</div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        marginTop: 10, paddingInline: 12, width: '100%', flexShrink: 0,
      }}>
        {mode.tags.map((tag, i) => {
          const TagIcon = TagIcons[i];
          return (
            <div key={tag} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 100, padding: '3px 9px',
            }}>
              <div style={{ color: mode.color, display: 'flex', flexShrink: 0 }}>
                <TagIcon size={tagIconSize} />
              </div>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 700,
                fontSize: tagFontSize, letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.62)',
              }}>{tag}</span>
            </div>
          );
        })}
      </div>

      <div style={{ flexGrow: 1, minHeight: 8 }}/>

      <motion.button
        animate={hovered ? { scale: 1.04 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          padding: '0.65rem 1.2rem',
          background: `linear-gradient(135deg,${mode.color} 0%,${mode.glow} 100%)`,
          border: `2px solid ${mode.color}`,
          borderRadius: 100,
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900, fontSize: ctaFontSize, letterSpacing: '0.07em',
          color: mode.id === 'home' ? '#000' : '#fff',
          cursor: 'pointer',
          boxShadow: `0 0 24px ${mode.glow}50`,
          width: 'calc(100% - 24px)', flexShrink: 0,
        }}
        whileTap={{ scale: 0.97 }}
        onClick={e => { e.stopPropagation(); handleSelect(); }}
      >{mode.cta}</motion.button>
    </motion.div>
  );
}

const LIVE_DEST = '/live-dashboard';
const LIVE_ROLES = ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] as const;

/* ── page ─────────────────────────────────────── */
export default function ModeSelect() {
  const [, navigate] = useLocation();
  const vw = useViewport();
  const { user, role, isLoading } = useAuth();

  const isMobile  = vw < 640;
  const isTablet  = vw >= 640 && vw < 900;
  const compact   = vw < 900;

  // Auth-aware handler for Modalità Live button
  const handleLiveSelect = () => {
    AudioManager.resumeContext();
    console.log('[LiveLoginFlow] clicked live', { isLoading, user: user?.email ?? null, role });
    if (isLoading) return; // wait for auth to resolve

    if (!user) {
      const target = `${LIVE_DEST}`;
      console.log('[LiveLoginFlow] not authenticated → redirect to login', { target });
      navigate(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }

    const hasAccess = (LIVE_ROLES as readonly string[]).includes(role);
    console.log('[LiveLoginFlow] authenticated', { role, hasAccess, dest: LIVE_DEST });

    if (hasAccess) {
      navigate(LIVE_DEST);
    } else {
      // Authenticated but role doesn't have admin access (e.g. player)
      console.log('[LiveLoginFlow] role denied', { role });
      navigate('/login?redirect=' + encodeURIComponent(LIVE_DEST));
    }
  };

  /* card dimensions scale with viewport */
  const cardW     = isMobile ? '100%' : isTablet ? 220 : 260;
  const cardH     = isMobile ? 280    : isTablet ? 310  : 338;
  const cardsDir  = isMobile ? 'column' as const : 'row' as const;
  const cardsGap  = isMobile ? 14 : 28;
  const maxCards  = isMobile ? 420 : isTablet ? 490 : 580;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      minHeight: '100dvh',
      overflowX: 'hidden',
      overflowY: isMobile ? 'auto' : 'hidden',
      fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif",
      background: '#09050f',
    }}>

      {/* ── Background image: cover with Jonny/park centred ── */}
      <img
        src={pub('/mode-select-bg.png')}
        alt="" aria-hidden
        style={{
          position: 'fixed', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 18%',
          zIndex: 0, pointerEvents: 'none', userSelect: 'none',
          opacity: isMobile ? 0.35 : 1,
        }}
      />

      {/* ── Dark overlay ── */}
      <div style={{
        position: 'fixed', inset: 0,
        background: isMobile
          ? 'linear-gradient(to bottom,rgba(9,5,15,0.55) 0%,rgba(9,5,15,0.82) 100%)'
          : 'rgba(0,0,0,0.22)',
        zIndex: 1, pointerEvents: 'none',
      }}/>

      {/* ── Centre-column contrast gradient (desktop only) ── */}
      {!isMobile && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'radial-gradient(ellipse 62% 78% at 50% 68%, rgba(5,2,16,0.58) 0%, transparent 72%)',
          zIndex: 2, pointerEvents: 'none',
        }}/>
      )}

      {/* ── Content column ──
           Desktop/tablet: flex-end pushes cards into the lower half, leaving
           the Jonny's World artwork visible above. Mobile: flex-start + scroll. */}
      <div style={{
        position: 'relative', zIndex: 20,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'flex-end',
        paddingBottom: isMobile ? 28 : isTablet ? '6vh' : '5vh',
        padding: isMobile ? '20px 16px 28px' : undefined,
        paddingTop: isMobile ? undefined : '12px',
        paddingLeft: isMobile ? undefined : '24px',
        paddingRight: isMobile ? undefined : '24px',
        boxSizing: 'border-box',
      }}>

        {/* Back button — pinned top-left */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate('/')}
          style={{
            position: 'absolute',
            top: isMobile ? 16 : 20,
            left: isMobile ? 16 : 24,
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.4rem 0.9rem',
            background: 'rgba(0,0,0,0.55)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            borderRadius: 100,
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <ChevronLeft size={13}/> {isMobile ? 'MENU' : 'TORNA AL MENU'}
        </motion.button>

        {/* ── Title + Cards — lifted together on desktop/tablet ── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          transform: isMobile ? undefined : isTablet ? 'translateY(-40px)' : 'translateY(-80px)',
        }}>

        {/* ── Title block ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.48, ease: 'easeOut' as const }}
          style={{
            textAlign: 'center',
            marginBottom: isMobile ? 20 : 40,
            marginTop: isMobile ? 48 : 0,
          }}
        >
          <div style={{
            fontFamily: "'Outfit','Arial Black',sans-serif",
            fontWeight: 900,
            fontSize: isMobile ? '1.3rem' : isTablet ? '1.5rem' : '1.7rem',
            letterSpacing: '0.05em',
            color: '#fff', lineHeight: 1.1,
            textShadow: '0 2px 20px rgba(0,0,0,0.95), 0 0 60px rgba(0,0,0,0.7)',
          }}>
            SCEGLI LA TUA MODALITÀ
          </div>
          <div style={{
            marginTop: 7,
            fontSize: isMobile ? '0.64rem' : '0.72rem',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.55)',
            fontWeight: 600,
            textTransform: 'uppercase',
            textShadow: '0 1px 12px rgba(0,0,0,0.95)',
          }}>
            Due esperienze. Un solo show.
          </div>
        </motion.div>

        {/* ── Cards row / column ── */}
        <div style={{
          display: 'flex',
          flexDirection: cardsDir,
          gap: cardsGap,
          width: '100%',
          maxWidth: maxCards,
          alignItems: 'stretch',
        }}>
          {MODES.map((mode, i) => (
            <div
              key={mode.id}
              style={{
                flex: 1,
                width: isMobile ? '100%' : cardW,
                minWidth: isMobile ? undefined : cardW,
                minHeight: cardH,
              }}
            >
              <ModeCard
                mode={mode}
                delay={0.22 + i * 0.13}
                compact={compact}
                onSelect={mode.id === 'live' ? handleLiveSelect : undefined}
              />
            </div>
          ))}
        </div>

        </div>{/* end title+cards wrapper */}

      </div>
    </div>
  );
}

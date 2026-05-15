import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Home, Mic2, ChevronLeft, Users, Star, Zap, Building2 } from 'lucide-react';

/* ── asset helper ─────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
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
function ModeCard({ mode, delay }: { mode: Mode; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const [, navigate] = useLocation();
  const { Icon, tagIcons: TagIcons } = mode;

  return (
    <motion.div
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.55, ease: 'easeOut' as const }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => navigate(mode.route)}
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
        padding: '0 0 20px 0',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 50% at 50% 0%,${mode.color}10 0%,transparent 60%)`,
        pointerEvents: 'none',
      }}/>
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
          marginTop: 22, width: 66, height: 66, borderRadius: '50%',
          background: `radial-gradient(circle,${mode.color}28 0%,${mode.color}0a 70%)`,
          border: `2px solid ${mode.color}88`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 26px ${mode.glow}3c`, flexShrink: 0,
        }}
      >
        <div style={{ color: mode.color, display: 'flex' }}><Icon size={30} strokeWidth={1.5} /></div>
      </motion.div>

      <div style={{
        marginTop: 12, fontFamily: "'Outfit','Arial Black',sans-serif",
        fontWeight: 900, fontSize: '1rem', letterSpacing: '0.08em',
        color: mode.color, textAlign: 'center', paddingInline: 16, flexShrink: 0,
      }}>{mode.title}</div>

      <div style={{
        marginTop: 5, fontFamily: "'Outfit',sans-serif",
        fontWeight: 600, fontSize: '0.74rem',
        color: 'rgba(255,255,255,0.78)',
        textAlign: 'center', paddingInline: 16, lineHeight: 1.35, flexShrink: 0,
      }}>{mode.subtitle}</div>

      <div style={{
        marginTop: 8, fontFamily: "'Outfit',sans-serif",
        fontWeight: 400, fontSize: '0.67rem',
        color: 'rgba(255,255,255,0.42)',
        textAlign: 'center', paddingInline: 18, lineHeight: 1.45, flexShrink: 0,
      }}>{mode.desc}</div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        marginTop: 12, paddingInline: 14, width: '100%', flexShrink: 0,
      }}>
        {mode.tags.map((tag, i) => {
          const TagIcon = TagIcons[i];
          return (
            <div key={tag} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 100, padding: '3px 10px',
            }}>
              <div style={{ color: mode.color, display: 'flex', flexShrink: 0 }}><TagIcon size={10} /></div>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 700,
                fontSize: '0.62rem', letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.62)',
              }}>{tag}</span>
            </div>
          );
        })}
      </div>

      <div style={{ flexGrow: 1 }}/>

      <motion.button
        animate={hovered ? { scale: 1.04 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          padding: '0.7rem 1.4rem',
          background: `linear-gradient(135deg,${mode.color} 0%,${mode.glow} 100%)`,
          border: `2px solid ${mode.color}`,
          borderRadius: 100,
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900, fontSize: '0.82rem', letterSpacing: '0.07em',
          color: mode.id === 'home' ? '#000' : '#fff',
          cursor: 'pointer',
          boxShadow: `0 0 24px ${mode.glow}50`,
          width: 'calc(100% - 28px)', flexShrink: 0,
        }}
        whileTap={{ scale: 0.97 }}
        onClick={e => { e.stopPropagation(); navigate(mode.route); }}
      >{mode.cta}</motion.button>
    </motion.div>
  );
}

/* ── page ─────────────────────────────────────── */
export default function ModeSelect() {
  const [, navigate] = useLocation();

  /*
   * New background: 1538×1023 artwork with a clear central pathway.
   * Logo occupies top ~32% of image height → at 720px = ~230px.
   * Jonny occupies right ~35% → at 1280px starts at ~832px.
   *
   * Cards sit below the logo and to the left of Jonny:
   *   CARD_X = 180px (left edge)
   *   Two 280px cards + 40px gap → right edge = 180+280+40+280 = 780px (52px clear of Jonny)
   *   Title centered over that 600px span at x=480px
   *   CARD_Y = 258px (below logo, small breathing room)
   *   CARD_H = 370px → cards end at 628px, back button at 646px < 720 ✓
   */
  /*
   * Background image: JONNY'S WORLD logo occupies roughly y=0–248px.
   * Title must start BELOW the logo so it doesn't overlap it.
   * Road/pathway center ≈ 42% of 1280px = 538px.
   * Two 260px cards + 40px gap = 560px, centered: left = 538-280 = 258px.
   * TITLE_Y=270 clears logo. CARD_H=338 keeps back-button inside 720px.
   *   Cards end: 318+338=656  Back button: 656+14=670  < 720 ✓
   */
  const CARD_X   = 258;
  const CARD_W   = 260;
  const CARD_H   = 338;
  const CARD_GAP = 40;
  const TITLE_Y  = 270;
  const CARD_Y   = 318;
  const CARDS_TOTAL_W = CARD_W * 2 + CARD_GAP;   /* 560 */

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{
        fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif",
      }}>

      {/* ── fullscreen background — only official uploaded image ── */}
      <img
        src={pub('/mode-select-bg.png')}
        alt=""
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          zIndex: 0,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      {/* ── 20% dark veil ── */}
      <div className="absolute inset-0" style={{
        background: 'rgba(0,0,0,0.20)',
        zIndex: 1,
        pointerEvents: 'none',
      }}/>

      {/*
       * Gradient mask that darkens the center column where the pathway is,
       * providing contrast for card readability without hiding the artwork.
       * Fades naturally into the sides so park elements stay vivid.
       */}
      <div className="absolute inset-0" style={{
        background: [
          /* darkens just the center vertical strip for card readability */
          'radial-gradient(ellipse 52% 72% at 42% 62%, rgba(5,2,16,0.52) 0%, transparent 70%)',
        ].join(','),
        zIndex: 2,
        pointerEvents: 'none',
      }}/>

      {/* ── title — centered over card span ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5, ease: 'easeOut' as const }}
        style={{
          position: 'absolute',
          left: CARD_X,
          top: TITLE_Y,
          width: CARDS_TOTAL_W,
          textAlign: 'center',
          zIndex: 20,
        }}
      >
        <div style={{
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900, fontSize: '1.65rem', letterSpacing: '0.05em',
          color: '#fff', lineHeight: 1.1,
          textShadow: '0 2px 16px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.7)',
        }}>
          SCEGLI LA TUA MODALITÀ
        </div>
        <div style={{
          marginTop: 6, fontSize: '0.72rem', letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.58)', fontWeight: 600,
          textTransform: 'uppercase',
          textShadow: '0 1px 10px rgba(0,0,0,0.95)',
        }}>
          Due esperienze. Un solo show.
        </div>
      </motion.div>

      {/* ── Home card ── */}
      <div style={{
        position: 'absolute',
        left: CARD_X, top: CARD_Y,
        width: CARD_W, height: CARD_H,
        zIndex: 20,
      }}>
        <ModeCard mode={MODES[0]} delay={0.26} />
      </div>

      {/* ── Live card ── */}
      <div style={{
        position: 'absolute',
        left: CARD_X + CARD_W + CARD_GAP, top: CARD_Y,
        width: CARD_W, height: CARD_H,
        zIndex: 20,
      }}>
        <ModeCard mode={MODES[1]} delay={0.38} />
      </div>

      {/* ── Back button ── */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.35 }}
        onClick={() => navigate('/')}
        style={{
          position: 'absolute',
          /* center the button under the two cards */
          left: CARD_X + CARDS_TOTAL_W / 2,
          transform: 'translateX(-50%)',
          top: CARD_Y + CARD_H + 14,
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.45rem 1.2rem',
          background: 'rgba(0,0,0,0.55)',
          border: '1.5px solid rgba(255,255,255,0.2)',
          borderRadius: 100,
          color: 'rgba(255,255,255,0.58)',
          fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: 'all 0.2s',
        }}
        whileHover={{ borderColor: 'rgba(255,255,255,0.45)', color: 'rgba(255,255,255,0.9)' }}
        whileTap={{ scale: 0.97 }}
      >
        <ChevronLeft size={13}/> TORNA AL MENU
      </motion.button>
    </div>
  );
}

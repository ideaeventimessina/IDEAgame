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
    bgSolid: 'rgba(28,14,2,0.90)',
    border: 'rgba(245,182,66,0.55)',
    cta: "ENTRA NELL'ARENA",
    route: '/home-room',
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
    bgSolid: 'rgba(18,5,40,0.90)',
    border: 'rgba(168,85,247,0.55)',
    cta: 'INIZIA LO SHOW',
    route: '/home-v4?mode=live',
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
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.55, ease: 'easeOut' as const }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => navigate(mode.route)}
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderRadius: 24,
        background: mode.bgSolid,
        border: `2px solid ${hovered ? mode.color : mode.border}`,
        boxShadow: hovered
          ? `0 0 55px ${mode.glow}55, 0 0 110px ${mode.glow}22, inset 0 1px 0 rgba(255,255,255,0.1)`
          : `0 0 25px ${mode.glow}20, inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        padding: '0 0 24px 0',
      }}
    >
      {/* accent tint */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 55% at 50% 0%,${mode.color}12 0%,transparent 65%)`,
        pointerEvents: 'none',
      }}/>
      {/* top glow band */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg,transparent,${mode.color},transparent)`,
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.25s',
      }}/>

      {/* icon */}
      <motion.div
        animate={hovered ? { scale: 1.1, y: -3 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          marginTop: 28,
          width: 80, height: 80,
          borderRadius: '50%',
          background: `radial-gradient(circle,${mode.color}2e 0%,${mode.color}0e 70%)`,
          border: `2.5px solid ${mode.color}99`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 32px ${mode.glow}44`,
          flexShrink: 0,
        }}
      >
        <div style={{ color: mode.color, display: 'flex' }}><Icon size={36} strokeWidth={1.5} /></div>
      </motion.div>

      <div style={{
        marginTop: 16, fontFamily: "'Outfit','Arial Black',sans-serif",
        fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.08em',
        color: mode.color, textAlign: 'center', paddingInline: 20, flexShrink: 0,
      }}>{mode.title}</div>

      <div style={{
        marginTop: 6, fontFamily: "'Outfit',sans-serif",
        fontWeight: 600, fontSize: '0.8rem',
        color: 'rgba(255,255,255,0.78)',
        textAlign: 'center', paddingInline: 20, lineHeight: 1.4, flexShrink: 0,
      }}>{mode.subtitle}</div>

      <div style={{
        marginTop: 10, fontFamily: "'Outfit',sans-serif",
        fontWeight: 400, fontSize: '0.72rem',
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center', paddingInline: 24, lineHeight: 1.5, flexShrink: 0,
      }}>{mode.desc}</div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        marginTop: 14, paddingInline: 18, width: '100%', flexShrink: 0,
      }}>
        {mode.tags.map((tag, i) => {
          const TagIcon = TagIcons[i];
          return (
            <div key={tag} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 100, padding: '4px 12px',
            }}>
              <div style={{ color: mode.color, display: 'flex', flexShrink: 0 }}><TagIcon size={11} /></div>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 700,
                fontSize: '0.67rem', letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.65)',
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
          padding: '0.8rem 1.8rem',
          background: `linear-gradient(135deg,${mode.color} 0%,${mode.glow} 100%)`,
          border: `2px solid ${mode.color}`,
          borderRadius: 100,
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.07em',
          color: mode.id === 'home' ? '#000' : '#fff',
          cursor: 'pointer',
          boxShadow: `0 0 28px ${mode.glow}55`,
          width: 'calc(100% - 36px)', flexShrink: 0,
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

  const CARD_X   = 220;
  const TITLE_Y  = 52;
  const CARD_Y   = 148;
  const CARD_W   = 420;
  const CARD_H   = 490;
  const CARD_GAP = 60;

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{
        background: '#0a041a',   /* deep purple base — shows where image is masked */
        fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif",
      }}>

      {/*
       * ── LEFT WING: neon signs + audience, ~0–22% width ──
       * Shows only the left slice of the artwork.
       */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${pub('/mode-select-bg.png')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'left center',
        zIndex: 1,
        maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,0) 22%)',
        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,0) 22%)',
      }}/>

      {/*
       * ── RIGHT WING: Jonny + right attractions, ~70–100% width ──
       * Shows only the right slice of the artwork.
       */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${pub('/mode-select-bg.png')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'right center',
        zIndex: 1,
        maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,0) 32%)',
        WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,0) 32%)',
      }}/>

      {/*
       * ── BOTTOM BAND: stage floor + front-row audience ──
       * Shows the lower 28% of the image so the stage doesn't disappear.
       */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${pub('/mode-select-bg.png')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
        zIndex: 1,
        maskImage: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.85) 14%, rgba(0,0,0,0) 28%)',
        WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.85) 14%, rgba(0,0,0,0) 28%)',
      }}/>

      {/*
       * ── TOP BAND: sky + fireworks, hidden behind center ──
       * Shows only the top 18% where baked logo does NOT overlap left/right edges.
       */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${pub('/mode-select-bg.png')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        zIndex: 1,
        maskImage: [
          'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.7) 8%, rgba(0,0,0,0) 18%)',
          'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 72%, rgba(0,0,0,1) 88%)',
        ].join(','),
        WebkitMaskImage: [
          'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.7) 8%, rgba(0,0,0,0) 18%)',
          'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 72%, rgba(0,0,0,1) 88%)',
        ].join(','),
        WebkitMaskComposite: 'source-in',
        maskComposite: 'intersect',
      }}/>

      {/* ── subtle vignette on the center dark zone ── */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 55% 65% at 48% 50%, rgba(20,8,50,0.0) 0%, rgba(10,4,26,0.55) 70%, rgba(10,4,26,0.0) 100%)',
        zIndex: 2,
        pointerEvents: 'none',
      }}/>

      {/* ── title block ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5, ease: 'easeOut' as const }}
        style={{
          position: 'absolute',
          left: CARD_X, top: TITLE_Y,
          width: CARD_W * 2 + CARD_GAP,
          zIndex: 20,
        }}
      >
        <div style={{
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900, fontSize: '1.95rem', letterSpacing: '0.05em',
          color: '#fff', lineHeight: 1.1,
          textShadow: '0 2px 14px rgba(0,0,0,0.9)',
        }}>
          SCEGLI LA TUA MODALITÀ
        </div>
        <div style={{
          marginTop: 7, fontSize: '0.78rem', letterSpacing: '0.24em',
          color: 'rgba(255,255,255,0.6)', fontWeight: 600,
          textTransform: 'uppercase',
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
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
        <ModeCard mode={MODES[0]} delay={0.28} />
      </div>

      {/* ── Live card ── */}
      <div style={{
        position: 'absolute',
        left: CARD_X + CARD_W + CARD_GAP, top: CARD_Y,
        width: CARD_W, height: CARD_H,
        zIndex: 20,
      }}>
        <ModeCard mode={MODES[1]} delay={0.40} />
      </div>

      {/* ── Back button ── */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.58, duration: 0.35 }}
        onClick={() => navigate('/home-v4')}
        style={{
          position: 'absolute',
          left: CARD_X,
          top: CARD_Y + CARD_H + 14,
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          padding: '0.5rem 1.3rem',
          background: 'rgba(0,0,0,0.5)',
          border: '1.5px solid rgba(255,255,255,0.2)',
          borderRadius: 100,
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em',
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

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
  bg: string;
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
    bg: 'linear-gradient(145deg,rgba(245,182,66,0.18) 0%,rgba(180,90,10,0.08) 100%)',
    border: 'rgba(245,182,66,0.5)',
    cta: "ENTRA NELL'ARENA",
    route: '/home-room',
    Icon: Home,
    tagIcons: [Users, Star, Zap],
  },
  {
    id: 'live',
    title: 'MODALITÀ LIVE',
    subtitle: 'Eventi, matrimoni, aziende e feste',
    desc: 'Palco, proiettore, pubblico. Lo show professionale firmato Jonny\'s World.',
    tags: ['20–200 ospiti', 'Show professionale', 'Con presentatore'],
    color: '#A855F7',
    glow: '#C084FC',
    bg: 'linear-gradient(145deg,rgba(168,85,247,0.18) 0%,rgba(60,10,140,0.08) 100%)',
    border: 'rgba(168,85,247,0.5)',
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
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.6, ease: 'easeOut' as const }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => navigate(mode.route)}
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderRadius: 28,
        padding: '0 0 28px 0',
        background: mode.bg,
        border: `2px solid ${hovered ? mode.color : mode.border}`,
        boxShadow: hovered
          ? `0 0 60px ${mode.glow}55, 0 0 120px ${mode.glow}22, inset 0 1px 0 rgba(255,255,255,0.12)`
          : `0 0 30px ${mode.glow}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        backdropFilter: 'blur(22px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 'clamp(240px,28vw,340px)',
      }}
    >
      {/* top glow band */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg,transparent,${mode.color},transparent)`,
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.25s',
      }}/>

      {/* icon stage */}
      <motion.div
        animate={hovered ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          marginTop: 40,
          width: 96, height: 96,
          borderRadius: '50%',
          background: `radial-gradient(circle,${mode.color}33 0%,${mode.color}11 70%)`,
          border: `2.5px solid ${mode.color}88`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 40px ${mode.glow}44`,
        }}
      >
        <div style={{ color: mode.color, display:'flex' }}><Icon size={44} strokeWidth={1.5} /></div>
      </motion.div>

      {/* title */}
      <div style={{
        marginTop: 24,
        fontFamily: "'Outfit','Arial Black',sans-serif",
        fontWeight: 900,
        fontSize: 'clamp(1rem,1.5vw,1.25rem)',
        letterSpacing: '0.08em',
        color: mode.color,
        textAlign: 'center',
        paddingInline: 24,
      }}>
        {mode.title}
      </div>

      {/* subtitle */}
      <div style={{
        marginTop: 8,
        fontFamily: "'Outfit',sans-serif",
        fontWeight: 600,
        fontSize: 'clamp(0.75rem,1.1vw,0.9rem)',
        color: 'rgba(255,255,255,0.75)',
        textAlign: 'center',
        paddingInline: 24,
        lineHeight: 1.4,
      }}>
        {mode.subtitle}
      </div>

      {/* desc */}
      <div style={{
        marginTop: 14,
        fontFamily: "'Outfit',sans-serif",
        fontWeight: 400,
        fontSize: 'clamp(0.65rem,0.9vw,0.78rem)',
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        paddingInline: 28,
        lineHeight: 1.5,
      }}>
        {mode.desc}
      </div>

      {/* tags */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, paddingInline: 20, width: '100%' }}>
        {mode.tags.map((tag, i) => {
          const TagIcon = TagIcons[i];
          return (
            <div key={tag} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 100,
              padding: '5px 14px',
            }}>
              <div style={{ color: mode.color, display:'flex', flexShrink:0 }}><TagIcon size={12} /></div>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.65)',
              }}>{tag}</span>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <motion.button
        animate={hovered ? { scale: 1.04 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          marginTop: 28,
          padding: '0.85rem 2rem',
          background: `linear-gradient(135deg,${mode.color} 0%,${mode.glow} 100%)`,
          border: `2px solid ${mode.color}`,
          borderRadius: 100,
          fontFamily: "'Outfit','Arial Black',sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(0.8rem,1.2vw,1rem)',
          letterSpacing: '0.07em',
          color: mode.id === 'home' ? '#000' : '#fff',
          cursor: 'pointer',
          boxShadow: `0 0 30px ${mode.glow}55`,
          width: 'calc(100% - 40px)',
        }}
        whileTap={{ scale: 0.97 }}
        onClick={e => { e.stopPropagation(); navigate(mode.route); }}
      >
        {mode.cta}
      </motion.button>
    </motion.div>
  );
}

/* ── page ─────────────────────────────────────── */
export default function ModeSelect() {
  const [, navigate] = useLocation();

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ fontFamily:"'Outfit','Space Grotesk','Arial Black',sans-serif" }}>

      {/* ── fullscreen background image ── */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${pub('/mode-select-bg.png')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        zIndex: 0,
      }}/>

      {/* ── dark overlay for readability (25%) ── */}
      <div className="absolute inset-0" style={{
        background: 'rgba(3,0,16,0.28)',
        zIndex: 1,
      }}/>

      {/* ── bottom vignette so cards float above floor ── */}
      <div className="absolute inset-x-0 bottom-0" style={{
        height: '30%',
        background: 'linear-gradient(to top,rgba(3,0,16,0.55) 0%,transparent 100%)',
        zIndex: 2,
        pointerEvents: 'none',
      }}/>

      {/* ── main content ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">

        {/* logo */}
        <motion.img
          src={pub('/jonny-world-logo.png')}
          alt="Jonny's World"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.65, ease: 'easeOut' as const }}
          style={{
            width: 'clamp(10rem,16vw,15rem)',
            objectFit: 'contain',
            marginBottom: 'clamp(0.6rem,1.2vh,1rem)',
            filter: 'drop-shadow(0 0 30px rgba(245,182,66,0.7)) drop-shadow(0 0 70px rgba(168,85,247,0.35))',
          }}
        />

        {/* heading */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 'clamp(1rem,2vh,1.8rem)' }}
        >
          <div style={{
            fontWeight: 900,
            fontSize: 'clamp(1.4rem,2.4vw,2rem)',
            letterSpacing: '0.04em',
            color: '#fff',
            lineHeight: 1.1,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}>
            SCEGLI LA TUA MODALITÀ
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 'clamp(0.65rem,0.95vw,0.82rem)',
            letterSpacing: '0.28em',
            color: 'rgba(255,255,255,0.55)',
            fontWeight: 600,
            textTransform: 'uppercase',
            textShadow: '0 1px 8px rgba(0,0,0,0.8)',
          }}>
            Due esperienze. Un solo show.
          </div>
        </motion.div>

        {/* cards row */}
        <div style={{
          display: 'flex',
          gap: 'clamp(16px,2.5vw,32px)',
          alignItems: 'stretch',
        }}>
          {MODES.map((mode, i) => (
            <ModeCard key={mode.id} mode={mode} delay={0.35 + i * 0.12} />
          ))}
        </div>

        {/* back button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          onClick={() => navigate('/home-v4')}
          style={{
            marginTop: 'clamp(1rem,2vh,1.8rem)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.6rem',
            background: 'rgba(0,0,0,0.35)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            borderRadius: 100,
            color: 'rgba(255,255,255,0.65)',
            fontSize: 'clamp(0.72rem,1vw,0.85rem)',
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            transition: 'all 0.2s',
          }}
          whileHover={{ borderColor: 'rgba(255,255,255,0.45)', color: 'rgba(255,255,255,0.9)' }}
          whileTap={{ scale: 0.97 }}
        >
          <ChevronLeft size={15}/> TORNA AL MENU
        </motion.button>
      </div>
    </div>
  );
}

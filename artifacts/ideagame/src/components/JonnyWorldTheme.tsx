/**
 * Jonny's World — Shared theme components for all arenas.
 * Visual-only layer. Zero game logic here.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';
import { useLocation } from 'wouter';

// ── Arena theme configuration ────────────────────────────────────────────────
export type ArenaKey = 'quizzone' | 'coppie' | 'ballo' | 'percorso' | 'wordback' | 'adult' | 'karaoke';

export const ARENA: Record<ArenaKey, {
  bg: string; accent: string; glow: string; title: string;
}> = {
  quizzone: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #0d1f3c 0%, #060d1a 45%, #020609 100%)',
    accent: '#60A5FA', glow: '#3B82F6', title: 'QUIZZONE',
  },
  coppie: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #2d0a1a 0%, #150410 45%, #080206 100%)',
    accent: '#FF69B4', glow: '#FF1493', title: 'ARENA DELLE COPPIE',
  },
  ballo: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #140b2a 0%, #09051a 45%, #04020f 100%)',
    accent: '#A78BFA', glow: '#7C3AED', title: 'DANCE ARENA',
  },
  percorso: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #201200 0%, #100900 45%, #060400 100%)',
    accent: '#F5B642', glow: '#D97706', title: 'PERCORSO A RISATE',
  },
  wordback: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #001c10 0%, #000e08 45%, #000503 100%)',
    accent: '#34D399', glow: '#059669', title: 'WORD CHALLENGE',
  },
  adult: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #1e0006 0%, #0d0003 45%, #060001 100%)',
    accent: '#F87171', glow: '#DC2626', title: 'ADULT ARENA',
  },
  karaoke: {
    bg: 'radial-gradient(ellipse 140% 80% at 50% -5%, #200a28 0%, #110516 45%, #090309 100%)',
    accent: '#F472B6', glow: '#DB2777', title: 'KARAOKE STAGE',
  },
};

// ── Star particle background ─────────────────────────────────────────────────
function Star({ i, color }: { i: number; color: string }) {
  const x = (i * 37 + 13) % 100;
  const y = (i * 53 + 9) % 100;
  const size = 1 + (i % 4) * 0.7;
  const dur  = 2.5 + (i % 6) * 0.55;
  const del  = -(i * 0.18);
  return (
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color }}
      animate={{ opacity: [0.15, 0.75, 0.15] }}
      transition={{ duration: dur, delay: del, repeat: Infinity }}
    />
  );
}

// ── Arena background wrapper ─────────────────────────────────────────────────
interface ArenaBgProps { theme: typeof ARENA[ArenaKey]; children: ReactNode; className?: string; style?: React.CSSProperties }
export function ArenaBg({ theme, children, className = '', style }: ArenaBgProps) {
  return (
    <div className={`relative flex h-screen flex-col overflow-hidden ${className}`} style={{ background: theme.bg, ...style }}>
      {/* Star field */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {Array.from({ length: 48 }).map((_, i) => <Star key={i} i={i} color={theme.accent} />)}
      </div>
      {/* Ambient glow spots */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div style={{ position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: '70%', height: '50%', borderRadius: '50%', background: `radial-gradient(ellipse, ${theme.glow}20 0%, transparent 70%)`, filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', left: '5%', width: '35%', height: '35%', borderRadius: '50%', background: `radial-gradient(ellipse, ${theme.glow}12 0%, transparent 70%)`, filter: 'blur(35px)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', right: '5%', width: '35%', height: '35%', borderRadius: '50%', background: `radial-gradient(ellipse, ${theme.glow}12 0%, transparent 70%)`, filter: 'blur(35px)' }} />
      </div>
      {/* Content above everything */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

// ── Neon text ────────────────────────────────────────────────────────────────
type NeonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export function NeonTitle({ text, color, size = 'md', className = '' }: { text: string; color: string; size?: NeonSize; className?: string }) {
  const sizes: Record<NeonSize, string> = {
    xs: 'text-sm sm:text-base',
    sm: 'text-lg sm:text-2xl',
    md: 'text-2xl sm:text-4xl',
    lg: 'text-4xl sm:text-6xl lg:text-7xl',
    xl: 'text-5xl sm:text-7xl lg:text-9xl',
  };
  return (
    <div className={`font-black text-display tracking-wider select-none ${sizes[size]} ${className}`}
      style={{ color, textShadow: `0 0 20px ${color}99, 0 0 40px ${color}55, 0 0 80px ${color}22` }}>
      {text}
    </div>
  );
}

// ── Arena top header bar ─────────────────────────────────────────────────────
export function ArenaHeader({ theme, left, right }: { theme: typeof ARENA[ArenaKey]; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-5 py-2.5 shrink-0"
      style={{ borderBottom: `1px solid ${theme.accent}25`, background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(14px)' }}>
      <div className="flex items-center gap-3 min-w-0">
        {left ?? (
          <span className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: theme.accent, textShadow: `0 0 10px ${theme.accent}88` }}>
            {theme.title}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">{right}</div>
    </header>
  );
}

// ── Jonny waiting / idle screen ──────────────────────────────────────────────
export function JonnyWaitingScreen({ theme, subtitle, label }: { theme: typeof ARENA[ArenaKey]; subtitle?: string; label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <NeonTitle text={theme.title} color={theme.accent} size="lg" />
      {subtitle && <p className="text-lg text-white/55 font-semibold max-w-lg">{subtitle}</p>}
      <motion.img src="/jonny-master.jpg" alt="Jonny"
        style={{ height: 200, width: 'auto', objectFit: 'contain', filter: `drop-shadow(0 8px 36px ${theme.glow}77)` }}
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {label && (
        <motion.div className="rounded-2xl border px-6 py-2.5 text-sm font-bold"
          style={{ borderColor: `${theme.accent}55`, background: `${theme.accent}12`, color: theme.accent }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity }}>
          {label}
        </motion.div>
      )}
    </div>
  );
}

// ── Neon team score bar ──────────────────────────────────────────────────────
export interface ScoreTeam { id: string; name: string; color: string; score: number }
export function ArenaScoreBar({ teams, accent }: { teams: ScoreTeam[]; accent: string }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  return (
    <div className="shrink-0 flex items-center justify-center gap-2.5 flex-wrap px-4 py-3"
      style={{ background: 'rgba(0,0,0,0.55)', borderTop: `1px solid ${accent}20`, backdropFilter: 'blur(12px)' }}>
      {sorted.map((tm, i) => (
        <motion.div key={tm.id} layout
          className="flex items-center gap-2 rounded-xl px-3.5 py-1.5"
          style={{
            background: `${tm.color}15`, border: `1.5px solid ${tm.color}${i === 0 ? '99' : '44'}`,
            boxShadow: i === 0 ? `0 0 14px ${tm.color}44` : 'none',
          }}>
          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: tm.color }} />
          <span className="text-xs sm:text-sm font-bold text-white/75 max-w-[80px] truncate">{tm.name}</span>
          <span className="text-display text-base sm:text-xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Win podium overlay ───────────────────────────────────────────────────────
export function WinPodium({ theme, teams, winnerName, onHome }: {
  theme: typeof ARENA[ArenaKey]; teams: ScoreTeam[]; winnerName?: string | null; onHome: () => void;
}) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const medals = ['1°', '2°', '3°'];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)' }}>
      <motion.div initial={{ scale: 0.75, y: 50, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        className="flex flex-col items-center gap-5 w-full max-w-lg px-6">
        {/* Jonny celebrating */}
        <motion.img src="/jonny-master.jpg" alt="Jonny"
          style={{ height: 130, filter: `drop-shadow(0 8px 32px ${theme.glow}99)` }}
          animate={{ y: [0, -10, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 2.8, repeat: Infinity }} />
        {/* Title */}
        <div className="text-center">
          <NeonTitle text="FINE PARTITA" color={theme.accent} size="lg" />
          {winnerName && (
            <p className="mt-1 text-white/60 font-bold text-lg">
              Vince <span style={{ color: theme.accent }}>{winnerName}</span>
            </p>
          )}
        </div>
        {/* Leaderboard */}
        <div className="w-full space-y-2.5">
          {sorted.slice(0, 3).map((tm, i) => (
            <motion.div key={tm.id} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 + 0.3 }}
              className="flex items-center gap-4 rounded-2xl px-5 py-3"
              style={{ background: `${tm.color}12`, border: `1.5px solid ${tm.color}${i === 0 ? '80' : '35'}`, boxShadow: i === 0 ? `0 0 24px ${tm.color}33` : 'none' }}>
              <span className="w-8 text-center text-base font-black" style={{ color: i === 0 ? '#F5B642' : 'rgba(255,255,255,0.35)' }}>{medals[i] ?? `${i+1}°`}</span>
              <span className="flex-1 text-display text-base sm:text-lg font-black truncate" style={{ color: tm.color }}>{tm.name}</span>
              <span className="text-display text-2xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</span>
              <span className="text-xs text-white/30">pt</span>
            </motion.div>
          ))}
        </div>
        <button onClick={onHome}
          className="mt-1 rounded-2xl border px-8 py-2.5 text-sm font-black text-white/70 transition-colors hover:text-white"
          style={{ borderColor: `${theme.accent}55`, background: `${theme.accent}10` }}>
          Torna al parco
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Socket status badge ──────────────────────────────────────────────────────
export function SocketBadge({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${connected ? 'border-green-500/30 text-green-400' : 'border-amber-500/30 text-amber-400 animate-pulse'}`}
      style={{ background: connected ? '#22c55e10' : '#f59e0b10' }}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-amber-400'}`} />
      {connected ? 'live' : 'offline'}
    </div>
  );
}

// ── Flash message overlay ────────────────────────────────────────────────────
export function FlashOverlay({ flash, color }: { flash: string | null; color: string }) {
  return (
    <AnimatePresence>
      {flash && (
        <motion.div key={flash} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.2 }}
          className="absolute inset-x-0 top-[28%] z-40 flex justify-center pointer-events-none">
          <div className="rounded-3xl px-8 py-4 text-center text-xl sm:text-3xl font-black text-white shadow-2xl"
            style={{ background: `${color}20`, border: `2px solid ${color}77`, boxShadow: `0 0 60px ${color}55`, backdropFilter: 'blur(14px)' }}>
            {flash}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Neon progress timer bar ──────────────────────────────────────────────────
export function NeonTimerBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <motion.div className="h-full rounded-r-full"
        animate={{ width: `${pct}%` }} transition={{ duration: 0.12 }}
        style={{ background: color, boxShadow: `0 0 10px ${color}99` }} />
    </div>
  );
}

// ── Jonny home button ────────────────────────────────────────────────────────
export function HomeButton({ onClick, accent }: { onClick: () => void; accent: string }) {
  const [, navigate] = useLocation();
  const handler = onClick ?? (() => navigate('/'));
  return (
    <button onClick={handler}
      className="flex h-8 w-8 items-center justify-center rounded-xl border transition-all hover:scale-105"
      style={{ borderColor: `${accent}55`, background: `${accent}15` }}
      title="Torna al parco">
      <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
    </button>
  );
}

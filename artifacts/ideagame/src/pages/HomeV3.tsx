import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Play, Trophy, RotateCcw, Zap, Users, Star, ChevronRight, Crown } from 'lucide-react';

/* ─── types ──────────────────────────────────────────────────── */
type Screen = 'show' | 'arena' | 'podium';

interface Game {
  slug: string; label: string; emoji: string; color: string;
  glow: string; img: string; desc: string;
}
interface Player { id: number; name: string; avatar: string; score: number; delta: number; }

/* ─── mock data ──────────────────────────────────────────────── */
const GAMES: Game[] = [
  { slug: 'percorso',  label: 'Percorso a Risate', emoji: '🎲', color: '#7C3AED', glow: '#A855F7', img: '/challenges/sfida.png',    desc: 'Sfide di gruppo a tappe epiche' },
  { slug: 'coppie',    label: 'Coppie',             emoji: '🃏', color: '#DB2777', glow: '#F472B6', img: '/challenges/coppia.png',   desc: 'Memory visivo per coppie' },
  { slug: 'quizzone',  label: 'Quizzone',           emoji: '❓', color: '#D97706', glow: '#FBBF24', img: '/challenges/domanda.png',  desc: 'Quiz a risposta rapida' },
  { slug: 'adult',     label: 'Adult Only',         emoji: '🔥', color: '#DC2626', glow: '#F87171', img: '/challenges/reazione.png', desc: 'Solo per adulti 18+' },
  { slug: 'ballo',     label: 'Sfida di Ballo',     emoji: '💃', color: '#059669', glow: '#34D399', img: '/challenges/ballo.png',    desc: 'Muoviti con il telefono' },
  { slug: 'parola',    label: 'Parola alle Spalle', emoji: '🔤', color: '#0891B2', glow: '#22D3EE', img: '/challenges/mimo.png',     desc: 'Indovina senza guardare' },
  { slug: 'karaoke',   label: 'Karaoke Battle',     emoji: '🎤', color: '#9333EA', glow: '#C084FC', img: '/challenges/fantasia.png', desc: 'Chi canta meglio?' },
  { slug: 'freestyle', label: 'Freestyle',          emoji: '⭐', color: '#B45309', glow: '#FCD34D', img: '/challenges/veloce.png',  desc: 'Creatività senza limiti' },
];

const PLAYERS: Player[] = [
  { id: 1, name: 'Sofia',   avatar: '🦋', score: 4800, delta: 340 },
  { id: 2, name: 'Marco',   avatar: '🐯', score: 4200, delta: 280 },
  { id: 3, name: 'Giulia',  avatar: '🌸', score: 5100, delta: 450 },
  { id: 4, name: 'Lorenzo', avatar: '🦊', score: 3900, delta: 210 },
  { id: 5, name: 'Chiara',  avatar: '⭐', score: 4650, delta: 390 },
  { id: 6, name: 'Davide',  avatar: '🎸', score: 3500, delta: 175 },
];

/* ─── asset helper ───────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function a(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

/* ─── wheel math ─────────────────────────────────────────────── */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function sector(cx: number, cy: number, r: number, ri: number, a1: number, a2: number) {
  const o1 = polar(cx, cy, r, a1), o2 = polar(cx, cy, r, a2);
  const i1 = polar(cx, cy, ri, a1), i2 = polar(cx, cy, ri, a2);
  const lg = a2 - a1 > 180 ? 1 : 0;
  return `M${o1.x},${o1.y} A${r},${r},0,${lg},1,${o2.x},${o2.y} L${i2.x},${i2.y} A${ri},${ri},0,${lg},0,${i1.x},${i1.y} Z`;
}
function mid(cx: number, cy: number, r: number, a1: number, a2: number) {
  return polar(cx, cy, r, (a1 + a2) / 2);
}

/* ─── stage beam background ──────────────────────────────────── */
function StageBeams() {
  const beams = Array.from({ length: 12 }, (_, i) => ({
    angle: -60 + i * 12,
    opacity: 0.04 + (i % 3) * 0.03,
    delay: i * 0.4,
    width: 180 + (i % 4) * 60,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* radial glow from bottom center */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 110%, #3B1F8C 0%, transparent 65%)' }} />
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 100%, #7C3AED44 0%, transparent 70%)' }} />
      {/* beams */}
      {beams.map((b, i) => (
        <motion.div
          key={i}
          className="absolute bottom-0"
          style={{
            left: '50%',
            width: b.width,
            height: '90%',
            transformOrigin: 'bottom center',
            transform: `translateX(-50%) rotate(${b.angle}deg)`,
            background: `linear-gradient(0deg, rgba(168,85,247,${b.opacity * 2}) 0%, transparent 80%)`,
          }}
          animate={{ opacity: [b.opacity, b.opacity * 2.5, b.opacity] }}
          transition={{ duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut' as const, delay: b.delay }}
        />
      ))}
      {/* floor reflection */}
      <div className="absolute bottom-0 left-0 right-0 h-48"
        style={{ background: 'linear-gradient(0deg, rgba(124,58,237,0.18) 0%, transparent 100%)' }} />
      {/* floor line */}
      <div className="absolute bottom-24 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(245,182,66,0.5) 30%, rgba(245,182,66,0.8) 50%, rgba(245,182,66,0.5) 70%, transparent 100%)' }} />
      {/* scanline texture */}
      <div className="absolute inset-0 opacity-[0.015]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 3px)' }} />
      {/* vignette */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 130% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.7) 100%)' }} />
    </div>
  );
}

/* ─── floating particles ─────────────────────────────────────── */
function Particles({ count = 30 }: { count?: number }) {
  const ps = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: 2 + Math.random() * 4,
    dur: 6 + Math.random() * 10,
    delay: Math.random() * 8,
    color: ['#F5B642','#A855F7','#EC4899','#00F5A0','#22D3EE'][i % 5],
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {ps.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: '-5%', width: p.size, height: p.size, background: p.color, boxShadow: `0 0 ${p.size * 3}px ${p.color}` }}
          animate={{ y: [0, -(window.innerHeight || 800) * 1.1], opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'linear' as const }}
        />
      ))}
    </div>
  );
}

/* ─── confetti for podium ────────────────────────────────────── */
function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: ['#F5B642','#A855F7','#EC4899','#34D399','#F87171','#22D3EE','#FCD34D'][i % 7],
    size: 6 + Math.random() * 10,
    dur: 2 + Math.random() * 3,
    delay: Math.random() * 2,
    rotate: Math.random() * 720,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{ left: `${p.x}%`, top: '-5%', width: p.size, height: p.size * 0.5, background: p.color, borderRadius: 2 }}
          animate={{ y: ['0vh', '110vh'], rotate: [0, p.rotate], opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'linear' as const }}
        />
      ))}
    </div>
  );
}

/* ─── game wheel SVG ─────────────────────────────────────────── */
function GameWheel({ selected, onSelect, spinning }: {
  selected: Game; onSelect: (g: Game) => void; spinning: boolean;
}) {
  const cx = 200, cy = 200, r = 175, ri = 52;
  const controls = useAnimation();

  useEffect(() => {
    if (spinning) {
      controls.start({ rotate: [0, 360 * 4 + GAMES.indexOf(selected) * 45], transition: { duration: 2.4, ease: 'easeInOut' as const } });
    }
  }, [spinning, selected, controls]);

  return (
    <motion.div animate={controls} style={{ transformOrigin: 'center' }}>
      <svg viewBox="0 0 400 400" className="w-full h-full">
        <defs>
          {GAMES.map(g => (
            <radialGradient key={g.slug} id={`grad-${g.slug}`} cx="60%" cy="40%">
              <stop offset="0%" stopColor={g.glow} stopOpacity="0.9" />
              <stop offset="100%" stopColor={g.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <filter id="glow-wheel">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* outer ring glow */}
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="rgba(245,182,66,0.25)" strokeWidth="16" />
        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="rgba(245,182,66,0.5)" strokeWidth="2" />

        {GAMES.map((g, i) => {
          const a1 = i * 45, a2 = (i + 1) * 45;
          const isSelected = g.slug === selected.slug;
          const label = mid(cx, cy, (r + ri) / 2, a1, a2);
          return (
            <g key={g.slug} onClick={() => onSelect(g)} style={{ cursor: 'pointer' }}>
              <path
                d={sector(cx, cy, r - (isSelected ? 0 : 6), ri + (isSelected ? 0 : 4), a1, a2)}
                fill={`url(#grad-${g.slug})`}
                stroke={isSelected ? '#F5B642' : 'rgba(0,0,0,0.5)'}
                strokeWidth={isSelected ? 3 : 1.5}
                filter={isSelected ? 'url(#glow-wheel)' : undefined}
                style={{ transition: 'all 0.2s' }}
              />
              <text
                x={label.x} y={label.y - 8}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="22" style={{ userSelect: 'none' }}
              >{g.emoji}</text>
              <text
                x={label.x} y={label.y + 12}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill="rgba(255,255,255,0.85)"
                fontWeight="bold"
                style={{ userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >{g.label.split(' ')[0]}</text>
            </g>
          );
        })}

        {/* center hub */}
        <circle cx={cx} cy={cy} r={ri} fill="#0D0720" stroke="rgba(245,182,66,0.6)" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={ri - 8} fill="#1A0D40" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" style={{ userSelect: 'none' }}>🎯</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="#F5B642" fontWeight="bold" style={{ userSelect: 'none', letterSpacing: '0.15em' }}>SCEGLI</text>
      </svg>
    </motion.div>
  );
}

/* ─── neon button ────────────────────────────────────────────── */
function NeonBtn({ children, onClick, gradient, glow, className = '' }:
  { children: React.ReactNode; onClick: () => void; gradient: string; glow: string; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative overflow-hidden font-black rounded-2xl px-8 py-5 text-xl text-white tracking-wide ${className}`}
      style={{ background: gradient, boxShadow: `0 0 30px ${glow}55, 0 0 60px ${glow}22, inset 0 1px 0 rgba(255,255,255,0.2)` }}
      whileHover={{ scale: 1.05, boxShadow: `0 0 50px ${glow}88, 0 0 100px ${glow}33` }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="absolute inset-0 opacity-30 rounded-2xl"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.4), transparent)' }} />
      <span className="relative z-10 flex items-center gap-3">{children}</span>
    </motion.button>
  );
}

/* ─── screen 1: show / landing ───────────────────────────────── */
function ShowLanding({ onArena }: { onArena: () => void }) {
  return (
    <motion.div
      key="show"
      className="absolute inset-0 flex"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6 }}
    >
      {/* LEFT — titles + CTA */}
      <div className="flex flex-col justify-center pl-[6vw] pr-[3vw] w-[42%] z-10">
        <motion.div
          initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7, ease: 'easeOut' as const }}
        >
          <img src={a('/logo.png')} alt="IDEAgame" className="h-10 mb-6 object-contain" style={{ filter: 'brightness(1.2)' }} />
          <div className="text-[0.7vw] font-black uppercase tracking-[0.35em] mb-3"
            style={{ color: '#F5B642' }}>Il Parco del Divertimento Intelligente</div>
          <h1 className="font-black leading-[0.92] mb-4"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 5.5rem)', color: 'white', textShadow: '0 0 40px rgba(168,85,247,0.8), 0 4px 20px rgba(0,0,0,0.8)' }}>
            JONNY'S<br />
            <span style={{ color: '#F5B642', textShadow: '0 0 60px rgba(245,182,66,0.9)' }}>WORLD</span>
          </h1>
          <p className="mb-10 text-white/60 max-w-md" style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1.1rem)', lineHeight: 1.6 }}>
            8 mondi di gioco. Un palco. Fino a 20 giocatori.<br />
            Costruito per far divertire tutti.
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' as const }}
          className="flex flex-col gap-4"
        >
          <NeonBtn onClick={onArena} gradient="linear-gradient(135deg,#F5B642 0%,#FF6B35 100%)" glow="#F5B642">
            <Play size={24} fill="black" className="text-black" />
            <span className="text-black">Inizia il Show</span>
          </NeonBtn>
          <div className="flex gap-3">
            {[{ icon: '🏠', label: 'Modalità Casa' }, { icon: '📺', label: 'Modalità Live' }].map(m => (
              <button key={m.label} className="flex-1 rounded-xl py-3 font-bold text-white/70 text-sm flex items-center justify-center gap-2 transition-all hover:text-white"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* CENTER/RIGHT — Jonny hero image */}
      <div className="flex-1 relative flex items-end justify-center pb-0 z-10">
        <motion.img
          src={a('/jonny-world-hero.png')}
          alt="Jonny's World"
          className="object-contain"
          style={{ maxHeight: '88vh', maxWidth: '100%', filter: 'drop-shadow(0 0 60px rgba(168,85,247,0.6))' }}
          initial={{ scale: 0.9, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.9, ease: 'easeOut' as const }}
        />
      </div>

      {/* BOTTOM STRIP — 8 game icons */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 py-5 z-20"
        style={{ background: 'linear-gradient(0deg, rgba(10,4,30,0.95) 0%, transparent 100%)' }}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        {GAMES.map((g, i) => (
          <motion.div key={g.slug} className="flex flex-col items-center gap-1.5"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + i * 0.06 }}
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-2xl"
              style={{ background: `${g.color}33`, border: `1.5px solid ${g.color}66`, boxShadow: `0 0 14px ${g.color}44` }}>
              {g.emoji}
            </div>
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wide text-center" style={{ maxWidth: 56 }}>
              {g.label.split(' ')[0]}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

/* ─── screen 2: arena ────────────────────────────────────────── */
function Arena({ onPodium }: { onPodium: () => void }) {
  const [selected, setSelected] = useState(GAMES[0]);
  const [spinning, setSpinning] = useState(false);
  const sorted = [...PLAYERS].sort((a, b) => b.score - a.score);

  const handleSpin = useCallback(() => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 2500);
  }, []);

  return (
    <motion.div
      key="arena"
      className="absolute inset-0 flex"
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-8 z-30"
        style={{ background: 'linear-gradient(180deg, rgba(10,4,30,0.9) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-3">
          <img src={a('/logo.png')} alt="" className="h-7 object-contain" />
          <span className="text-white/50 font-bold text-sm">·</span>
          <span className="font-black text-white tracking-wide" style={{ fontSize: '1rem' }}>ARENA DI GIOCO</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-white/60 text-sm font-bold">
            <Users size={14} className="text-amber-400" />
            <span>{PLAYERS.length} giocatori</span>
          </div>
          <div className="rounded-xl px-4 py-1.5 font-black text-sm"
            style={{ background: 'rgba(245,182,66,0.15)', border: '1px solid rgba(245,182,66,0.4)', color: '#F5B642' }}>
            SORR40
          </div>
        </div>
      </div>

      {/* LEFT — player roster */}
      <div className="w-[22%] flex flex-col justify-center pl-6 pr-3 z-10 pt-16 pb-8">
        <div className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Classifica Live</div>
        <div className="flex flex-col gap-2">
          {sorted.map((p, i) => (
            <motion.div key={p.id}
              className="flex items-center gap-3 rounded-2xl px-3 py-3"
              initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.07, ease: 'easeOut' as const }}
              style={{
                background: i === 0 ? 'linear-gradient(135deg,rgba(245,182,66,0.2),rgba(245,182,66,0.05))' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${i === 0 ? 'rgba(245,182,66,0.4)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: i === 0 ? '0 0 20px rgba(245,182,66,0.15)' : 'none',
              }}>
              <div className="text-base font-black w-5 text-center"
                style={{ color: i === 0 ? '#F5B642' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255,255,255,0.3)' }}>
                {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
              </div>
              <span className="text-xl">{p.avatar}</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-white text-sm truncate">{p.name}</div>
                <div className="text-green-400 text-xs font-bold">+{p.delta}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-white text-sm">{p.score.toLocaleString()}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* CENTER — wheel */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pt-16">
        <div className="relative" style={{ width: 'min(42vw, 60vh)', height: 'min(42vw, 60vh)' }}>
          {/* outer glow ring */}
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: `0 0 80px ${selected.glow}44, 0 0 160px ${selected.glow}22`, pointerEvents: 'none' }} />
          <GameWheel selected={selected} onSelect={setSelected} spinning={spinning} />
        </div>

        <motion.div className="mt-4 flex gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <NeonBtn onClick={handleSpin} gradient="linear-gradient(135deg,#7C3AED,#4F46E5)" glow="#7C3AED"
            className="text-base px-6 py-3">
            <Zap size={18} /> Gira la Ruota
          </NeonBtn>
          <NeonBtn onClick={onPodium} gradient="linear-gradient(135deg,#059669,#0D9488)" glow="#059669"
            className="text-base px-6 py-3">
            <Trophy size={18} /> Classifica
          </NeonBtn>
        </motion.div>
      </div>

      {/* RIGHT — selected game + Jonny */}
      <div className="w-[26%] flex flex-col justify-center pr-6 pl-3 z-10 pt-16 pb-8">
        {/* Jonny */}
        <motion.img
          src={a('/jonny-master-nobg.png')}
          alt="Jonny"
          className="object-contain self-center mb-4"
          style={{ height: 'min(22vh, 200px)', filter: `drop-shadow(0 0 30px ${selected.glow}88)` }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' as const }}
        />

        {/* selected game card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.slug}
            className="rounded-3xl overflow-hidden"
            style={{ border: `2px solid ${selected.color}99`, boxShadow: `0 0 40px ${selected.color}33` }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <div className="relative h-28 overflow-hidden">
              <img src={a(selected.img)} alt={selected.label}
                className="w-full h-full object-cover" style={{ filter: `brightness(0.7) saturate(1.4)` }} />
              <div className="absolute inset-0"
                style={{ background: `linear-gradient(0deg, ${selected.color}cc 0%, transparent 60%)` }} />
              <div className="absolute bottom-3 left-4 text-3xl">{selected.emoji}</div>
            </div>
            <div className="p-4" style={{ background: `${selected.color}22` }}>
              <div className="font-black text-white text-lg leading-tight">{selected.label}</div>
              <div className="text-white/60 text-sm mt-1">{selected.desc}</div>
              <NeonBtn onClick={() => {}} gradient={`linear-gradient(135deg,${selected.color},${selected.glow})`}
                glow={selected.glow} className="w-full justify-center mt-4 text-sm px-4 py-3">
                <Play size={16} fill="white" /> Avvia Questo Gioco
              </NeonBtn>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ─── screen 3: podium ───────────────────────────────────────── */
function Podium({ onRestart }: { onRestart: () => void }) {
  const sorted = [...PLAYERS].sort((a, b) => b.score - a.score);
  const top3 = [sorted[1], sorted[0], sorted[2]];
  const podiumH = ['h-32', 'h-48', 'h-24'];
  const podiumColors = ['#C0C0C0', '#F5B642', '#CD7F32'];
  const podiumGlow   = ['rgba(192,192,192,0.5)', 'rgba(245,182,66,0.8)', 'rgba(205,127,50,0.5)'];
  const positions    = [2, 1, 3];
  const rest = sorted.slice(3);

  return (
    <motion.div
      key="podium"
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Confetti />

      {/* header */}
      <div className="flex items-center justify-between px-10 pt-8 pb-0 z-10 shrink-0">
        <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className="text-[0.65vw] font-black uppercase tracking-[0.3em] text-amber-400 mb-1">Risultati Finali</div>
          <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3rem)', textShadow: '0 0 40px rgba(245,182,66,0.7)' }}>
            🏆 Hall of Fame
          </h2>
        </motion.div>
        <motion.button
          onClick={onRestart}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-white"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
          initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }}
        >
          <RotateCcw size={16} /> Ricomincia
        </motion.button>
      </div>

      {/* main podium area */}
      <div className="flex flex-1 items-end justify-center gap-0 px-16 pb-0 z-10 relative">
        {/* glow under podium */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-32"
          style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 100%, rgba(245,182,66,0.35) 0%, transparent 70%)' }} />

        {top3.map((p, display) => (
          <motion.div
            key={p.id}
            className="flex flex-col items-center"
            style={{ width: '20%', maxWidth: 220 }}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + display * 0.2, duration: 0.7, ease: 'easeOut' as const }}
          >
            {/* crown for winner */}
            {positions[display] === 1 && (
              <motion.div
                animate={{ y: [0, -8, 0], rotate: [-5, 5, -5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' as const }}
                className="text-4xl mb-1"
              >👑</motion.div>
            )}

            {/* avatar */}
            <div className="text-5xl mb-2">{p.avatar}</div>
            <div className="font-black text-white mb-1" style={{ fontSize: 'clamp(0.9rem, 1.5vw, 1.3rem)' }}>{p.name}</div>
            <div className="font-black mb-3" style={{ color: podiumColors[display], fontSize: 'clamp(0.8rem, 1.2vw, 1.1rem)', textShadow: `0 0 20px ${podiumColors[display]}` }}>
              {p.score.toLocaleString()} pt
            </div>

            {/* podium block */}
            <div
              className={`w-full ${podiumH[display]} flex items-end justify-center pb-4 rounded-t-2xl relative overflow-hidden`}
              style={{
                background: `linear-gradient(180deg, ${podiumColors[display]}22 0%, ${podiumColors[display]}44 100%)`,
                border: `2px solid ${podiumColors[display]}66`,
                boxShadow: `0 0 40px ${podiumGlow[display]}, inset 0 1px 0 rgba(255,255,255,0.15)`,
              }}
            >
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
              <span className="font-black text-4xl relative z-10"
                style={{ color: podiumColors[display], textShadow: `0 0 30px ${podiumColors[display]}` }}>
                {positions[display]}°
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* floor */}
      <div className="h-6 mx-8 rounded-none z-10 shrink-0"
        style={{ background: 'linear-gradient(180deg, rgba(245,182,66,0.2), rgba(245,182,66,0.05))', borderTop: '2px solid rgba(245,182,66,0.4)' }} />

      {/* bottom ranking */}
      <div className="flex justify-center gap-4 px-10 py-5 z-10 shrink-0">
        {rest.map((p, i) => (
          <motion.div
            key={p.id}
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.08 }}
          >
            <span className="text-white/30 font-black text-sm">{i + 4}°</span>
            <span className="text-xl">{p.avatar}</span>
            <span className="font-bold text-white text-sm">{p.name}</span>
            <span className="text-amber-400 font-black text-sm ml-1">{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── root ───────────────────────────────────────────────────── */
export default function HomeV3() {
  const [screen, setScreen] = useState<Screen>('show');

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 150% 100% at 50% 120%, #1E0A50 0%, #0D0320 40%, #050110 100%)', fontFamily: "'Outfit','Space Grotesk',sans-serif" }}
    >
      <StageBeams />
      <Particles count={25} />

      <AnimatePresence mode="wait">
        {screen === 'show'   && <ShowLanding onArena={() => setScreen('arena')} />}
        {screen === 'arena'  && <Arena onPodium={() => setScreen('podium')} />}
        {screen === 'podium' && <Podium onRestart={() => setScreen('show')} />}
      </AnimatePresence>
    </div>
  );
}

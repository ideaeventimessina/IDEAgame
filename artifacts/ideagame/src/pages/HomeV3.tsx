import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Play, Trophy, RotateCcw, Zap, Users } from 'lucide-react';

/* ─── types ──────────────────────────────────────────────────── */
type Screen = 'show' | 'arena' | 'podium';

interface Game {
  slug: string; label: string; short: string; abbr: string;
  color: string; glow: string; desc: string;
}
interface Player { id: number; name: string; initials: string; score: number; delta: number; }

/* ─── mock data ──────────────────────────────────────────────── */
const GAMES: Game[] = [
  { slug: 'percorso',  label: 'Percorso a Risate', short: 'PERCORSO',  abbr: 'PR', color: '#7C3AED', glow: '#A855F7', desc: 'Sfide di gruppo a tappe epiche' },
  { slug: 'coppie',    label: 'Coppie',             short: 'COPPIE',    abbr: 'CO', color: '#DB2777', glow: '#F472B6', desc: 'Memory visivo per coppie' },
  { slug: 'quizzone',  label: 'Quizzone',           short: 'QUIZZONE',  abbr: 'QZ', color: '#D97706', glow: '#FBBF24', desc: 'Quiz a risposta rapida' },
  { slug: 'adult',     label: 'Adult Only',         short: 'ADULT',     abbr: '18', color: '#DC2626', glow: '#F87171', desc: 'Solo per adulti, 18+' },
  { slug: 'ballo',     label: 'Sfida di Ballo',     short: 'SFIDA',     abbr: 'SF', color: '#059669', glow: '#34D399', desc: 'Muoviti con il telefono' },
  { slug: 'parola',    label: 'Parola alle Spalle', short: 'PAROLA',    abbr: 'PA', color: '#0891B2', glow: '#22D3EE', desc: 'Indovina senza guardare' },
  { slug: 'karaoke',   label: 'Karaoke Battle',     short: 'KARAOKE',   abbr: 'KR', color: '#9333EA', glow: '#C084FC', desc: 'Chi canta meglio?' },
  { slug: 'freestyle', label: 'Freestyle Battle',   short: 'FREESTYLE', abbr: 'FS', color: '#B45309', glow: '#FCD34D', desc: 'Creatività senza limiti' },
];

const PLAYERS: Player[] = [
  { id: 1, name: 'Sofia',   initials: 'SO', score: 5100, delta: 450 },
  { id: 2, name: 'Chiara',  initials: 'CH', score: 4800, delta: 390 },
  { id: 3, name: 'Marco',   initials: 'MA', score: 4200, delta: 280 },
  { id: 4, name: 'Lorenzo', initials: 'LO', score: 3900, delta: 210 },
  { id: 5, name: 'Giulia',  initials: 'GI', score: 3500, delta: 175 },
  { id: 6, name: 'Davide',  initials: 'DA', score: 3100, delta: 120 },
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
function midPt(cx: number, cy: number, r: number, a1: number, a2: number) {
  return polar(cx, cy, r, (a1 + a2) / 2);
}

/* ─── stage background ───────────────────────────────────────── */
function StageBeams() {
  const beams = Array.from({ length: 16 }, (_, i) => ({
    angle: -75 + i * 10,
    opacity: 0.05 + (i % 4) * 0.025,
    delay: i * 0.35,
    width: 140 + (i % 5) * 70,
    color: i % 3 === 0 ? '168,85,247' : i % 3 === 1 ? '245,182,66' : '236,72,153',
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* deep stage bg */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 140% 90% at 50% 115%, #2D0E6A 0%, #130530 45%, #060115 100%)' }} />

      {/* volumetric beams */}
      {beams.map((b, i) => (
        <motion.div key={i}
          className="absolute bottom-0"
          style={{
            left: '50%', width: b.width, height: '92%',
            transformOrigin: 'bottom center',
            transform: `translateX(-50%) rotate(${b.angle}deg)`,
            background: `linear-gradient(0deg, rgba(${b.color},${b.opacity * 3}) 0%, rgba(${b.color},${b.opacity}) 40%, transparent 85%)`,
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.5 + i * 0.28, repeat: Infinity, ease: 'easeInOut' as const, delay: b.delay }}
        />
      ))}

      {/* stage platform */}
      <div className="absolute" style={{ bottom: '12%', left: 0, right: 0, height: 6,
        background: 'linear-gradient(90deg, transparent 0%, rgba(245,182,66,0.15) 15%, rgba(245,182,66,0.7) 40%, rgba(255,255,255,0.9) 50%, rgba(245,182,66,0.7) 60%, rgba(245,182,66,0.15) 85%, transparent 100%)',
        boxShadow: '0 0 40px rgba(245,182,66,0.5), 0 0 80px rgba(245,182,66,0.2)',
      }} />
      {/* floor under stage */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '13%',
        background: 'linear-gradient(0deg, rgba(10,4,30,0.95) 0%, rgba(30,10,80,0.4) 60%, transparent 100%)',
      }} />
      {/* floor reflection / mirror */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '12%',
        background: 'linear-gradient(0deg, rgba(124,58,237,0.22) 0%, transparent 100%)',
      }} />

      {/* left column light */}
      <div className="absolute top-0 bottom-0 left-[8%]" style={{ width: 3,
        background: 'linear-gradient(180deg, transparent 0%, rgba(168,85,247,0.6) 30%, rgba(245,182,66,0.8) 50%, rgba(168,85,247,0.6) 70%, transparent 100%)',
        boxShadow: '0 0 30px rgba(168,85,247,0.5)', filter: 'blur(1px)',
      }} />
      {/* right column light */}
      <div className="absolute top-0 bottom-0 right-[8%]" style={{ width: 3,
        background: 'linear-gradient(180deg, transparent 0%, rgba(236,72,153,0.6) 30%, rgba(245,182,66,0.8) 50%, rgba(236,72,153,0.6) 70%, transparent 100%)',
        boxShadow: '0 0 30px rgba(236,72,153,0.5)', filter: 'blur(1px)',
      }} />

      {/* ceiling glow */}
      <div className="absolute top-0 left-0 right-0 h-20"
        style={{ background: 'linear-gradient(180deg, rgba(90,30,180,0.3) 0%, transparent 100%)' }} />

      {/* scanline */}
      <div className="absolute inset-0 opacity-[0.012]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,1) 3px, rgba(255,255,255,1) 4px)' }} />
      {/* vignette */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 120% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.75) 100%)' }} />
    </div>
  );
}

/* ─── particles ──────────────────────────────────────────────── */
function Particles({ count = 28 }: { count?: number }) {
  const ps = Array.from({ length: count }, (_, i) => ({
    id: i, x: Math.random() * 100, size: 2 + Math.random() * 5,
    dur: 7 + Math.random() * 10, delay: Math.random() * 9,
    color: ['#F5B642','#A855F7','#EC4899','#00F5A0','#22D3EE'][i % 5],
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {ps.map(p => (
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: '-5%', width: p.size, height: p.size,
            background: p.color, boxShadow: `0 0 ${p.size * 3}px ${p.color}` }}
          animate={{ y: [0, -900], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'linear' as const }}
        />
      ))}
    </div>
  );
}

/* ─── confetti ───────────────────────────────────────────────── */
function Confetti() {
  const pieces = Array.from({ length: 70 }, (_, i) => ({
    id: i, x: Math.random() * 100,
    color: ['#F5B642','#A855F7','#EC4899','#34D399','#F87171','#22D3EE','#FCD34D'][i % 7],
    size: 7 + Math.random() * 10, dur: 2.2 + Math.random() * 3,
    delay: Math.random() * 2.5, rotate: Math.random() * 720,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <motion.div key={p.id} className="absolute"
          style={{ left: `${p.x}%`, top: '-5%', width: p.size, height: p.size * 0.5,
            background: p.color, borderRadius: 2 }}
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
  const cx = 220, cy = 220, r = 200, ri = 58;
  const controls = useAnimation();

  useEffect(() => {
    if (spinning) {
      controls.start({
        rotate: [0, 360 * 5 + GAMES.indexOf(selected) * 45],
        transition: { duration: 2.6, ease: 'easeInOut' as const },
      });
    }
  }, [spinning, selected, controls]);

  return (
    <motion.div animate={controls} style={{ transformOrigin: 'center', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 440 440" width="100%" height="100%">
        <defs>
          {GAMES.map(g => (
            <radialGradient key={g.slug} id={`gv3-${g.slug}`} cx="55%" cy="35%" r="70%">
              <stop offset="0%" stopColor={g.glow} stopOpacity="1" />
              <stop offset="100%" stopColor={g.color} stopOpacity="1" />
            </radialGradient>
          ))}
          {/* glow filter for selected sector */}
          <filter id="sel-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* strong text shadow */}
          <filter id="txt-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="rgba(0,0,0,0.95)" floodOpacity="1" />
          </filter>
          {/* outer ring glow */}
          <filter id="ring-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* outer glow rings */}
        <circle cx={cx} cy={cy} r={r + 18} fill="none" stroke="rgba(245,182,66,0.12)" strokeWidth="22" filter="url(#ring-glow)" />
        <circle cx={cx} cy={cy} r={r + 7}  fill="none" stroke="rgba(245,182,66,0.35)" strokeWidth="4" />
        <circle cx={cx} cy={cy} r={r + 2}  fill="none" stroke="rgba(255,255,255,0.6)"  strokeWidth="1.5" />

        {GAMES.map((g, i) => {
          const a1 = i * 45, a2 = (i + 1) * 45;
          const isSelected = g.slug === selected.slug;
          // label: two lines — abbr badge at mid-outer, short name at mid-inner area
          const outerLabel = midPt(cx, cy, r * 0.74, a1, a2);
          const innerLabel = midPt(cx, cy, r * 0.52, a1, a2);

          return (
            <g key={g.slug} onClick={() => onSelect(g)} style={{ cursor: 'pointer' }}>
              {/* sector */}
              <path
                d={sector(cx, cy, r - (isSelected ? 0 : 7), ri + (isSelected ? 0 : 5), a1, a2)}
                fill={`url(#gv3-${g.slug})`}
                stroke={isSelected ? '#F5B642' : 'rgba(0,0,0,0.6)'}
                strokeWidth={isSelected ? 3.5 : 1.5}
                filter={isSelected ? 'url(#sel-glow)' : undefined}
                style={{ transition: 'stroke 0.2s' }}
              />
              {/* separator lines between sectors */}
              {!isSelected && (
                <line
                  x1={polar(cx, cy, ri + 5, a1).x} y1={polar(cx, cy, ri + 5, a1).y}
                  x2={polar(cx, cy, r - 7, a1).x}   y2={polar(cx, cy, r - 7, a1).y}
                  stroke="rgba(0,0,0,0.4)" strokeWidth="1"
                />
              )}
              {/* abbreviation badge (outer area) */}
              <text
                x={outerLabel.x} y={outerLabel.y - 7}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="28" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
                fill="rgba(255,255,255,0.25)"
                style={{ userSelect: 'none', letterSpacing: '-1px' }}
              >{g.abbr}</text>
              {/* single-word label */}
              <text
                x={outerLabel.x} y={outerLabel.y + 16}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
                fill="white"
                stroke="rgba(0,0,0,0.9)" strokeWidth="3" paintOrder="stroke"
                filter="url(#txt-shadow)"
                style={{ userSelect: 'none', letterSpacing: '0.04em' }}
              >{g.short}</text>
            </g>
          );
        })}

        {/* center hub */}
        <circle cx={cx} cy={cy} r={ri + 4} fill="rgba(0,0,0,0.5)" />
        <circle cx={cx} cy={cy} r={ri}     fill="#0A0418" stroke="rgba(245,182,66,0.7)" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={ri - 6} fill="#150830" />
        {/* hub text */}
        <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
          fontSize="13" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
          fill="#F5B642" style={{ userSelect: 'none', letterSpacing: '0.12em' }}>JW</text>
        <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5" fontFamily="'Outfit',sans-serif"
          fill="rgba(245,182,66,0.5)" style={{ userSelect: 'none', letterSpacing: '0.2em' }}>SCEGLI</text>

        {/* pointer/arrow at top */}
        <polygon
          points={`${cx - 10},${cy - r - 16} ${cx + 10},${cy - r - 16} ${cx},${cy - r - 2}`}
          fill="#F5B642" filter="url(#ring-glow)"
        />
      </svg>
    </motion.div>
  );
}

/* ─── game card (no image, abstract premium frame) ───────────── */
function GameCard({ game }: { game: Game }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={game.slug}
        className="rounded-3xl overflow-hidden"
        style={{ border: `2px solid ${game.color}bb`, boxShadow: `0 0 50px ${game.color}44, 0 0 100px ${game.color}18` }}
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -14, scale: 0.97 }}
        transition={{ duration: 0.28 }}
      >
        {/* abstract header panel — no image */}
        <div className="relative overflow-hidden" style={{ height: 110 }}>
          {/* layered gradient background */}
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${game.color} 0%, ${game.glow}88 50%, #0D0320 100%)` }} />
          <div className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 80% 120% at 80% 50%, rgba(255,255,255,0.12), transparent 70%)' }} />
          {/* geometric lines */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 110" preserveAspectRatio="none">
            <line x1="0" y1="110" x2="110" y2="0" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            <line x1="40" y1="110" x2="150" y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
            <line x1="80" y1="110" x2="190" y2="0" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
            <circle cx="240" cy="55" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <circle cx="240" cy="55" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          </svg>
          {/* floor reflection line */}
          <div className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${game.glow}, transparent)` }} />
          {/* abbr large watermark */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black select-none"
            style={{ fontSize: 64, color: 'rgba(255,255,255,0.1)', lineHeight: 1, fontFamily: "'Outfit','Arial Black',sans-serif", letterSpacing: '-3px' }}>
            {game.abbr}
          </div>
          {/* short name badge */}
          <div className="absolute bottom-3 left-4">
            <div className="rounded-xl px-3 py-1 font-black text-white text-sm tracking-wider"
              style={{ background: `${game.color}99`, border: `1px solid ${game.glow}88`, backdropFilter: 'blur(4px)' }}>
              {game.short}
            </div>
          </div>
        </div>

        {/* info section */}
        <div className="p-4" style={{ background: `linear-gradient(180deg, ${game.color}1A 0%, rgba(10,4,30,0.95) 100%)` }}>
          <div className="font-black text-white text-lg leading-tight mb-1">{game.label}</div>
          <div className="text-white/55 text-sm mb-4">{game.desc}</div>
          <NeonBtn
            onClick={() => {}}
            gradient={`linear-gradient(135deg,${game.color},${game.glow})`}
            glow={game.glow}
            className="w-full justify-center text-sm px-4 py-3"
          >
            <Play size={15} fill="white" />
            Avvia Questo Gioco
          </NeonBtn>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── neon button ────────────────────────────────────────────── */
function NeonBtn({ children, onClick, gradient, glow, className = '' }:
  { children: React.ReactNode; onClick: () => void; gradient: string; glow: string; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative overflow-hidden font-black rounded-2xl px-8 py-5 text-xl text-white tracking-wide ${className}`}
      style={{ background: gradient, boxShadow: `0 0 28px ${glow}55, 0 0 56px ${glow}22, inset 0 1px 0 rgba(255,255,255,0.22)` }}
      whileHover={{ scale: 1.055, boxShadow: `0 0 50px ${glow}99, 0 0 100px ${glow}33` }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="absolute inset-0 opacity-25 rounded-2xl"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.5), transparent)' }} />
      <span className="relative z-10 flex items-center justify-center gap-3">{children}</span>
    </motion.button>
  );
}

/* ─── screen 1: landing show ─────────────────────────────────── */
function ShowLanding({ onArena }: { onArena: () => void }) {
  return (
    <motion.div
      key="show" className="absolute inset-0 flex"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.55 }}
    >
      {/* LEFT — title + CTA (38%) */}
      <div className="relative z-10 flex flex-col justify-center pl-[6vw] pr-[2vw] w-[38%]">
        <motion.div
          initial={{ x: -70, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.7, ease: 'easeOut' as const }}
        >
          <img src={a('/logo.png')} alt="IDEAgame" className="h-9 mb-7 object-contain object-left"
            style={{ filter: 'brightness(1.3) drop-shadow(0 0 12px rgba(245,182,66,0.5))' }} />
          <div className="font-black uppercase mb-3"
            style={{ fontSize: 'clamp(0.55rem, 0.85vw, 0.75rem)', letterSpacing: '0.35em', color: '#F5B642' }}>
            Il Parco del Divertimento Intelligente
          </div>
          <h1 className="font-black leading-[0.88] mb-6"
            style={{
              fontSize: 'clamp(3rem, 7vw, 6.5rem)',
              color: 'white',
              textShadow: '0 0 50px rgba(168,85,247,0.9), 0 6px 30px rgba(0,0,0,0.9)',
              fontFamily: "'Outfit','Arial Black',sans-serif",
            }}>
            JONNY'S<br />
            <span style={{ color: '#F5B642', textShadow: '0 0 70px rgba(245,182,66,1), 0 0 140px rgba(245,182,66,0.5)' }}>WORLD</span>
          </h1>
          <p className="mb-10 max-w-sm"
            style={{ fontSize: 'clamp(0.85rem, 1.3vw, 1.05rem)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>
            8 mondi di gioco. Un palco. Fino a 20 giocatori.<br />
            Costruito per far divertire tutti.
          </p>
        </motion.div>

        <motion.div className="flex flex-col gap-4"
          initial={{ y: 35, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' as const }}>
          <NeonBtn onClick={onArena} gradient="linear-gradient(135deg,#F5B642 0%,#FF6B35 100%)" glow="#F5B642">
            <Play size={26} fill="black" className="text-black shrink-0" />
            <span className="text-black font-black">Inizia il Show</span>
          </NeonBtn>
          <div className="flex gap-3">
            {['Casa', 'Live'].map((m, idx) => (
              <button key={m} className="flex-1 rounded-2xl py-4 font-black tracking-wider transition-all hover:text-white"
                style={{
                  background: idx === 0 ? 'rgba(124,58,237,0.18)' : 'rgba(219,39,119,0.18)',
                  border: `1.5px solid ${idx === 0 ? 'rgba(124,58,237,0.5)' : 'rgba(219,39,119,0.5)'}`,
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 'clamp(0.8rem, 1.1vw, 0.95rem)',
                }}>
                Modalità {m}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* RIGHT — Jonny hero image, fullscreen anchor */}
      <div className="flex-1 relative">
        <motion.img
          src={a('/jonny-world-hero.png')}
          alt="Jonny's World"
          className="absolute bottom-0 right-0 object-contain object-bottom"
          style={{
            height: '94vh', maxWidth: '62vw',
            filter: 'drop-shadow(0 0 80px rgba(168,85,247,0.7)) drop-shadow(-20px 0 40px rgba(168,85,247,0.3))',
          }}
          initial={{ scale: 0.92, opacity: 0, x: 40 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 1.0, ease: 'easeOut' as const }}
        />
      </div>

      {/* BOTTOM STRIP */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-5 z-20"
        style={{ padding: '14px 24px', background: 'linear-gradient(0deg, rgba(6,1,20,0.97) 0%, rgba(6,1,20,0.6) 70%, transparent 100%)' }}>
        {GAMES.map((g, i) => (
          <motion.div key={g.slug} className="flex flex-col items-center gap-1.5"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 + i * 0.055 }}>
            <div className="flex items-center justify-center rounded-xl font-black"
              style={{
                width: 52, height: 52,
                background: `linear-gradient(135deg, ${g.color}55, ${g.color}22)`,
                border: `1.5px solid ${g.color}88`,
                boxShadow: `0 0 16px ${g.color}44`,
                color: 'white', fontSize: 15, letterSpacing: '0.02em',
                fontFamily: "'Outfit','Arial Black',sans-serif",
              }}>
              {g.abbr}
            </div>
            <span className="font-black text-white/50 text-center"
              style={{ fontSize: 9, letterSpacing: '0.1em', maxWidth: 54 }}>
              {g.short}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── screen 2: arena ────────────────────────────────────────── */
function Arena({ onPodium }: { onPodium: () => void }) {
  const [selected, setSelected] = useState(GAMES[0]);
  const [spinning, setSpinning] = useState(false);
  const sorted = [...PLAYERS].sort((a, b) => b.score - a.score);

  const handleSpin = useCallback(() => {
    if (spinning) return;
    const rnd = GAMES[Math.floor(Math.random() * GAMES.length)];
    setSelected(rnd);
    setSpinning(true);
    setTimeout(() => setSpinning(false), 2800);
  }, [spinning]);

  return (
    <motion.div key="arena" className="absolute inset-0 flex"
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}>

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-8"
        style={{ height: 62, background: 'linear-gradient(180deg, rgba(8,3,22,0.92) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-3">
          <img src={a('/logo.png')} alt="" className="h-7 object-contain"
            style={{ filter: 'brightness(1.2) drop-shadow(0 0 8px rgba(245,182,66,0.4))' }} />
          <div className="w-px h-5 bg-white/20 mx-1" />
          <span className="font-black text-white tracking-[0.2em]"
            style={{ fontSize: 'clamp(0.8rem, 1.1vw, 1rem)' }}>ARENA DI GIOCO</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 font-bold" style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>
            <Users size={14} style={{ color: '#F5B642' }} />
            {PLAYERS.length} giocatori
          </div>
          <div className="rounded-xl px-4 py-1.5 font-black text-sm tracking-widest"
            style={{ background: 'rgba(245,182,66,0.15)', border: '1px solid rgba(245,182,66,0.45)', color: '#F5B642' }}>
            SORR40
          </div>
        </div>
      </div>

      {/* LEFT — ranking (20%) */}
      <div className="w-[20%] z-10 pt-[62px] pb-6 pl-5 pr-3 flex flex-col justify-center">
        <div className="font-black uppercase mb-4"
          style={{ fontSize: '0.65rem', letterSpacing: '0.25em', color: 'rgba(255,255,255,0.35)' }}>
          Classifica Live
        </div>
        <div className="flex flex-col gap-2">
          {sorted.map((p, i) => {
            const rankColor = i === 0 ? '#F5B642' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255,255,255,0.25)';
            return (
              <motion.div key={p.id}
                className="flex items-center gap-3 rounded-2xl px-3 py-3"
                initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.07, ease: 'easeOut' as const }}
                style={{
                  background: i === 0 ? 'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(245,182,66,0.06))' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${i === 0 ? 'rgba(245,182,66,0.45)' : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: i === 0 ? '0 0 24px rgba(245,182,66,0.18)' : 'none',
                }}>
                {/* rank badge */}
                <div className="w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0"
                  style={{ background: `${rankColor}22`, color: rankColor, border: `1px solid ${rankColor}55` }}>
                  {i + 1}
                </div>
                {/* avatar circle */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                  {p.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-white truncate" style={{ fontSize: '0.85rem' }}>{p.name}</div>
                  <div className="font-bold" style={{ fontSize: '0.7rem', color: '#34D399' }}>+{p.delta}</div>
                </div>
                <div className="font-black text-white shrink-0" style={{ fontSize: '0.8rem' }}>
                  {(p.score / 1000).toFixed(1)}k
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* CENTER — wheel (46%) */}
      <div className="flex-1 z-10 pt-[62px] flex flex-col items-center justify-center">
        {/* wheel glow bg */}
        <div className="relative flex items-center justify-center"
          style={{ width: 'min(48vw, 68vh)', height: 'min(48vw, 68vh)' }}>
          <div className="absolute inset-[-8%] rounded-full pointer-events-none"
            style={{ boxShadow: `0 0 100px ${selected.glow}55, 0 0 200px ${selected.glow}22`, background: `radial-gradient(circle, ${selected.color}0A 0%, transparent 70%)` }} />
          <GameWheel selected={selected} onSelect={setSelected} spinning={spinning} />
        </div>

        <motion.div className="flex gap-4 mt-3"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <NeonBtn onClick={handleSpin}
            gradient="linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)" glow="#7C3AED"
            className="text-base px-7 py-3.5">
            <Zap size={18} /> Gira la Ruota
          </NeonBtn>
          <NeonBtn onClick={onPodium}
            gradient="linear-gradient(135deg,#059669 0%,#0D9488 100%)" glow="#059669"
            className="text-base px-7 py-3.5">
            <Trophy size={18} /> Classifica
          </NeonBtn>
        </motion.div>
      </div>

      {/* RIGHT — Jonny + game card (34%) */}
      <div className="w-[34%] z-10 pt-[62px] pb-6 pr-6 pl-2 flex flex-col justify-end relative">
        {/* Jonny — tall, overlapping, dominant */}
        <motion.img
          src={a('/jonny-master-nobg.png')}
          alt="Jonny"
          className="absolute pointer-events-none"
          style={{
            right: '4%', bottom: '32%',
            height: 'min(62vh, 580px)',
            filter: `drop-shadow(0 0 40px ${selected.glow}bb) drop-shadow(-10px 10px 30px rgba(0,0,0,0.8))`,
            zIndex: 20,
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' as const }}
        />

        {/* game card — positioned at bottom, below Jonny feet */}
        <div className="relative z-10" style={{ marginTop: 'auto' }}>
          <GameCard game={selected} />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── screen 3: podium ───────────────────────────────────────── */
function Podium({ onRestart }: { onRestart: () => void }) {
  const sorted = [...PLAYERS].sort((a, b) => b.score - a.score);
  const display = [sorted[1], sorted[0], sorted[2]]; // 2nd, 1st, 3rd
  const podiumH  = [160, 220, 120];
  const rankPos  = [2, 1, 3];
  const metals   = ['#C0C0C0', '#F5B642', '#CD7F32'];
  const glows    = ['rgba(192,192,192,0.6)', 'rgba(245,182,66,0.9)', 'rgba(205,127,50,0.6)'];
  const rest = sorted.slice(3);

  return (
    <motion.div key="podium" className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}>
      <Confetti />

      {/* header */}
      <div className="flex items-center justify-between px-10 pt-8 shrink-0 z-10">
        <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className="font-black uppercase mb-1.5"
            style={{ fontSize: '0.7rem', letterSpacing: '0.3em', color: '#F5B642' }}>Risultati Finali</div>
          <h2 className="font-black text-white"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', textShadow: '0 0 50px rgba(245,182,66,0.8)', fontFamily: "'Outfit','Arial Black',sans-serif" }}>
            HALL OF FAME
          </h2>
        </motion.div>
        <motion.button onClick={onRestart}
          className="flex items-center gap-2.5 rounded-2xl px-6 py-3 font-black text-white"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.95rem' }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
          initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
          <RotateCcw size={15} /> Ricomincia
        </motion.button>
      </div>

      {/* podium platform area */}
      <div className="flex-1 flex items-end justify-center gap-4 px-[15%] pb-0 z-10 relative">
        {/* glow floor */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-40 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 100%, rgba(245,182,66,0.45) 0%, transparent 70%)' }} />

        {display.map((p, di) => (
          <motion.div key={p.id} className="flex flex-col items-center"
            style={{ flex: di === 1 ? '1.3' : '1', maxWidth: di === 1 ? 260 : 200 }}
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + di * 0.18, duration: 0.75, ease: 'easeOut' as const }}>

            {/* crown for 1st */}
            {rankPos[di] === 1 && (
              <motion.div className="text-5xl mb-1"
                animate={{ y: [0, -10, 0], rotate: [-6, 6, -6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' as const }}>
                &#128081;
              </motion.div>
            )}

            {/* avatar circle */}
            <div className="rounded-full flex items-center justify-center font-black mb-2"
              style={{
                width: di === 1 ? 72 : 56, height: di === 1 ? 72 : 56,
                background: `linear-gradient(135deg, ${metals[di]}44, ${metals[di]}22)`,
                border: `3px solid ${metals[di]}`,
                boxShadow: `0 0 30px ${glows[di]}, inset 0 0 20px rgba(255,255,255,0.05)`,
                fontSize: di === 1 ? 22 : 18, color: metals[di],
              }}>
              {p.initials}
            </div>

            <div className="font-black text-white mb-1 text-center"
              style={{ fontSize: di === 1 ? '1.3rem' : '1rem', fontFamily: "'Outfit','Arial Black',sans-serif" }}>
              {p.name}
            </div>
            <div className="font-black mb-3" style={{ color: metals[di], fontSize: di === 1 ? '1.1rem' : '0.9rem', textShadow: `0 0 20px ${metals[di]}` }}>
              {p.score.toLocaleString()} pt
            </div>

            {/* podium block */}
            <div className="w-full flex items-end justify-center rounded-t-3xl relative overflow-hidden"
              style={{
                height: podiumH[di],
                background: `linear-gradient(180deg, ${metals[di]}2A 0%, ${metals[di]}55 100%)`,
                border: `2px solid ${metals[di]}88`,
                borderBottom: 'none',
                boxShadow: `0 0 50px ${glows[di]}, 0 0 100px ${metals[di]}22, inset 0 1px 0 rgba(255,255,255,0.2)`,
              }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
              {/* rank number */}
              <div className="font-black pb-5 relative z-10"
                style={{ fontSize: di === 1 ? '3.5rem' : '2.5rem', color: metals[di], textShadow: `0 0 30px ${metals[di]}` }}>
                {rankPos[di]}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* stage floor line */}
      <div className="h-2 mx-8 shrink-0 z-10"
        style={{ background: `linear-gradient(90deg, transparent 0%, rgba(245,182,66,0.6) 20%, rgba(255,255,255,0.9) 50%, rgba(245,182,66,0.6) 80%, transparent 100%)`, boxShadow: '0 0 30px rgba(245,182,66,0.4)' }} />

      {/* rest of ranking */}
      <div className="flex justify-center gap-4 px-10 py-5 shrink-0 z-10">
        {rest.map((p, i) => (
          <motion.div key={p.id} className="flex items-center gap-3 rounded-2xl px-5 py-3"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.85 + i * 0.08 }}>
            <span className="font-black" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1rem' }}>{i + 4}</span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>{p.initials}</div>
            <span className="font-black text-white" style={{ fontSize: '0.95rem' }}>{p.name}</span>
            <span className="font-black" style={{ color: '#F5B642', fontSize: '0.9rem' }}>{p.score.toLocaleString()}</span>
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
      style={{ background: '#050112', fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif" }}
    >
      <StageBeams />
      <Particles count={28} />
      <AnimatePresence mode="wait">
        {screen === 'show'   && <ShowLanding onArena={() => setScreen('arena')} />}
        {screen === 'arena'  && <Arena onPodium={() => setScreen('podium')} />}
        {screen === 'podium' && <Podium onRestart={() => setScreen('show')} />}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import type { JonnyMood } from '@/contexts/JonnyContext';

const GAMES = [
  { name: 'Percorso\na Risate', emoji: '😂', color: '#FF6B6B', glow: '#FF6B6B' },
  { name: 'Gioco delle\nCoppie', emoji: '💑', color: '#FF69B4', glow: '#FF69B4' },
  { name: 'Quizzone', emoji: '❓', color: '#4ECDC4', glow: '#4ECDC4' },
  { name: 'Sfida di\nBallo', emoji: '💃', color: '#A78BFA', glow: '#A78BFA' },
  { name: 'Freestyle\nBattle', emoji: '🎤', color: '#F59E0B', glow: '#F59E0B' },
  { name: 'Adult\nOnly', emoji: '🔞', color: '#F87171', glow: '#F87171' },
  { name: 'Percorso\na Parole', emoji: '🗣️', color: '#34D399', glow: '#34D399' },
  { name: 'Karaoke\nBattle', emoji: '🎵', color: '#60A5FA', glow: '#60A5FA' },
];

const JONNY_SLIDES: { mood: JonnyMood; label: string }[] = [
  { mood: 'idle',       label: 'Benvenuto nel\nmondo di Jonny!' },
  { mood: 'excited',    label: 'Preparati a\ndivertirti!' },
  { mood: 'round_done', label: 'Sfida i tuoi\namici!' },
  { mood: 'attention',  label: 'Tante sorprese\nti aspettano!' },
  { mood: 'winner',     label: 'Solo uno può\ntrionfare!' },
  { mood: 'challenge',  label: 'Ogni gioco\nè un\'avventura!' },
];

const CONFETTI_COLORS = ['#F5B642','#FF6B6B','#4ECDC4','#A78BFA','#FF69B4','#34D399','#60A5FA'];

function Particle({ i }: { i: number }) {
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  const left = `${(i * 7.3 + 3) % 100}%`;
  const dur = 3 + (i % 5) * 0.8;
  const delay = -(i * 0.4);
  const size = 6 + (i % 4) * 3;
  const isCircle = i % 3 === 0;
  return (
    <motion.div
      className="absolute top-0 pointer-events-none"
      style={{ left, width: size, height: isCircle ? size : size * 0.5, borderRadius: isCircle ? '50%' : 2, backgroundColor: color, opacity: 0.85 }}
      animate={{ y: ['0vh', '105vh'], rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)], opacity: [0, 1, 1, 0] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function NeonCard({ name, emoji, color, glow, idx }: { name: string; emoji: string; color: string; glow: string; idx: number }) {
  return (
    <motion.div
      className="shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-4 cursor-pointer select-none"
      style={{ borderColor: color, background: `${color}18`, boxShadow: `0 0 18px ${glow}55, inset 0 0 12px ${glow}15`, minWidth: 100 }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + idx * 0.07, type: 'spring', stiffness: 200 }}
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.06, boxShadow: `0 0 32px ${glow}99, inset 0 0 16px ${glow}25` }}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-center text-xs font-black leading-tight" style={{ color, whiteSpace: 'pre-line' }}>{name}</span>
    </motion.div>
  );
}

interface Props {
  onJoin: () => void;
}

export function PlayerLanding({ onJoin }: Props) {
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlideIdx(i => (i + 1) % JONNY_SLIDES.length), 3000);
    return () => clearInterval(t);
  }, []);

  const slide = JONNY_SLIDES[slideIdx];

  return (
    <div className="relative flex flex-col items-center overflow-hidden min-h-screen w-full"
      style={{
        background: 'radial-gradient(ellipse 140% 80% at 50% 0%, #3b1d8a 0%, #1a0b4b 40%, #0d0520 100%)',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
      }}>

      {/* Confetti rain */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        {Array.from({ length: 28 }).map((_, i) => <Particle key={i} i={i} />)}
      </div>

      {/* Hero image overlay */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.07]"
        style={{ backgroundImage: 'url(/jonny-world-hero.png)', backgroundSize: 'cover', backgroundPosition: 'center top' }} />

      {/* Radial glow spots */}
      <div className="pointer-events-none absolute left-1/4 top-1/3 w-64 h-64 rounded-full z-0"
        style={{ background: 'radial-gradient(circle, #7c3aed44 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="pointer-events-none absolute right-1/4 top-2/3 w-48 h-48 rounded-full z-0"
        style={{ background: 'radial-gradient(circle, #f59e0b33 0%, transparent 70%)', filter: 'blur(30px)' }} />

      {/* ─── HEADER logo ─── */}
      <div className="relative z-10 w-full flex items-center justify-center pt-5 pb-1">
        <motion.img
          src="/logo.png" alt="IDEAgame"
          className="h-8 w-auto drop-shadow-[0_0_16px_rgba(245,182,66,0.8)]"
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        />
      </div>

      {/* ─── TITLE ─── */}
      <motion.div className="relative z-10 text-center px-4 mt-1"
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
        <div className="text-display font-black leading-none"
          style={{ fontSize: 'clamp(2rem, 9vw, 3rem)', color: '#F5B642',
            textShadow: '0 0 20px #F5B64299, 0 0 60px #F5B64255, 2px 2px 0 #7c3aed, 4px 4px 0 #4c1d95' }}>
          JONNY'S
        </div>
        <div className="text-display font-black leading-none -mt-1"
          style={{ fontSize: 'clamp(2.6rem, 12vw, 4rem)', color: '#ffffff',
            textShadow: '0 0 20px #ffffff55, 2px 2px 0 #F5B642, 4px 4px 0 #7c3aed, 6px 6px 0 #4c1d95' }}>
          WORLD
        </div>
        <motion.div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: '#F5B642', textShadow: '0 0 10px #F5B64288' }}
          animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
          ✦ Il Parco del Divertimento Intelligente ✦
        </motion.div>
      </motion.div>

      {/* ─── JONNY + SPEECH (layout orizzontale su schermi larghi) ─── */}
      <div className="relative z-10 flex items-center justify-center gap-3 mt-2 px-4 w-full">
        <AnimatePresence mode="wait">
          <motion.div key={slideIdx} className="flex items-center gap-3"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}>
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
              <JonnyAvatar mood={slide.mood} size={230}
                className="drop-shadow-[0_0_40px_rgba(245,182,66,0.6)] shrink-0" />
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Speech bubble laterale */}
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="wait">
            <motion.div key={`txt-${slideIdx}`}
              className="rounded-2xl rounded-bl-sm border-2 border-yellow-400/60 px-4 py-3 text-center text-sm font-black max-w-[160px]"
              style={{ background: 'rgba(245,182,66,0.12)', color: '#FDE68A',
                whiteSpace: 'pre-line', textShadow: '0 0 10px #F5B64266',
                boxShadow: '0 0 20px rgba(245,182,66,0.2)' }}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}>
              {slide.label}
            </motion.div>
          </AnimatePresence>
          {/* Slide dots */}
          <div className="flex gap-1.5 justify-center">
            {JONNY_SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlideIdx(i)}
                className="rounded-full transition-all"
                style={{ width: i === slideIdx ? 18 : 6, height: 6,
                  background: i === slideIdx ? '#F5B642' : '#4c1d9588' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ─── GAME CARDS ─── */}
      <div className="relative z-10 w-full mt-3">
        <div className="px-4 mb-1.5 text-xs font-black uppercase tracking-widest text-yellow-400/80">🎮 I Giochi</div>
        <div className="flex gap-2.5 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-hide">
          {GAMES.map((g, i) => (
            <div key={g.name} className="snap-start">
              <NeonCard {...g} idx={i} />
            </div>
          ))}
        </div>
      </div>

      {/* ─── CTA ─── */}
      <div className="relative z-10 w-full px-4 mt-4">
        <motion.button
          onClick={onJoin}
          className="relative w-full overflow-hidden rounded-2xl py-5 text-xl font-black text-black"
          style={{ background: 'linear-gradient(135deg, #F5B642 0%, #FF8C00 50%, #F5B642 100%)',
            backgroundSize: '200% 200%', boxShadow: '0 0 40px rgba(245,182,66,0.7), 0 4px 30px rgba(245,182,66,0.4)' }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 3, repeat: Infinity }}
          whileTap={{ scale: 0.97 }}
          whileHover={{ boxShadow: '0 0 60px rgba(245,182,66,0.9), 0 4px 40px rgba(245,182,66,0.6)' }}
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}>
          {/* Shine sweep */}
          <motion.div className="absolute inset-0 w-1/3 skew-x-[-20deg]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5 }} />
          🎮 Gioca con noi!
        </motion.button>

        <motion.button onClick={onJoin}
          className="mt-2.5 w-full text-center text-sm text-white/50 hover:text-white/80 transition-colors"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          Ho già un codice → inseriscilo
        </motion.button>
      </div>
    </div>
  );
}

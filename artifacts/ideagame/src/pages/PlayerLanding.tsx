import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GAMES = [
  { name: 'Percorso\na Risate',   color: '#FF5E5E', glow: '#FF5E5E' },
  { name: 'Gioco delle\nCoppie',  color: '#FF69B4', glow: '#FF69B4' },
  { name: 'Quizzone',             color: '#00E5C8', glow: '#00E5C8' },
  { name: 'Sfida di\nBallo',      color: '#B06BFF', glow: '#B06BFF' },
  { name: 'Freestyle\nBattle',    color: '#FFB800', glow: '#FFB800' },
  { name: 'Adult\nOnly 18+',      color: '#FF4B4B', glow: '#FF4B4B' },
  { name: 'Parola alle\nSpalle',  color: '#3DFFB0', glow: '#3DFFB0' },
  { name: 'Karaoke\nBattle',      color: '#5EA8FF', glow: '#5EA8FF' },
];

const POSES = [
  { src: '/jonny/via-nobg.png',      caption: 'Preparati a divertirti!' },
  { src: '/jonny/saluti-nobg.png',   caption: 'Benvenuto nel mondo di Jonny!' },
  { src: '/jonny/sfida-nobg.png',    caption: 'Scegli la tua sfida!' },
  { src: '/jonny/vincitore-nobg.png',caption: 'Solo uno può trionfare!' },
];

const CONFETTI = [
  '#F5B642','#FF5E5E','#00E5C8','#B06BFF','#FF69B4','#3DFFB0','#5EA8FF','#FFB800',
];

function Confetto({ i }: { i: number }) {
  const color = CONFETTI[i % CONFETTI.length];
  const left   = `${(i * 6.7 + 2) % 100}%`;
  const dur    = 4 + (i % 4) * 0.9;
  const delay  = -(i * 0.35);
  const w      = 5 + (i % 4) * 3;
  const h      = i % 3 === 0 ? w : w * 0.45;
  return (
    <motion.div
      className="absolute top-0 pointer-events-none rounded-sm"
      style={{ left, width: w, height: h, backgroundColor: color, opacity: 0.9 }}
      animate={{ y: ['0vh', '108vh'], rotate: [0, i % 2 === 0 ? 360 : -360], opacity: [0, 0.9, 0.9, 0] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'linear' }}
    />
  );
}

interface Props { onJoin: () => void }

export function PlayerLanding({ onJoin }: Props) {
  const [poseIdx, setPoseIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPoseIdx(i => (i + 1) % POSES.length), 3200);
    return () => clearInterval(t);
  }, []);

  const pose = POSES[poseIdx];

  return (
    <div
      className="relative flex flex-col items-center w-full overflow-x-hidden"
      style={{
        minHeight: '100svh',
        background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #4a1a9e 0%, #2d0f72 30%, #160840 60%, #08051a 100%)',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* ── Coriandoli ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        {Array.from({ length: 32 }).map((_, i) => <Confetto key={i} i={i} />)}
      </div>

      {/* ── Glow spots ── */}
      <div className="pointer-events-none absolute z-0" style={{ top: '15%', left: '10%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, #7c3aed55 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="pointer-events-none absolute z-0" style={{ top: '50%', right: '5%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, #FF5E5E33 0%, transparent 70%)', filter: 'blur(30px)' }} />
      <div className="pointer-events-none absolute z-0" style={{ top: '70%', left: '5%', width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, #00E5C833 0%, transparent 70%)', filter: 'blur(30px)' }} />

      {/* ── Logo ── */}
      <motion.div
        className="relative z-10 pt-6 pb-0"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src="/logo.png" alt="IDEAgame" className="h-9 w-auto" style={{ filter: 'drop-shadow(0 0 12px rgba(245,182,66,0.7))' }} />
      </motion.div>

      {/* ── Titolo ── */}
      <motion.div
        className="relative z-10 text-center px-4 mt-3 select-none"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, delay: 0.1 }}
      >
        <div
          className="font-black leading-none text-display"
          style={{
            fontSize: 'clamp(2.4rem, 11vw, 3.8rem)',
            background: 'linear-gradient(160deg, #FFE57A 0%, #F5B642 40%, #FF8C00 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 18px rgba(245,182,66,0.55))',
          }}
        >
          JONNY'S WORLD
        </div>
        <motion.p
          className="mt-1.5 text-xs font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(245,182,66,0.75)', letterSpacing: '0.22em' }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          Il Parco del Divertimento Intelligente
        </motion.p>
      </motion.div>

      {/* ── Jonny ── */}
      <div className="relative z-10 flex items-center justify-center w-full mt-1 px-4" style={{ minHeight: 260 }}>
        <AnimatePresence mode="wait">
          <motion.img
            key={pose.src}
            src={pose.src}
            alt="Jonny"
            style={{ height: 260, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 8px 32px rgba(245,182,66,0.4))' }}
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ duration: 0.42 }}
          />
        </AnimatePresence>

        {/* Caption bubble */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`cap-${poseIdx}`}
              className="rounded-2xl border px-4 py-2 text-center text-sm font-bold"
              style={{
                borderColor: 'rgba(245,182,66,0.45)',
                background: 'rgba(20,8,50,0.65)',
                backdropFilter: 'blur(8px)',
                color: '#FFE57A',
                maxWidth: 260,
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              {pose.caption}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Floating dots nav */}
        <div className="absolute -bottom-5 left-0 right-0 flex justify-center gap-1.5">
          {POSES.map((_, i) => (
            <button
              key={i}
              onClick={() => setPoseIdx(i)}
              style={{
                width: i === poseIdx ? 20 : 6,
                height: 6,
                borderRadius: 4,
                background: i === poseIdx ? '#F5B642' : 'rgba(245,182,66,0.25)',
                transition: 'all 0.3s',
                border: 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Badge strip ── */}
      <motion.div
        className="relative z-10 flex gap-2 mt-8 px-4 w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        {[
          { label: '8 Giochi', sub: 'diversi ogni sera' },
          { label: 'Live Party', sub: 'tutti insieme' },
          { label: 'Sul tuo\ntelefono', sub: 'nessuna app' },
        ].map(b => (
          <div
            key={b.label}
            className="flex-1 flex flex-col items-center rounded-2xl py-2.5 px-1"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span className="text-xs font-black text-white text-center leading-tight whitespace-pre-line">{b.label}</span>
            <span className="text-[9px] text-white/45 text-center mt-0.5">{b.sub}</span>
          </div>
        ))}
      </motion.div>

      {/* ── Giochi ── */}
      <div className="relative z-10 w-full mt-5">
        <div className="px-4 mb-2 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'rgba(245,182,66,0.7)' }}>
          I Giochi
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-hide snap-x snap-mandatory">
          {GAMES.map((g, i) => (
            <motion.div
              key={g.name}
              className="snap-start shrink-0 flex items-center justify-center rounded-xl"
              style={{
                minWidth: 96, height: 72,
                border: `1.5px solid ${g.color}`,
                background: `linear-gradient(135deg, ${g.color}18 0%, ${g.color}08 100%)`,
                boxShadow: `0 0 14px ${g.glow}44, inset 0 0 10px ${g.glow}12`,
                cursor: 'default',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.06, type: 'spring', stiffness: 180 }}
            >
              <span
                className="font-black text-center leading-tight whitespace-pre-line"
                style={{
                  fontSize: 11, color: g.color,
                  textShadow: `0 0 8px ${g.glow}99`,
                }}
              >
                {g.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="relative z-10 w-full px-4 mt-5">
        <motion.button
          onClick={onJoin}
          className="relative w-full overflow-hidden rounded-2xl font-black text-black"
          style={{
            padding: '18px 0',
            fontSize: '1.15rem',
            background: 'linear-gradient(135deg, #F5B642 0%, #FF9500 100%)',
            boxShadow: '0 0 36px rgba(245,182,66,0.65), 0 4px 24px rgba(245,182,66,0.35)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 180 }}
          whileTap={{ scale: 0.975 }}
          whileHover={{ boxShadow: '0 0 52px rgba(245,182,66,0.85), 0 4px 36px rgba(245,182,66,0.5)' }}
        >
          {/* Shine sweep */}
          <motion.div
            className="absolute top-0 bottom-0 w-1/4 skew-x-[-18deg]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.38), transparent)' }}
            animate={{ x: ['-120%', '420%'] }}
            transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.8 }}
          />
          Gioca con noi
        </motion.button>

        <motion.button
          onClick={onJoin}
          className="mt-3 w-full text-center text-xs font-semibold transition-colors"
          style={{ color: 'rgba(255,255,255,0.38)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          whileHover={{ color: 'rgba(255,255,255,0.7)' } as object}
        >
          Ho un codice evento → inseriscilo
        </motion.button>
      </div>
    </div>
  );
}

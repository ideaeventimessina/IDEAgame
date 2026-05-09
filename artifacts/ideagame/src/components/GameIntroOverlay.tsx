import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameIcon } from '@/components/GameIcon';

type IconName = Parameters<typeof GameIcon>[0]['name'];

interface Props {
  name: string;
  tagline: string;
  accentColor: string;
  icon: string;
  slug: string;
  onDone: () => void;
}

const DURATION_MS = 5000;

export function GameIntroOverlay({ name, tagline, accentColor, icon, slug, onDone }: Props) {
  const [phase, setPhase] = useState<'burst' | 'text' | 'fadeout'>('burst');
  const [hasVideo, setHasVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoSrc = `/stingers/${slug}.mp4`;

  useEffect(() => {
    // Check if a stinger video exists for this game
    fetch(videoSrc, { method: 'HEAD' })
      .then(r => { if (r.ok) setHasVideo(true); })
      .catch(() => {});
  }, [videoSrc]);

  useEffect(() => {
    // Phase timeline for the pure-animation fallback
    const t1 = setTimeout(() => setPhase('text'), 400);
    const t2 = setTimeout(() => setPhase('fadeout'), DURATION_MS - 600);
    timerRef.current = setTimeout(onDone, DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleVideoEnd() {
    onDone();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black"
      style={{ perspective: 1000 }}
    >
      {/* ── Video stinger (when available) ── */}
      {hasVideo && (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          muted={false}
          playsInline
          onEnded={handleVideoEnd}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* ── Pure-animation fallback (shown when no video) ── */}
      {!hasVideo && (
        <>
          {/* Radial color burst */}
          <motion.div
            initial={{ opacity: 0, scale: 0.1 }}
            animate={{ opacity: phase === 'fadeout' ? 0 : [0, 0.7, 0.4], scale: phase === 'fadeout' ? 2 : [0.1, 1.8, 1.4] }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, ${accentColor}88 0%, ${accentColor}22 45%, transparent 70%)`,
            }}
          />

          {/* Scanline grid overlay — luxury feel */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 6px)',
            }}
          />

          {/* Centre content */}
          <div className="relative z-10 flex flex-col items-center gap-4 px-8 text-center">
            {/* Octagonal icon frame */}
            <AnimatePresence>
              {phase !== 'burst' && (
                <motion.div
                  initial={{ scale: 0.2, opacity: 0, rotateY: -90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 18 }}
                  className="oct-clip flex items-center justify-center"
                  style={{
                    width: 140,
                    height: 140,
                    background: `linear-gradient(145deg, ${accentColor} 0%, ${accentColor}99 60%, #0a0820 130%)`,
                    filter: `drop-shadow(0 0 60px ${accentColor}88)`,
                  }}
                >
                  <GameIcon
                    name={icon as IconName}
                    style={{ width: 64, height: 64, color: 'white' }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Game name */}
            <AnimatePresence>
              {phase === 'text' && (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center gap-3"
                >
                  <h1
                    className="text-display font-black leading-none tracking-tight"
                    style={{
                      fontSize: 'clamp(2.8rem, 8vw, 6rem)',
                      color: accentColor,
                      textShadow: `0 0 80px ${accentColor}88, 0 4px 32px rgba(0,0,0,0.8)`,
                    }}
                  >
                    {name}
                  </h1>
                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 0.75, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="max-w-lg text-lg font-medium text-white/70 leading-relaxed"
                  >
                    {tagline}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>


          {/* Jonny floating from bottom-right */}
          <AnimatePresence>
            {phase === 'text' && (
              <motion.img src="/jonny-master.jpg" alt="Jonny"
                initial={{ opacity: 0, x: 80, y: 40 }}
                animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ opacity: { duration: 0.5 }, x: { type: 'spring', stiffness: 120 }, y: { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 } }}
                className="pointer-events-none absolute bottom-0 right-0 select-none"
                style={{ height: 'clamp(180px, 30vh, 280px)', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', filter: `drop-shadow(0 0 40px ${accentColor}66) drop-shadow(0 20px 50px rgba(0,0,0,0.6))` }}
              />
            )}
          </AnimatePresence>

          {/* Fade-out veil */}
          <AnimatePresence>
            {phase === 'fadeout' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0 bg-black"
              />
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

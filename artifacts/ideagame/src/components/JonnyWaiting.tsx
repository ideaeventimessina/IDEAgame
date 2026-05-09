import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import type { JonnyMode } from '@/contexts/JonnyContext';

const LIVE_MESSAGES = [
  'Il gioco inizierà a breve…',
  'Aspettiamo che tutti si uniscano!',
  'Preparati — partiremo presto!',
  'L\'animatore sta per iniziare…',
  'Controlla il grande schermo!',
];

const HOME_MESSAGES = [
  'Sto preparando il gioco per te…',
  'Jonny è quasi pronto!',
  'Metti a fuoco, si parte presto!',
  'Caricamento gioco in corso…',
  'Quasi pronti!',
];

interface JonnyWaitingProps {
  playerName: string;
  eventName?: string;
  jonnyMode: JonnyMode;
}

export function JonnyWaiting({ playerName, eventName, jonnyMode }: JonnyWaitingProps) {
  const [msgIdx, setMsgIdx] = useState(0);
  const pool = jonnyMode === 'home' ? HOME_MESSAGES : LIVE_MESSAGES;

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % pool.length), 3500);
    return () => clearInterval(t);
  }, [pool.length]);

  return (
    <div className="mt-8 flex flex-col items-center gap-5">
      {/* Jonny avatar with breathing animation */}
      <motion.div
        animate={{ scale: [1, 1.04, 1], y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
      >
        <JonnyAvatar mood="thinking" size={100} />
      </motion.div>

      {/* Hi player! */}
      <div className="text-center">
        <div className="text-display text-lg font-black" style={{ color: '#D4AF37' }}>
          Ciao, {playerName}!
        </div>
        {eventName && (
          <div className="mt-0.5 text-xs text-muted-foreground">{eventName}</div>
        )}
      </div>

      {/* Cycling message */}
      <div
        className="w-full rounded-2xl border px-5 py-4 text-center"
        style={{
          borderColor: 'rgba(212,175,55,0.25)',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(20,15,40,0.5))',
        }}
      >
        {jonnyMode === 'home' && (
          <div className="mb-1 text-[10px] font-bold tracking-widest" style={{ color: '#D4AF37' }}>
            JONNY CO-HOST
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={msgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-sm font-medium text-foreground/80"
          >
            {pool[msgIdx]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mode badge */}
      {jonnyMode === 'home' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest"
          style={{ borderColor: 'rgba(212,175,55,0.3)', color: '#D4AF37' }}
        >
          HOME MODE — Jonny è il tuo game master
        </motion.div>
      )}

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: '#D4AF37' }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.25, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  );
}

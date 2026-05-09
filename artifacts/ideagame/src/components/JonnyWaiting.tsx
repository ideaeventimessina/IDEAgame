import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import type { JonnyMode } from '@/contexts/JonnyContext';

interface JonnyWaitingProps {
  playerName?: string;
  eventName?: string;
  jonnyMode: JonnyMode;
}

const LIVE_MESSAGES = [
  "L'animatore sta preparando qualcosa di epico… 🎤",
  "Riscaldati — la partita sta per iniziare!",
  "Guarda il grande schermo, ci siamo quasi… 👀",
  "Controlla che il tuo telefono sia carico! 🔋",
  "Fai squadra — parla con i tuoi compagni! 💬",
  "Il pubblico sta arrivando… preparati! 🎊",
];

const HOME_MESSAGES = [
  "Sto preparando la prossima sfida… 🧠",
  "Il gioco sta per iniziare, tieniti pronto!",
  "Studia la classifica — sai chi battere 😏",
  "Respira… e punta al primo posto! 🏆",
  "Ogni secondo conta — concentrati! ⚡",
  "La prossima domanda sarà decisiva… 🎯",
];

export function JonnyWaiting({ playerName, eventName, jonnyMode }: JonnyWaitingProps) {
  const pool = jonnyMode === 'home' ? HOME_MESSAGES : LIVE_MESSAGES;
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % pool.length);
        setVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(timer);
  }, [pool.length]);

  return (
    <div className="mt-6 flex flex-col items-center gap-5 text-center px-4">

      {/* Jonny avatar — waiting pose with gentle float */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      >
        <JonnyAvatar mood="waiting" size={140} />
      </motion.div>

      {/* Greeting */}
      <div>
        <div className="text-display text-2xl font-black" style={{ color: '#D4AF37' }}>
          {playerName ? `Pronto, ${playerName}!` : 'Sei dentro!'}
        </div>
        {eventName && (
          <div className="mt-0.5 text-sm text-muted-foreground">{eventName}</div>
        )}
      </div>

      {/* Cycling Jonny message */}
      <div
        className="relative w-full max-w-xs rounded-2xl border px-4 py-3 text-sm font-medium"
        style={{
          background: 'linear-gradient(135deg, rgba(16,12,34,0.9) 0%, rgba(10,8,25,0.9) 100%)',
          borderColor: 'rgba(212,175,55,0.3)',
          color: '#e8d5a3',
          minHeight: 56,
        }}
      >
        <div className="mb-1 text-[10px] font-black tracking-widest" style={{ color: '#D4AF37' }}>
          JONNY{jonnyMode === 'home' ? ' HOME' : ''}
        </div>
        <AnimatePresence mode="wait">
          {visible && (
            <motion.span
              key={idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="block"
            >
              {pool[idx]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Pulsing dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: '#D4AF37' }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {jonnyMode === 'home' && (
        <div className="rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest"
          style={{ borderColor: 'rgba(212,175,55,0.35)', color: '#D4AF37' }}>
          🏠 HOME MODE
        </div>
      )}
    </div>
  );
}

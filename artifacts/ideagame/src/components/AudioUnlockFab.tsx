import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useAudioOrchestrator } from '@/contexts/AudioOrchestrator';

/**
 * Full-screen audio unlock overlay.
 * Shown on the projector page (Hub) whenever projectorActive && !audioUnlocked.
 * The entire screen is tappable — making it impossible to miss.
 * One tap unlocks the AudioContext and starts the lobby music.
 */
export function AudioUnlockFab() {
  const { projectorActive, audioUnlocked, unlockAudio } = useAudioOrchestrator();

  const visible = projectorActive && !audioUnlocked;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="audio-unlock-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={unlockAudio}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer select-none"
          style={{
            background: 'rgba(6, 2, 19, 0.88)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Pulsing gold ring */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute rounded-full"
            style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(212,175,55,0.35) 0%, transparent 70%)' }}
          />

          {/* Icon */}
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="relative flex items-center justify-center rounded-full mb-6"
            style={{
              width: 100, height: 100,
              background: 'linear-gradient(135deg, #D4AF37 0%, #F5B642 100%)',
              boxShadow: '0 0 60px rgba(212,175,55,0.5), 0 0 120px rgba(212,175,55,0.2)',
            }}
          >
            <Volume2 className="h-12 w-12" style={{ color: '#080605' }} />
          </motion.div>

          {/* Label */}
          <div className="text-center">
            <div className="text-display text-3xl font-black text-white mb-2" style={{ letterSpacing: '0.04em' }}>
              TOCCA PER INIZIARE
            </div>
            <div className="text-sm font-medium" style={{ color: 'rgba(212,175,55,0.7)' }}>
              Sblocca l'audio prima di avviare lo show
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useAudioOrchestrator } from '@/contexts/AudioOrchestrator';

export function AudioUnlockFab() {
  const { projectorActive, audioUnlocked, unlockAudio } = useAudioOrchestrator();

  const visible = projectorActive && !audioUnlocked;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          onClick={unlockAudio}
          className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-full px-5 py-3 font-bold text-sm shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #D4AF37 0%, #F5B642 100%)',
            color: '#080605',
            boxShadow: '0 0 0 3px rgba(212,175,55,0.35), 0 8px 32px rgba(0,0,0,0.6)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <Volume2 className="h-4 w-4" />
          🔊 Attiva Audio
        </motion.button>
      )}
    </AnimatePresence>
  );
}

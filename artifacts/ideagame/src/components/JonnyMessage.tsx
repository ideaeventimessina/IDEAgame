import { AnimatePresence, motion } from 'framer-motion';
import { useJonny } from '@/contexts/JonnyContext';
import { JonnyAvatar } from '@/components/JonnyAvatar';

const MOOD_COLORS: Record<string, string> = {
  cheering:    'rgba(212,175,55,0.18)',
  celebrating: 'rgba(212,175,55,0.22)',
  thinking:    'rgba(148,130,255,0.15)',
  excited:     'rgba(212,175,55,0.18)',
  idle:        'rgba(255,255,255,0.07)',
};

export function JonnyMessage() {
  const { jonnyToast, isHostedByJonny } = useJonny();

  return (
    <AnimatePresence>
      {isHostedByJonny && jonnyToast && (
        <motion.div
          key={jonnyToast.id}
          initial={{ opacity: 0, y: 16, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.93 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          className="pointer-events-none fixed bottom-20 left-0 right-0 z-40 flex justify-center px-4"
        >
          <div
            className="flex items-center gap-2.5 rounded-full border px-4 py-2.5 shadow-lg"
            style={{
              background: MOOD_COLORS[jonnyToast.mood ?? 'idle'],
              borderColor: 'rgba(212,175,55,0.35)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,175,55,0.08)',
            }}
          >
            <JonnyAvatar mood={jonnyToast.mood ?? 'idle'} size={30} />
            {jonnyToast.icon && (
              <span className="text-base leading-none">{jonnyToast.icon}</span>
            )}
            <span className="text-sm font-bold" style={{ color: '#e8d5a3' }}>
              {jonnyToast.text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

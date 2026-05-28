import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';

/**
 * Cockpit button is shown ONLY on explicit Live/Admin/Regia paths.
 * Every Home Mode screen (desktop or mobile) must never see it.
 * Allowlist — if the current path does not start with one of these, return null.
 */
const ALLOWED_PREFIXES = [
  '/cockpit',
  '/control',
  '/presenter',
  '/presenter-live',
  '/projector',
  '/lobby',
  '/scoreboard',
  '/serata-completa',
  // live game projector routes
  '/quizzone',
  '/coppie',
  '/percorso-risate',
  '/adult-only',
  '/sfida-ballo',
  '/parola-alle-spalle',
  '/karaoke-battle',
  '/freestyle-battle',
  '/saramusica',
];

function isAllowedPath(location: string): boolean {
  return ALLOWED_PREFIXES.some(
    prefix => location === prefix || location.startsWith(prefix + '/') || location.startsWith(prefix + '?'),
  );
}

export function BackToCockpit() {
  const [location, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowed = isAllowedPath(location);

  useEffect(() => {
    if (!allowed) return;
    const show = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 3000);
    };
    window.addEventListener('mousemove', show);
    return () => {
      window.removeEventListener('mousemove', show);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [allowed]);

  if (!allowed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="back-cockpit"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          onClick={() => navigate('/control')}
          className="fixed left-4 top-20 z-[100] flex items-center gap-2 rounded-2xl border border-border bg-card/80 px-4 py-2.5 text-sm font-bold text-muted-foreground shadow-xl backdrop-blur-md transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
          Cockpit
        </motion.button>
      )}
    </AnimatePresence>
  );
}

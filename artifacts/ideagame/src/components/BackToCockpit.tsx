import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';

const HIDE_ON = ['/admin', '/play', '/login', '/splash', '/language', '/tenant', '/control', '/event-setup', '/permissions'];

export function BackToCockpit() {
  const [location, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = HIDE_ON.some(p => location === p || location.startsWith(p + '/'));

  useEffect(() => {
    if (hide) return;
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
  }, [hide]);

  if (hide) return null;

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
          className="fixed left-4 top-4 z-[100] flex items-center gap-2 rounded-2xl border border-border bg-card/80 px-4 py-2.5 text-sm font-bold text-muted-foreground shadow-xl backdrop-blur-md transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
          Cockpit
        </motion.button>
      )}
    </AnimatePresence>
  );
}

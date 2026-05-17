import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';

const HIDE_ROUTES = [
  '/', '/admin', '/play', '/login', '/splash', '/language', '/tenant',
  '/control', '/event-setup', '/permissions', '/presenter', '/presenter-live',
  // player-phone routes
  '/home/join', '/join', '/home-lobby',
];

/**
 * Returns true when we are in a player/phone context where the Cockpit
 * button must NEVER appear.  Checks three independent signals:
 *  1. Route prefix — covers all known player-phone routes
 *  2. Mobile/touch viewport — any device with innerWidth < 900 or coarse pointer
 *  3. Home-player identity in storage — player has joined a home session
 */
function isPlayerContext(location: string): boolean {
  if (HIDE_ROUTES.some(p => location === p || location.startsWith(p + '/'))) return true;

  if (typeof window !== 'undefined') {
    if (window.innerWidth < 900) return true;
    try { if (window.matchMedia('(pointer: coarse)').matches) return true; } catch { /* ignore */ }
  }

  try {
    // HomeJoin stores player identity under this key after joining
    if (localStorage.getItem('ideagame:home:join')) return true;
    if (localStorage.getItem('ideagame:home:player')) return true;
    if (sessionStorage.getItem('ideagame:home:player')) return true;
  } catch { /* ignore */ }

  return false;
}

export function BackToCockpit() {
  const [location, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = isPlayerContext(location);

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
          className="fixed left-4 top-20 z-[100] flex items-center gap-2 rounded-2xl border border-border bg-card/80 px-4 py-2.5 text-sm font-bold text-muted-foreground shadow-xl backdrop-blur-md transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
          Cockpit
        </motion.button>
      )}
    </AnimatePresence>
  );
}

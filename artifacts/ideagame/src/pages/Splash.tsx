import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { MockBanner } from '@/components/MockBanner';
import { useT } from '@/i18n';

export default function Splash() {
  const t = useT();
  const [, navigate] = useLocation();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setProgress(p => Math.min(100, p + 4)), 50);
    const tm = setTimeout(() => navigate('/language'), 1500);
    return () => { clearInterval(i); clearTimeout(tm); };
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <MockBanner note="splash di onboarding visivo" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(245,182,66,0.12),_transparent_60%)]" />
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="hex-logo grid h-40 w-40 place-items-center bg-gradient-to-br from-primary to-accent shadow-[0_0_80px_rgba(245,182,66,0.45)]"
        >
          <span className="text-display text-5xl font-black text-primary-foreground">I</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-display text-4xl font-black tracking-tight sm:text-6xl"
        >
          {t('app.title')}
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-3 text-sm uppercase tracking-[0.4em] text-muted-foreground"
        >
          {t('app.tagline')}
        </motion.div>
        <div className="mt-12 h-1 w-72 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 text-xs text-muted-foreground">v0.1.0 · offline ready</div>
      </div>
    </div>
  );
}

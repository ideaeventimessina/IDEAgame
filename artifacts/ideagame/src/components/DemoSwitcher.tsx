import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Tv, Smartphone, ShieldCheck, Rocket, LayoutGrid, X, MonitorPlay } from 'lucide-react';
import { useT } from '@/i18n';
import { useAuth } from '@/auth/roles';
import { motion, AnimatePresence } from 'framer-motion';

const ADMIN_ROLES = ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] as const;

export function DemoSwitcher() {
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const t = useT();
  const { user, role } = useAuth();
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlJoinCode = urlParams.get('e')?.toUpperCase() ?? '';
  const [projectorJoinCode, setProjectorJoinCode] = useState(urlJoinCode);

  useEffect(() => {
    if (urlJoinCode || !user) return;
    fetch('/api/events/current', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(ev => {
        if (ev?.joinCode) setProjectorJoinCode(String(ev.joinCode).toUpperCase());
      })
      .catch(() => {});
  }, [urlJoinCode, user]);

  const projectorPath = projectorJoinCode ? `/?e=${projectorJoinCode}` : '/cockpit';

  // Only show the Navigator to authenticated admin/staff users.
  // Unauthenticated projector viewers and players must never see it.
  if (!user || !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) return null;

  const isAdmin     = location.startsWith('/admin');
  const isPlay      = location.startsWith('/play');
  const isDemo      = location.startsWith('/demo');
  const isPresenter = location.startsWith('/presenter');
  const isStage     = !isAdmin && !isPlay && !isDemo && !isPresenter;

  const item = (active: boolean, icon: ReactNode, label: string, to: string) => (
    <button
      onClick={() => { navigate(to); setOpen(false); }}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}<span>{label}</span>
    </button>
  );

  return (
    <>
      {/* Always-visible toggle handle — sits comfortably above the Mac dock */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border bg-card/75 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground"
        title="Navigator"
      >
        {open
          ? <X className="h-3.5 w-3.5" />
          : <LayoutGrid className="h-3.5 w-3.5" />
        }
        <span>{open ? 'Chiudi' : 'Navigator'}</span>
      </button>

      {/* Expandable nav bar — slides up from handle on click */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2"
          >
            <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-2xl backdrop-blur-md">
              <span className="px-3 text-xs uppercase tracking-widest text-muted-foreground">{t('demo.switcher')}</span>
              {item(isStage,     <Tv className="h-4 w-4" />,          t('demo.stage'),  '/')}
              {item(isPlay,      <Smartphone className="h-4 w-4" />,   t('demo.player'), '/play')}
              {item(isPresenter, <MonitorPlay className="h-4 w-4" />,  'Presentatore',   '/presenter')}
              {item(isAdmin,     <ShieldCheck className="h-4 w-4" />,  t('demo.admin'),  '/admin')}
              {item(isDemo,      <Rocket className="h-4 w-4" />,       'Demo',           '/demo')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

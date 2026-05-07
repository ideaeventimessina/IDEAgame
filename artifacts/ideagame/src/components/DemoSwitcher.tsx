import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Tv, Smartphone, ShieldCheck } from 'lucide-react';
import { useT } from '@/i18n';

export function DemoSwitcher() {
  const [location, navigate] = useLocation();
  const t = useT();
  const isAdmin = location.startsWith('/admin');
  const isPlay = location.startsWith('/play');
  const isStage = !isAdmin && !isPlay;

  const item = (active: boolean, icon: ReactNode, label: string, to: string) => (
    <button
      onClick={() => navigate(to)}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover-elevate'
      }`}
    >
      {icon}<span>{label}</span>
    </button>
  );

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card/85 p-1 shadow-2xl backdrop-blur-md">
        <span className="px-3 text-xs uppercase tracking-widest text-muted-foreground">{t('demo.switcher')}</span>
        {item(isStage, <Tv className="h-4 w-4" />, t('demo.stage'), '/')}
        {item(isPlay, <Smartphone className="h-4 w-4" />, t('demo.player'), '/play')}
        {item(isAdmin, <ShieldCheck className="h-4 w-4" />, t('demo.admin'), '/admin')}
      </div>
    </div>
  );
}

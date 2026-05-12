import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Gamepad2, Settings2, Users, LogOut, Loader2,
  CalendarDays, Tv2, Copy, Check, ArrowLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/roles';
import { useGetCurrentEvent, getGetCurrentEventQueryKey } from '@workspace/api-client-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  tenant_owner: 'Proprietario',
  game_manager: 'Game Manager',
  entertainer: 'Animatore',
  player: 'Giocatore',
};

interface NavCard {
  icon: React.ReactNode;
  label: string;
  sub: string;
  href: string;
  accent: string;
  roles?: string[];
}

export default function Cockpit() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: event } = useGetCurrentEvent({
    query: { queryKey: getGetCurrentEventQueryKey(), enabled: !!user, retry: false },
  });

  const joinCode = (event as { joinCode?: string } | undefined)?.joinCode ?? null;
  const eventName = (event as { name?: string } | undefined)?.name ?? null;

  const projectorUrl = joinCode
    ? `${window.location.origin}/?e=${joinCode}`
    : `${window.location.origin}/`;

  const copyUrl = () => {
    void navigator.clipboard.writeText(projectorUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout'); } catch { /* ignore */ }
    window.location.href = BASE;
  };

  const NAV_CARDS: NavCard[] = [
    {
      icon: <Gamepad2 className="h-8 w-8" />,
      label: 'Sala Controllo',
      sub: 'Gestisci sessioni e punteggi',
      href: '/control',
      accent: '#60A5FA',
    },
    {
      icon: <Settings2 className="h-8 w-8" />,
      label: 'Admin',
      sub: 'Dashboard & impostazioni',
      href: '/admin',
      accent: '#A78BFA',
      roles: ['super_admin', 'tenant_owner', 'game_manager'],
    },
    {
      icon: <Users className="h-8 w-8" />,
      label: 'Giocatore',
      sub: joinCode ? `Entra con codice ${joinCode}` : 'Unisciti come giocatore',
      href: joinCode ? `/play?e=${joinCode}` : '/play',
      accent: '#34D399',
    },
  ];

  const visibleCards = NAV_CARDS.filter(c =>
    !c.roles || !user?.role || c.roles.includes(user.role)
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      {/* Hex grid bg */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{ backgroundImage: 'url("/hex-grid.svg")', backgroundSize: '80px' }} />

      {/* Gold glow top */}
      <div className="pointer-events-none absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }} />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">

        {/* Back to Hub */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => navigate('/')}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Hub
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {user?.role ? ROLE_LABEL[user.role] ?? user.role : ''}
          </div>
          <h1 className="text-display text-4xl font-black text-white sm:text-5xl">
            Ciao, <span style={{ color: '#F59E0B' }}>{user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'Staff'}</span>
          </h1>

          {eventName && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm"
            >
              <CalendarDays className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-medium text-white/80">{eventName}</span>
              {joinCode && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="font-black tracking-widest text-amber-400">{joinCode}</span>
                </>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Proiettore TV — info banner (NOT a nav button) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="mb-6 w-full max-w-2xl rounded-2xl border-2 p-5"
          style={{ borderColor: '#F59E0B44', background: '#F59E0B08' }}
        >
          <div className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0" style={{ color: '#F59E0B' }}>
              <Tv2 className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-display text-base font-black text-white">Proiettore / Schermo TV</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Apri questo link direttamente sul TV o sullo schermo proiettore — <strong className="text-white/60">non su questo dispositivo</strong>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono font-bold text-amber-300">
                  {projectorUrl}
                </code>
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-400/20 transition-colors shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiato!' : 'Copia'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Nav cards — same tab navigation */}
        <div className={`grid w-full max-w-2xl gap-4 ${visibleCards.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {visibleCards.map((card, i) => (
            <motion.button
              key={card.label}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              onClick={() => navigate(card.href)}
              className="group relative flex flex-col items-center gap-3 rounded-2xl border-2 p-7 text-center transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ borderColor: `${card.accent}33`, background: `${card.accent}08` }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${card.accent}88`;
                (e.currentTarget as HTMLButtonElement).style.background = `${card.accent}14`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${card.accent}33`;
                (e.currentTarget as HTMLButtonElement).style.background = `${card.accent}08`;
              }}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover:opacity-100"
                style={{ boxShadow: `0 0 40px ${card.accent}22` }} />
              <div style={{ color: card.accent }}>{card.icon}</div>
              <div>
                <div className="text-display text-lg font-black text-white">{card.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{card.sub}</div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Logout */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-10"
        >
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Esci
          </button>
        </motion.div>

      </div>
    </div>
  );
}

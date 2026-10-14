/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Home, MapPin, Lock, Spade, Crown, ChevronRight } from 'lucide-react';
import { AudioManager } from '@/audio/AudioManager';
import { useAuth } from '@/auth/roles';
import ShowStage from '@/components/ShowStage';
import ShellHeader from '@/components/ShellHeader';
import StageFit from '@/components/StageFit';

/* ─── Scelta modalità (mockup 05 · vista 02 MODALITÀ) ───────────────────
   Due modalità principali (Gioca a casa / Eventi e locali) + altre modalità
   (Lockdown / Burraco / Casinò). Routing e flusso login Live preservati.
*/

const LIVE_DEST = '/home-setup?mode=live';
const LIVE_ROLES = ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] as const;

function useIsNarrow(bp = 760) {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : false,
  );
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return narrow;
}

type Big = {
  id: string;
  title: string;
  desc: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  tint: string;
  border: string;
  glow: string;
  onClick: () => void;
};
type Small = {
  id: string;
  title: string;
  desc: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  tint: string;
  border: string;
  onClick: () => void;
};

function BigCard({ m }: { m: Big }) {
  const { Icon } = m;
  return (
    <button
      type="button"
      onClick={m.onClick}
      className="group relative flex h-full flex-col justify-end overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.99]"
      style={{ padding: 18, background: m.tint, border: `1.5px solid ${m.border}`, boxShadow: `0 0 28px ${m.glow}` }}
    >
      <span
        className="pointer-events-none absolute grid place-items-center"
        style={{ top: 22, left: '50%', transform: 'translateX(-50%)', color: '#F7F3E8', opacity: 0.95, filter: `drop-shadow(0 4px 14px ${m.glow})` }}
      >
        <Icon size={54} strokeWidth={1.9} />
      </span>
      <div style={{ paddingRight: 44 }}>
        <div className="font-black" style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontSize: 28, color: '#F7F3E8', lineHeight: 1.05 }}>
          {m.title}
        </div>
        <div className="font-medium" style={{ fontSize: 13.5, color: 'rgba(247,243,232,0.82)', marginTop: 5, lineHeight: 1.25, whiteSpace: 'pre-line' }}>
          {m.desc}
        </div>
      </div>
      <ChevronRight size={26} strokeWidth={2.4} className="absolute" style={{ right: 16, top: '50%', transform: 'translateY(-50%)', color: 'rgba(247,243,232,0.85)' }} />
    </button>
  );
}

function SmallCard({ m }: { m: Small }) {
  const { Icon } = m;
  return (
    <button
      type="button"
      onClick={m.onClick}
      className="group relative flex h-full flex-col justify-center overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.99]"
      style={{ padding: 16, paddingRight: 40, background: m.tint, border: `1.5px solid ${m.border}` }}
    >
      <span className="grid place-items-center" style={{ color: '#F7F3E8', marginBottom: 9 }}>
        <Icon size={26} strokeWidth={2} />
      </span>
      <div className="font-extrabold" style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontSize: 18, color: '#F7F3E8', lineHeight: 1.05 }}>
        {m.title}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(247,243,232,0.72)', marginTop: 4, lineHeight: 1.22, whiteSpace: 'pre-line' }}>{m.desc}</div>
      <ChevronRight size={18} strokeWidth={2.4} className="absolute" style={{ right: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(247,243,232,0.7)' }} />
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center justify-center" style={{ gap: 14 }}>
      <span style={{ height: 1, flex: 1, maxWidth: 230, background: 'linear-gradient(90deg,transparent,rgba(230,184,92,0.4))' }} />
      <span className="font-bold" style={{ fontSize: 12, letterSpacing: '0.22em', color: 'rgba(230,184,92,0.85)' }}>
        ALTRE MODALITÀ
      </span>
      <span style={{ height: 1, flex: 1, maxWidth: 230, background: 'linear-gradient(90deg,rgba(230,184,92,0.4),transparent)' }} />
    </div>
  );
}

export default function ModeSelect() {
  const [, navigate] = useLocation();
  const { user, role, isLoading } = useAuth();
  const narrow = useIsNarrow(700);

  const go = (route: string) => {
    AudioManager.resumeContext();
    navigate(route);
  };

  // flusso login Live preservato
  const goLive = () => {
    AudioManager.resumeContext();
    if (isLoading) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(LIVE_DEST)}`);
      return;
    }
    const hasAccess = (LIVE_ROLES as readonly string[]).includes(role);
    navigate(hasAccess ? LIVE_DEST : `/login?redirect=${encodeURIComponent(LIVE_DEST)}`);
  };

  const bigs: Big[] = [
    { id: 'casa', title: 'Gioca a casa', desc: 'Perfetto per serate tra amici\ne in famiglia', Icon: Home,
      tint: 'linear-gradient(145deg, rgba(150,96,34,0.5) 0%, rgba(26,16,34,0.92) 62%)', border: 'rgba(120,186,222,0.55)', glow: 'rgba(90,170,220,0.22)', onClick: () => go('/home-setup') },
    { id: 'eventi', title: 'Eventi e locali', desc: 'Per gruppi numerosi\ned eventi speciali', Icon: MapPin,
      tint: 'linear-gradient(145deg, rgba(126,42,170,0.6) 0%, rgba(20,10,40,0.94) 62%)', border: 'rgba(190,96,234,0.6)', glow: 'rgba(170,80,230,0.26)', onClick: goLive },
  ];

  const smalls: Small[] = [
    { id: 'lockdown', title: 'Lockdown', desc: 'Gioca a distanza\ncon i tuoi amici', Icon: Lock,
      tint: 'linear-gradient(150deg, rgba(34,62,140,0.55) 0%, rgba(10,12,30,0.94) 64%)', border: 'rgba(96,126,232,0.5)', onClick: () => go('/home-setup?mode=lockdown') },
    { id: 'burraco', title: 'Burraco', desc: 'Il classico intramontabile\nin versione digitale', Icon: Spade,
      tint: 'linear-gradient(150deg, rgba(20,96,64,0.55) 0%, rgba(8,20,16,0.94) 64%)', border: 'rgba(64,204,146,0.5)', onClick: () => go('/gestione/burraco') },
    { id: 'casino', title: 'Casinò', desc: 'Sfide e giochi\ndi società', Icon: Crown,
      tint: 'linear-gradient(150deg, rgba(96,44,156,0.55) 0%, rgba(14,8,30,0.94) 64%)', border: 'rgba(176,112,232,0.5)', onClick: () => go('/gestione/casino') },
  ];

  const Title = (
    <h1
      className="text-center font-black"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontSize: 24, color: '#F7F3E8', margin: 0 }}
    >
      Scegli la modalità di gioco
    </h1>
  );

  const header = (
    <ShellHeader num="02" label="MODALITÀ" onPlayers={() => navigate('/home/join')} onSettings={() => navigate('/home-setup')} onProfile={() => navigate('/home-setup')} />
  );

  const bigsR = bigs;
  const smallsR = smalls;

  if (narrow) {
    return (
      <ShowStage style={{ minHeight: '100dvh' }}>
        {header}
        <main className="flex flex-1 flex-col" style={{ padding: '6px 16px calc(20px + env(safe-area-inset-bottom))', gap: 16, maxWidth: 520, margin: '0 auto', width: '100%' }}>
          {Title}
          <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
            {bigsR.map((m) => (
              <div key={m.id} style={{ height: 150 }}>
                <BigCard m={m} />
              </div>
            ))}
          </div>
          <Divider />
          <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
            {smallsR.map((m) => (
              <div key={m.id} style={{ height: 104 }}>
                <SmallCard m={m} />
              </div>
            ))}
          </div>
        </main>
      </ShowStage>
    );
  }

  return (
    <ShowStage>
      <StageFit designW={752} designH={500}>
        {header}
        <main className="flex flex-1 flex-col" style={{ padding: '0 14px 16px', gap: 14 }}>
          <div style={{ paddingTop: 4 }}>{Title}</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, height: 182 }}>
            {bigsR.map((m) => (
              <BigCard key={m.id} m={m} />
            ))}
          </div>
          <Divider />
          <div className="grid flex-1" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {smallsR.map((m) => (
              <SmallCard key={m.id} m={m} />
            ))}
          </div>
        </main>
      </StageFit>
    </ShowStage>
  );
}

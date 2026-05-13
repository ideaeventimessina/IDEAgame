import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

interface LiveState {
  event?: {
    id: string;
    joinCode: string;
    status: string;
  } | null;
}

function appPath(path: string) {
  const cleanBase = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${cleanBase}${path}`;
}

export default function ProjectorStandby() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const r = await fetch(appPath('/api/events/public/live-state'), { credentials: 'include' });
        const data = r.ok ? await r.json() as LiveState : null;

        if (!cancelled && data?.event?.joinCode) {
          window.location.href = appPath(`/?e=${String(data.event.joinCode).toUpperCase()}`);
          return;
        }
      } catch {
        // resta in attesa
      }

      if (!cancelled) setChecked(true);
    };

    void check();
    const id = window.setInterval(check, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050014] text-white">
      <motion.img
        src="/jonny-world-hero.png"
        alt="Jonny's World"
        className="absolute inset-0 h-full w-full object-cover object-center"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,0,20,0.12)_0%,rgba(5,0,20,0.35)_55%,rgba(5,0,20,0.82)_100%)]" />
      <div className="absolute inset-x-0 bottom-10 flex justify-center px-6">
        <motion.div
          animate={{ opacity: [0.72, 1, 0.72] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="rounded-2xl border border-amber-300/50 bg-black/55 px-8 py-4 text-center shadow-2xl backdrop-blur-md"
        >
          <div className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">
            {checked ? 'In attesa di un evento' : 'Ricerca evento live'}
          </div>
          <div className="mt-1 text-sm text-white/70">
            Questo schermo passerà automaticamente al QR quando la regia avvierà la partita.
          </div>
        </motion.div>
      </div>
    </div>
  );
}

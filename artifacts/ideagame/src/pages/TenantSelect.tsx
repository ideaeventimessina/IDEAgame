import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { TENANTS } from '@/data/mock';
import { Building2, Search, WifiOff, ChevronRight } from 'lucide-react';

export default function TenantSelect() {
  const [, navigate] = useLocation();
  const detected = TENANTS[0]!;
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [auto, setAuto] = useState(3);

  useEffect(() => {
    if (showAll) return undefined;
    if (auto <= 0) { navigate('/login'); return undefined; }
    const t = setTimeout(() => setAuto(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [auto, showAll, navigate]);

  const filtered = TENANTS.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Step 2 of 3</div>
        <div className="mt-3 text-display text-5xl font-black">Identifica il locale</div>
      </div>

      <div className="mt-10 w-full max-w-lg rounded-3xl border-2 border-primary/40 bg-card/80 p-8 shadow-[0_0_60px_rgba(245,182,66,0.18)]">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Detected venue</div>
        <div className="mt-3 flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl text-xl font-black text-primary-foreground" style={{ background: detected.brandColor }}>
            {detected.name.slice(0, 1)}
          </div>
          <div>
            <div className="text-display text-2xl font-black">{detected.name}</div>
            <div className="text-sm text-muted-foreground">Plan: {detected.plan} · {detected.locale.toUpperCase()}</div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => setShowAll(true)} className="text-sm font-semibold text-primary">Cambia tenant</button>
          <button
            onClick={() => navigate('/login')}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover-elevate"
          >
            Conferma {!showAll && `(${auto})`}
          </button>
        </div>
      </div>

      {showAll && (
        <div className="mt-8 w-full max-w-lg rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca venue..." className="w-full bg-transparent outline-none" />
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {filtered.map(t => (
              <button key={t.id} onClick={() => navigate('/login')} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left hover-elevate">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-bold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.plan} · {t.locale.toUpperCase()}</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => navigate('/admin/system')} className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <WifiOff className="h-4 w-4" />
        Usa il dispositivo offline
      </button>
    </div>
  );
}

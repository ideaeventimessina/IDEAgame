import { useState } from 'react';
import { useLocation } from 'wouter';
import { Mic, MoveDiagonal, Camera, Check, X } from 'lucide-react';
import { MockBanner } from '@/components/MockBanner';

type Status = 'pending' | 'granted' | 'denied';

const ITEMS = [
  { key: 'mic', icon: Mic, title: 'Microfono', why: 'Per cantare in SaraMusica e usare il riconoscimento vocale.' },
  { key: 'motion', icon: MoveDiagonal, title: 'Movimento', why: 'Per misurare i tuoi passi nella Sfida di Ballo.' },
  { key: 'camera', icon: Camera, title: 'Fotocamera', why: 'Per ri-scansionare il QR se cambi stanza.' },
] as const;

export default function Permissions() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<Record<string, Status>>({ mic: 'pending', motion: 'pending', camera: 'pending' });
  const [idx, setIdx] = useState(0);
  const item = ITEMS[idx];

  if (!item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 text-primary">
          <Check className="h-10 w-10" />
        </div>
        <div className="mt-4 text-display text-3xl font-black">Tutto pronto</div>
        <div className="mt-2 text-muted-foreground">Sei configurato per giocare.</div>
        <button onClick={() => navigate('/play')} className="mt-8 rounded-full bg-primary px-8 py-3 font-bold text-primary-foreground hover-elevate">
          Vai alla partita
        </button>
      </div>
    );
  }

  const Icon = item.icon;
  const decide = (s: Status) => {
    setState(prev => ({ ...prev, [item.key]: s }));
    setIdx(i => i + 1);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <MockBanner note="schermata di onboarding — i permessi non sono richiesti realmente" />
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2">
          {ITEMS.map((it, i) => (
            <span key={it.key}
              className={`h-1.5 w-10 rounded-full ${i < idx ? 'bg-primary' : i === idx ? 'bg-primary/60' : 'bg-border'}`} />
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
            <Icon className="h-10 w-10" />
          </div>
          <div className="mt-5 text-display text-3xl font-black">{item.title}</div>
          <div className="mt-2 text-muted-foreground">{item.why}</div>

          <button onClick={() => decide('granted')} className="mt-8 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground hover-elevate">
            Consenti
          </button>
          <button onClick={() => decide('denied')} className="mt-2 w-full rounded-xl border border-border py-3 text-sm font-semibold hover-elevate">
            Salta — guardo soltanto
          </button>
        </div>

        <div className="mt-6 space-y-2 text-xs">
          {ITEMS.map(it => {
            const s = state[it.key];
            return (
              <div key={it.key} className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2">
                <div className="flex items-center gap-2"><it.icon className="h-3.5 w-3.5 text-muted-foreground" /> {it.title}</div>
                <span className={s === 'granted' ? 'text-primary' : s === 'denied' ? 'text-destructive' : 'text-muted-foreground'}>
                  {s === 'granted' ? <Check className="h-4 w-4" /> : s === 'denied' ? <X className="h-4 w-4" /> : 'In attesa'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

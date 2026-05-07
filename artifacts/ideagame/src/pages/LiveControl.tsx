import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { GAMES, TEAMS } from '@/data/mock';
import {
  Pause, Play, SkipForward, Eye, Plus, Minus,
  Power, MonitorOff, X
} from 'lucide-react';

export default function LiveControl() {
  const [, navigate] = useLocation();
  const [gameIdx, setGameIdx] = useState(2);
  const game = GAMES[gameIdx]!;
  const [round, setRound] = useState(3);
  const [time, setTime] = useState(22);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(TEAMS.map(t => [t.id, t.score]))
  );
  const [black, setBlack] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const i = setInterval(() => setTime(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [paused]);

  const adjust = (id: string, delta: number) =>
    setScores(s => ({ ...s, [id]: Math.max(0, (s[id] ?? 0) + delta) }));

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="rounded-full border border-border p-2 hover-elevate">
            <X className="h-4 w-4" />
          </button>
          <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Cockpit animatore</div>
          <button onClick={() => setBlack(b => !b)} className={`rounded-full border p-2 ${black ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border hover-elevate'}`}>
            <MonitorOff className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-3xl border-2 p-6" style={{ borderColor: game.accentColor, background: `${game.accentColor}10` }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">In corso</div>
              <div className="text-display text-2xl font-black" style={{ color: game.accentColor }}>{game.name}</div>
            </div>
            <select value={gameIdx} onChange={e => setGameIdx(+e.target.value)} className="rounded-xl border border-border bg-background/40 px-3 py-2 text-sm">
              {GAMES.map((g, i) => <option key={g.id} value={i}>{g.name}</option>)}
            </select>
          </div>

          <div className="mt-6 flex items-center justify-around">
            <button onClick={() => setRound(r => Math.max(1, r - 1))} className="rounded-full border border-border p-3 hover-elevate"><Minus className="h-5 w-5" /></button>
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Round</div>
              <div className="text-display text-5xl font-black">{round}/{game.settings.rounds}</div>
            </div>
            <button onClick={() => setRound(r => r + 1)} className="rounded-full border border-border p-3 hover-elevate"><Plus className="h-5 w-5" /></button>
          </div>

          <div className="mt-6 grid place-items-center">
            <div className="relative grid h-44 w-44 place-items-center rounded-full border-8 border-primary/30">
              <div className="absolute inset-2 rounded-full border-8 transition-all" style={{ borderColor: game.accentColor, opacity: time > 0 ? 1 : 0.3 }} />
              <div className="text-display text-6xl font-black tabular-nums">{time}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button onClick={() => setTime(t => t + 10)} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">+10s</button>
            <button onClick={() => setPaused(p => !p)} className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover-elevate inline-flex items-center justify-center gap-2">
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Riprendi' : 'Pausa'}
            </button>
            <button onClick={() => setTime(t => Math.max(0, t - 10))} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">−10s</button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Punteggi</div>
          <div className="mt-3 space-y-2">
            {TEAMS.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <div className="flex-1 truncate font-bold">{t.name}</div>
                <button onClick={() => adjust(t.id, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover-elevate"><Minus className="h-4 w-4" /></button>
                <div className="w-12 text-center text-display text-lg font-black tabular-nums">{scores[t.id]}</div>
                <button onClick={() => adjust(t.id, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover-elevate"><Plus className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate inline-flex items-center justify-center gap-2">
            <Eye className="h-4 w-4" /> Rivela
          </button>
          <button onClick={() => setRound(r => r + 1)} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate inline-flex items-center justify-center gap-2">
            <SkipForward className="h-4 w-4" /> Prossimo round
          </button>
        </div>

        <button onClick={() => navigate('/scoreboard')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground hover-elevate">
          <Power className="h-4 w-4" /> Termina e mostra classifica
        </button>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { CheckCircle2, Minus, Plus } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  color: string;
}

interface ScoreRow {
  teamId: string;
  total: number;
}

interface ScorePanelProps {
  teams: Team[];
  scoreboardRows: ScoreRow[];
  busy: boolean;
  sessionRunning: boolean;
  onScore: (teamId: string, delta: number) => void;
}

const QUICK_DELTAS = [-100, -50, -10, +10, +50, +100];

function TeamScoreRow({
  team,
  total,
  busy,
  sessionRunning,
  onScore,
}: {
  team: Team;
  total: number;
  busy: boolean;
  sessionRunning: boolean;
  onScore: (teamId: string, delta: number) => void;
}) {
  const [customVal, setCustomVal] = useState('');
  const [setMode, setSetMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = busy || !sessionRunning;

  const applyCustom = () => {
    const num = parseInt(customVal, 10);
    if (isNaN(num) || num === 0) { setCustomVal(''); return; }
    if (setMode) {
      // Set absolute value: delta = target - current
      onScore(team.id, num - total);
    } else {
      onScore(team.id, num);
    }
    setCustomVal('');
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyCustom();
  };

  return (
    <div
      className="rounded-xl border bg-card/60 p-3 space-y-2.5"
      style={{ borderColor: `${team.color}44` }}
    >
      {/* Row 1: name + total */}
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: team.color }} />
        <span className="flex-1 font-bold truncate text-sm">{team.name}</span>
        <span
          className="text-display text-2xl font-black tabular-nums leading-none"
          style={{ color: team.color }}
        >
          {total}
        </span>
      </div>

      {/* Row 2: quick preset chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {QUICK_DELTAS.map(d => (
          <button
            key={d}
            disabled={disabled}
            onClick={() => onScore(team.id, d)}
            className={`flex-1 min-w-[44px] rounded-lg border py-1.5 text-xs font-bold tabular-nums transition-all hover-elevate disabled:opacity-40 ${
              d < 0
                ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
            }`}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>

      {/* Row 3: custom input */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSetMode(m => !m)}
          className={`shrink-0 rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            setMode
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
          }`}
          title={setMode ? 'Modalità: imposta valore assoluto' : 'Modalità: aggiusta di ±N'}
        >
          {setMode ? '= fisso' : '± delta'}
        </button>

        <div className="flex flex-1 items-center gap-1">
          <button
            disabled={disabled}
            onClick={() => { setCustomVal(v => String((parseInt(v, 10) || 0) - (setMode ? 50 : 10))); }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border hover-elevate disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          <input
            ref={inputRef}
            type="number"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={handleKey}
            placeholder={setMode ? `es. ${total + 100}` : 'es. ±250'}
            disabled={disabled}
            className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40"
          />

          <button
            disabled={disabled}
            onClick={() => { setCustomVal(v => String((parseInt(v, 10) || 0) + (setMode ? 50 : 10))); }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border hover-elevate disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          disabled={disabled || !customVal || customVal === '0'}
          onClick={applyCustom}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover-elevate disabled:opacity-40"
          title="Applica"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      </div>

      {setMode && (
        <div className="text-[10px] text-muted-foreground text-center">
          Imposta punteggio assoluto — delta calcolato automaticamente ({'>'}0 aggiunge, {'<'}0 sottrae)
        </div>
      )}
    </div>
  );
}

export function ScorePanel({ teams, scoreboardRows, busy, sessionRunning, onScore }: ScorePanelProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Punteggi live</div>
        {!sessionRunning && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
            sessione non attiva
          </span>
        )}
      </div>
      <div className="space-y-2">
        {teams.map(tm => {
          const entry = scoreboardRows.find(r => r.teamId === tm.id);
          const total = entry?.total ?? 0;
          return (
            <TeamScoreRow
              key={tm.id}
              team={tm}
              total={total}
              busy={busy}
              sessionRunning={sessionRunning}
              onScore={onScore}
            />
          );
        })}
      </div>
    </div>
  );
}

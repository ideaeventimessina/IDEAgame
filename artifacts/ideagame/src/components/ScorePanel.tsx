import { useState, useRef, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';

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
  /** Must return a Promise so ScorePanel can show success/error feedback */
  onScore: (teamId: string, delta: number) => Promise<void>;
}

const QUICK_POS = [10, 50, 100];
const QUICK_NEG = [-10, -50, -100];

type FeedbackState =
  | { kind: 'success'; label: string }
  | { kind: 'error'; label: string }
  | null;

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
  onScore: (teamId: string, delta: number) => Promise<void>;
}) {
  const [customVal, setCustomVal] = useState('');
  const [setMode, setSetMode] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disabled = busy || localBusy || !sessionRunning;

  const showFeedback = useCallback((fb: FeedbackState) => {
    setFeedback(fb);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback(null), 2200);
  }, []);

  const fire = useCallback(async (delta: number) => {
    if (disabled || delta === 0) return;
    setLocalBusy(true);
    try {
      await onScore(team.id, delta);
      const label = delta > 0 ? `+${delta} pt` : `${delta} pt`;
      showFeedback({ kind: 'success', label });
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Errore API';
      showFeedback({ kind: 'error', label: msg });
    } finally {
      setLocalBusy(false);
    }
  }, [disabled, onScore, showFeedback, team.id]);

  const applyCustom = useCallback(async () => {
    const num = parseInt(customVal, 10);
    if (isNaN(num) || num === 0) { setCustomVal(''); return; }
    const delta = setMode ? num - total : num;
    setCustomVal('');
    await fire(delta);
    inputRef.current?.focus();
  }, [customVal, fire, setMode, total]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void applyCustom(); }
  };

  const canConfirm = !disabled && !!customVal && customVal !== '0';

  return (
    <div
      className="rounded-xl border bg-card/60 p-3 space-y-2.5 transition-all"
      style={{ borderColor: `${team.color}44` }}
    >
      {/* Row 1: name + total + feedback flash */}
      <div className="flex items-center gap-2 min-h-[2rem]">
        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: team.color }} />
        <span className="flex-1 font-bold truncate text-sm">{team.name}</span>

        {feedback ? (
          <span className={`text-sm font-black tabular-nums px-2 py-0.5 rounded-lg transition-all ${
            feedback.kind === 'success'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-destructive/20 text-destructive'
          }`}>
            {feedback.kind === 'success' ? '✓ ' : '✕ '}{feedback.label}
          </span>
        ) : (
          <span
            className="text-display text-2xl font-black tabular-nums leading-none"
            style={{ color: team.color }}
          >
            {total}
          </span>
        )}
      </div>

      {/* Row 2: positive chips */}
      <div className="flex items-center gap-1.5">
        {QUICK_NEG.map(d => (
          <button
            key={d}
            disabled={disabled}
            onClick={() => void fire(d)}
            className="flex-1 rounded-lg border border-destructive/40 bg-destructive/10 py-1.5 text-xs font-bold text-destructive tabular-nums hover:bg-destructive/20 disabled:opacity-40 transition-colors"
          >
            {d}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-0.5" />
        {QUICK_POS.map(d => (
          <button
            key={d}
            disabled={disabled}
            onClick={() => void fire(d)}
            className="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 py-1.5 text-xs font-bold text-green-400 tabular-nums hover:bg-green-500/20 disabled:opacity-40 transition-colors"
          >
            +{d}
          </button>
        ))}
      </div>

      {/* Row 3: custom input — no stepper buttons (they caused mis-clicks) */}
      <div className="flex items-center gap-2">
        {/* Mode toggle */}
        <button
          onClick={() => { setSetMode(m => !m); setCustomVal(''); }}
          className={`shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
            setMode
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
          }`}
          title={setMode ? 'Modalità: imposta valore assoluto totale' : 'Modalità: aggiusta di ±N'}
        >
          {setMode ? '= fisso' : '± delta'}
        </button>

        {/* Free input */}
        <input
          ref={inputRef}
          type="number"
          value={customVal}
          onChange={e => setCustomVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder={setMode ? `es. ${total + 200}` : 'es. ±250'}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40"
        />

        {/* Confirm — well separated from input, full height */}
        <button
          disabled={!canConfirm}
          onClick={() => void applyCustom()}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all ${
            canConfirm
              ? 'bg-primary text-primary-foreground hover:scale-105 shadow-md'
              : 'bg-muted text-muted-foreground opacity-40'
          }`}
          title={setMode ? `Imposta a ${customVal} pt (totale assoluto)` : `Aggiungi ${customVal} pt`}
        >
          <CheckCircle2 className="h-5 w-5" />
        </button>
      </div>

      {setMode && (
        <p className="text-[10px] text-muted-foreground text-center leading-tight">
          Imposta punteggio fisso — il delta viene calcolato automaticamente rispetto al totale attuale ({total} pt)
        </p>
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

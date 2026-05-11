import { useState, type ReactNode } from 'react';

interface ProjectorPreviewProps {
  total: number;
  label?: string;
  accentColor?: string;
  children: (idx: number) => ReactNode;
}

export function ProjectorPreview({
  total,
  label = '🎬 Anteprima proiettore',
  accentColor = '#F5B642',
  children,
}: ProjectorPreviewProps) {
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, Math.max(0, total - 1));

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-background/60 overflow-hidden">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          {label}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30"
          >
            ← Prec
          </button>
          <span className="min-w-[60px] text-center text-xs text-muted-foreground font-mono">
            {safeIdx + 1} / {total}
          </span>
          <button
            onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
            disabled={safeIdx === total - 1}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30"
          >
            Succ →
          </button>
        </div>
      </div>

      {/* Dark slide */}
      <div
        className="relative min-h-[240px]"
        style={{
          background: `radial-gradient(ellipse at 60% 30%, ${accentColor}18 0%, transparent 65%), linear-gradient(135deg, #0d0d0d 0%, #111 100%)`,
        }}
      >
        {/* Hex bg decoration */}
        <div className="absolute inset-0 overflow-hidden opacity-[0.04] pointer-events-none select-none">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className="absolute text-[140px] leading-none"
              style={{ top: `${(i % 3) * 38}%`, left: `${(i % 4) * 28}%`, color: accentColor }}
            >
              ⬡
            </div>
          ))}
        </div>
        <div className="relative z-10">{children(safeIdx)}</div>
      </div>
    </div>
  );
}

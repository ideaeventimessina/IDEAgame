import { AlertTriangle } from 'lucide-react';

export function MockBanner({ note }: { note?: string }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-300 backdrop-blur">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>Mock UI — non collegata al backend{note ? ` · ${note}` : ''}</span>
    </div>
  );
}

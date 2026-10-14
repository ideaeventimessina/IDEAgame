/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { Users, Settings } from 'lucide-react';

/**
 * Intestazione condivisa delle schermate "show" (tavola 05 dei mockup).
 * Sinistra: badge numerato della vista. Centro: logo Johhy + wordmark IDEAGAME.
 * Destra: azioni (giocatori, impostazioni, avatar conduttore).
 */
export function ShellHeader({
  num,
  label,
  onPlayers,
  onSettings,
  onProfile,
}: {
  num: string;
  label: string;
  onPlayers?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
}) {
  return (
    <header
      className="relative z-20 flex items-center justify-between"
      style={{ padding: '14px clamp(14px, 2.2vw, 30px)' }}
    >
      {/* badge vista */}
      <div
        className="flex items-center gap-2 rounded-xl"
        style={{
          padding: '5px 14px 5px 6px',
          background: 'rgba(13,13,25,0.72)',
          border: '1px solid rgba(230,184,92,0.45)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}
      >
        <span
          className="grid place-items-center rounded-lg font-extrabold"
          style={{
            width: 30,
            height: 30,
            background: 'linear-gradient(180deg,#FCE08B 0%,#E6B85C 100%)',
            color: '#1a1205',
            fontSize: 15,
          }}
        >
          {num}
        </span>
        <span
          className="font-extrabold tracking-wide"
          style={{ color: '#F7F3E8', fontSize: 16, letterSpacing: '0.04em' }}
        >
          {label}
        </span>
      </div>

      {/* logo centrale */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 select-none">
        <img
          src="/brand/logo-glasses.png"
          alt=""
          aria-hidden
          style={{ height: 34, width: 'auto' }}
          draggable={false}
        />
        <span
          className="hidden min-[520px]:inline font-black"
          style={{
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontSize: 26,
            letterSpacing: '0.02em',
            color: '#F7F3E8',
          }}
        >
          IDEAGAME
        </span>
      </div>

      {/* azioni */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlayers}
          aria-label="Giocatori"
          className="grid place-items-center rounded-full transition-colors"
          style={{ width: 40, height: 40, color: '#E6B85C', background: 'rgba(255,255,255,0.04)' }}
        >
          <Users size={20} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Impostazioni"
          className="grid place-items-center rounded-full transition-colors"
          style={{ width: 40, height: 40, color: '#E6B85C', background: 'rgba(255,255,255,0.04)' }}
        >
          <Settings size={20} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={onProfile}
          aria-label="Profilo conduttore"
          className="overflow-hidden rounded-full"
          style={{ width: 40, height: 40, border: '2px solid #E6B85C', background: '#0d0d19' }}
        >
          <img
            src="/jonny-master-nobg.png"
            alt=""
            aria-hidden
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%' }}
            draggable={false}
          />
        </button>
      </div>
    </header>
  );
}

export default ShellHeader;

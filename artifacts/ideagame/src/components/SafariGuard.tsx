/**
 * SafariGuard — shared browser gate for join entry points.
 * Renders a blocking screen on iOS Chrome / Firefox iOS / in-app browsers.
 * Must appear BEFORE the nickname input so the user sees it immediately.
 *
 * Used by:
 *   /join/:code   (JoinPage)
 *   /home/join    (HomeJoin — phase 'nickname')
 *
 * Does NOT mention sensors, Sfida di Ballo, or any gameplay detail.
 */
import { useState, type ReactNode } from 'react';

const BLOCKED_TOKENS = ['CriOS', 'FxiOS', 'Instagram', 'FBAN', 'FBAV'] as const;

export function isBrowserBlocked(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const hasBlockedToken = BLOCKED_TOKENS.some(t => ua.includes(t));
  const isSafari = ua.includes('Safari') && !ua.includes('CriOS') && !ua.includes('FxiOS');
  return hasBlockedToken && !isSafari;
}

const STEPS = [
  'Copia il link',
  'Apri Safari',
  'Incolla il link nella barra indirizzi',
  'Premi Vai',
] as const;

interface Props {
  children: ReactNode;
}

/**
 * If the browser is blocked, renders the "Apri con Safari" screen.
 * Otherwise renders children unchanged.
 */
export function SafariGuard({ children }: Props) {
  const blocked = isBrowserBlocked();
  const [showSteps, setShowSteps] = useState(false);
  const [copied,    setCopied]    = useState(false);

  if (!blocked) return <>{children}</>;

  const handleCopy = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      /* clipboard blocked — no-op */
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#030010',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 28px', gap: 20,
      textAlign: 'center',
      overflowY: 'auto',
      fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif",
    }}>

      {/* Background glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 100%,rgba(245,182,66,0.12) 0%,rgba(60,20,120,0.35) 45%,#030010 70%)',
      }}/>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 340 }}>

        {/* Icon */}
        <div style={{ fontSize: 56 }}>🧭</div>

        {/* Title */}
        <div style={{
          fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1.25,
          letterSpacing: '-0.01em',
        }}>
          Apri con Safari
        </div>

        {/* Body */}
        <div style={{
          fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65,
          maxWidth: 280,
        }}>
          Per continuare, apri questo link con Safari.
        </div>

        {/* Primary — Copia link */}
        <button
          onClick={handleCopy}
          style={{
            width: '100%', padding: '16px 20px',
            borderRadius: 18, border: 'none',
            background: copied
              ? 'linear-gradient(135deg,#16a34a,#15803d)'
              : 'linear-gradient(135deg,#F5B642,#E09020)',
            color: '#fff', fontSize: 17, fontWeight: 900,
            cursor: 'pointer', letterSpacing: '0.01em',
            boxShadow: copied
              ? '0 0 30px rgba(22,163,74,0.4)'
              : '0 0 30px rgba(245,182,66,0.4)',
            transition: 'background 0.3s, box-shadow 0.3s',
          }}>
          {copied ? '✅ Link copiato!' : '📋 Copia link'}
        </button>

        {/* Secondary — Mostra istruzioni */}
        <button
          onClick={() => setShowSteps(s => !s)}
          style={{
            width: '100%', padding: '14px 20px',
            borderRadius: 18, border: '2px solid rgba(245,182,66,0.35)',
            background: 'rgba(245,182,66,0.07)',
            color: 'rgba(245,182,66,0.85)', fontSize: 15, fontWeight: 800,
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}>
          {showSteps ? '▲ Nascondi istruzioni' : 'Mostra istruzioni'}
        </button>

        {/* Instruction steps */}
        {showSteps && (
          <div style={{
            width: '100%',
            background: 'rgba(245,182,66,0.06)',
            border: '1px solid rgba(245,182,66,0.2)',
            borderRadius: 16, padding: '18px 20px',
            textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  minWidth: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(245,182,66,0.2)',
                  border: '1.5px solid rgba(245,182,66,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 900, color: '#F5B642', flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, paddingTop: 4 }}>
                  {step}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

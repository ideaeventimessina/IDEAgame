/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import type { CSSProperties, ReactNode } from 'react';

/**
 * Palco "show" condiviso (tavola 05): fondo studio scuro con bagliori oro caldi,
 * lieve alone viola in alto e vignettatura. Ricostruito in CSS (nessun asset) per
 * restare autonomo e leggero; approssima la scena dipinta dei mockup.
 */
export function ShowStage({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        minHeight: '100dvh',
        overflow: 'hidden',
        background: '#08070f',
        fontFamily: "'Outfit', system-ui, sans-serif",
        ...style,
      }}
    >
      {/* strati di luce */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: [
            // alone viola in alto
            'radial-gradient(60% 45% at 50% -8%, rgba(99,47,170,0.38), transparent 70%)',
            // riflettori oro laterali
            'radial-gradient(38% 60% at 2% 40%, rgba(230,184,92,0.16), transparent 70%)',
            'radial-gradient(38% 60% at 98% 42%, rgba(230,184,92,0.14), transparent 70%)',
            // pavimento caldo
            'radial-gradient(90% 55% at 50% 118%, rgba(236,177,90,0.30), transparent 72%)',
            // base
            'radial-gradient(120% 90% at 50% 20%, #15111f 0%, #0b0911 55%, #060509 100%)',
          ].join(','),
        }}
      />
      {/* bokeh oro soffuso */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.5,
          background: [
            'radial-gradient(circle 3px at 12% 82%, rgba(253,227,135,0.9), transparent 60%)',
            'radial-gradient(circle 2px at 20% 90%, rgba(253,227,135,0.7), transparent 60%)',
            'radial-gradient(circle 4px at 84% 86%, rgba(253,227,135,0.8), transparent 60%)',
            'radial-gradient(circle 2px at 92% 78%, rgba(253,227,135,0.6), transparent 60%)',
            'radial-gradient(circle 3px at 50% 94%, rgba(253,227,135,0.7), transparent 60%)',
            'radial-gradient(circle 2px at 70% 92%, rgba(253,227,135,0.55), transparent 60%)',
          ].join(','),
        }}
      />
      {/* vignettatura */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 180px 60px rgba(0,0,0,0.65)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

export default ShowStage;

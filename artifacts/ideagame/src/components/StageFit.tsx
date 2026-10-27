/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Palco a dimensioni fisse (metodo "schermata fissa" della skill mockup-replica):
 * costruisce il contenuto alla larghezza di progetto e lo scala con transform
 * per riempire il viewport mantenendo le proporzioni. Evita reflow e rewrap del
 * testo, così la composizione resta identica al mockup a qualunque risoluzione.
 *
 * Su viewport molto stretti/alti (telefono) il contenuto va comunque riflussato:
 * passare `reflow` per saltare lo scaling e impilare in verticale.
 */
export function StageFit({
  designW,
  designH,
  children,
  reflowAt = 0,
}: {
  designW: number;
  designH: number;
  children: ReactNode;
  /** sotto questa larghezza di viewport (px) si disattiva lo scaling (telefono) */
  reflowAt?: number;
}) {
  const [scale, setScale] = useState(1);
  const [reflow, setReflow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Misura il VIEWPORT reale (non il genitore: con minHeight:100dvh può crescere
    // oltre lo schermo e falsare la scala -> interfaccia "zoomata"/instabile).
    const compute = () => {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      if (reflowAt && vw < reflowAt) { setReflow(true); return; }
      setReflow(false);
      // Altezza REALE del contenuto (≥ designH): se il palco cresce — un campo in
      // più, un testo più lungo, un viewport basso — scaliamo su quella e NON
      // tagliamo mai in basso. offsetHeight/scrollHeight non risentono del transform.
      const contentH = Math.max(designH, innerRef.current?.scrollHeight ?? designH);
      const next = Math.min(vw / designW, vh / contentH);
      setScale(prev => (Math.abs(prev - next) > 0.004 ? next : prev));
    };
    compute();
    const raf = requestAnimationFrame(compute);        // ricalcola dopo il layout/font
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null;
    if (ro && innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', compute);
    window.visualViewport?.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', compute);
      window.visualViewport?.removeEventListener('resize', compute);
    };
  }, [designW, designH, reflowAt]);

  if (reflow) {
    return (
      <div ref={ref} style={{ width: '100%', minHeight: '100dvh' }}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',   // àncora al viewport: palco sempre centrato e scalato sullo schermo visibile
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: designW,
          minHeight: designH,
          height: 'auto',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default StageFit;

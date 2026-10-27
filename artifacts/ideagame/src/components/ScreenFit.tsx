/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface ScreenFitProps {
  children: ReactNode;
  /** Scala massima: il contenuto che già entra non viene mai ingrandito oltre questa (default 1). */
  maxScale?: number;
  /** Padding di sicurezza in px sottratto allo spazio disponibile su ogni lato (default 0). */
  pad?: number;
  /** Allineamento verticale del contenuto scalato nell'area disponibile (default 'center'). */
  align?: 'center' | 'start' | 'end';
  className?: string;
  style?: CSSProperties;
}

/**
 * ScreenFit — garantisce che il contenuto entri SEMPRE in UNA sola schermata, senza scroll.
 *
 * Misura la dimensione NATURALE del contenuto (offsetWidth/Height, immuni al transform)
 * e, se eccede lo spazio disponibile in altezza o larghezza, applica `transform: scale()`
 * per farlo rientrare. Non ingrandisce mai oltre `maxScale`: ciò che già sta dentro resta
 * identico. Si ri-misura quando cambia il viewport o il contenuto (ResizeObserver), quindi
 * una domanda lunga o un elenco di giocatori che cresce non spingono più nulla fuori schermo.
 *
 * Uso tipico: wrappare il corpo di una schermata (TV / regìa / telefono) dentro un contenitore
 * a dimensione nota (es. flex:1 minHeight:0, oppure height:100%).
 */
export function ScreenFit({ children, maxScale = 1, pad = 0, align = 'center', className, style }: ScreenFitProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const availW = Math.max(1, outer.clientWidth - pad * 2);
        const availH = Math.max(1, outer.clientHeight - pad * 2);
        // offsetWidth/Height NON risentono del transform → dimensione naturale stabile, niente loop.
        const natW = inner.offsetWidth || 1;
        const natH = inner.offsetHeight || 1;
        const next = Math.min(maxScale, availW / natW, availH / natH);
        setScale(prev => (Math.abs(prev - next) > 0.003 ? next : prev));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [maxScale, pad]);

  const justify = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center';
  const origin = align === 'start' ? 'top center' : align === 'end' ? 'bottom center' : 'center center';

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        ...style,
      }}
    >
      <div ref={innerRef} style={{ flex: '0 0 auto', transform: `scale(${scale})`, transformOrigin: origin }}>
        {children}
      </div>
    </div>
  );
}

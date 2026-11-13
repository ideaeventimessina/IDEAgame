/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Kit UI Casinò — primitive React condivise (redesign 2026-11) ───────────────
   Shell + header ruolo fedeli ai mockup approvati. Tutto vive sotto `.cas` (vedi
   casino-ui.css): niente stili globali, non tocca gli altri giochi. Riusato da
   telefoni, regie, monitor e dealer del casinò. */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import './casino-ui.css';

const BASE = (import.meta.env.BASE_URL as string) || '/';
export const CAS_LOGO = BASE + 'casino/logo-originale.png';

/* Tutto schermo "come un'app" senza pulsanti: al PRIMO tocco entra in fullscreen dove si può
   (Android, e Firefox del maxi-schermo → via anche la barra URL). Su iPhone l'API fullscreen non
   esiste per le pagine: è un no-op, il vero fullscreen lì è "Aggiungi a Home" (meta nell'index). */
export function useFullscreenOnFirstGesture() {
  useEffect(() => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const go = () => {
      try {
        const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
        if (req && !document.fullscreenElement) req.call(el)?.catch?.(() => { /* negato: pazienza */ });
      } catch { /* */ }
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go, { once: true });
    return () => window.removeEventListener('pointerdown', go);
  }, []);
}

/* Shell telefono: header ruolo (logo + occhiello + titolo) + corpo centrato 490px. */
export function CasPhone({ eyebrow, title, children, footer }: { eyebrow: string; title: string; children: ReactNode; footer?: ReactNode }) {
  useFullscreenOnFirstGesture();
  return (
    <div className="cas phone">
      <header className="cashead">
        <img src={CAS_LOGO} alt="IDEAeventi" />
        <div><small className="eyebrow">{eyebrow}</small><h1>{title}</h1></div>
      </header>
      <main className="casmain">{children}</main>
      {footer}
    </div>
  );
}

/* Shell schermo largo (regia / monitor / dealer): header + main max 1550px. */
export function CasScreen({ eyebrow, title, children, right }: { eyebrow: string; title: string; children: ReactNode; right?: ReactNode }) {
  useFullscreenOnFirstGesture();
  return (
    <div className="cas">
      <header className="cashead">
        <img src={CAS_LOGO} alt="IDEAeventi" />
        <div><small className="eyebrow">{eyebrow}</small><h1>{title}</h1></div>
        {right}
      </header>
      <main className="casmain">{children}</main>
    </div>
  );
}

/* Riga occhiello + badge in alto a ogni schermata (stato corrente). */
export function Hero({ label, badge }: { label: string; badge?: ReactNode }) {
  return (
    <div className="hero row spread">
      <small className="eyebrow">{label}</small>
      {badge != null && <span className="badge">{badge}</span>}
    </div>
  );
}

/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Kit UI Casinò — primitive React condivise (redesign 2026-11) ───────────────
   Shell + header ruolo fedeli ai mockup approvati. Tutto vive sotto `.cas` (vedi
   casino-ui.css): niente stili globali, non tocca gli altri giochi. Riusato da
   telefoni, regie, monitor e dealer del casinò. */

import type { ReactNode } from 'react';
import './casino-ui.css';

const BASE = (import.meta.env.BASE_URL as string) || '/';
export const CAS_LOGO = BASE + 'casino/logo-originale.png';

/* Shell telefono: header ruolo (logo + occhiello + titolo) + corpo centrato 490px. */
export function CasPhone({ eyebrow, title, children, footer }: { eyebrow: string; title: string; children: ReactNode; footer?: ReactNode }) {
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

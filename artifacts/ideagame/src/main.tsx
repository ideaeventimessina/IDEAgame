import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── iOS viewport-zoom reset ────────────────────────────────────────────────────
// When an iOS keyboard dismisses it can leave the viewport zoomed in.
// On every focusout (input blur) we restore scroll position so the layout snaps back.
// The 100ms rAF delay lets iOS finish its own scroll-restore first.
document.addEventListener('focusout', () => {
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }, 100);
  });
}, true);

createRoot(document.getElementById("root")!).render(<App />);

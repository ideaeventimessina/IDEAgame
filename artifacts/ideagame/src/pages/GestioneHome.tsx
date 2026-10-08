/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — landing ─────────────────────────────────────────────
   Ingresso isolato dai party game: scegli Burraco o Casinò (con i loghi IDEA
   EVENTI), crea una serata o entra con un codice. ──────────────────────────── */

import { useState } from 'react';
import { useLocation } from 'wouter';

const API = (import.meta.env.BASE_URL as string || '/') + 'api';
const ASSET = (import.meta.env.BASE_URL as string) || '/';
const GOLD = '#E8B24C';

// Logo del brand con fallback tipografico finché il file non è caricato.
function BrandImg({ src, fallbackTop, fallbackBottom, h }: { src: string; fallbackTop: string; fallbackBottom: string; h: number }) {
  const [ok, setOk] = useState(true);
  if (ok) return <img src={`${ASSET}${src}`} alt={`${fallbackTop} ${fallbackBottom}`} onError={() => setOk(false)} style={{ maxHeight: h, maxWidth: '82%', objectFit: 'contain' }} />;
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontWeight: 900, fontSize: h * 0.18, color: '#fff' }}>IDEA <span style={{ color: GOLD }}>EVENTI</span></div>
      <div style={{ fontWeight: 900, fontSize: h * 0.3, color: GOLD, letterSpacing: '0.05em', textShadow: `0 2px 12px ${GOLD}66` }}>{fallbackBottom}</div>
    </div>
  );
}

export default function GestioneHome() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const createBurraco = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/gestione/burraco/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Serata Burraco' }) });
      const s = await r.json();
      navigate(`/gestione/burraco?code=${s.masterCode}`);
    } finally { setBusy(false); }
  };
  const createCasino = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/gestione/casino/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'IDEACASINO' }) });
      const s = await r.json();
      navigate(`/gestione/casino?code=${s.masterCode}`);
    } finally { setBusy(false); }
  };
  const enter = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setErr(''); setBusy(true);
    try {
      const rb = await fetch(`${API}/gestione/burraco/resolve/${c}`);
      if (rb.ok) { navigate(`/gestione/burraco?code=${c}`); return; }
      const rc = await fetch(`${API}/gestione/casino/resolve/${c}`);
      if (rc.ok) { navigate(`/gestione/casino?code=${c}`); return; }
      setErr('Codice non trovato');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -10%, #1a3d30, #0a1a14 55%, #060d0a 100%)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: 24, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 900, letterSpacing: '0.01em' }}>Gestione Serate</div>
        <div style={{ opacity: 0.6, marginTop: 6, fontSize: 16 }}>IDEA Eventi — Burraco &amp; Casinò in tempo reale</div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 820 }}>
        <ModeCard onClick={createBurraco} disabled={busy} accent="#34D399" bg="linear-gradient(165deg,#0f3d2e,#09241b)">
          <BrandImg src="ideaeventi-burraco-logo.png" fallbackTop="IDEA EVENTI" fallbackBottom="BURRACO" h={150} />
          <div style={{ opacity: 0.75, fontSize: 14, marginTop: 10 }}>Torneo a coppie · tavoli, turni, classifica live</div>
        </ModeCard>
        <ModeCard onClick={createCasino} disabled={busy} accent={GOLD} bg="linear-gradient(165deg,#2b1c06,#140c03)">
          <BrandImg src="ideaeventi-logo.png" fallbackTop="IDEA EVENTI" fallbackBottom="CASINÒ" h={150} />
          <div style={{ opacity: 0.75, fontSize: 14, marginTop: 10 }}>Fiche, cassa, roulette sui tavoli 80″</div>
        </ModeCard>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()}
          placeholder="Hai un codice? Entra"
          style={{ padding: '13px 18px', borderRadius: 12, border: '1px solid #ffffff33', background: '#ffffff11', color: '#fff', fontSize: 16, width: 240, textAlign: 'center', letterSpacing: '0.12em', textTransform: 'uppercase' }} />
        <button onClick={enter} disabled={busy} style={{ padding: '13px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(180deg,#F4CE72,#CE9633)', color: '#231503', fontWeight: 900, cursor: 'pointer', fontSize: 16 }}>Entra</button>
      </div>
      {err && <div style={{ color: '#f87171', fontWeight: 700 }}>{err}</div>}
    </div>
  );
}

function ModeCard({ children, onClick, disabled, accent, bg }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; accent: string; bg: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ flex: '1 1 330px', minHeight: 300, borderRadius: 26, border: `2px solid ${accent}55`, background: bg, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 28, boxShadow: `0 20px 60px #0007, inset 0 0 80px ${accent}10` }}>
      {children}
    </button>
  );
}

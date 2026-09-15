/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — landing ─────────────────────────────────────────────
   Punto d'ingresso isolato dai party game: scegli Burraco o Casinò, crea una
   serata o entra con un codice. ──────────────────────────────────────────── */

import { useState } from 'react';
import { useLocation } from 'wouter';

const API = (import.meta.env.BASE_URL as string || '/') + 'api';

export default function GestioneHome() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

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
      const r = await fetch(`${API}/gestione/casino/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Serata Casinò' }) });
      const s = await r.json();
      navigate(`/gestione/casino?code=${s.masterCode}`);
    } finally { setBusy(false); }
  };
  const [err, setErr] = useState('');
  const enter = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setErr(''); setBusy(true);
    try {
      // Prova Burraco, poi Casinò: reindirizza al gioco giusto col codice.
      const rb = await fetch(`${API}/gestione/burraco/resolve/${c}`);
      if (rb.ok) { navigate(`/gestione/burraco?code=${c}`); return; }
      const rc = await fetch(`${API}/gestione/casino/resolve/${c}`);
      if (rc.ok) { navigate(`/gestione/casino?code=${c}`); return; }
      setErr('Codice non trovato');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #14082e, #070318 60%)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 20, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '0.02em' }}>🎴 Gestione Serate</div>
        <div style={{ opacity: 0.6, marginTop: 6, fontSize: 16 }}>Burraco &amp; Casinò — punteggi in tempo reale</div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 720 }}>
        <button onClick={createBurraco} disabled={busy}
          style={{ flex: '1 1 300px', minHeight: 180, borderRadius: 24, border: '2px solid #34D39966', background: 'linear-gradient(160deg,#0f3d2e,#0a2620)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ fontSize: 56 }}>🃏</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#34D399' }}>BURRACO</div>
          <div style={{ opacity: 0.7, fontSize: 14, marginTop: 4 }}>Torneo a coppie, tavoli a rotazione</div>
        </button>
        <button onClick={createCasino} disabled={busy}
          style={{ flex: '1 1 300px', minHeight: 180, borderRadius: 24, border: '2px solid #F5B64266', background: 'linear-gradient(160deg,#3d2a08,#241806)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ fontSize: 56 }}>🎰</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#F5B642' }}>CASINÒ</div>
          <div style={{ opacity: 0.7, fontSize: 14, marginTop: 4 }}>Gestione fish, cassa e classifiche</div>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()}
          placeholder="Hai un codice? Entra"
          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #ffffff33', background: '#ffffff11', color: '#fff', fontSize: 16, width: 220, textAlign: 'center', letterSpacing: '0.15em', textTransform: 'uppercase' }} />
        <button onClick={enter} style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 16 }}>Entra</button>
      </div>
      {err && <div style={{ color: '#f87171', fontWeight: 700 }}>{err}</div>}
    </div>
  );
}

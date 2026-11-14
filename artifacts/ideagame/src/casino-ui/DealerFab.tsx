/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Pulsanti dealer: QR nuovi giocatori + Schermo pieno ─────────────────────────
   Due pulsanti flottanti (in basso a destra, vicino ai comandi del dealer) su OGNI
   schermata dealer:
   · 📷 apre/chiude al volo un QR provvisorio con cui i NUOVI giocatori entrano alla
     serata (link ?code=<joinCode> → selfie + nome). Si apre e si chiude con un clic.
   · ⛶ entra/esce dallo schermo pieno (via la barra URL per tutta la serata).
   Il joinCode arriva da /dealer-join/<dealerCode> (vale per ogni tipo di dealer). */

import { useEffect, useState, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API = (import.meta.env.BASE_URL as string || '/') + 'api';
const ORIGIN = window.location.origin + (import.meta.env.BASE_URL as string || '/');

export function DealerFab({ dealerCode }: { dealerCode: string }) {
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/gestione/casino/dealer-join/${encodeURIComponent(dealerCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d?.joinCode) setJoinCode(d.joinCode); })
      .catch(() => { /* */ });
    return () => { alive = false; };
  }, [dealerCode]);

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFs = () => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (document.fullscreenElement) document.exitFullscreen?.();
      else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)?.catch?.(() => { /* negato */ });
    } catch { /* */ }
  };

  const joinUrl = joinCode ? `${ORIGIN}gestione/casino?code=${joinCode}` : '';
  const fab: CSSProperties = {
    width: 54, height: 54, borderRadius: '50%', border: '2px solid #e5c680',
    background: 'radial-gradient(circle at 50% 35%,#14352a,#06140d)', color: '#ffe9a6',
    fontSize: 24, cursor: 'pointer', display: 'grid', placeItems: 'center',
    boxShadow: '0 4px 14px #000a, inset 0 1px 0 #ffffff14', lineHeight: 1,
  };

  return (
    <>
      <div style={{ position: 'fixed', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 9000 }}>
        {joinCode && (
          <button style={fab} onClick={() => setShowQr(v => !v)} title="QR nuovi giocatori" aria-label="QR nuovi giocatori">📷</button>
        )}
        <button style={fab} onClick={toggleFs} title={isFs ? 'Esci da schermo pieno' : 'Schermo pieno'} aria-label="Schermo pieno">{isFs ? '🡼' : '⛶'}</button>
      </div>

      {showQr && joinUrl && (
        <div onClick={() => setShowQr(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9001, background: 'rgba(2,10,6,.86)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'linear-gradient(160deg,#10251d,#06140d)', border: '2px solid #e5c680', borderRadius: 18, padding: 24, textAlign: 'center', maxWidth: 420, boxShadow: '0 12px 40px #000' }}>
            <div style={{ color: '#e5c680', font: '700 clamp(20px,3vw,30px)/1.1 "Cinzel Cas",Georgia,serif', marginBottom: 6 }}>Nuovo giocatore?</div>
            <div style={{ color: '#bac9b9', fontSize: 14, marginBottom: 16 }}>Inquadra per entrare alla serata (selfie + nome)</div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, display: 'inline-block' }}>
              <QRCodeSVG value={joinUrl} size={Math.min(300, Math.max(180, window.innerWidth * 0.5))} />
            </div>
            <div style={{ color: '#8ea69a', fontSize: 12, marginTop: 14 }}>Tocca fuori per chiudere</div>
          </div>
        </div>
      )}
    </>
  );
}

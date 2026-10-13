/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Fumetto UNICO di Johhy. Mostra ESATTAMENTE il testo pronunciato, un segmento-frase
   per volta, sincronizzato sul clock dell'audio reale (niente effetto macchina da
   scrivere). Fondo scuro quasi opaco, bordo oro, testo crema; max 2–3 righe. Si
   ancora al personaggio e NON va mai sopra risposte/numeri/QR/timer (il layout
   riserva lo spazio). In mute il testo resta leggibile senza finta bocca parlante;
   in errore audio mostra comunque il testo. Sostituisce JonnyLayer/JonnyMessage/JonnyWaiting. */

import { useEffect, useRef, useState } from 'react';
import { useJonnySpeaking } from '@/hooks/useJonnyVoice';
import { segmentText, activeSegment, JOHHY_NAME } from './johhy';

export interface JohhyBubbleProps {
  /** 'monitor' (1920 ref: 320–420px, 24–30px) o 'phone' (font 16–18px). */
  variant?: 'monitor' | 'phone';
  /** Testo da mostrare quando Johhy NON sta parlando (es. caption muta o ultimo messaggio). */
  message?: string | null;
  /** Mostra "Rileggi" e lo invoca (ripete la battuta corrente). */
  onReplay?: () => void;
  /** Permette di chiudere il fumetto (accessibilità / mute). */
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function JohhyBubble({ variant = 'monitor', message = null, onReplay, onClose, className, style }: JohhyBubbleProps) {
  const voice = useJonnySpeaking();
  const [visible, setVisible] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null); // testo che resta 2s dopo la fine
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // segmento attivo sul clock audio (fonte = testo esatto pronunciato)
  const segs = voice.text ? segmentText(voice.text, voice.durMs) : [];
  const seg = voice.speaking ? activeSegment(segs, voice.timeMs) : null;

  useEffect(() => {
    if (voice.speaking && voice.text) {
      if (lingerRef.current) { clearTimeout(lingerRef.current); lingerRef.current = null; }
      setFrozen(null);
      setVisible(true);
    } else if (visible && !message) {
      // fine/salto: resta 2s col testo completo, poi scompare (Rileggi resta accessibile)
      setFrozen((f) => f ?? voice.text ?? seg?.text ?? null);
      if (!lingerRef.current) lingerRef.current = setTimeout(() => { setVisible(false); setFrozen(null); lingerRef.current = null; }, 2000);
    }
    return () => { /* timer ripulito al prossimo cambio o unmount */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.speaking, voice.text]);

  useEffect(() => () => { if (lingerRef.current) clearTimeout(lingerRef.current); }, []);

  const shown = seg?.text ?? frozen ?? message ?? null;
  const show = (voice.speaking && !!seg) || (!!frozen) || (!!message);
  if (!show || !shown) return null;

  const phone = variant === 'phone';
  const C = phone
    ? { w: 'min(78vw, 300px)', font: 17, pad: '10px 13px', char: 72, radius: 14 }
    : { w: 'clamp(320px, 23vw, 420px)', font: 27, pad: '14px 18px', char: 96, radius: 18 };

  return (
    <div
      className={className}
      style={{
        position: 'relative', width: C.w, maxWidth: '92vw',
        background: 'rgba(8,10,20,0.94)', border: '2px solid #e8c879', borderRadius: C.radius,
        boxShadow: '0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,235,160,.12)',
        padding: C.pad, color: '#f4ecd8', fontFamily: 'Georgia, "Times New Roman", serif',
        animation: 'johhyBubbleIn .28s cubic-bezier(.2,.85,.3,1) both', ...style,
      }}
      role="status" aria-live="polite" aria-label={`${JOHHY_NAME} dice: ${shown}`}
    >
      <style>{`@keyframes johhyBubbleIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ font: `700 ${phone ? 12 : 14}px/1 Georgia, serif`, letterSpacing: '.12em', textTransform: 'uppercase', background: 'linear-gradient(180deg,#fff3c2,#ffe08a 55%,#e4ad4b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{JOHHY_NAME}</span>
        {voice.speaking && <SpeakingDots />}
        {!voice.speaking && <span style={{ fontSize: phone ? 10 : 12, color: '#9aa' }}>· testo</span>}
      </div>
      <div style={{ font: `400 ${C.font}px/1.3 Georgia, serif`, maxHeight: `${C.font * 1.3 * 3}px`, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {shown}
      </div>
      {(onReplay || onClose) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
          {onReplay && <button onClick={onReplay} style={btn(phone)}>↺ Rileggi</button>}
          {onClose && <button onClick={onClose} style={btn(phone)}>Chiudi</button>}
        </div>
      )}
    </div>
  );
}

function btn(phone: boolean): React.CSSProperties {
  return {
    font: `600 ${phone ? 12 : 14}px/1 Georgia, serif`, color: '#ffe9a6', cursor: 'pointer',
    background: 'rgba(255,235,160,.08)', border: '1px solid rgba(232,200,121,.5)',
    borderRadius: 8, padding: phone ? '5px 9px' : '6px 12px',
  };
}

function SpeakingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      <style>{`@keyframes johhyDot{0%,80%,100%{transform:scale(.5);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#e8c879', animation: `johhyDot 1s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </span>
  );
}

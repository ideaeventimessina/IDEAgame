/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * UpgradeLive — /passa-a-live
 * Pagina di conversione: spiega cosa sblocca la modalità Live e avvia il pagamento
 * con carta (Stripe). Il checkout parte dal backend /api/billing/checkout; finché
 * Stripe non è configurato (chiavi + prezzo), il bottone mostra "presto disponibile"
 * e rimanda al login/registrazione. Nessuna cassa finta: se non è configurato, si dice.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ChevronLeft, Sparkles, Mic2, Lock, Bot, Music, Check } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

const UNLOCKS = [
  { Icon: Bot,   t: 'Intelligenza Artificiale', d: 'Domande, canzoni e sfide infinite generate al momento: partite sempre diverse.' },
  { Icon: Lock,  t: 'Adult per il club',        d: 'Livelli 4 e 5 espliciti, obblighi veri, musica per livello, preferiti segreti.' },
  { Icon: Mic2,  t: 'Karaoke Live',             d: 'Il karaoke con video, code e votazioni per gestire una serata intera.' },
  { Icon: Music, t: 'Tutto il resto',           d: 'Lockdown, contenuti curati, la voce di Jonny e la musica su misura.' },
];

export default function UpgradeLive() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const startCheckout = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${BASE}api/billing/checkout`.replace(/([^:])\/\//g, '$1/'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ plan: 'live' }),
      });
      const d = await r.json().catch(() => ({})) as { url?: string; configured?: boolean; error?: string };
      if (d.url) { window.location.href = d.url; return; }             // → Stripe Checkout
      if (d.configured === false) { setMsg('Il pagamento online sarà attivo a breve. Nel frattempo accedi con il tuo login o richiedi l\'accesso Live.'); return; }
      setMsg(d.error ?? 'Al momento non riesco ad avviare il pagamento. Riprova.');
    } catch {
      setMsg('Errore di rete. Riprova tra poco.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0b0620', color: '#fff', fontFamily: "'Outfit','Space Grotesk',sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 18px 48px' }}>
        <button onClick={() => navigate('/mode-select')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 100,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)',
            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
          <ChevronLeft size={14}/> Modalità
        </button>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginTop: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.35), rgba(168,85,247,0.08))', border: '2px solid rgba(168,85,247,0.6)', marginBottom: 14 }}>
            <Sparkles size={34} color="#C084FC" />
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '0.02em' }}>Passa a Live</h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', marginTop: 6, fontSize: '0.95rem', lineHeight: 1.5 }}>
            La modalità Home è gratis e sempre aperta. Con <b style={{ color: '#C084FC' }}>Live</b> sblocchi tutto:
            il gioco diventa infinito e pronto per eventi, feste e club.
          </p>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 26 }}>
          {UNLOCKS.map(({ Icon, t, d }) => (
            <div key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 14 }}>
              <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: 'rgba(168,85,247,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color="#C084FC" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>{t}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', lineHeight: 1.4 }}>{d}</div>
              </div>
              <Check size={18} color="#4ADE80" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          ))}
        </div>

        <button onClick={() => void startCheckout()} disabled={loading}
          style={{ width: '100%', marginTop: 26, padding: '1rem', borderRadius: 100, border: 'none', cursor: loading ? 'wait' : 'pointer',
            background: 'linear-gradient(135deg,#A855F7,#7c3aed)', color: '#fff', fontWeight: 900, fontSize: '1.05rem',
            letterSpacing: '0.04em', boxShadow: '0 0 40px rgba(168,85,247,0.45)' }}>
          {loading ? 'Un attimo…' : '💳 Paga con carta e sblocca Live'}
        </button>

        <button onClick={() => navigate('/login?redirect=' + encodeURIComponent('/home-setup?mode=live'))}
          style={{ width: '100%', marginTop: 10, padding: '0.8rem', borderRadius: 100, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.9rem' }}>
          Ho già un accesso Live → Accedi
        </button>

        {msg && (
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.85rem', color: '#FCD34D',
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '10px 14px' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}

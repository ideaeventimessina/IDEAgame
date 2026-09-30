/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * UpgradeLive — /passa-a-live
 * Pagina di conversione: spiega cosa sblocca la modalità Live e avvia il pagamento
 * con carta (Stripe). Il checkout parte dal backend /api/billing/checkout; finché
 * Stripe non è configurato (chiavi + prezzo), il bottone mostra "presto disponibile"
 * e rimanda al login/registrazione. Nessuna cassa finta: se non è configurato, si dice.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ChevronLeft, Sparkles, Mic2, Lock, Bot, Music, Check } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
const api = (p: string) => `${BASE}${p}`.replace(/([^:])\/\//g, '$1/');

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
  const [code, setCode] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Ritorno dalla cassa Stripe: ?paid=1&cs=cs_... → recupera il CODICE serata.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cs = q.get('cs');
    if (q.get('paid') !== '1' || !cs) return;
    setChecking(true);
    fetch(api('api/billing/code-after-pay'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cs }),
    })
      .then(r => r.json())
      .then((d: { code?: string; error?: string; emailed?: boolean; email?: string }) => {
        if (d.code) { setCode(d.code); if (d.emailed && d.email) setEmailedTo(d.email); }
        else setMsg(d.error ?? 'Pagamento ricevuto: recupero il codice non riuscito, contattaci.');
      })
      .catch(() => setMsg('Pagamento ricevuto ma non riesco a recuperare il codice. Contattaci.'))
      .finally(() => setChecking(false));
  }, []);

  const startCheckout = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(api('api/billing/checkout'), {
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

        {/* Ritorno dal pagamento: codice serata */}
        {(checking || code) && (
          <div style={{ marginTop: 22, borderRadius: 18, padding: 18, textAlign: 'center',
            background: 'rgba(74,222,128,0.12)', border: '1.5px solid rgba(74,222,128,0.5)' }}>
            {checking && <div style={{ color: '#86EFAC', fontWeight: 700 }}>Pagamento ricevuto, genero il codice…</div>}
            {code && (
              <>
                <div style={{ color: '#86EFAC', fontWeight: 800, fontSize: '0.9rem' }}>✅ Pagamento riuscito! Il tuo codice serata:</div>
                <div style={{ margin: '12px 0', fontSize: '1.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#fff',
                  background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '10px 14px', userSelect: 'all' }}>{code}</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: 12 }}>
                  Vale per una serata (48h), monouso. {emailedTo ? `Te l'abbiamo mandato anche via email a ${emailedTo}.` : 'Salvalo.'}
                </div>
                <button onClick={() => navigate(`/home-setup?mode=live&code=${encodeURIComponent(code)}`)}
                  style={{ width: '100%', padding: '0.9rem', borderRadius: 100, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg,#34D399,#059669)', color: '#062', fontWeight: 900, fontSize: '1rem' }}>
                  🎉 Crea la serata Live
                </button>
              </>
            )}
          </div>
        )}

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

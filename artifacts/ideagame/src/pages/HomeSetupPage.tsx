/**
 * HomeSetupPage — /home-setup
 * Crea una nuova stanza HOME MODE con configurazione reale.
 * Visually matches HomeRoom aesthetic. No visual redesign.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2 } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

const GAME_OPTIONS = [
  { slug: 'percorso-a-risate',  label: 'Percorso a Risate',  emoji: '😂' },
  { slug: 'gioco-coppie',       label: 'Gioco delle Coppie', emoji: '💞' },
  { slug: 'quizzone',           label: 'Quizzone',            emoji: '⭐' },
  { slug: 'saramusica',         label: 'SaraMusica',          emoji: '🎵' },
  { slug: 'adult-only',         label: 'Adult Only',          emoji: '🔞' },
  { slug: 'sfida-ballo',        label: 'Sfida di Ballo',      emoji: '💃' },
  { slug: 'parola-alle-spalle', label: 'Parola alle Spalle',  emoji: '💬' },
  { slug: 'karaoke-battle',     label: 'Karaoke Battle',      emoji: '🎤' },
];


function SceneBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 130% 90% at 50% 100%,rgba(245,182,66,0.2) 0%,rgba(60,20,120,0.55) 30%,#030010 70%)',
      }}/>
      <div className="absolute" style={{
        left: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from -6deg at 20% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      <div className="absolute" style={{
        right: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from 6deg at 80% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 3,
        background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.5),transparent)',
      }}/>
    </div>
  );
}

export default function HomeSetupPage() {
  const [, navigate] = useLocation();
  const [hostName, setHostName]         = useState('');
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const toggleGame = (slug: string) => {
    setSelectedGames(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleCreate = async () => {
    if (!hostName.trim()) { setError('Inserisci il tuo nome per continuare.'); return; }
    if (selectedGames.length === 0) { setError('Seleziona almeno un gioco.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/home/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostName: hostName.trim(),
          selectedGames,
        }),
      });
      if (!res.ok) throw new Error('Errore nella creazione della stanza.');
      const session = await res.json() as { id: string; joinCode: string };
      navigate(`/home-lobby/${session.joinCode}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-auto"
      style={{ background: '#030010', fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      <SceneBg />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between"
        style={{ padding: 'clamp(10px,1.5vh,18px) clamp(16px,2.5vw,32px) 4px' }}>
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          onClick={() => navigate('/mode-select')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.45rem 1.1rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1.5px solid rgba(255,255,255,0.12)',
            borderRadius: 100,
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          whileHover={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}
          whileTap={{ scale: 0.97 }}>
          <ChevronLeft size={13}/> MODALITÀ
        </motion.button>

        <motion.img
          src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.5 }}
          style={{ width: 'clamp(7rem,11vw,9rem)', objectFit: 'contain',
            filter: 'drop-shadow(0 0 20px rgba(245,182,66,0.6))' }}
        />
        <div style={{ width: 100 }}/>
      </div>

      {/* page title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45 }}
        style={{ textAlign: 'center', marginBottom: 'clamp(10px,1.6vh,18px)', position: 'relative', zIndex: 10 }}>
        <div style={{
          fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.6rem)',
          letterSpacing: '0.06em', color: '#fff',
        }}>CREA LA TUA STANZA</div>
        <div style={{
          fontSize: '0.65rem', letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.35)', fontWeight: 600,
          textTransform: 'uppercase', marginTop: 2,
        }}>Modalità Home · Partita Privata</div>
      </motion.div>

      {/* form card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        style={{
          position: 'relative', zIndex: 10,
          maxWidth: 600, margin: '0 auto',
          padding: '0 clamp(16px,2.5vw,32px) 32px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>

        {/* host name */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: 'clamp(14px,2vh,20px)',
          backdropFilter: 'blur(14px)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.2em', color: '#F5B642', textTransform: 'uppercase' }}>
            ⚙ Impostazioni Stanza
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              Nome Host
            </label>
            <input
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              placeholder="Come ti chiami?"
              maxLength={30}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${error && !hostName ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 10, padding: '0.6rem 1rem',
                color: '#fff', fontFamily: "'Outfit',sans-serif",
                fontSize: '0.9rem', fontWeight: 600, outline: 'none', width: '100%',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(245,182,66,0.6)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
            />
          </div>

        </div>

        {/* game selector */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: 'clamp(14px,2vh,20px)',
          backdropFilter: 'blur(14px)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.2em', color: '#A855F7', textTransform: 'uppercase' }}>
              🎮 Giochi Inclusi
            </div>
            <button onClick={() => setSelectedGames(selectedGames.length === GAME_OPTIONS.length ? [] : GAME_OPTIONS.map(g => g.slug))}
              style={{
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer',
                textTransform: 'uppercase',
              }}>
              {selectedGames.length === GAME_OPTIONS.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GAME_OPTIONS.map(g => {
              const active = selectedGames.includes(g.slug);
              return (
                <button key={g.slug} onClick={() => toggleGame(g.slug)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px',
                  background: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${active ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 100, cursor: 'pointer', transition: 'all 0.18s',
                }}>
                  <span style={{ fontSize: '0.85rem' }}>{g.emoji}</span>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}>
                    {g.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 10, padding: '8px 14px',
            fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,100,100,0.9)',
          }}>{error}</div>
        )}

        {/* CTA */}
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={handleCreate} disabled={loading}
          style={{
            background: loading ? 'rgba(245,182,66,0.4)' : 'linear-gradient(135deg,#F5B642,#E09020)',
            border: 'none', borderRadius: 100, padding: '0.9rem 2rem',
            fontSize: '1rem', fontWeight: 900, letterSpacing: '0.12em', color: '#fff',
            boxShadow: '0 0 40px rgba(245,182,66,0.45)', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%',
          }}>
          {loading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }}/> : '⚡'}
          {loading ? 'CREAZIONE...' : 'CREA STANZA'}
        </motion.button>
      </motion.div>
    </div>
  );
}

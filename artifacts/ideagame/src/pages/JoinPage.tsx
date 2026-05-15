/**
 * JoinPage — /join/:code
 * Guest entra nella stanza digitando il proprio nickname.
 * Chiama /api/home/sessions/by-code/:code → /api/home/sessions/:id/join
 * poi naviga a /home/join?s=:code per il controller di gioco.
 */
import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const AVATAR_COLORS = ['#F5B642','#A855F7','#EC4899','#34D399','#60A5FA','#F87171','#FB923C','#22D3EE'];

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

interface HomeSession {
  id: string;
  joinCode: string;
  hostName: string;
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'ended';
}

export default function JoinPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase().trim();

  const [session, setSession]   = useState<HomeSession | null>(null);
  const [players, setPlayers]   = useState<{ id: string }[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [avatarColor]           = useState(randomColor);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/home/sessions/by-code/${code}`)
      .then(r => {
        if (r.status === 404 || r.status === 409) { setNotFound(true); return null; }
        return r.json() as Promise<{ session: HomeSession; players: { id: string }[] }>;
      })
      .then(data => {
        if (!data) return;
        setSession(data.session);
        setPlayers(data.players);
      })
      .catch(() => setNotFound(true));
  }, [code]);

  const handleJoin = async () => {
    if (!nickname.trim()) { setError('Inserisci il tuo nome.'); return; }
    if (!session) return;
    if (players.length >= session.maxPlayers) { setError('La stanza è piena.'); return; }
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), avatarColor }),
      });
      if (!r.ok) {
        const msg = await r.json() as { error?: string };
        setError(msg.error ?? 'Errore durante il join.');
        return;
      }
      const player = await r.json() as { id: string };
      try {
        localStorage.setItem('ideagame:home:player', JSON.stringify({
          sessionId: session.id,
          joinCode: session.joinCode,
          playerId: player.id,
          nickname: nickname.trim(),
        }));
      } catch { /* ignore storage errors */ }
      navigate(`/home/join?s=${session.joinCode}`);
    } catch {
      setError('Errore di rete. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  if (notFound) {
    return (
      <div style={{
        minHeight: '100vh', background: '#030010', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        fontFamily: "'Outfit','Arial Black',sans-serif",
      }}>
        <div style={{ fontSize: '3rem' }}>😕</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>
          Stanza non trovata
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          Il codice <strong style={{ color: '#F5B642' }}>{code}</strong> non esiste o è scaduto.
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: '#030010', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={36} style={{ color: '#F5B642', animation: 'spin 1s linear infinite' }}/>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#030010',
      fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative',
    }}>
      {/* background glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 100%,rgba(245,182,66,0.15) 0%,rgba(60,20,120,0.4) 40%,#030010 70%)',
      }}/>

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'relative', zIndex: 10, width: '100%', maxWidth: 380,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        }}>

        {/* Logo */}
        <img src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          style={{ width: 120, objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(245,182,66,0.6))' }}/>

        {/* Room info card */}
        <div style={{
          background: 'rgba(245,182,66,0.08)',
          border: '1.5px solid rgba(245,182,66,0.4)',
          borderRadius: 18, padding: '16px 24px', textAlign: 'center', width: '100%',
        }}>
          <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
            Stanza di
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            {session.hostName}
          </div>
          <div style={{
            display: 'inline-block',
            fontSize: '2rem', fontWeight: 900, letterSpacing: '0.18em', color: '#F5B642',
            textShadow: '0 0 20px rgba(245,182,66,0.7)',
          }}>{session.joinCode}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            {players.length}/{session.maxPlayers} giocatori connessi
          </div>
        </div>

        {/* nickname form */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{
            fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
          }}>Il tuo nome</label>

          {/* avatar color preview + input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: `radial-gradient(circle,${avatarColor}88,${avatarColor}33)`,
              border: `2px solid ${avatarColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: '1rem', color: '#fff',
            }}>
              {nickname ? nickname[0]!.toUpperCase() : '?'}
            </div>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleJoin()}
              placeholder="Come ti chiami?"
              maxLength={20}
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.07)',
                border: `1.5px solid ${error ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 12, padding: '0.7rem 1rem',
                color: '#fff', fontFamily: "'Outfit',sans-serif",
                fontSize: '1rem', fontWeight: 700, outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(245,182,66,0.6)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 8, padding: '7px 12px',
              fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,120,120,0.9)',
            }}>{error}</div>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => void handleJoin()}
            disabled={loading || !nickname.trim()}
            style={{
              background: nickname.trim() && !loading ? 'linear-gradient(135deg,#F5B642,#E09020)' : 'rgba(255,255,255,0.08)',
              border: 'none', borderRadius: 100, padding: '0.85rem 0',
              width: '100%', fontSize: '1rem', fontWeight: 900, letterSpacing: '0.1em',
              color: nickname.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)',
              boxShadow: nickname.trim() && !loading ? '0 0 30px rgba(245,182,66,0.4)' : 'none',
              cursor: nickname.trim() && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.25s',
            }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/> : '⚡'}
            {loading ? 'ENTRANDO...' : 'ENTRA NELLA STANZA'}
          </motion.button>
        </div>
      </motion.div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

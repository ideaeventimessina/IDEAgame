/**
 * HomeLobbyPage — /home-lobby/:code
 * Sala d'attesa host. Mostra QR reale, codice, giocatori live, pulsante avvia.
 * Polling ogni 3s su /api/home/sessions/by-code/:code.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Users, Check, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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
  gameConfig: Record<string, unknown>;
}
interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

const AVATAR_COLORS = ['#F5B642','#A855F7','#EC4899','#34D399','#60A5FA','#F87171','#FB923C','#22D3EE'];

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
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1280 120"
        preserveAspectRatio="none" style={{ height: 100, opacity: 0.45 }}>
        {Array.from({ length: 44 }).map((_, i) => {
          const x = i * (1280 / 44);
          const h = 40 + Math.sin(i * 1.5) * 16 + (i % 3) * 10;
          return <ellipse key={i} cx={x + 14} cy={118 - h / 2} rx={8} ry={h / 2} fill="rgba(0,0,0,0.5)"/>;
        })}
      </svg>
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 3,
        background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.5),transparent)',
      }}/>
    </div>
  );
}

export default function HomeLobbyPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase().trim();

  const [session, setSession]   = useState<HomeSession | null>(null);
  const [players, setPlayers]   = useState<HomePlayer[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${BASE.replace(/\/$/, '')}/join/${code}`
    : `/join/${code}`;

  const poll = useCallback(async () => {
    if (!code) return;
    try {
      const r = await fetch(`/api/home/sessions/by-code/${code}`);
      if (r.status === 404) { setNotFound(true); return; }
      if (!r.ok) return;
      const data = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(data.session);
      setPlayers(data.players);
      if (data.session.status === 'playing') {
        navigate(`/home?s=${data.session.id}`);
      }
    } catch { /* network hiccup */ }
  }, [code, navigate]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => { void poll(); }, 3000);
    return () => clearInterval(id);
  }, [poll]);

  const handleStart = async () => {
    if (!session) return;
    setStarting(true);
    try {
      await fetch(`/api/home/sessions/${session.id}/ready`, { method: 'POST' });
      navigate(`/home?s=${session.id}`);
    } catch {
      setStarting(false);
    }
  };

  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: '#030010', fontFamily: "'Outfit',sans-serif", gap: 16 }}>
        <SceneBg/>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>
            Stanza non trovata
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
            Il codice {code} non esiste o è scaduto.
          </div>
          <button onClick={() => navigate('/home-setup')} style={{
            background: 'rgba(245,182,66,0.2)', border: '1.5px solid rgba(245,182,66,0.5)',
            borderRadius: 100, padding: '0.6rem 1.6rem', cursor: 'pointer',
            color: '#F5B642', fontWeight: 700, fontSize: '0.8rem',
          }}>← Crea nuova stanza</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: '#030010' }}>
        <SceneBg/>
        <Loader2 size={36} style={{ color: '#F5B642', animation: 'spin 1s linear infinite', position: 'relative', zIndex: 10 }}/>
      </div>
    );
  }

  const canStart = players.length >= 1;

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background: '#030010', fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      <SceneBg/>

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between"
        style={{ padding: 'clamp(10px,1.5vh,18px) clamp(16px,2.5vw,32px) 4px' }}>
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => navigate('/home-setup')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.45rem 1.1rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1.5px solid rgba(255,255,255,0.12)',
            borderRadius: 100, color: 'rgba(255,255,255,0.5)',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          whileHover={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}
          whileTap={{ scale: 0.97 }}>
          <ChevronLeft size={13}/> MODIFICA
        </motion.button>

        <motion.img src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.5 }}
          style={{ width: 'clamp(7rem,11vw,9rem)', objectFit: 'contain',
            filter: 'drop-shadow(0 0 20px rgba(245,182,66,0.6))' }}/>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(168,85,247,0.12)',
          border: '1px solid rgba(168,85,247,0.3)',
          borderRadius: 100, padding: '6px 14px',
        }}>
          <Users size={13} style={{ color: '#A855F7' }}/>
          <span style={{ fontWeight: 800, fontSize: '0.75rem', color: '#A855F7' }}>
            {players.length}/{session.maxPlayers}
          </span>
        </div>
      </div>

      {/* title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ textAlign: 'center', marginBottom: 'clamp(8px,1.2vh,14px)', position: 'relative', zIndex: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 'clamp(1rem,1.8vw,1.4rem)', letterSpacing: '0.06em', color: '#fff' }}>
          IN ATTESA DEI GIOCATORI
        </div>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>
          {session.hostName} · Stanza {session.joinCode}
        </div>
      </motion.div>

      {/* main 3-col layout */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'grid',
        gridTemplateColumns: '1fr clamp(120px,14vw,160px) 1fr',
        gap: 'clamp(10px,1.8vw,24px)',
        padding: '0 clamp(16px,2.5vw,32px)',
        alignItems: 'start',
      }}>

        {/* LEFT — session info */}
        <motion.div
          initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: 'clamp(14px,2vh,20px)',
            backdropFilter: 'blur(14px)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.2em', color: '#F5B642', textTransform: 'uppercase' }}>
            ⚙ Dettagli Stanza
          </div>

          {[
            { label: 'Host', value: session.hostName },
            { label: 'Codice', value: session.joinCode },
            { label: 'Max Giocatori', value: String(session.maxPlayers) },
            { label: 'Durata', value: String((session.gameConfig as Record<string, unknown>)?.matchDuration ?? 'normal') },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {row.label}
              </span>
              <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 700 }}>{row.value}</span>
            </div>
          ))}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }}/>

          <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
            Giochi inclusi
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {((session.gameConfig as Record<string, unknown>)?.selectedGames as string[] ?? []).map(g => (
              <div key={g} style={{
                padding: '3px 9px',
                background: 'rgba(168,85,247,0.12)',
                border: '1px solid rgba(168,85,247,0.3)',
                borderRadius: 100,
                fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)',
                letterSpacing: '0.04em',
              }}>{g.replace(/-/g, ' ')}</div>
            ))}
          </div>
        </motion.div>

        {/* CENTER — code + QR */}
        <motion.div
          initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.28 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>

          {/* code */}
          <div style={{
            background: 'rgba(245,182,66,0.1)',
            border: '2px solid rgba(245,182,66,0.55)',
            borderRadius: 14, padding: '10px 16px', textAlign: 'center',
            boxShadow: '0 0 30px rgba(245,182,66,0.2)', width: '100%',
          }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>
              Codice
            </div>
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
              style={{
                fontFamily: "'Outfit','Arial Black',sans-serif",
                fontWeight: 900, fontSize: 'clamp(1.4rem,2.2vw,1.8rem)',
                letterSpacing: '0.12em', color: '#F5B642',
                textShadow: '0 0 20px rgba(245,182,66,0.7)',
              }}>
              {session.joinCode}
            </motion.div>
          </div>

          {/* real QR */}
          <div style={{
            background: '#fff', borderRadius: 12, padding: 10,
            boxShadow: '0 0 30px rgba(245,182,66,0.35)',
            border: '2px solid rgba(245,182,66,0.5)',
          }}>
            <QRCodeSVG value={joinUrl} size={102} bgColor="#ffffff" fgColor="#0a0820" level="M" includeMargin={false}/>
          </div>

          <span style={{
            fontFamily: "'Outfit',sans-serif", fontSize: '0.62rem', fontWeight: 700,
            letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
          }}>Scansiona per entrare</span>

          {/* count badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '5px 12px',
          }}>
            <Users size={12} style={{ color: '#A855F7' }}/>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>
              <span style={{ color: '#A855F7' }}>{players.length}</span>/{session.maxPlayers} connessi
            </span>
          </div>
        </motion.div>

        {/* RIGHT — players */}
        <motion.div
          initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: 'clamp(12px,1.8vh,18px)',
            backdropFilter: 'blur(14px)',
          }}>
            <div style={{
              fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.2em',
              color: '#A855F7', textTransform: 'uppercase', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Users size={13}/> Giocatori in attesa
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minHeight: 120 }}>
              <AnimatePresence>
                {players.map((p, i) => {
                  const color = p.avatarColor || AVATAR_COLORS[i % AVATAR_COLORS.length]!;
                  return (
                    <motion.div key={p.id}
                      initial={{ x: 30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      transition={{ duration: 0.35, ease: 'easeOut' as const }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(255,255,255,0.06)',
                        border: `1.5px solid ${color}44`,
                        borderRadius: 100, padding: '7px 14px 7px 7px',
                        boxShadow: `0 0 16px ${color}22`,
                      }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: `radial-gradient(circle,${color}55,${color}22)`,
                        border: `2px solid ${color}88`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: '0.75rem', color: '#fff', flexShrink: 0,
                      }}>{p.nickname[0]?.toUpperCase()}</div>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em', flex: 1 }}>
                        {p.nickname}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={12} style={{ color: '#34D399' }}/>
                        <span style={{ fontSize: '0.62rem', color: '#34D399', fontWeight: 700, letterSpacing: '0.05em' }}>
                          CONNESSO
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {players.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                  In attesa dei giocatori…
                </div>
              )}
            </div>
          </div>

          {/* Jonny bubble */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            style={{
              background: 'linear-gradient(135deg,rgba(168,85,247,0.18),rgba(245,182,66,0.1))',
              border: '1.5px solid rgba(168,85,247,0.45)',
              borderRadius: 16, padding: '12px 16px', backdropFilter: 'blur(12px)',
              position: 'relative',
            }}>
            <div style={{ position: 'absolute', bottom: -8, right: 24, width: 14, height: 8, background: 'rgba(168,85,247,0.45)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}/>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <img src={pub('/jonny-master-nobg.png')} alt="Jonny" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.6))' }}/>
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.15em', color: '#F5B642', textTransform: 'uppercase', marginBottom: 4 }}>Jonny dice</div>
                <div style={{ fontWeight: 600, fontSize: 'clamp(0.72rem,1vw,0.82rem)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.45, fontStyle: 'italic' }}>
                  {players.length === 0
                    ? '"Aspettiamo i giocatori… scansionate il QR!"'
                    : players.length < 2
                    ? '"Un altro giocatore e possiamo cominciare!"'
                    : `"${players.length} giocatori pronti! Quando vuoi, si parte!"`}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* CTA */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20 }}>
        <motion.button
          whileHover={canStart ? { scale: 1.03 } : {}}
          whileTap={canStart ? { scale: 0.97 } : {}}
          onClick={canStart ? handleStart : undefined}
          disabled={!canStart || starting}
          style={{
            background: canStart ? 'linear-gradient(135deg,#F5B642,#E09020)' : 'rgba(255,255,255,0.08)',
            border: canStart ? 'none' : '1.5px solid rgba(255,255,255,0.15)',
            borderRadius: 100, padding: '0.85rem 3.5rem',
            fontSize: '1rem', fontWeight: 900, letterSpacing: '0.12em',
            color: canStart ? '#fff' : 'rgba(255,255,255,0.3)',
            boxShadow: canStart ? '0 0 40px rgba(245,182,66,0.5)' : 'none',
            cursor: canStart ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.3s',
          }}>
          {starting ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }}/> : '⚡'}
          {starting ? 'AVVIO...' : canStart ? 'AVVIA LA PARTITA' : 'IN ATTESA DI GIOCATORI…'}
        </motion.button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

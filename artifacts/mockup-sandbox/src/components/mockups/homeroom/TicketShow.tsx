import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_PLAYERS = [
  { id: 1, name: 'Sofia',   color: '#A855F7', initDelay: 1.2 },
  { id: 2, name: 'Marco',   color: '#F5B642', initDelay: 2.4 },
  { id: 3, name: 'Giulia',  color: '#EC4899', initDelay: 3.6 },
  { id: 4, name: 'Lorenzo', color: '#34D399', initDelay: 5.0 },
];
const GAMES = ['Freestyle', 'Quizzone', 'Parola', 'Karaoke', 'Percorso'];
const CODE = 'CASA42';

function MockQR() {
  const cells = Array.from({ length: 17 * 17 }, (_, i) => {
    const row = Math.floor(i / 17); const col = i % 17;
    const isCorner = (row < 3 && col < 3) || (row < 3 && col > 13) || (row > 13 && col < 3);
    const seed = ((row * 17 + col) * 2654435761) >>> 0;
    return isCorner ? true : (seed % 3 !== 0);
  });
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 8, display: 'inline-block' }}>
      <svg width={80} height={80} viewBox="0 0 17 17">
        {cells.map((filled, i) => filled && (
          <rect key={i} x={i % 17} y={Math.floor(i / 17)} width={1} height={1} fill="#111" />
        ))}
      </svg>
    </div>
  );
}

export function TicketShow() {
  const [arrived, setArrived] = useState<number[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hostName, setHostName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('8');

  useEffect(() => {
    const timers = MOCK_PLAYERS.map(p =>
      setTimeout(() => setArrived(prev => [...prev, p.id]), p.initDelay * 1000)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const activePlayers = MOCK_PLAYERS.filter(p => arrived.includes(p.id));

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#030010', fontFamily: "'Outfit','Arial Black',sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {/* Cinematic background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 110% 90% at 50% 100%,rgba(245,182,66,0.18) 0%,rgba(60,20,120,0.5) 35%,#030010 68%)',
      }}/>
      {/* Spotlight left */}
      <div style={{
        position: 'absolute', left: '-10%', top: 0, width: '50%', height: '100%',
        background: 'conic-gradient(from -4deg at 15% 0%,transparent 0deg,rgba(245,182,66,0.06) 14deg,transparent 28deg)',
        filter: 'blur(3px)', pointerEvents: 'none',
      }}/>
      {/* Spotlight right */}
      <div style={{
        position: 'absolute', right: '-10%', top: 0, width: '50%', height: '100%',
        background: 'conic-gradient(from 4deg at 85% 0%,transparent 0deg,rgba(168,85,247,0.07) 14deg,transparent 28deg)',
        filter: 'blur(3px)', pointerEvents: 'none',
      }}/>

      {/* top nav */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
      }}>
        <button style={{
          background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.12)',
          borderRadius: 100, padding: '7px 16px', color: 'rgba(255,255,255,0.45)',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
        }}>
          ← MODALITÀ
        </button>
        <div style={{
          fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.18em',
          color: '#F5B642', textShadow: '0 0 24px rgba(245,182,66,0.6)',
        }}>JONNY'S WORLD</div>
        <div style={{ width: 100 }} />
      </div>

      {/* HERO TICKET */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' as const }}
        style={{
          position: 'relative', zIndex: 10,
          display: 'flex', gap: 0, alignItems: 'stretch',
          filter: 'drop-shadow(0 0 60px rgba(245,182,66,0.35)) drop-shadow(0 0 120px rgba(168,85,247,0.2))',
          marginTop: -20,
        }}
      >
        {/* Left stub */}
        <div style={{
          width: 54, background: 'rgba(245,182,66,0.12)',
          border: '2px solid rgba(245,182,66,0.4)',
          borderRight: '2px dashed rgba(245,182,66,0.35)',
          borderRadius: '18px 0 0 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '16px 0', gap: 6,
        }}>
          {['H','O','M','E'].map((c, i) => (
            <span key={i} style={{
              fontWeight: 900, fontSize: '0.65rem', letterSpacing: '0.12em',
              color: 'rgba(245,182,66,0.5)', writingMode: 'vertical-rl',
            }}>{c}</span>
          ))}
        </div>

        {/* Main ticket body */}
        <div style={{
          background: 'linear-gradient(135deg,rgba(20,8,45,0.97),rgba(35,10,80,0.97))',
          border: '2px solid rgba(245,182,66,0.4)',
          borderLeft: 'none', borderRight: 'none',
          padding: '24px 36px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          minWidth: 360,
        }}>
          <div style={{
            fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
          }}>CODICE DI ACCESSO</div>

          <motion.div
            animate={{ textShadow: ['0 0 30px rgba(245,182,66,0.6)', '0 0 60px rgba(245,182,66,1)', '0 0 30px rgba(245,182,66,0.6)'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
            style={{
              fontWeight: 900, fontSize: '4.2rem', letterSpacing: '0.18em',
              color: '#F5B642', lineHeight: 1, marginBottom: 4,
            }}
          >
            {CODE}
          </motion.div>

          <div style={{ height: 1, width: '100%', background: 'rgba(245,182,66,0.18)', margin: '4px 0' }}/>

          <MockQR />

          <div style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
          }}>Scansiona per entrare</div>

          {/* player count badge */}
          <div style={{
            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: 100, padding: '5px 14px',
            fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.7)',
          }}>
            <span style={{ color: '#A855F7' }}>{activePlayers.length}</span>/{maxPlayers} giocatori connessi
          </div>
        </div>

        {/* Right: player arrivals */}
        <div style={{
          width: 200, background: 'rgba(168,85,247,0.08)',
          border: '2px solid rgba(245,182,66,0.4)',
          borderLeft: '2px dashed rgba(245,182,66,0.35)',
          borderRadius: '0 18px 18px 0',
          padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em',
            color: 'rgba(168,85,247,0.8)', textTransform: 'uppercase', marginBottom: 4,
          }}>IN SALA</div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <AnimatePresence>
              {activePlayers.map(p => (
                <motion.div key={p.id}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' as const }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: `${p.color}12`, border: `1px solid ${p.color}40`,
                    borderRadius: 100, padding: '5px 10px',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: `radial-gradient(circle,${p.color}55,${p.color}22)`,
                    border: `1.5px solid ${p.color}80`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.62rem', fontWeight: 900, color: '#fff', flexShrink: 0,
                  }}>{p.name[0]}</div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{p.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: '#34D399', fontWeight: 700 }}>✓</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {activePlayers.length === 0 && (
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', padding: '12px 0' }}>
                In attesa…
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* GAME CHIPS row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        style={{ position: 'relative', zIndex: 10, display: 'flex', gap: 8, marginTop: 14 }}
      >
        {GAMES.map(g => (
          <div key={g} style={{
            padding: '4px 12px', background: 'rgba(168,85,247,0.1)',
            border: '1px solid rgba(168,85,247,0.3)', borderRadius: 100,
            fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.06em',
          }}>{g}</div>
        ))}
      </motion.div>

      {/* SETTINGS TRAY toggle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{ position: 'relative', zIndex: 10, marginTop: 10 }}
      >
        <button
          onClick={() => setSettingsOpen(o => !o)}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '6px 20px', cursor: 'pointer',
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          ⚙ {settingsOpen ? 'CHIUDI' : 'IMPOSTAZIONI STANZA'} {settingsOpen ? '▲' : '▼'}
        </button>
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                overflow: 'hidden', marginTop: 8,
                background: 'rgba(20,8,45,0.9)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14, padding: '14px 18px', backdropFilter: 'blur(16px)',
                display: 'flex', gap: 16, alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>NOME HOST</label>
                <input value={hostName} onChange={e => setHostName(e.target.value)} placeholder="Come ti chiami?"
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                    outline: 'none', width: 160,
                  }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>MAX GIOCATORI</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['4','6','8','12','20'].map(n => (
                    <button key={n} onClick={() => setMaxPlayers(n)} style={{
                      padding: '5px 8px', background: maxPlayers === n ? 'rgba(245,182,66,0.25)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${maxPlayers === n ? 'rgba(245,182,66,0.7)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 6, color: maxPlayers === n ? '#F5B642' : 'rgba(255,255,255,0.45)',
                      fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                    }}>{n}</button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'linear-gradient(135deg,#F5B642,#E09020)',
          border: 'none', borderRadius: 100, padding: '14px 48px', cursor: 'pointer',
          fontSize: '1rem', fontWeight: 900, letterSpacing: '0.12em', color: '#fff',
          boxShadow: '0 0 40px rgba(245,182,66,0.5), 0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        ⚡ AVVIA LA PARTITA
      </motion.button>

      {/* crowd silhouettes */}
      <svg style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', pointerEvents: 'none', zIndex: 1 }}
        viewBox="0 0 1280 100" preserveAspectRatio="none" height={80}>
        {Array.from({ length: 56 }).map((_, i) => {
          const x = i * (1280 / 56);
          const h = 30 + Math.sin(i * 1.5) * 10 + (i % 3) * 6;
          return <ellipse key={i} cx={x + 11} cy={100} rx={8} ry={h} fill="rgba(0,0,0,0.45)" />;
        })}
      </svg>
    </div>
  );
}

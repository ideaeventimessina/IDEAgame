import { useState, useEffect, useRef } from 'react';
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
      <svg width={76} height={76} viewBox="0 0 17 17">
        {cells.map((filled, i) => filled && (
          <rect key={i} x={i % 17} y={Math.floor(i / 17)} width={1} height={1} fill="#111" />
        ))}
      </svg>
    </div>
  );
}

function HexGrid() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="hex-cmd" x="0" y="0" width="56" height="64" patternUnits="userSpaceOnUse">
          <polygon points="28,2 52,16 52,48 28,62 4,48 4,16"
            fill="none" stroke="rgba(245,182,66,0.8)" strokeWidth="1"/>
          <polygon points="28,2 52,16 52,48 28,62 4,48 4,16"
            transform="translate(28,32)"
            fill="none" stroke="rgba(245,182,66,0.8)" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-cmd)"/>
    </svg>
  );
}

/* Waveform / pulse bar for a player */
function PulseBar({ color, active }: { color: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 20 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div key={i}
          animate={active ? {
            height: [4, 4 + (i % 3 + 1) * 5, 4],
            opacity: [0.5, 1, 0.5],
          } : { height: 3, opacity: 0.3 }}
          transition={{ duration: 0.7 + i * 0.1, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' as const }}
          style={{
            width: 3, background: color, borderRadius: 2,
            minHeight: 3,
          }}
        />
      ))}
    </div>
  );
}

export function CommandCenter() {
  const [arrived, setArrived] = useState<number[]>([]);
  const [hostName, setHostName] = useState('');
  const [eveningName, setEveningName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('8');
  const [selectedGames, setSelectedGames] = useState<string[]>(['Freestyle', 'Quizzone', 'Parola']);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = MOCK_PLAYERS.map(p =>
      setTimeout(() => setArrived(prev => [...prev, p.id]), p.initDelay * 1000)
    );
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 800);
    return () => clearInterval(interval);
  }, []);

  const activePlayers = MOCK_PLAYERS.filter(p => arrived.includes(p.id));
  const toggleGame = (g: string) =>
    setSelectedGames(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#030010', fontFamily: "'Outfit','Arial Black',sans-serif",
      position: 'relative', display: 'flex', flexDirection: 'column',
    }}>
      <HexGrid />

      {/* top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(3,0,16,0.7)', backdropFilter: 'blur(12px)',
        zIndex: 10, flexShrink: 0,
      }}>
        <button style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ← MODALITÀ
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 8px #34D399' }}
            />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: '#34D399' }}>
              SISTEMA ONLINE
            </span>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.18em', color: '#F5B642' }}>
          JONNY'S WORLD
        </div>
      </div>

      {/* MAIN — horizontal split: left config | center hero | right live */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '280px 1fr 280px',
        overflow: 'hidden',
      }}>

        {/* LEFT COLUMN — mission config */}
        <div style={{
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14,
          overflowY: 'auto', background: 'rgba(10,4,28,0.5)',
        }}>
          <div style={{
            fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.3em',
            color: 'rgba(245,182,66,0.6)', textTransform: 'uppercase',
            borderBottom: '1px solid rgba(245,182,66,0.15)', paddingBottom: 8,
          }}>⚙ CONFIG. MISSIONE</div>

          {[
            { label: 'NOME OPERATORE', value: hostName, set: setHostName, ph: 'Identificativo host' },
            { label: 'NOME OPERAZIONE', value: eveningName, set: setEveningName, ph: 'Es. Compleanno di Marco' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{
                fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
              }}>{f.label}</label>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '7px 10px', color: '#fff',
                  fontSize: '0.8rem', fontWeight: 600, outline: 'none', width: '100%',
                  fontFamily: "'Outfit',monospace",
                }} />
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            }}>CAPACITÀ AGENTI</label>
            <div style={{ display: 'flex', gap: 5 }}>
              {['4','6','8','12','20'].map(n => (
                <button key={n} onClick={() => setMaxPlayers(n)} style={{
                  flex: 1, padding: '6px 0',
                  background: maxPlayers === n ? 'rgba(245,182,66,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${maxPlayers === n ? 'rgba(245,182,66,0.6)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  color: maxPlayers === n ? '#F5B642' : 'rgba(255,255,255,0.35)',
                  fontSize: '0.7rem', fontWeight: 800,
                }}>{n}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }}/>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            }}>MODULI ATTIVI</label>
            {GAMES.map(g => {
              const on = selectedGames.includes(g);
              return (
                <button key={g} onClick={() => toggleGame(g)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>{g}</span>
                  <div style={{
                    width: 28, height: 14, borderRadius: 7, padding: '2px 3px',
                    background: on ? '#A855F7' : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }}/>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER — hero codename + QR */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', gap: 0,
        }}>
          {/* Radial glow */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 70% 70% at 50% 50%,rgba(245,182,66,0.1) 0%,transparent 70%)',
          }}/>

          {/* OPERATION TAG */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            style={{
              fontSize: '0.5rem', fontWeight: 900, letterSpacing: '0.5em',
              color: 'rgba(245,182,66,0.5)', textTransform: 'uppercase',
              marginBottom: 6, fontFamily: "'Courier New',monospace",
            }}
          >▸ OPERAZIONE ATTIVA ◂</motion.div>

          {/* Giant CODE */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: 'easeOut' as const }}
            style={{ position: 'relative', zIndex: 2 }}
          >
            {/* Scan lines overlay */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 4, overflow: 'hidden',
              background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.04) 3px,rgba(0,0,0,0.04) 4px)',
            }}/>
            <motion.div
              animate={{ textShadow: ['0 0 30px rgba(245,182,66,0.4)', '0 0 70px rgba(245,182,66,0.9)', '0 0 30px rgba(245,182,66,0.4)'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' as const }}
              style={{
                fontWeight: 900, fontSize: '6.5rem', letterSpacing: '0.28em', color: '#F5B642',
                lineHeight: 1, fontFamily: "'Courier New','Outfit',monospace",
              }}
            >{CODE}</motion.div>
          </motion.div>

          {/* QR + text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            style={{
              marginTop: 18,
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '14px 20px',
            }}
          >
            <MockQR />
            <div>
              <div style={{
                fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.25em',
                color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 4,
              }}>ACCESSO RAPIDO</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
                play.jonnysworld.it
              </div>
              <div style={{
                fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginTop: 2,
              }}>oppure scansiona il QR code</div>
            </div>
          </motion.div>

          {/* Player count readout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            style={{
              marginTop: 16,
              fontFamily: "'Courier New',monospace",
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            AGENTI CONNESSI:{' '}
            <span style={{ color: '#A855F7', fontWeight: 900 }}>{activePlayers.length}</span>
            {' '}/{' '}{maxPlayers}
          </motion.div>
        </div>

        {/* RIGHT COLUMN — live agent feed */}
        <div style={{
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(10,4,28,0.5)',
        }}>
          <div style={{
            fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.3em',
            color: 'rgba(168,85,247,0.7)', textTransform: 'uppercase',
            borderBottom: '1px solid rgba(168,85,247,0.15)', paddingBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <motion.div animate={{ opacity: [1,0.3,1] }} transition={{ duration: 1, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }}/>
            AGENTI IN TEMPO REALE
          </div>

          {/* All player slots */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {MOCK_PLAYERS.map(p => {
              const isLive = arrived.includes(p.id);
              return (
                <motion.div key={p.id}
                  animate={{ opacity: isLive ? 1 : 0.25 }}
                  transition={{ duration: 0.4 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isLive ? `${p.color}10` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isLive ? `${p.color}40` : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10, padding: '9px 12px',
                    transition: 'all 0.4s',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isLive ? `radial-gradient(circle,${p.color}55,${p.color}22)` : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${isLive ? p.color + '80' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 900, color: isLive ? '#fff' : 'rgba(255,255,255,0.2)',
                    flexShrink: 0,
                  }}>{p.name[0]}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.75rem', fontWeight: 800,
                      color: isLive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
                      marginBottom: 2,
                    }}>{p.name}</div>
                    <PulseBar color={p.color} active={isLive} />
                  </div>

                  <div style={{
                    fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.1em',
                    color: isLive ? '#34D399' : 'rgba(255,255,255,0.15)',
                    fontFamily: "'Courier New',monospace",
                  }}>
                    {isLive ? 'LIVE' : '----'}
                  </div>
                </motion.div>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, parseInt(maxPlayers) - MOCK_PLAYERS.length) }).slice(0, 4).map((_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, opacity: 0.2,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10, padding: '9px 12px',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '1px dashed rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.62rem', color: 'rgba(255,255,255,0.15)',
                }}>?</div>
                <div style={{
                  flex: 1, height: 1,
                  background: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.1) 0,rgba(255,255,255,0.1) 6px,transparent 6px,transparent 12px)',
                }}/>
              </div>
            ))}
          </div>

          {/* Jonny status line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
            style={{
              background: 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(245,182,66,0.07))',
              border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, padding: '10px 12px',
              fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)',
              fontStyle: 'italic', lineHeight: 1.4,
            }}
          >
            <span style={{ color: '#F5B642', fontWeight: 900, fontStyle: 'normal' }}>Jonny: </span>
            "Quando tutti sono pronti, io apro le porte dell'arena."
          </motion.div>
        </div>
      </div>

      {/* bottom bar with CTA */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(3,0,16,0.8)', backdropFilter: 'blur(12px)',
        padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 16, zIndex: 10,
      }}>
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          style={{
            background: 'linear-gradient(135deg,#F5B642,#E09020)',
            border: 'none', borderRadius: 100, padding: '12px 64px', cursor: 'pointer',
            fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.12em', color: '#fff',
            boxShadow: '0 0 40px rgba(245,182,66,0.45), 0 6px 20px rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          ⚡ AVVIA LA PARTITA
        </motion.button>
      </div>
    </div>
  );
}

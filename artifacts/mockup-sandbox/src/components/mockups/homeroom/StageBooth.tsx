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
      <svg width={72} height={72} viewBox="0 0 17 17">
        {cells.map((filled, i) => filled && (
          <rect key={i} x={i % 17} y={Math.floor(i / 17)} width={1} height={1} fill="#111" />
        ))}
      </svg>
    </div>
  );
}

export function StageBooth() {
  const [arrived, setArrived] = useState<number[]>([]);
  const [hostName, setHostName] = useState('');
  const [eveningName, setEveningName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('8');
  const [selectedGames, setSelectedGames] = useState<string[]>(['Freestyle', 'Quizzone', 'Parola']);

  useEffect(() => {
    const timers = MOCK_PLAYERS.map(p =>
      setTimeout(() => setArrived(prev => [...prev, p.id]), p.initDelay * 1000)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const activePlayers = MOCK_PLAYERS.filter(p => arrived.includes(p.id));

  const toggleGame = (g: string) =>
    setSelectedGames(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#030010', fontFamily: "'Outfit','Arial Black',sans-serif",
      display: 'flex',
    }}>
      {/* ── LEFT: STAGE (65%) ── */}
      <div style={{
        flex: '0 0 65%', position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Stage floor glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 130% 70% at 50% 105%,rgba(245,182,66,0.22) 0%,rgba(60,20,120,0.5) 40%,#030010 70%)',
        }}/>
        {/* Spot beams */}
        <div style={{
          position: 'absolute', left: '-5%', top: 0, width: '55%', height: '100%',
          background: 'conic-gradient(from -5deg at 20% 0%,transparent 0deg,rgba(245,182,66,0.07) 16deg,transparent 32deg)',
          filter: 'blur(3px)', pointerEvents: 'none',
        }}/>
        <div style={{
          position: 'absolute', right: '-5%', top: 0, width: '55%', height: '100%',
          background: 'conic-gradient(from 5deg at 80% 0%,transparent 0deg,rgba(168,85,247,0.08) 16deg,transparent 32deg)',
          filter: 'blur(3px)', pointerEvents: 'none',
        }}/>

        {/* Top nav (stage side) */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', zIndex: 10,
        }}>
          <button style={{
            background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '6px 14px', cursor: 'pointer',
            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)',
          }}>← MODALITÀ</button>
          <div style={{
            fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.2em',
            color: '#F5B642', textShadow: '0 0 20px rgba(245,182,66,0.6)',
          }}>JONNY'S WORLD</div>
        </div>

        {/* MARQUEE code */}
        <div style={{ position: 'relative', zIndex: 5, textAlign: 'center' }}>
          {/* Frame / marquee border */}
          <div style={{
            border: '2px solid rgba(245,182,66,0.4)',
            borderRadius: 20,
            padding: '20px 44px 16px',
            background: 'rgba(245,182,66,0.05)',
            boxShadow: '0 0 60px rgba(245,182,66,0.2), inset 0 0 40px rgba(245,182,66,0.04)',
            position: 'relative', marginBottom: 20,
          }}>
            {/* Corner lights */}
            {['tl','tr','bl','br'].map(c => (
              <motion.div key={c} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: c === 'tr' || c === 'bl' ? 0.75 : 0, ease: 'easeInOut' as const }}
                style={{
                  position: 'absolute',
                  top: c.startsWith('t') ? -5 : undefined, bottom: c.startsWith('b') ? -5 : undefined,
                  left: c.endsWith('l') ? -5 : undefined, right: c.endsWith('r') ? -5 : undefined,
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#F5B642',
                  boxShadow: '0 0 12px rgba(245,182,66,0.9)',
                }}/>
            ))}

            <div style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.35em',
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6,
            }}>CODICE DI ACCESSO</div>
            <motion.div
              animate={{ textShadow: ['0 0 20px rgba(245,182,66,0.5)', '0 0 50px rgba(245,182,66,0.9)', '0 0 20px rgba(245,182,66,0.5)'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
              style={{
                fontWeight: 900, fontSize: '5rem', letterSpacing: '0.22em', color: '#F5B642', lineHeight: 1,
              }}
            >{CODE}</motion.div>
          </div>

          {/* QR + scan label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
            <MockQR />
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4,
              }}>SCANSIONA PER ENTRARE</div>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              }}>o digita il codice su</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#A855F7' }}>
                play.jonnysworld.it
              </div>
            </div>
          </div>
        </div>

        {/* AUDIENCE — player silhouettes + arrivals */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 130,
          display: 'flex', alignItems: 'flex-end', paddingBottom: 0, paddingLeft: 20,
          gap: 0, zIndex: 5,
        }}>
          {/* Static silhouettes */}
          {Array.from({ length: 26 }).map((_, i) => {
            const h = 32 + Math.sin(i * 2.1) * 8 + (i % 3) * 5;
            return <div key={i} style={{
              width: 18, height: h, borderRadius: '50% 50% 0 0',
              background: 'rgba(0,0,0,0.55)', flexShrink: 0, marginRight: 2,
            }}/>;
          })}
          {/* Live player arrivals as glowing silhouettes */}
          <AnimatePresence>
            {activePlayers.map(p => (
              <motion.div key={p.id}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' as const }}
                style={{ flexShrink: 0, marginRight: 2, position: 'relative' }}
              >
                <div style={{
                  width: 18, height: 44, borderRadius: '50% 50% 0 0',
                  background: p.color, opacity: 0.7,
                  boxShadow: `0 0 20px ${p.color}`,
                }}/>
                <motion.div
                  animate={{ y: [-8, -18, -8], opacity: [0.8, 0.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' as const }}
                  style={{
                    position: 'absolute', bottom: '105%', left: '50%', transform: 'translateX(-50%)',
                    fontSize: '0.58rem', fontWeight: 800, color: p.color,
                    whiteSpace: 'nowrap', textShadow: `0 0 8px ${p.color}`,
                  }}
                >{p.name}</motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Floor line */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.5),transparent)',
        }}/>
      </div>

      {/* ── CURTAIN DIVIDER ── */}
      <div style={{
        width: 3,
        background: 'linear-gradient(180deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.4),transparent)',
        flexShrink: 0, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(245,182,66,0.9),rgba(245,182,66,0.3))',
          boxShadow: '0 0 20px rgba(245,182,66,0.8)',
        }}/>
      </div>

      {/* ── RIGHT: CONTROL BOOTH (35%) ── */}
      <div style={{
        flex: '0 0 35%', display: 'flex', flexDirection: 'column',
        background: 'rgba(10,4,28,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
        padding: '60px 24px 28px',
        gap: 16, overflow: 'auto',
      }}>
        <div style={{
          fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.28em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: -4,
        }}>🎛 REGIA</div>
        <div style={{
          fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.05em', color: '#fff',
        }}>Configura la partita</div>

        {/* fields */}
        {[
          { label: 'NOME HOST', value: hostName, set: setHostName, ph: 'Come ti chiami?' },
          { label: 'NOME SERATA', value: eveningName, set: setEveningName, ph: 'Es. Compleanno di Marco' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.18em',
              color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
            }}>{f.label}</label>
            <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: '8px 12px', color: '#fff',
                fontSize: '0.85rem', fontWeight: 600, outline: 'none', width: '100%',
              }} />
          </div>
        ))}

        {/* max players */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{
            fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
          }}>MAX GIOCATORI</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['4','6','8','12','20'].map(n => (
              <button key={n} onClick={() => setMaxPlayers(n)} style={{
                flex: 1, padding: '7px 0',
                background: maxPlayers === n ? 'rgba(245,182,66,0.22)' : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${maxPlayers === n ? 'rgba(245,182,66,0.7)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8, cursor: 'pointer',
                color: maxPlayers === n ? '#F5B642' : 'rgba(255,255,255,0.4)',
                fontSize: '0.75rem', fontWeight: 800,
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* game selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{
            fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
          }}>GIOCHI INCLUSI</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GAMES.map(g => {
              const active = selectedGames.includes(g);
              return (
                <button key={g} onClick={() => toggleGame(g)} style={{
                  padding: '5px 11px',
                  background: active ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${active ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 100, cursor: 'pointer',
                  color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                  transition: 'all 0.18s',
                }}>{g}</button>
              );
            })}
          </div>
        </div>

        {/* divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }}/>

        {/* Players waiting mini list */}
        <div>
          <div style={{
            fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.18em',
            color: 'rgba(168,85,247,0.7)', textTransform: 'uppercase', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#34D399',
              boxShadow: '0 0 8px #34D399', display: 'inline-block',
            }}/> LIVE — {activePlayers.length}/{maxPlayers} connessi
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <AnimatePresence>
              {activePlayers.map(p => (
                <motion.div key={p.id}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: 'backOut' as const }}
                  style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: `radial-gradient(circle,${p.color}55,${p.color}22)`,
                    border: `2px solid ${p.color}80`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 900, color: '#fff',
                    boxShadow: `0 0 14px ${p.color}44`,
                  }}>{p.name[0]}</motion.div>
              ))}
            </AnimatePresence>
            {activePlayers.length === 0 && (
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                In attesa dei giocatori…
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          style={{
            marginTop: 'auto', background: 'linear-gradient(135deg,#F5B642,#E09020)',
            border: 'none', borderRadius: 14, padding: '14px 0', cursor: 'pointer',
            fontSize: '0.92rem', fontWeight: 900, letterSpacing: '0.1em', color: '#fff',
            boxShadow: '0 0 30px rgba(245,182,66,0.4)', width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          ⚡ AVVIA LA PARTITA
        </motion.button>
      </div>
    </div>
  );
}

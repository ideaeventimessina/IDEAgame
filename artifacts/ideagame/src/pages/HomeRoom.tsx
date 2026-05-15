/**
 * HomeRoom — Mock home game room setup screen.
 * Zero backend · zero socket · zero API. Pure frontend mock.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Users, Globe, ChevronLeft, Zap, Check } from 'lucide-react';

/* ── asset helper ─────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

/* ── mock data ────────────────────────────────── */
const MOCK_PLAYERS = [
  { id: 1, name: 'Sofia',   color: '#A855F7', delay: 1.2 },
  { id: 2, name: 'Marco',   color: '#F5B642', delay: 2.4 },
  { id: 3, name: 'Giulia',  color: '#EC4899', delay: 3.6 },
  { id: 4, name: 'Lorenzo', color: '#34D399', delay: 5.0 },
];

const LANGUAGES = ['🇮🇹 Italiano', '🇬🇧 English', '🇪🇸 Español', '🇫🇷 Français'];

/* ── cinematic background ─────────────────────── */
function SceneBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 130% 90% at 50% 100%,rgba(245,182,66,0.2) 0%,rgba(60,20,120,0.55) 30%,#030010 70%)',
      }}/>
      {/* spotlight left */}
      <div className="absolute" style={{
        left: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from -6deg at 20% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      {/* spotlight center */}
      <div className="absolute" style={{
        left: '30%', top: 0, width: '40%', height: '90%',
        background: 'conic-gradient(from -5deg at 50% 0%,transparent 0deg,rgba(168,85,247,0.1) 14deg,transparent 28deg)',
        filter: 'blur(3px)',
      }}/>
      {/* spotlight right */}
      <div className="absolute" style={{
        right: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from 6deg at 80% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      {/* crowd silhouettes */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1280 160" preserveAspectRatio="none" style={{ height: 160, opacity: 0.6 }}>
        {Array.from({ length: 48 }).map((_, i) => {
          const x = i * (1280 / 48);
          const h = 50 + Math.sin(i * 1.5) * 20 + (i % 3) * 12;
          return <ellipse key={i} cx={x + 13} cy={158 - h / 2} rx={9} ry={h / 2} fill="rgba(0,0,0,0.5)"/>;
        })}
      </svg>
      {/* floor glow */}
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 100,
        background: 'radial-gradient(ellipse 80% 100% at 50% 100%,rgba(245,182,66,0.2) 0%,rgba(168,85,247,0.1) 50%,transparent 80%)',
        filter: 'blur(10px)',
      }}/>
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 3,
        background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.5),transparent)',
      }}/>
      {/* particles */}
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{
            width: 2 + (i % 3), height: 2 + (i % 3),
            left: `${6 + (i * 6.5) % 88}%`,
            top: `${10 + (i * 7.3) % 70}%`,
            background: i % 2 === 0 ? 'rgba(245,182,66,0.65)' : 'rgba(168,85,247,0.65)',
          }}
          animate={{ y: [-6, 6, -6], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' as const }}
        />
      ))}
    </div>
  );
}

/* ── mock QR ──────────────────────────────────── */
function MockQR({ code }: { code: string }) {
  const cells = Array.from({ length: 17 * 17 }, (_, i) => {
    const row = Math.floor(i / 17); const col = i % 17;
    const isCorner =
      (row < 3 && col < 3) || (row < 3 && col > 13) || (row > 13 && col < 3);
    const seed = ((row * 17 + col) * 2654435761) >>> 0;
    return isCorner ? true : (seed % 3 !== 0);
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 10,
        boxShadow: '0 0 30px rgba(245,182,66,0.35), 0 0 60px rgba(245,182,66,0.15)',
        border: '2px solid rgba(245,182,66,0.5)',
      }}>
        <svg width={102} height={102} viewBox="0 0 17 17">
          {cells.map((filled, i) => filled && (
            <rect key={i} x={i % 17} y={Math.floor(i / 17)} width={1} height={1} fill="#111"/>
          ))}
        </svg>
      </div>
      <span style={{
        fontFamily: "'Outfit',sans-serif", fontSize: '0.62rem', fontWeight: 700,
        letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
      }}>
        Scansiona per entrare
      </span>
    </div>
  );
}

/* ── form input ───────────────────────────────── */
function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{
        fontFamily: "'Outfit',sans-serif", fontSize: '0.65rem', fontWeight: 800,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)',
      }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1.5px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '0.6rem 1rem',
          color: '#fff',
          fontFamily: "'Outfit',sans-serif",
          fontSize: '0.9rem',
          fontWeight: 600,
          outline: 'none',
          width: '100%',
          transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = 'rgba(245,182,66,0.6)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
      />
    </div>
  );
}

/* ── select field ─────────────────────────────── */
function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{
        fontFamily: "'Outfit',sans-serif", fontSize: '0.65rem', fontWeight: 800,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)',
      }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'rgba(30,10,60,0.9)',
          border: '1.5px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '0.6rem 1rem',
          color: '#fff',
          fontFamily: "'Outfit',sans-serif",
          fontSize: '0.9rem',
          fontWeight: 600,
          outline: 'none',
          width: '100%',
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ── player pill ──────────────────────────────── */
function PlayerPill({ name, color, index }: { name: string; color: string; index: number }) {
  return (
    <motion.div
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' as const }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${color}44`,
        borderRadius: 100,
        padding: '7px 14px 7px 7px',
        boxShadow: `0 0 16px ${color}22`,
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: `radial-gradient(circle,${color}55,${color}22)`,
        border: `2px solid ${color}88`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Outfit',sans-serif", fontWeight: 900,
        fontSize: '0.75rem', color: '#fff',
        flexShrink: 0,
      }}>
        {name[0]}
      </div>
      <span style={{
        fontFamily: "'Outfit',sans-serif", fontWeight: 700,
        fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)',
        letterSpacing: '0.02em',
      }}>{name}</span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Check size={12} color="#34D399"/>
        <span style={{ fontSize: '0.62rem', color: '#34D399', fontWeight: 700, letterSpacing: '0.05em' }}>
          CONNESSO
        </span>
      </div>
    </motion.div>
  );
}

/* ── page ─────────────────────────────────────── */
export default function HomeRoom() {
  const [, navigate] = useLocation();
  const [hostName,   setHostName]   = useState('');
  const [eveningName, setEveningName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('8');
  const [language,   setLanguage]   = useState(LANGUAGES[0]);
  const [arrivedIds, setArrivedIds] = useState<number[]>([]);

  const ROOM_CODE = 'CASA42';

  /* simulate players joining one by one */
  useEffect(() => {
    const timers = MOCK_PLAYERS.map(p =>
      setTimeout(() => setArrivedIds(prev => [...prev, p.id]), p.delay * 1000),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const arrivedPlayers = MOCK_PLAYERS.filter(p => arrivedIds.includes(p.id));

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background: '#030010', fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif" }}>

      <SceneBg/>

      {/* ── layout: 3 columns ── */}
      <div className="absolute inset-0 z-10 flex flex-col" style={{ padding: '0 clamp(16px,2.5vw,32px)' }}>

        {/* top bar */}
        <div className="flex items-center justify-between" style={{ paddingTop: 'clamp(10px,1.5vh,18px)', paddingBottom: 4 }}>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate('/mode-select')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 1.1rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1.5px solid rgba(255,255,255,0.12)',
              borderRadius: 100,
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.72rem', fontWeight: 700,
              letterSpacing: '0.05em', cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
            whileHover={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}
            whileTap={{ scale: 0.97 }}
          >
            <ChevronLeft size={13}/> MODALITÀ
          </motion.button>

          <motion.img
            src={pub('/jonny-world-logo.png')} alt="Jonny's World"
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.5 }}
            style={{
              width: 'clamp(7rem,11vw,9rem)', objectFit: 'contain',
              filter: 'drop-shadow(0 0 20px rgba(245,182,66,0.6))',
            }}
          />

          <div style={{ width: 100 }}/>
        </div>

        {/* page title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
          style={{ textAlign: 'center', marginBottom: 'clamp(6px,1.2vh,12px)' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.6rem)',
            letterSpacing: '0.06em', color: '#fff',
          }}>
            <Home size={22} color="#F5B642"/> CREA LA TUA STANZA
          </div>
          <div style={{
            fontSize: '0.65rem', letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.35)', fontWeight: 600,
            textTransform: 'uppercase', marginTop: 2,
          }}>
            Modalità Home · Partita Privata
          </div>
        </motion.div>

        {/* ── main 3-col grid ── */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr clamp(120px,14vw,160px) 1fr',
          gap: 'clamp(10px,1.8vw,24px)',
          minHeight: 0,
          alignItems: 'start',
        }}>

          {/* ── LEFT: form ── */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1.5px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: 'clamp(14px,2vh,22px) clamp(14px,1.8vw,22px)',
              backdropFilter: 'blur(14px)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{
              fontFamily: "'Outfit',sans-serif", fontWeight: 900,
              fontSize: '0.72rem', letterSpacing: '0.2em',
              color: '#F5B642', textTransform: 'uppercase', marginBottom: 2,
            }}>
              ⚙ Impostazioni Stanza
            </div>

            <Field label="Nome host" value={hostName} onChange={setHostName} placeholder="Come ti chiami?"/>
            <Field label="Nome serata" value={eveningName} onChange={setEveningName} placeholder="Es. Compleanno di Marco"/>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{
                  fontFamily: "'Outfit',sans-serif", fontSize: '0.65rem', fontWeight: 800,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.45)',
                }}>Max giocatori</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['4','6','8','12','20'].map(n => (
                    <button key={n} onClick={() => setMaxPlayers(n)}
                      style={{
                        flex: 1, padding: '0.45rem 0',
                        background: maxPlayers === n ? 'rgba(245,182,66,0.25)' : 'rgba(255,255,255,0.05)',
                        border: `1.5px solid ${maxPlayers === n ? 'rgba(245,182,66,0.7)' : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: 8, color: maxPlayers === n ? '#F5B642' : 'rgba(255,255,255,0.5)',
                        fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: '0.75rem',
                        cursor: 'pointer', transition: 'all 0.18s',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <SelectField label="Lingua gioco" value={language} onChange={setLanguage} options={LANGUAGES}/>
            </div>

            {/* divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }}/>

            {/* game mode chips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontFamily: "'Outfit',sans-serif", fontSize: '0.65rem', fontWeight: 800,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}>Giochi inclusi</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Freestyle','Quizzone','Parola','Karaoke','Percorso'].map((g, i) => (
                  <div key={g} style={{
                    padding: '4px 10px',
                    background: 'rgba(168,85,247,0.12)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: 100,
                    fontFamily: "'Outfit',sans-serif",
                    fontSize: '0.65rem', fontWeight: 700,
                    color: 'rgba(255,255,255,0.6)',
                    letterSpacing: '0.05em',
                  }}>
                    {g}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── CENTER: code + QR ── */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.28, duration: 0.5 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              paddingTop: 4,
            }}
          >
            {/* room code */}
            <div style={{
              background: 'rgba(245,182,66,0.1)',
              border: '2px solid rgba(245,182,66,0.55)',
              borderRadius: 14,
              padding: '10px 16px',
              textAlign: 'center',
              boxShadow: '0 0 30px rgba(245,182,66,0.2)',
              width: '100%',
            }}>
              <div style={{
                fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em',
                color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2,
              }}>Codice</div>
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
                style={{
                  fontFamily: "'Outfit','Arial Black',sans-serif",
                  fontWeight: 900, fontSize: 'clamp(1.4rem,2.2vw,1.8rem)',
                  letterSpacing: '0.12em', color: '#F5B642',
                  textShadow: '0 0 20px rgba(245,182,66,0.7)',
                }}
              >
                {ROOM_CODE}
              </motion.div>
            </div>

            <MockQR code={ROOM_CODE}/>

            {/* players badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 100, padding: '5px 12px',
            }}>
              <Users size={12} color="#A855F7"/>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 800,
                fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.05em',
              }}>
                <span style={{ color: '#A855F7' }}>{arrivedPlayers.length}</span>/{maxPlayers} connessi
              </span>
            </div>
          </motion.div>

          {/* ── RIGHT: players + jonny ── */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
            }}
          >
            {/* players list */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1.5px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: 'clamp(12px,1.8vh,18px) clamp(12px,1.4vw,18px)',
              backdropFilter: 'blur(14px)',
            }}>
              <div style={{
                fontFamily: "'Outfit',sans-serif", fontWeight: 900,
                fontSize: '0.72rem', letterSpacing: '0.2em',
                color: '#A855F7', textTransform: 'uppercase', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Users size={13}/> Giocatori in attesa
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minHeight: 120 }}>
                <AnimatePresence>
                  {arrivedPlayers.map((p, i) => (
                    <PlayerPill key={p.id} name={p.name} color={p.color} index={i}/>
                  ))}
                </AnimatePresence>
                {arrivedPlayers.length === 0 && (
                  <div style={{
                    textAlign: 'center', padding: '20px 0',
                    fontFamily: "'Outfit',sans-serif",
                    fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)',
                    fontStyle: 'italic',
                  }}>
                    In attesa dei giocatori…
                  </div>
                )}
              </div>
            </div>

            {/* Jonny speech bubble */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg,rgba(168,85,247,0.18),rgba(245,182,66,0.1))',
                border: '1.5px solid rgba(168,85,247,0.45)',
                borderRadius: 16,
                padding: '12px 16px',
                backdropFilter: 'blur(12px)',
              }}
            >
              {/* speech bubble tail */}
              <div style={{
                position: 'absolute', bottom: -8, right: 24, width: 14, height: 8,
                background: 'rgba(168,85,247,0.45)',
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
              }}/>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <img src={pub('/jonny-master-nobg.png')} alt="Jonny"
                  style={{
                    width: 44, height: 44, objectFit: 'contain', flexShrink: 0,
                    filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.6))',
                  }}
                />
                <div>
                  <div style={{
                    fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.15em',
                    color: '#F5B642', textTransform: 'uppercase', marginBottom: 4,
                  }}>Jonny dice</div>
                  <div style={{
                    fontFamily: "'Outfit',sans-serif", fontWeight: 600,
                    fontSize: 'clamp(0.72rem,1vw,0.82rem)',
                    color: 'rgba(255,255,255,0.85)',
                    lineHeight: 1.45, fontStyle: 'italic',
                  }}>
                    "Quando tutti sono pronti, io apro le porte dell'arena."
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

        </div>{/* end 3-col grid */}

        {/* ── bottom CTA ── */}
        <div className="flex items-center justify-center" style={{ paddingBlock: 'clamp(10px,1.8vh,18px)' }}>
          <motion.button
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            onClick={() => navigate('/home-v4?mode=home')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.9rem',
              padding: '1rem 3.5rem',
              background: 'linear-gradient(135deg,#F5B642 0%,#FF8C00 55%,#FF5500 100%)',
              border: '2px solid #FFD700',
              borderRadius: 100,
              fontFamily: "'Outfit','Arial Black',sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(1rem,1.6vw,1.3rem)',
              color: '#000',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              boxShadow: '0 0 50px rgba(245,182,66,0.65), 0 0 100px rgba(245,182,66,0.25), 0 6px 28px rgba(0,0,0,0.55)',
            }}
          >
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const }}
              style={{ fontSize: '1.3em' }}
            >⚡</motion.span>
            AVVIA LA PARTITA
          </motion.button>
        </div>

      </div>{/* end layout */}

      {/* Jonny full — scenic right */}
      <motion.div
        className="absolute pointer-events-none select-none"
        style={{ right: '-3%', bottom: 0, zIndex: 2, width: 'clamp(120px,16vw,200px)' }}
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.9, ease: 'easeOut' as const }}
      >
        <div style={{
          position: 'absolute', bottom: 0, left: '5%', right: '5%', height: 10,
          background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.7),rgba(168,85,247,0.5),transparent)',
          borderRadius: '50%', filter: 'blur(6px)',
        }}/>
        <motion.img
          src={pub('/jonny-master-nobg.png')} alt="Jonny host"
          style={{
            display: 'block', width: '100%', objectFit: 'contain',
            filter: 'drop-shadow(0 0 40px rgba(245,182,66,0.5)) drop-shadow(-4px 0 20px rgba(168,85,247,0.4)) drop-shadow(0 6px 24px rgba(0,0,0,0.6))',
          }}
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' as const }}
        />
      </motion.div>

    </div>
  );
}

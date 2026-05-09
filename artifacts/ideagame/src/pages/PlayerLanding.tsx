import { useRef } from 'react';
import { motion } from 'framer-motion';

// ── Dati ────────────────────────────────────────────────────────────────────

const MONDI = [
  { num: '01', name: 'Percorso a Risate',   desc: 'Sfide esilaranti, prove assurde, risate infinite',     color: '#F5B642', dark: '#7a5200' },
  { num: '02', name: 'Gioco delle Coppie',  desc: 'Memoria, intesa e complicità tra squadre',              color: '#FF69B4', dark: '#8a1050' },
  { num: '03', name: 'Quizzone',            desc: 'Domande, nervi e chi sa di più trionfa',               color: '#60A5FA', dark: '#1040a0' },
  { num: '04', name: 'SaraMusica',          desc: 'Indovina il titolo prima che lo facciano gli altri',   color: '#34D399', dark: '#0a6040' },
  { num: '05', name: 'Adult Only',          desc: 'Riservato agli adulti, vietato ai noiosi',             color: '#F87171', dark: '#8a1010' },
  { num: '06', name: 'Sfida di Ballo',      desc: 'Il telefono giudica il tuo ritmo — nessuna pietà',    color: '#A78BFA', dark: '#50208a' },
  { num: '07', name: 'Parola alle Spalle',  desc: 'Fai indovinare la parola senza poterla dire',         color: '#2DD4BF', dark: '#0a5050' },
  { num: '08', name: 'Karaoke Battle',      desc: 'Sali sul palco — la platea è il tuo giudice',         color: '#F472B6', dark: '#8a1060' },
];

const STEPS = [
  { num: '01', title: "L'animatore avvia",    body: "Crea l'evento in pochi secondi, sceglie i giochi e gestisce tutto dal suo tablet" },
  { num: '02', title: 'Gli ospiti entrano',   body: "Inquadrano il QR code con il telefono — nessuna app da scaricare, nessuna registrazione" },
  { num: '03', title: 'Jonny guida il gioco', body: "Il parco si anima, le squadre si sfidano, Jonny porta il divertimento fino all'ultima sfida" },
];

// ── Stelle ───────────────────────────────────────────────────────────────────

function Stars() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 80 }).map((_, i) => {
        const x  = (i * 43 + 17) % 100;
        const y  = (i * 67 + 11) % 100;
        const sz = 1 + (i % 5) * 0.5;
        const opacity = 0.15 + (i % 5) * 0.12;
        return (
          <motion.div key={i} className="absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: sz, height: sz, opacity }}
            animate={{ opacity: [opacity * 0.4, opacity, opacity * 0.4] }}
            transition={{ duration: 2 + (i % 7) * 0.4, delay: -(i * 0.22), repeat: Infinity }} />
        );
      })}
    </div>
  );
}

// ── Coriandoli ───────────────────────────────────────────────────────────────

const PALETTE = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#2DD4BF'];

function Coriandoli({ count = 28 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const color  = PALETTE[i % PALETTE.length];
        const left   = `${(i * 7.3 + 3) % 100}%`;
        const dur    = 5 + (i % 5) * 0.8;
        const w      = 5 + (i % 4) * 2.5;
        const h      = i % 3 === 0 ? w : w * 0.42;
        return (
          <motion.div key={i} className="absolute top-0 rounded-sm" style={{ left, width: w, height: h, backgroundColor: color }}
            animate={{ y: ['0vh', '110vh'], rotate: [0, i % 2 ? 400 : -400], opacity: [0, 0.85, 0.85, 0] }}
            transition={{ duration: dur, delay: -(i * 0.41), repeat: Infinity, ease: 'linear' }} />
        );
      })}
    </div>
  );
}

// ── Componenti sezione ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6 sm:mb-10">
      <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, #F5B64255)' }} />
      <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: '#F5B642' }}>{children}</span>
      <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, #F5B64255)' }} />
    </div>
  );
}

// ── HERO ─────────────────────────────────────────────────────────────────────

function Hero({ onJoin, onScrollDown }: { onJoin: () => void; onScrollDown: () => void }) {
  return (
    <section className="relative flex flex-col overflow-hidden select-none"
      style={{ minHeight: '100svh', background: 'radial-gradient(ellipse 120% 70% at 50% -5%, #1e0840 0%, #0e0520 40%, #060210 100%)' }}>

      <Stars />

      {/* Spotlight cone */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full"
        style={{ height: '80%', background: 'radial-gradient(ellipse 60% 100% at 50% 0%, #7C3AED1a 0%, transparent 75%)' }} />

      {/* Side glow orbs */}
      <div className="pointer-events-none absolute" style={{ top: '30%', left: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, #F5B64210 0%, transparent 70%)', filter: 'blur(50px)' }} />
      <div className="pointer-events-none absolute" style={{ top: '40%', right: '-5%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, #FF69B410 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Hero poster image — fills the screen */}
      <motion.div className="absolute inset-0 z-0"
        initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}>
        <img src="/jonny-world-hero.png" alt="Jonny's World"
          className="w-full h-full object-cover object-center"
          style={{ filter: 'brightness(0.88) saturate(1.15)' }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(4,2,16,0.05) 0%, rgba(4,2,16,0.0) 35%, rgba(4,2,16,0.55) 60%, rgba(4,2,16,0.92) 78%, rgba(4,2,16,0.99) 100%)' }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(4,2,16,0.45) 0%, transparent 18%)' }} />
      </motion.div>

      {/* CTAs — pinned to bottom of hero */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center pb-10 sm:pb-12 px-5">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-5 text-xs font-black uppercase tracking-[0.2em]"
          style={{ background: 'rgba(245,182,66,0.15)', border: '1px solid rgba(245,182,66,0.45)', color: '#F5B642', backdropFilter: 'blur(10px)' }}>
          <motion.span className="inline-block w-2 h-2 rounded-full bg-current flex-shrink-0"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          8 mondi di gioco live
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg">
          <motion.button onClick={onJoin} whileTap={{ scale: 0.97 }}
            className="relative flex-1 overflow-hidden rounded-2xl font-black text-black"
            style={{ padding: '20px 32px', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', background: 'linear-gradient(135deg, #FFE57A 0%, #F5B642 50%, #E08800 100%)', boxShadow: '0 0 50px rgba(245,182,66,0.7), 0 4px 24px rgba(0,0,0,0.6)' }}>
            <motion.div className="absolute inset-0 -skew-x-12 w-1/4"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)' }}
              animate={{ x: ['-150%', '400%'] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }} />
            Entra nel mondo
          </motion.button>

          <motion.button onClick={onScrollDown} whileTap={{ scale: 0.97 }}
            className="flex-1 rounded-2xl font-bold"
            style={{ padding: '20px 24px', fontSize: 'clamp(0.88rem, 2vw, 1rem)', border: '1.5px solid rgba(245,182,66,0.5)', color: '#FFE57A', background: 'rgba(4,2,16,0.55)', backdropFilter: 'blur(12px)' }}>
            Scopri gli 8 giochi
          </motion.button>
        </div>

        <button onClick={onJoin} className="mt-4 font-medium"
          style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Ho un codice evento → inseriscilo
        </button>
      </div>

      {/* Scroll indicator */}
      <motion.div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center"
        animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
        <div className="w-px h-10" style={{ background: 'linear-gradient(to bottom, rgba(245,182,66,0.5), transparent)' }} />
      </motion.div>
    </section>
  );
}

// ── SEZIONE 8 MONDI ──────────────────────────────────────────────────────────

function Mondi() {
  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-10 lg:px-16"
      style={{ background: 'linear-gradient(180deg, #060210 0%, #0c0420 50%, #060210 100%)' }}>

      <div className="max-w-7xl mx-auto">
        <SectionLabel>I Mondi di Gioco</SectionLabel>

        <div className="text-center mb-10 sm:mb-14">
          <h2 className="font-black text-white leading-tight"
            style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)', textShadow: '0 0 40px rgba(167,139,250,0.3)' }}>
            8 attrazioni.<br />Una serata indimenticabile.
          </h2>
          <p className="mt-3 font-medium max-w-xl mx-auto" style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1.05rem)', color: 'rgba(255,255,255,0.45)' }}>
            Ogni gioco è un mondo a sé. L'animatore sceglie, il pubblico vince.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {MONDI.map((m, i) => (
            <motion.div key={m.num}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.06, duration: 0.5, type: 'spring', stiffness: 160 }}
              className="relative overflow-hidden rounded-2xl sm:rounded-3xl flex flex-col"
              style={{
                background: `linear-gradient(145deg, ${m.color}12 0%, ${m.dark}30 100%)`,
                border: `1.5px solid ${m.color}35`,
                boxShadow: `0 4px 30px ${m.color}18, inset 0 0 20px ${m.color}08`,
                minHeight: 'clamp(140px, 20vh, 210px)',
                padding: 'clamp(14px, 3vw, 24px)',
              }}>

              {/* Attraction number — giant watermark */}
              <div className="absolute top-1 right-2 font-black leading-none pointer-events-none select-none"
                style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)', color: `${m.color}18` }}>
                {m.num}
              </div>

              {/* Top accent bar */}
              <div className="w-8 h-1 rounded-full mb-3" style={{ background: m.color, boxShadow: `0 0 10px ${m.color}` }} />

              <h3 className="font-black leading-tight relative z-10"
                style={{ fontSize: 'clamp(0.8rem, 2vw, 1.05rem)', color: m.color, textShadow: `0 0 16px ${m.color}66` }}>
                {m.name}
              </h3>

              <p className="mt-2 relative z-10 leading-snug" style={{ fontSize: 'clamp(0.65rem, 1.4vw, 0.8rem)', color: 'rgba(255,255,255,0.48)' }}>
                {m.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── COME FUNZIONA ─────────────────────────────────────────────────────────────

function ComeFunziona() {
  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-10 lg:px-16 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060210 0%, #0a0628 50%, #060210 100%)' }}>

      {/* BG accent */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div style={{ width: '60%', height: '60%', borderRadius: '50%', background: 'radial-gradient(ellipse, #7C3AED0a 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <SectionLabel>Come Funziona</SectionLabel>

        <div className="text-center mb-10 sm:mb-14">
          <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)' }}>
            Tre passi verso il divertimento
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {STEPS.map((s, i) => (
            <motion.div key={s.num}
              initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.12, duration: 0.6, type: 'spring', stiffness: 140 }}
              className="relative rounded-3xl p-6 sm:p-8 flex flex-col"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>

              {/* Giant step number */}
              <div className="font-black leading-none mb-4" style={{ fontSize: 'clamp(3.5rem, 8vw, 6rem)', color: '#F5B642', opacity: 0.18, lineHeight: 1 }}>
                {s.num}
              </div>

              {/* Connector arrow (hidden on mobile) */}
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 z-10"
                  style={{ width: 24, height: 24, color: 'rgba(245,182,66,0.35)' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18l6-6-6-6" strokeWidth={2} /></svg>
                </div>
              )}

              <h3 className="font-black text-white mb-2" style={{ fontSize: 'clamp(1rem, 2.2vw, 1.3rem)' }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 'clamp(0.78rem, 1.6vw, 0.92rem)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── MODALITA' ─────────────────────────────────────────────────────────────────

function Modalita({ onJoin }: { onJoin: () => void }) {
  const modes = [
    {
      tag: 'Live Event', title: 'Feste, matrimoni, eventi aziendali',
      body: "Jonny's World è pensato per le serate dal vivo. Fino a 200 persone, tutto su schermo, tutto live.",
      color: '#F5B642', dark: '#7a3e00',
      items: ['Proiettore + QR code', 'Fino a 200 ospiti', 'Ogni gioco su misura'],
    },
    {
      tag: 'Home Mode', title: 'Gioca da casa con Jonny come host',
      body: "Stessa esperienza, divano di casa. Connetti la TV, invita gli amici — Jonny è lì.",
      color: '#A78BFA', dark: '#2d1060',
      items: ['Smart TV + telefoni', 'Nessun limite di giocatori', 'Modalità family-friendly'],
    },
  ];

  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-10 lg:px-16"
      style={{ background: 'linear-gradient(180deg, #060210 0%, #080318 50%, #060210 100%)' }}>

      <div className="max-w-7xl mx-auto">
        <SectionLabel>Due Modalita</SectionLabel>

        <div className="text-center mb-10 sm:mb-14">
          <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)' }}>
            Live o a casa — Jonny arriva.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {modes.map((m, i) => (
            <motion.div key={m.tag}
              initial={{ opacity: 0, x: i === 0 ? -24 : 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.1, duration: 0.6, type: 'spring', stiffness: 140 }}
              className="relative overflow-hidden rounded-3xl p-7 sm:p-10 flex flex-col gap-5"
              style={{
                background: `linear-gradient(145deg, ${m.color}15 0%, ${m.dark}40 100%)`,
                border: `1.5px solid ${m.color}30`,
                boxShadow: `0 8px 40px ${m.color}18`,
              }}>

              {/* BG glow */}
              <div className="pointer-events-none absolute top-0 right-0 w-1/2 h-1/2"
                style={{ background: `radial-gradient(circle at 80% 20%, ${m.color}18 0%, transparent 70%)` }} />

              <div className="relative z-10">
                <div className="inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.2em] mb-4"
                  style={{ background: `${m.color}20`, border: `1px solid ${m.color}40`, color: m.color }}>
                  {m.tag}
                </div>
                <h3 className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)' }}>
                  {m.title}
                </h3>
                <p style={{ fontSize: 'clamp(0.8rem, 1.6vw, 0.95rem)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>
                  {m.body}
                </p>
              </div>

              <ul className="relative z-10 flex flex-col gap-2.5">
                {m.items.map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
                    <span style={{ fontSize: 'clamp(0.78rem, 1.5vw, 0.88rem)', color: 'rgba(255,255,255,0.65)' }}>{item}</span>
                  </li>
                ))}
              </ul>

              {i === 0 && (
                <motion.button onClick={onJoin} whileTap={{ scale: 0.97 }}
                  className="relative z-10 self-start mt-2 rounded-xl font-black text-black"
                  style={{ padding: '12px 28px', fontSize: '0.9rem', background: 'linear-gradient(135deg, #FFE57A 0%, #F5B642 100%)', boxShadow: '0 0 24px rgba(245,182,66,0.45)' }}>
                  Entra in un evento
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── JONNY CREATOR ─────────────────────────────────────────────────────────────

const CREATOR_STEPS = [
  { num: '01', emoji: '🎭', title: 'Scegli il tema',       body: 'Digiti "La Bella e la Bestia" e Jonny capisce tutto — pubblico, tono, difficoltà.' },
  { num: '02', emoji: '🤖', title: 'Jonny genera',         body: 'In 30 secondi: quiz, sfide, playlist e parole — pronti per la tua serata.' },
  { num: '03', emoji: '✅', title: 'Approvi o modifichi',  body: 'Rivedi ogni contenuto, tieni quello che vuoi, elimina il resto con un clic.' },
  { num: '04', emoji: '🚀', title: 'Importa direttamente', body: 'Un clic e il contenuto è live nella tua console — pronto per il proiettore.' },
];

function JonnyCrea() {
  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-10 lg:px-16 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060210 0%, #0f0830 50%, #060210 100%)' }}>

      {/* BG aurora */}
      <div className="pointer-events-none absolute inset-0">
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: '70%', height: '60%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(245,182,66,0.07) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <SectionLabel>Jonny AI Creator</SectionLabel>

        <div className="text-center mb-10 sm:mb-14">
          <motion.div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-4 text-xs font-black uppercase tracking-[0.2em]"
            style={{ background: 'rgba(245,182,66,0.12)', border: '1px solid rgba(245,182,66,0.35)', color: '#F5B642' }}
            initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            ✨ Powered by AI
          </motion.div>
          <motion.h2 className="font-black text-white leading-tight"
            style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)' }}
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: 0.08 }}>
            Jonny crea la tua serata.<br />
            <span style={{ color: '#F5B642' }}>Tu ti diverti.</span>
          </motion.h2>
          <motion.p className="mt-4 max-w-lg mx-auto"
            style={{ fontSize: 'clamp(0.83rem, 1.7vw, 1rem)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.15 }}>
            Digita il tema — "matrimonio anni '80", "La Bella e la Bestia", "serata aziendale tech" —
            e Jonny genera in 30 secondi quiz, sfide fisiche, playlist karaoke e molto altro.
          </motion.p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-14">
          {CREATOR_STEPS.map((s, i) => (
            <motion.div key={s.num}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.08, duration: 0.5, type: 'spring', stiffness: 150 }}
              className="relative rounded-2xl sm:rounded-3xl flex flex-col"
              style={{ padding: 'clamp(16px,3vw,28px)', background: 'rgba(245,182,66,0.05)', border: '1.5px solid rgba(245,182,66,0.18)', boxShadow: '0 4px 24px rgba(245,182,66,0.06)' }}>

              <div className="text-2xl sm:text-3xl mb-3">{s.emoji}</div>
              <div className="font-black leading-none mb-2" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', color: 'rgba(245,182,66,0.15)', lineHeight: 1 }}>
                {s.num}
              </div>
              <h3 className="font-black mb-2" style={{ fontSize: 'clamp(0.82rem, 1.8vw, 1rem)', color: '#F5B642' }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 'clamp(0.7rem, 1.4vw, 0.82rem)', color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Demo showcase */}
        <motion.div className="relative overflow-hidden rounded-3xl"
          style={{ background: 'linear-gradient(145deg, rgba(245,182,66,0.1) 0%, rgba(124,58,237,0.08) 100%)', border: '1.5px solid rgba(245,182,66,0.22)', padding: 'clamp(24px, 4vw, 40px)' }}
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.6 }}>

          <div className="pointer-events-none absolute top-0 right-0 w-2/5 h-full"
            style={{ background: 'radial-gradient(circle at 90% 20%, rgba(245,182,66,0.1) 0%, transparent 60%)' }} />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-10">
            <div className="flex-1">
              <div className="text-sm font-black uppercase tracking-[0.15em] mb-2" style={{ color: 'rgba(245,182,66,0.6)' }}>
                Esempio dal vivo
              </div>
              <div className="font-black text-white mb-3" style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)' }}>
                Tema: "La Bella e la Bestia"
              </div>
              <p style={{ fontSize: 'clamp(0.78rem, 1.5vw, 0.9rem)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
                Jonny genera automaticamente: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>15 domande quiz</strong> sui film Disney,
                una <strong style={{ color: 'rgba(255,255,255,0.7)' }}>playlist karaoke</strong> con "Tale As Old As Time" e altri classici,
                <strong style={{ color: 'rgba(255,255,255,0.7)' }}> 10 sfide fisiche</strong> a tema fiaba e
                <strong style={{ color: 'rgba(255,255,255,0.7)' }}> 20 parole</strong> per "Parola alle Spalle".
              </p>
            </div>

            <div className="flex-shrink-0 flex flex-col gap-2 w-full lg:w-auto">
              <div className="flex flex-col gap-1.5">
                {['🎯 Quiz Quizzone', '🎤 Playlist Karaoke', '⚡ Sfide Percorso', '🔤 Parola alle Spalle'].map((item, i) => (
                  <motion.div key={item} className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: 'rgba(245,182,66,0.08)', border: '1px solid rgba(245,182,66,0.2)' }}
                    initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.07 }}>
                    <span className="text-sm">{item}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                      <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>PRONTO</span>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="text-center text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                generato in ~30 secondi
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── FINALE ────────────────────────────────────────────────────────────────────

function Finale({ onJoin }: { onJoin: () => void }) {
  return (
    <section className="relative overflow-hidden py-24 sm:py-36 px-5 sm:px-10 text-center"
      style={{ background: 'radial-gradient(ellipse 120% 100% at 50% 100%, #1e0840 0%, #0e0520 40%, #060210 100%)' }}>

      <Coriandoli count={20} />

      {/* Stage spotlight from bottom */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ width: '80%', height: '60%', background: 'radial-gradient(ellipse at 50% 100%, rgba(245,182,66,0.12) 0%, transparent 70%)' }} />

      <div className="relative z-10 flex flex-col items-center max-w-4xl mx-auto">

        {/* Jonny vincitore */}
        <motion.img src="/jonny-master.jpg" alt="Jonny"
          style={{ height: 'clamp(180px, 30vh, 340px)', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 16px 50px rgba(245,182,66,0.6))' }}
          initial={{ opacity: 0, y: 40, scale: 0.85 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.7, type: 'spring', stiffness: 100 }}
          animate={{ y: [0, -16, 0] }}
        />

        <motion.h2 className="font-black text-white mt-8 leading-tight"
          style={{ fontSize: 'clamp(2.2rem, 7vw, 5.5rem)', filter: 'drop-shadow(0 0 40px rgba(245,182,66,0.3))' }}
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.15, duration: 0.6 }}>
          Benvenuto nel<br />
          <span style={{ color: '#F5B642' }}>mondo di Jonny</span>
        </motion.h2>

        <motion.p className="mt-4 max-w-lg" style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1.05rem)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.25 }}>
          Il parco del divertimento intelligente ti aspetta.<br />
          Scegli la tua sfida e inizia a giocare.
        </motion.p>

        <motion.button onClick={onJoin} whileTap={{ scale: 0.96 }}
          className="relative overflow-hidden rounded-2xl font-black text-black mt-10"
          style={{ padding: '20px 60px', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', background: 'linear-gradient(135deg, #FFE57A 0%, #F5B642 50%, #E08800 100%)', boxShadow: '0 0 60px rgba(245,182,66,0.6), 0 8px 30px rgba(0,0,0,0.5)' }}
          initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 140 }}>
          <motion.div className="absolute inset-0 -skew-x-12 w-1/4"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }}
            animate={{ x: ['-150%', '400%'] }} transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.5 }} />
          Gioca ora con Jonny
        </motion.button>

        <motion.button onClick={onJoin} className="mt-4 font-medium transition-colors"
          style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}
          whileHover={{ color: 'rgba(255,255,255,0.6)' } as Record<string, string>}
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.5 }}>
          Ho un codice evento → inseriscilo
        </motion.button>
      </div>
    </section>
  );
}

// ── FOOTER ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="relative py-8 sm:py-10 px-5 text-center"
      style={{ background: '#04020e', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="IDEAgame" className="h-5 w-auto" style={{ filter: 'drop-shadow(0 0 8px rgba(245,182,66,0.5)) brightness(0.8)' }} />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>powered by IDEAgame</span>
        </div>
        <div className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Progettato e sviluppato da <span style={{ color: 'rgba(255,255,255,0.45)' }}>Andrea Gentile</span>
        </div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>
          © {new Date().getFullYear()} Jonny's World
        </div>
      </div>
    </footer>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

interface Props { onJoin: () => void }

export function PlayerLanding({ onJoin }: Props) {
  const mondiRef = useRef<HTMLDivElement>(null);

  const scrollToMondi = () => mondiRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="relative w-full overflow-x-hidden" style={{ background: '#060210' }}>
      <Hero onJoin={onJoin} onScrollDown={scrollToMondi} />
      <div ref={mondiRef}><Mondi /></div>
      <ComeFunziona />
      <Modalita onJoin={onJoin} />
      <JonnyCrea />
      <Finale onJoin={onJoin} />
      <Footer />
    </div>
  );
}

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

      {/* Main hero layout: stacks on mobile, side-by-side on desktop */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 flex-1 py-16 gap-8 lg:gap-0">

        {/* Left: text + CTAs */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left lg:max-w-[52%]">

          {/* Top badge */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-xs font-black uppercase tracking-[0.2em]"
            style={{ background: 'rgba(245,182,66,0.12)', border: '1px solid rgba(245,182,66,0.35)', color: '#F5B642' }}>
            <motion.span className="inline-block w-2 h-2 rounded-full bg-current"
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
            8 mondi di gioco live
          </motion.div>

          {/* JONNY'S WORLD title — 3D extrusion effect */}
          <motion.div initial={{ opacity: 0, scale: 0.88, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, type: 'spring', stiffness: 120 }}
            className="font-black leading-none text-display"
            style={{
              fontSize: 'clamp(3rem, 11vw, 9rem)',
              color: '#F5B642',
              filter: 'drop-shadow(0 8px 0 #7a3e00) drop-shadow(0 0 60px rgba(245,182,66,0.35))',
              lineHeight: 0.92,
            }}>
            JONNY'S<br />WORLD
          </motion.div>

          {/* Subtitle */}
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-4 sm:mt-5 font-bold uppercase tracking-[0.18em]"
            style={{ fontSize: 'clamp(0.65rem, 2vw, 1.05rem)', color: '#A78BFA', textShadow: '0 0 24px #A78BFA55' }}>
            Il parco del divertimento intelligente
          </motion.p>

          {/* CTAs */}
          <motion.div className="flex flex-col sm:flex-row gap-3 mt-8 sm:mt-10 w-full sm:w-auto"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}>

            <motion.button onClick={onJoin} whileTap={{ scale: 0.97 }}
              className="relative overflow-hidden rounded-2xl font-black text-black"
              style={{ padding: '18px 40px', fontSize: 'clamp(0.95rem, 2vw, 1.15rem)', background: 'linear-gradient(135deg, #FFE57A 0%, #F5B642 50%, #E08800 100%)', boxShadow: '0 0 40px rgba(245,182,66,0.55), 0 4px 20px rgba(0,0,0,0.4)' }}>
              <motion.div className="absolute inset-0 -skew-x-12 w-1/4"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                animate={{ x: ['-150%', '400%'] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }} />
              Entra nel mondo
            </motion.button>

            <motion.button onClick={onScrollDown} whileTap={{ scale: 0.97 }}
              className="rounded-2xl font-bold"
              style={{ padding: '18px 32px', fontSize: 'clamp(0.85rem, 1.8vw, 1rem)', border: '1.5px solid rgba(167,139,250,0.5)', color: '#A78BFA', background: 'rgba(167,139,250,0.08)' }}>
              Scopri gli 8 giochi
            </motion.button>
          </motion.div>

          {/* Mini stat row */}
          <motion.div className="flex gap-6 sm:gap-8 mt-8 sm:mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {[['8', 'giochi'], ['Live', 'party'], ['No app', 'solo QR']].map(([big, small]) => (
              <div key={big} className="flex flex-col">
                <span className="font-black text-white" style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)' }}>{big}</span>
                <span className="text-xs uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.4)' }}>{small}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right: Jonny mascot */}
        <motion.div className="flex flex-col items-center justify-end lg:justify-center relative"
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.8 }}>

          {/* Stage glow below Jonny */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{ width: '70%', height: 60, background: 'radial-gradient(ellipse, rgba(245,182,66,0.35) 0%, transparent 70%)', filter: 'blur(20px)' }} />

          <motion.img src="/jonny/via-nobg.png" alt="Jonny"
            style={{
              height: 'clamp(220px, 40vh, 520px)', width: 'auto', objectFit: 'contain',
              mixBlendMode: 'multiply', filter: 'drop-shadow(0 20px 60px rgba(245,182,66,0.55)) drop-shadow(0 0 30px rgba(167,139,250,0.3))',
              position: 'relative', zIndex: 1,
            }}
            animate={{ y: [0, -20, 0], rotate: [-1, 1, -1] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div className="relative z-10 flex flex-col items-center pb-6 sm:pb-8"
        animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
        <div className="w-px h-12 sm:h-16" style={{ background: 'linear-gradient(to bottom, rgba(245,182,66,0.6), transparent)' }} />
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
        <motion.img src="/jonny/vincitore-nobg.png" alt="Jonny"
          style={{ height: 'clamp(180px, 30vh, 340px)', width: 'auto', objectFit: 'contain', mixBlendMode: 'multiply', filter: 'drop-shadow(0 16px 50px rgba(245,182,66,0.6))' }}
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
      <Finale onJoin={onJoin} />
      <Footer />
    </div>
  );
}

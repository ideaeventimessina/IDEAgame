import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Play, Trophy, Star, Zap, Music,
  QrCode, Gamepad2, ChevronRight, Home, Tv2, Lock,
  PartyPopper, Mic2, Shuffle, Heart, Flame,
} from 'lucide-react';

/* ─── types ─────────────────────────────────────────────────── */
type Screen =
  | 'landing'
  | 'mode-select'
  | 'home-lobby'
  | 'home-game'
  | 'home-scoreboard'
  | 'live-info'
  | 'live-wait';

interface MockPlayer { id: number; name: string; avatar: string; score: number; team: string; }
interface Game { slug: string; label: string; emoji: string; desc: string; color: string; img?: string; }

/* ─── mock data ──────────────────────────────────────────────── */
const MOCK_PLAYERS: MockPlayer[] = [
  { id: 1, name: 'Sofia',   avatar: '🦋', score: 340, team: 'Rossi' },
  { id: 2, name: 'Marco',   avatar: '🐯', score: 280, team: 'Blu'   },
  { id: 3, name: 'Giulia',  avatar: '🌸', score: 450, team: 'Rossi' },
  { id: 4, name: 'Lorenzo', avatar: '🦊', score: 210, team: 'Blu'   },
  { id: 5, name: 'Chiara',  avatar: '⭐', score: 390, team: 'Oro'   },
  { id: 6, name: 'Davide',  avatar: '🎸', score: 175, team: 'Oro'   },
];

const GAMES: Game[] = [
  { slug: 'percorso-a-risate', label: 'Percorso a Risate', emoji: '🎲', desc: 'Sfide di gruppo a tappe', color: '#7C3AED', img: '/challenges/sfida.png' },
  { slug: 'gioco-coppie',      label: 'Gioco delle Coppie', emoji: '🃏', desc: 'Memory di coppia visivo',  color: '#DB2777', img: '/challenges/coppia.png' },
  { slug: 'quizzone',          label: 'Quizzone',           emoji: '❓', desc: 'Quiz a risposta rapida',   color: '#D97706', img: '/challenges/domanda.png' },
  { slug: 'adult-only',        label: 'Adult Only',         emoji: '🔥', desc: 'Solo per adulti 18+',      color: '#DC2626', img: '/challenges/reazione.png' },
  { slug: 'sfida-ballo',       label: 'Sfida di Ballo',     emoji: '💃', desc: 'Muoviti con il telefono',  color: '#059669', img: '/challenges/ballo.png' },
  { slug: 'parola-alle-spalle',label: 'Parola alle Spalle', emoji: '🔤', desc: 'Indovina senza guardare',  color: '#0891B2', img: '/challenges/mimo.png' },
  { slug: 'karaoke-battle',    label: 'Karaoke Battle',     emoji: '🎤', desc: 'Chi canta meglio?',        color: '#7C3AED', img: '/challenges/fantasia.png' },
  { slug: 'freestyle-battle',  label: 'Freestyle Battle',   emoji: '⭐', desc: 'Creatività senza limiti',  color: '#B45309', img: '/challenges/veloce.png' },
];

const PODIUM_ORDER = [1, 0, 2];

/* ─── helpers ────────────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function asset(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -20 },
  transition: { duration: 0.38, ease: 'easeOut' as const },
};

/* ─── sub-screens ────────────────────────────────────────────── */

function Landing({ onNext }: { onNext: () => void }) {
  return (
    <motion.div {...fadeUp} className="relative flex flex-col items-center justify-between h-full px-6 pt-8 pb-10">
      <motion.img
        src={asset('/jonny-world-hero.png')}
        alt="Jonny's World"
        className="w-full max-w-lg rounded-3xl object-cover shadow-2xl"
        style={{ maxHeight: 340 }}
        initial={{ scale: 1.05, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7 }}
      />

      <div className="mt-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-400 mb-2">
            Il Parco del Divertimento Intelligente
          </div>
          <h1 className="text-4xl font-black text-white leading-tight drop-shadow-xl">
            JONNY'S&nbsp;<span className="text-amber-400">WORLD</span>
          </h1>
          <p className="mt-3 text-white/60 text-sm max-w-xs mx-auto">
            8 mondi di gioco. Un palco. Venti giocatori. Costruito per far divertire tutti.
          </p>
        </motion.div>
      </div>

      <motion.button
        onClick={onNext}
        className="mt-8 w-full max-w-sm rounded-2xl py-5 font-black text-xl text-black shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #F5B642 0%, #FF6B35 100%)' }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        🎉 Inizia il Divertimento
      </motion.button>

      <p className="mt-4 text-white/30 text-xs">Prototipo V2 — tutto mock, nessun backend</p>
    </motion.div>
  );
}

function ModeSelect({ onHome, onLive, onBack }: { onHome: () => void; onLive: () => void; onBack: () => void }) {
  return (
    <motion.div {...fadeUp} className="flex flex-col h-full px-6 pt-6 pb-10">
      <BackBtn onClick={onBack} />
      <div className="mt-6 mb-8 text-center">
        <div className="text-xs font-black uppercase tracking-[0.25em] text-amber-400 mb-1">Scegli la modalità</div>
        <h2 className="text-3xl font-black text-white">Come vuoi giocare?</h2>
      </div>

      <div className="flex flex-col gap-5 flex-1 justify-center max-w-sm mx-auto w-full">
        <ModeCard
          icon={<Home size={32} />}
          title="Modalità Home"
          sub="Gioca con amici e famiglia a casa"
          tags={['fino a 8 giocatori', 'niente proiettore', 'telefono basta']}
          gradient="linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)"
          onClick={onHome}
        />
        <ModeCard
          icon={<Tv2 size={32} />}
          title="Modalità Live"
          sub="Evento professionale con proiettore"
          tags={['fino a 20 giocatori', 'proiettore + regia', 'party show']}
          gradient="linear-gradient(135deg,#DB2777 0%,#9333EA 100%)"
          onClick={onLive}
        />
      </div>
    </motion.div>
  );
}

function ModeCard({ icon, title, sub, tags, gradient, onClick }:
  { icon: React.ReactNode; title: string; sub: string; tags: string[]; gradient: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative overflow-hidden rounded-3xl p-6 text-left shadow-xl"
      style={{ background: gradient }}
      whileHover={{ scale: 1.025, y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="absolute inset-0 opacity-10"
        style={{ background: 'radial-gradient(circle at 80% 20%, white, transparent 60%)' }} />
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-white/20 p-3 text-white">{icon}</div>
        <div className="flex-1">
          <div className="font-black text-xl text-white">{title}</div>
          <div className="text-white/70 text-sm mt-0.5">{sub}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map(t => (
              <span key={t} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">
                {t}
              </span>
            ))}
          </div>
        </div>
        <ChevronRight size={20} className="text-white/60 mt-1 shrink-0" />
      </div>
    </motion.button>
  );
}

function HomeLobby({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);

  return (
    <motion.div {...fadeUp} className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <BackBtn onClick={onBack} />
        <span className="font-black text-white text-lg ml-1">Lobby Casa</span>
      </div>

      {/* QR mock */}
      <div className="mx-5 rounded-3xl p-5 flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg,#1E1040 0%,#2D1B69 100%)', border: '1px solid rgba(124,58,237,0.4)' }}>
        <div className="rounded-2xl bg-white p-3 shrink-0">
          <QrCodeMock size={72} />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-purple-300">Codice partita</div>
          <div className="text-3xl font-black text-white tracking-widest mt-0.5">CASA42</div>
          <div className="text-white/50 text-xs mt-1">Vai su ideagame.app e inserisci il codice</div>
        </div>
      </div>

      {/* Players */}
      <div className="px-5 mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-white/50">
            <Users size={12} className="inline mr-1.5" />Giocatori ({MOCK_PLAYERS.length}/8)
          </span>
          <span className="text-xs font-bold text-green-400">● Live</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MOCK_PLAYERS.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl p-2.5 text-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="text-2xl">{p.avatar}</div>
              <div className="text-white font-bold text-xs mt-1 truncate">{p.name}</div>
              <div className="text-white/40 text-[10px]">{p.team}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Game Picker */}
      <div className="px-5 mt-4">
        <div className="text-xs font-black uppercase tracking-widest text-white/50 mb-2">
          <Gamepad2 size={12} className="inline mr-1.5" />Scegli il Gioco
        </div>
        <div className="grid grid-cols-4 gap-2">
          {GAMES.map(g => (
            <motion.button
              key={g.slug}
              onClick={() => setSelectedGame(g)}
              className="rounded-2xl p-2 text-center transition-all"
              style={{
                background: selectedGame.slug === g.slug
                  ? `${g.color}33`
                  : 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${selectedGame.slug === g.slug ? g.color : 'rgba(255,255,255,0.08)'}`,
              }}
              whileTap={{ scale: 0.93 }}
            >
              <div className="text-xl">{g.emoji}</div>
              <div className="text-[9px] font-bold text-white/70 mt-0.5 leading-tight">{g.label.split(' ')[0]}</div>
            </motion.button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl p-3 flex items-center gap-3"
          style={{ background: `${selectedGame.color}22`, border: `1px solid ${selectedGame.color}55` }}>
          <span className="text-2xl">{selectedGame.emoji}</span>
          <div>
            <div className="font-black text-white text-sm">{selectedGame.label}</div>
            <div className="text-white/50 text-xs">{selectedGame.desc}</div>
          </div>
        </div>
      </div>

      {/* Start */}
      <div className="px-5 mt-5 pb-8">
        <motion.button
          onClick={onStart}
          className="w-full rounded-2xl py-4 font-black text-lg text-black shadow-xl"
          style={{ background: 'linear-gradient(135deg,#00F5A0 0%,#00D9F5 100%)' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Play size={20} className="inline mr-2 -mt-0.5" />
          Avvia {selectedGame.label}
        </motion.button>
      </div>
    </motion.div>
  );
}

function HomeGame({ onEnd, onBack }: { onEnd: () => void; onBack: () => void }) {
  const [round, setRound] = useState(1);
  const [answered, setAnswered] = useState<number | null>(null);
  const correctIdx = 2;
  const answers = ['Milano', 'Roma', 'Napoli', 'Torino'];
  const totalRounds = 5;

  const handleAnswer = (i: number) => {
    if (answered !== null) return;
    setAnswered(i);
  };

  const nextRound = () => {
    if (round >= totalRounds) { onEnd(); return; }
    setRound(r => r + 1);
    setAnswered(null);
  };

  return (
    <motion.div {...fadeUp} className="flex flex-col h-full px-5 pt-5 pb-8">
      <div className="flex items-center justify-between mb-4">
        <BackBtn onClick={onBack} />
        <div className="text-white/50 text-sm font-bold">Round {round}/{totalRounds}</div>
        <div className="rounded-xl bg-amber-400/20 px-3 py-1 text-amber-400 font-black text-sm">
          <Zap size={12} className="inline mr-1" />Quizzone
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/10 mb-6">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#7C3AED,#00F5A0)' }}
          animate={{ width: `${(round / totalRounds) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Question */}
      <div className="rounded-3xl p-6 mb-5 text-center"
        style={{ background: 'linear-gradient(135deg,#1E1040,#2D1B69)', border: '1px solid rgba(124,58,237,0.3)' }}>
        <div className="text-xs font-black uppercase tracking-widest text-purple-300 mb-3">Domanda {round}</div>
        <div className="text-white font-black text-xl leading-snug">
          Qual è la capitale d'Italia?
        </div>
        <div className="mt-3 text-white/40 text-sm">⏱ 15 secondi rimasti</div>
      </div>

      {/* Answers */}
      <div className="grid grid-cols-2 gap-3 flex-1">
        {answers.map((a, i) => {
          const isCorrect = i === correctIdx;
          const isSelected = answered === i;
          let bg = 'rgba(255,255,255,0.07)';
          let border = 'rgba(255,255,255,0.12)';
          if (answered !== null) {
            if (isCorrect) { bg = 'rgba(0,245,160,0.2)'; border = '#00F5A0'; }
            else if (isSelected) { bg = 'rgba(239,68,68,0.2)'; border = '#EF4444'; }
          }
          return (
            <motion.button
              key={i}
              onClick={() => handleAnswer(i)}
              className="rounded-2xl p-4 text-left font-bold text-white flex items-center gap-3"
              style={{ background: bg, border: `1.5px solid ${border}` }}
              whileTap={{ scale: 0.96 }}
            >
              <span className="rounded-xl w-8 h-8 flex items-center justify-center font-black text-sm shrink-0"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                {['A','B','C','D'][i]}
              </span>
              {a}
              {answered !== null && isCorrect && <Star size={16} className="ml-auto text-green-400" />}
            </motion.button>
          );
        })}
      </div>

      {answered !== null && (
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={nextRound}
          className="mt-4 w-full rounded-2xl py-4 font-black text-lg text-black"
          style={{ background: 'linear-gradient(135deg,#F5B642,#FF6B35)' }}
        >
          {round >= totalRounds ? '🏆 Vedi classifica' : 'Prossima domanda →'}
        </motion.button>
      )}
    </motion.div>
  );
}

function HomeScoreboard({ onRestart, onBack }: { onRestart: () => void; onBack: () => void }) {
  const sorted = [...MOCK_PLAYERS].sort((a, b) => b.score - a.score);
  const podium = PODIUM_ORDER.map(i => sorted[i]).filter(Boolean);
  const rest   = sorted.slice(3);

  const podiumHeight = ['h-20', 'h-28', 'h-16'];
  const podiumColor  = ['#C0C0C0', '#F5B642', '#CD7F32'];
  const podiumPos    = [1, 0, 2];

  return (
    <motion.div {...fadeUp} className="flex flex-col h-full px-5 pt-5 pb-8 overflow-y-auto">
      <div className="flex items-center gap-3 mb-4">
        <BackBtn onClick={onBack} />
        <span className="font-black text-white text-lg">Classifica Finale</span>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3 mt-4 mb-6">
        {podium.map((p, display) => {
          const rank = podiumPos[display];
          const colors = ['#C0C0C0','#F5B642','#CD7F32'];
          return (
            <motion.div
              key={p.id}
              className="flex flex-col items-center"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: display * 0.15 }}
            >
              <div className="text-2xl mb-1">{p.avatar}</div>
              <div className="font-black text-white text-sm">{p.name}</div>
              <div className="font-bold text-xs mb-1" style={{ color: colors[rank] }}>
                {p.score} pt
              </div>
              <div
                className={`w-16 rounded-t-xl flex items-end justify-center pb-2 font-black text-white text-xl ${podiumHeight[rank]}`}
                style={{ background: `${colors[rank]}33`, border: `2px solid ${colors[rank]}` }}
              >
                {['🥇','🥈','🥉'][rank]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Rest */}
      <div className="space-y-2 mb-6">
        {rest.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-white/40 font-black text-sm w-5">{i + 4}</span>
            <span className="text-lg">{p.avatar}</span>
            <span className="font-bold text-white flex-1">{p.name}</span>
            <span className="text-amber-400 font-black text-sm">{p.score} pt</span>
          </div>
        ))}
      </div>

      <motion.button
        onClick={onRestart}
        className="w-full rounded-2xl py-4 font-black text-lg text-black"
        style={{ background: 'linear-gradient(135deg,#F5B642,#FF6B35)' }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      >
        <Shuffle size={18} className="inline mr-2 -mt-0.5" />Ricomincia
      </motion.button>
    </motion.div>
  );
}

function LiveInfo({ onJoin, onBack }: { onJoin: () => void; onBack: () => void }) {
  return (
    <motion.div {...fadeUp} className="flex flex-col h-full px-5 pt-5 pb-10 overflow-y-auto">
      <div className="flex items-center gap-3 mb-5">
        <BackBtn onClick={onBack} />
        <span className="font-black text-white text-lg">Modalità Live</span>
      </div>

      <div className="rounded-3xl overflow-hidden mb-5">
        <img src={asset('/jonny-world-promo.jpg')} alt="Jonny Live"
          className="w-full object-cover" style={{ maxHeight: 180 }} />
      </div>

      <h2 className="font-black text-white text-2xl mb-2">Un vero show dal vivo</h2>
      <p className="text-white/60 text-sm mb-5">
        L'animatore gestisce tutto dalla Regia. Tu e i tuoi amici giocate dal telefono.
        Il proiettore mostra il gioco a tutto il pubblico.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { icon: <Mic2 size={18}/>, label: 'Regia pro', sub: 'animatore in controllo' },
          { icon: <Trophy size={18}/>, label: 'Classifica live', sub: 'aggiornata in tempo reale' },
          { icon: <PartyPopper size={18}/>, label: 'Party show', sub: 'effetti e musica' },
          { icon: <Users size={18}/>, label: 'Fino a 20', sub: 'giocatori simultanei' },
        ].map(item => (
          <div key={item.label} className="rounded-2xl p-3"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-amber-400 mb-1">{item.icon}</div>
            <div className="font-black text-white text-sm">{item.label}</div>
            <div className="text-white/50 text-xs">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <motion.button
        onClick={onJoin}
        className="w-full rounded-2xl py-4 font-black text-lg text-black shadow-xl"
        style={{ background: 'linear-gradient(135deg,#DB2777,#9333EA)' }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      >
        <Play size={18} className="inline mr-2 -mt-0.5 text-white" />
        <span className="text-white">Ho un codice evento →</span>
      </motion.button>
    </motion.div>
  );
}

function LiveWait({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const handleLogoTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 5) { setShowAdmin(true); setTapCount(0); }
  };

  return (
    <motion.div {...fadeUp} className="flex flex-col h-full px-5 pt-5 pb-10">
      <div className="flex items-center gap-3 mb-6">
        <BackBtn onClick={onBack} />
        <span className="font-black text-white text-lg">Unisciti all'Evento</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.button
          onClick={handleLogoTap}
          className="mb-6"
          whileTap={{ scale: 0.9 }}
        >
          <img src={asset('/jonny-master-nobg.png')} alt="Jonny"
            className="w-32 h-32 object-contain drop-shadow-2xl" />
        </motion.button>

        <p className="text-white/60 text-sm text-center mb-6 max-w-xs">
          Inserisci il codice che l'animatore mostra sul proiettore
        </p>

        <div className="w-full max-w-xs">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="CODICE"
            className="w-full rounded-2xl text-center text-3xl font-black tracking-widest py-4 px-5 outline-none mb-4"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '2px solid rgba(255,255,255,0.2)',
              color: 'white',
              caretColor: '#F5B642',
            }}
          />

          <motion.button
            className="w-full rounded-2xl py-4 font-black text-lg text-black"
            style={{
              background: code.length === 6
                ? 'linear-gradient(135deg,#DB2777,#9333EA)'
                : 'rgba(255,255,255,0.1)',
              color: code.length === 6 ? 'white' : 'rgba(255,255,255,0.3)',
            }}
            whileTap={{ scale: 0.97 }}
            disabled={code.length < 4}
          >
            {code.length >= 4 ? `Entra con ${code}` : 'Inserisci il codice'}
          </motion.button>
        </div>
      </div>

      {/* Hidden admin tap easter egg */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-4 rounded-2xl p-4 text-center"
            style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.5)' }}
          >
            <Lock size={16} className="inline mr-2 text-purple-400" />
            <span className="text-purple-300 font-bold text-sm">Accesso Regia</span>
            <div className="flex gap-2 mt-3">
              <a href="/login"
                className="flex-1 rounded-xl py-2.5 text-center font-black text-sm text-white"
                style={{ background: 'rgba(124,58,237,0.5)' }}>
                Login Regia →
              </a>
              <button
                onClick={() => setShowAdmin(false)}
                className="rounded-xl px-4 py-2.5 font-black text-sm text-white/50"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                Nascondi
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showAdmin && (
        <p className="text-white/20 text-xs text-center mt-4">
          Sei l'animatore? Vai su /login
        </p>
      )}
    </motion.div>
  );
}

/* ─── QR placeholder ─────────────────────────────────────────── */
function QrCodeMock({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <rect width="72" height="72" fill="white" />
      {/* TL finder */}
      <rect x="4" y="4" width="24" height="24" rx="2" fill="#111" />
      <rect x="8" y="8" width="16" height="16" rx="1" fill="white" />
      <rect x="11" y="11" width="10" height="10" rx="1" fill="#111" />
      {/* TR finder */}
      <rect x="44" y="4" width="24" height="24" rx="2" fill="#111" />
      <rect x="48" y="8" width="16" height="16" rx="1" fill="white" />
      <rect x="51" y="11" width="10" height="10" rx="1" fill="#111" />
      {/* BL finder */}
      <rect x="4" y="44" width="24" height="24" rx="2" fill="#111" />
      <rect x="8" y="48" width="16" height="16" rx="1" fill="white" />
      <rect x="11" y="51" width="10" height="10" rx="1" fill="#111" />
      {/* data dots */}
      {[36,40,44,48,52,56,60,64].map(x =>
        [4,8,12,16,20,24,28,32,36,40].map(y =>
          Math.random() > 0.45 && x < 68 && y < 68 ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#111" />
          ) : null
        )
      )}
      {[4,8,12,16,20,24].map(x =>
        [36,40,44,48,52,56,60,64].map(y =>
          Math.random() > 0.45 ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#111" />
          ) : null
        )
      )}
    </svg>
  );
}

/* ─── shared components ──────────────────────────────────────── */
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white/60 hover:text-white"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
      whileTap={{ scale: 0.95 }}
    >
      <ArrowLeft size={14} />
      Indietro
    </motion.button>
  );
}

/* ─── root page ──────────────────────────────────────────────── */
export default function HomeV2() {
  const [screen, setScreen] = useState<Screen>('landing');

  const go = (s: Screen) => setScreen(s);

  return (
    <div
      className="min-h-screen select-none text-white overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #06021a 100%)',
        fontFamily: "'Outfit', 'Space Grotesk', sans-serif",
      }}
    >
      {/* floating decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #7C3AED, transparent 70%)' }}
          animate={{ scale: [1, 1.12, 1], x: [0, 10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #DB2777, transparent 70%)' }}
          animate={{ scale: [1, 1.08, 1], x: [0, -8, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #F5B642, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      </div>

      {/* content */}
      <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div key={screen} className="flex-1 flex flex-col min-h-screen" style={{ minHeight: '100svh' }}>
            {screen === 'landing'          && <Landing   onNext={() => go('mode-select')} />}
            {screen === 'mode-select'      && <ModeSelect onHome={() => go('home-lobby')} onLive={() => go('live-info')} onBack={() => go('landing')} />}
            {screen === 'home-lobby'       && <HomeLobby  onStart={() => go('home-game')}  onBack={() => go('mode-select')} />}
            {screen === 'home-game'        && <HomeGame   onEnd={() => go('home-scoreboard')} onBack={() => go('home-lobby')} />}
            {screen === 'home-scoreboard'  && <HomeScoreboard onRestart={() => go('home-lobby')} onBack={() => go('mode-select')} />}
            {screen === 'live-info'        && <LiveInfo   onJoin={() => go('live-wait')}   onBack={() => go('mode-select')} />}
            {screen === 'live-wait'        && <LiveWait   onBack={() => go('live-info')} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

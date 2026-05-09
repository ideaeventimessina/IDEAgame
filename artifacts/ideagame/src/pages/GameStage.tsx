import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { MockBanner } from '@/components/MockBanner';
import { ArrowLeft, Play, Sparkles } from 'lucide-react';
import { GAMES, TEAMS, QUESTIONS, getGame } from '@/data/mock';
import { GameIcon } from '@/components/GameIcon';
import { useT, useI18n } from '@/i18n';

function CountUp({ to, duration = 1.4 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setV(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v.toLocaleString()}</>;
}

function StagePlay({ slug }: { slug: string }) {
  const { locale } = useI18n();
  if (slug === 'quizzone') {
    const q = QUESTIONS[0]!;
    const tr = q.translations[locale] ?? q.translations.it;
    return (
      <div className="flex w-full flex-col items-center px-2">
        <div className="text-xs uppercase tracking-widest text-primary">{q.category} · {q.difficulty}</div>
        <div className="mt-4 text-display text-2xl font-black leading-tight sm:text-5xl md:text-6xl text-center">{tr.prompt}</div>
        <div className="mt-6 grid w-full max-w-5xl grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-6">
          {tr.options.map((opt, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/70 p-4 sm:rounded-3xl sm:p-8">
              <div className="flex items-center gap-3 sm:gap-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-display text-xl font-black sm:h-16 sm:w-16 sm:rounded-2xl sm:text-3xl">
                  {String.fromCharCode(65 + i)}
                </div>
                <div className="text-display text-base font-bold sm:text-3xl">{opt}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slug === 'saramusica') {
    return (
      <div className="flex flex-col items-center">
        <div className="relative h-40 w-40 sm:h-72 sm:w-72">
          <motion.div
            className="absolute inset-0 rounded-full border-[8px] border-primary sm:border-[14px]"
            animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
          />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-accent to-primary sm:inset-6" />
          <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background sm:h-10 sm:w-10" />
        </div>
        <div className="mt-6 flex h-16 items-end gap-1 sm:mt-10 sm:h-32 sm:gap-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div key={i}
              className="w-2 rounded-t bg-accent sm:w-3"
              animate={{ height: [8, 40 + (i % 5) * 8, 8] }}
              transition={{ repeat: Infinity, duration: 0.8 + (i % 4) * 0.1 }}
            />
          ))}
        </div>
        <div className="mt-4 text-display text-xl font-bold sm:mt-6 sm:text-3xl">Indovina la canzone</div>
      </div>
    );
  }
  if (slug === 'sfida-di-ballo') {
    return (
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div key={i}
            className="h-20 w-20 rounded-xl border-2 sm:h-32 sm:w-32 sm:rounded-2xl"
            style={{ borderColor: ['#00F5A0', '#9B5DE5', '#F5B642'][i % 3] }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.08 }}
          />
        ))}
      </div>
    );
  }
  if (slug === 'percorso-a-risate') {
    return (
      <div className="w-full max-w-4xl px-4">
        <div className="text-display text-xl text-muted-foreground sm:text-2xl">Tappa 3 di 6</div>
        <div className="mt-4 h-8 overflow-hidden rounded-full bg-card sm:mt-6 sm:h-10">
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-accent to-primary"
            initial={{ width: 0 }} animate={{ width: '50%' }} transition={{ duration: 1.4 }}
          />
        </div>
        <div className="mt-6 flex items-center justify-between text-display text-2xl sm:mt-10 sm:text-3xl">
          <span>🚦</span><span>•••</span><span>🏁</span>
        </div>
      </div>
    );
  }
  if (slug === 'gioco-delle-coppie') {
    return (
      <div className="flex items-center gap-6 sm:gap-16">
        {[{ n: 'Marco', c: '#5BC0EB' }, { n: 'Anna', c: '#E84A8E' }].map(p => (
          <motion.div key={p.n} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="flex h-24 w-24 items-center justify-center rounded-full text-display text-4xl font-black text-background sm:h-44 sm:w-44 sm:text-7xl"
                 style={{ background: p.c }}>
              {p.n[0]}
            </div>
            <div className="mt-2 text-center text-display text-lg font-bold sm:mt-4 sm:text-3xl">{p.n}</div>
          </motion.div>
        ))}
      </div>
    );
  }
  return (
    <div className="text-center px-4">
      <div className="text-display text-2xl font-black text-destructive sm:text-5xl">Drink. Truth. Dare.</div>
      <div className="mt-4 text-lg text-muted-foreground sm:mt-6 sm:text-2xl">Pesca una carta dal palco.</div>
    </div>
  );
}

export default function GameStage() {
  const [, params] = useRoute('/game/:slug');
  const [, navigate] = useLocation();
  const t = useT();
  const game = params ? getGame(params.slug) : undefined;

  const [adultOk, setAdultOk] = useState(!game?.adultOnly);
  const [intro, setIntro] = useState(true);
  const [round, setRound] = useState(1);
  const [time, setTime] = useState(game?.settings.timeLimit ?? 30);
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    if (!intro) return undefined;
    const tm = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(tm);
  }, [intro]);

  useEffect(() => {
    if (intro || showReveal) return undefined;
    const i = setInterval(() => setTime(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [intro, showReveal]);

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-display text-3xl">Game not found</div>
          <button onClick={() => navigate('/')} className="mt-4 text-primary underline">Back</button>
        </div>
      </div>
    );
  }

  const accent = game.accentColor;
  const sortedTeams = [...TEAMS].sort((a, b) => b.score - a.score);

  return (
    <div className="relative min-h-screen w-full overflow-hidden stage-vignette" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}25, transparent 60%), hsl(var(--background))` }}>
      <MockBanner note="stage di gioco animato — punteggi non persistiti su /scores" />

      {/* Adult gate */}
      <AnimatePresence>
        {!adultOk && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md px-4"
          >
            <div className="rounded-3xl border border-destructive/40 bg-card p-8 text-center max-w-2xl sm:p-12">
              <div className="text-display text-4xl font-black text-destructive sm:text-6xl">{t('game.adult.gate.title')}</div>
              <div className="mt-4 text-lg text-muted-foreground sm:mt-6 sm:text-2xl">{t('game.adult.gate.body')}</div>
              <div className="mt-8 flex justify-center gap-3 sm:mt-10 sm:gap-4">
                <button onClick={() => navigate('/')} className="rounded-2xl border border-border px-5 py-3 text-base font-bold hover-elevate sm:px-8 sm:py-4 sm:text-xl">
                  {t('game.adult.gate.cancel')}
                </button>
                <button onClick={() => setAdultOk(true)} className="rounded-2xl bg-destructive px-5 py-3 text-base font-bold text-destructive-foreground sm:px-8 sm:py-4 sm:text-xl">
                  {t('game.adult.gate.confirm')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro */}
      <AnimatePresence>
        {!intro ? null : (
          <motion.div
            initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center px-4"
            style={{ background: `linear-gradient(135deg, ${accent}, hsl(var(--background)))` }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 80, damping: 12 }}
              className="text-center"
            >
              <GameIcon name={game.icon} className="mx-auto h-16 w-16 text-background sm:h-32 sm:w-32" />
              <div className="text-display text-5xl font-black text-background neon-glow sm:text-7xl md:text-9xl" style={{ color: '#fff' }}>
                {game.name}
              </div>
              <div className="mt-3 text-lg text-background/90 sm:mt-4 sm:text-2xl">{game.tagline}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DEMO banner ── */}
      <div className="relative z-20 flex items-center justify-center gap-3 bg-destructive/90 backdrop-blur-sm py-2 px-4 border-b border-destructive/60">
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-white/90">⚠ DEMO / NON LIVE</span>
        <span className="hidden sm:inline text-[10px] text-white/70 uppercase tracking-widest">— Questa è una schermata di anteprima. Per il gioco reale usa il Cockpit animatore.</span>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-10 sm:py-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 hover-elevate sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-3">
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="font-bold text-sm sm:text-base">{t('game.back')}</span>
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          <GameIcon name={game.icon} className="h-5 w-5 sm:h-7 sm:w-7" style={{ color: accent }} />
          <div className="text-display text-xl font-black sm:text-3xl" style={{ color: accent }}>{game.name}</div>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="text-right">
            <div className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:block">{t('game.round')}</div>
            <div className="text-display text-xl font-black sm:text-3xl">{round}/{game.settings.rounds}</div>
          </div>
          <div className="text-right">
            <div className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:block">{t('game.timer')}</div>
            <div className="text-display text-2xl font-black tabular-nums sm:text-4xl" style={{ color: time < 6 ? 'hsl(var(--destructive))' : accent }}>
              {String(Math.floor(time / 60)).padStart(2, '0')}:{String(time % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
      </header>

      {/* Scoreboard ribbon — horizontal scroll on mobile */}
      <div className="relative z-10 overflow-x-auto px-4 sm:px-10">
        <div className="flex gap-2 sm:grid sm:grid-cols-4 sm:gap-4" style={{ minWidth: 'max-content' }} >
          {sortedTeams.map((tm, i) => (
            <div key={tm.id} className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-3">
              <div className="text-display text-base font-black text-muted-foreground sm:text-2xl">#{i + 1}</div>
              <div className="h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3" style={{ background: tm.color }} />
              <div className="text-display text-sm font-bold sm:text-xl">{tm.name}</div>
              <div className="ml-2 text-display text-base font-black sm:ml-auto sm:text-2xl" style={{ color: tm.color }}>
                {tm.score.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stage content */}
      <main className="relative z-10 mt-6 flex min-h-[50vh] items-center justify-center px-4 sm:mt-10 sm:min-h-[60vh] sm:px-10">
        <StagePlay slug={game.slug} />
      </main>

      {/* Bottom controls */}
      <footer className="relative z-10 mt-6 flex items-center justify-center gap-4 pb-28 sm:mt-8 sm:gap-6">
        <button
          onClick={() => { setRound(r => Math.min(game.settings.rounds, r + 1)); setTime(game.settings.timeLimit); }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-5 py-3 text-base font-bold hover-elevate sm:gap-3 sm:rounded-2xl sm:px-8 sm:py-5 sm:text-xl"
        >
          <Play className="h-4 w-4 sm:h-6 sm:w-6" /> {t('game.go')}
        </button>
        <button
          onClick={() => setShowReveal(true)}
          className="flex items-center gap-2 rounded-xl px-6 py-3 text-base font-black sm:gap-3 sm:rounded-2xl sm:px-10 sm:py-5 sm:text-2xl"
          style={{ background: accent, color: '#0a0820' }}
        >
          <Sparkles className="h-4 w-4 sm:h-7 sm:w-7" /> {t('game.reveal')}
        </button>
      </footer>

      {/* Score reveal */}
      <AnimatePresence>
        {showReveal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-md px-4"
            onClick={() => setShowReveal(false)}
          >
            <div className="flex items-end gap-4 sm:gap-12">
              {sortedTeams.slice(0, 3).map((tm, i) => (
                <motion.div
                  key={tm.id}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.18, type: 'spring', stiffness: 120 }}
                  className="text-center"
                >
                  <div className="text-display text-lg text-muted-foreground sm:text-2xl">#{i + 1}</div>
                  <div className="text-display font-black tabular-nums" style={{ color: tm.color, fontSize: i === 0 ? 'clamp(48px, 12vw, 180px)' : 'clamp(36px, 9vw, 130px)' }}>
                    <CountUp to={tm.score} />
                  </div>
                  <div className="text-display text-lg font-bold sm:text-3xl">{tm.name}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Keep GAMES and TEAMS in scope
void GAMES;
void TEAMS;

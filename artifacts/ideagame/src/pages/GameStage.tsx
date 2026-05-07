import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
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
      <div className="flex w-full flex-col items-center">
        <div className="text-xs uppercase tracking-widest text-primary">{q.category} · {q.difficulty}</div>
        <div className="mt-4 text-display text-5xl font-black leading-tight md:text-6xl text-center">{tr.prompt}</div>
        <div className="mt-12 grid w-full max-w-5xl grid-cols-2 gap-6">
          {tr.options.map((opt, i) => (
            <div key={i} className="rounded-3xl border border-border bg-card/70 p-8">
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-display text-3xl font-black">
                  {String.fromCharCode(65 + i)}
                </div>
                <div className="text-display text-3xl font-bold">{opt}</div>
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
        <div className="relative h-72 w-72">
          <motion.div
            className="absolute inset-0 rounded-full border-[14px] border-primary"
            animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
          />
          <div className="absolute inset-6 rounded-full bg-gradient-to-br from-accent to-primary" />
          <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
        </div>
        <div className="mt-10 flex h-32 items-end gap-2">
          {Array.from({ length: 32 }).map((_, i) => (
            <motion.div key={i}
              className="w-3 rounded-t bg-accent"
              animate={{ height: [16, 80 + (i % 5) * 12, 16] }}
              transition={{ repeat: Infinity, duration: 0.8 + (i % 4) * 0.1 }}
            />
          ))}
        </div>
        <div className="mt-6 text-display text-3xl font-bold">Indovina la canzone</div>
      </div>
    );
  }
  if (slug === 'sfida-di-ballo') {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div key={i}
            className="h-32 w-32 rounded-2xl border-2"
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
      <div className="w-full max-w-4xl">
        <div className="text-display text-2xl text-muted-foreground">Tappa 3 di 6</div>
        <div className="mt-6 h-10 overflow-hidden rounded-full bg-card">
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-accent to-primary"
            initial={{ width: 0 }} animate={{ width: '50%' }} transition={{ duration: 1.4 }}
          />
        </div>
        <div className="mt-10 flex items-center justify-between text-display text-3xl">
          <span>🚦</span><span>•••</span><span>🏁</span>
        </div>
      </div>
    );
  }
  if (slug === 'gioco-delle-coppie') {
    return (
      <div className="flex items-center gap-16">
        {[{ n: 'Marco', c: '#5BC0EB' }, { n: 'Anna', c: '#E84A8E' }].map(p => (
          <motion.div key={p.n} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="flex h-44 w-44 items-center justify-center rounded-full text-display text-7xl font-black text-background"
                 style={{ background: p.c }}>
              {p.n[0]}
            </div>
            <div className="mt-4 text-center text-display text-3xl font-bold">{p.n}</div>
          </motion.div>
        ))}
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="text-display text-5xl font-black text-destructive">Drink. Truth. Dare.</div>
      <div className="mt-6 text-2xl text-muted-foreground">Pesca una carta dal palco.</div>
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
      {/* Adult gate */}
      <AnimatePresence>
        {!adultOk && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md"
          >
            <div className="rounded-3xl border border-destructive/40 bg-card p-12 text-center max-w-2xl">
              <div className="text-display text-6xl font-black text-destructive">{t('game.adult.gate.title')}</div>
              <div className="mt-6 text-2xl text-muted-foreground">{t('game.adult.gate.body')}</div>
              <div className="mt-10 flex justify-center gap-4">
                <button onClick={() => navigate('/')} className="rounded-2xl border border-border px-8 py-4 text-xl font-bold hover-elevate">
                  {t('game.adult.gate.cancel')}
                </button>
                <button onClick={() => setAdultOk(true)} className="rounded-2xl bg-destructive px-8 py-4 text-xl font-bold text-destructive-foreground">
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
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accent}, hsl(var(--background)))` }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 80, damping: 12 }}
              className="text-center"
            >
              <GameIcon name={game.icon} className="mx-auto h-32 w-32 text-background" />
              <div className="text-display text-7xl md:text-9xl font-black text-background neon-glow" style={{ color: '#fff' }}>
                {game.name}
              </div>
              <div className="mt-4 text-2xl text-background/90">{game.tagline}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-10 py-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-3 hover-elevate">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold">{t('game.back')}</span>
        </button>
        <div className="flex items-center gap-4">
          <GameIcon name={game.icon} className="h-7 w-7" style={{ color: accent }} />
          <div className="text-display text-3xl font-black" style={{ color: accent }}>{game.name}</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{t('game.round')}</div>
            <div className="text-display text-3xl font-black">{round} / {game.settings.rounds}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{t('game.timer')}</div>
            <div className="text-display text-4xl font-black tabular-nums" style={{ color: time < 6 ? 'hsl(var(--destructive))' : accent }}>
              {String(Math.floor(time / 60)).padStart(2, '0')}:{String(time % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
      </header>

      {/* Scoreboard ribbon */}
      <div className="relative z-10 mx-10 grid grid-cols-4 gap-4">
        {sortedTeams.map((tm, i) => (
          <div key={tm.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-3">
            <div className="text-display text-2xl font-black text-muted-foreground">#{i + 1}</div>
            <div className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
            <div className="text-display text-xl font-bold">{tm.name}</div>
            <div className="ml-auto text-display text-2xl font-black" style={{ color: tm.color }}>
              {tm.score.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Stage content */}
      <main className="relative z-10 mt-10 flex min-h-[60vh] items-center justify-center px-10">
        <StagePlay slug={game.slug} />
      </main>

      {/* Bottom controls */}
      <footer className="relative z-10 mt-8 flex items-center justify-center gap-6 pb-28">
        <button
          onClick={() => { setRound(r => Math.min(game.settings.rounds, r + 1)); setTime(game.settings.timeLimit); }}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-8 py-5 text-xl font-bold hover-elevate"
        >
          <Play className="h-6 w-6" /> {t('game.go')}
        </button>
        <button
          onClick={() => setShowReveal(true)}
          className="flex items-center gap-3 rounded-2xl px-10 py-5 text-2xl font-black"
          style={{ background: accent, color: '#0a0820' }}
        >
          <Sparkles className="h-7 w-7" /> {t('game.reveal')}
        </button>
      </footer>

      {/* Score reveal */}
      <AnimatePresence>
        {showReveal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-md"
            onClick={() => setShowReveal(false)}
          >
            <div className="flex items-end gap-12">
              {sortedTeams.slice(0, 3).map((tm, i) => (
                <motion.div
                  key={tm.id}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.18, type: 'spring', stiffness: 120 }}
                  className="text-center"
                >
                  <div className="text-display text-2xl text-muted-foreground">#{i + 1}</div>
                  <div className="text-display font-black tabular-nums" style={{ color: tm.color, fontSize: i === 0 ? 180 : 130 }}>
                    <CountUp to={tm.score} />
                  </div>
                  <div className="text-display text-3xl font-bold">{tm.name}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

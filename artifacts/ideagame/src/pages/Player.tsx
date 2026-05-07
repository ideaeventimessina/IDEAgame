import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check } from 'lucide-react';
import { TEAMS, QUESTIONS } from '@/data/mock';
import { useT, useI18n, LOCALES } from '@/i18n';

export default function Player() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [step, setStep] = useState<'join' | 'play'>('join');
  const [nick, setNick] = useState('');
  const [team, setTeam] = useState(TEAMS[0]!.id);
  const [answer, setAnswer] = useState<number | null>(null);
  const [buzzed, setBuzzed] = useState(false);

  const teamObj = TEAMS.find(t => t.id === team)!;
  const q = QUESTIONS[0]!;
  const tr = q.translations[locale] ?? q.translations.it;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 12%), hsl(248 70% 4%))' }}>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-display font-black">I</div>
          <div className="text-display text-lg font-black">{t('app.title')}</div>
        </div>
        <select value={locale} onChange={e => setLocale(e.target.value as 'it' | 'en' | 'es' | 'fr')}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs">
          {LOCALES.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
        </select>
      </header>

      <AnimatePresence mode="wait">
        {step === 'join' ? (
          <motion.div key="join"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col"
          >
            <div className="text-display text-4xl font-black">{t('play.title')}</div>
            <div className="mt-1 text-muted-foreground">Compleanno Sorrento 40</div>

            <label className="mt-8 block text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.nickname')}</label>
            <input
              value={nick} onChange={e => setNick(e.target.value)} placeholder="Marco"
              className="mt-2 w-full rounded-2xl border border-border bg-card px-5 py-4 text-2xl font-bold text-foreground outline-none focus:border-primary"
            />

            <div className="mt-8 text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.team')}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {TEAMS.map(tm => (
                <button key={tm.id} onClick={() => setTeam(tm.id)}
                  className={`rounded-2xl border-2 px-4 py-5 text-left transition-all ${team === tm.id ? 'scale-[1.02]' : 'opacity-70'}`}
                  style={{ borderColor: tm.color, background: team === tm.id ? `${tm.color}22` : 'transparent' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full" style={{ background: tm.color }} />
                    <div className="text-display text-lg font-bold">{tm.name}</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              disabled={!nick.trim()}
              onClick={() => setStep('play')}
              className="mt-auto w-full rounded-3xl bg-primary py-5 text-2xl font-black text-primary-foreground disabled:opacity-40"
            >
              {t('play.join')}
            </button>
          </motion.div>
        ) : (
          <motion.div key="play"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-background text-display font-black"
                   style={{ background: teamObj.color }}>{nick[0]?.toUpperCase()}</div>
              <div>
                <div className="text-display text-lg font-bold">{nick}</div>
                <div className="text-xs text-muted-foreground">{teamObj.name}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">Score</div>
                <div className="text-display text-xl font-black text-primary">0</div>
              </div>
            </div>

            <motion.button
              onClick={() => setBuzzed(true)}
              animate={buzzed ? { scale: [1, 0.92, 1] } : {}}
              className="mt-6 flex aspect-square w-full items-center justify-center rounded-full text-display text-5xl font-black text-background shadow-2xl"
              style={{ background: `radial-gradient(circle at 35% 30%, ${teamObj.color}, #1a1535 95%)`, boxShadow: `0 20px 60px ${teamObj.color}66` }}
            >
              <Zap className="mr-3 h-12 w-12" />
              {t('play.buzzer')}
            </motion.button>

            <div className="mt-6 text-sm font-bold uppercase tracking-widest text-muted-foreground">{tr.prompt}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {tr.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setAnswer(i)}
                  className={`rounded-2xl border-2 px-3 py-5 text-display text-2xl font-black transition-all ${
                    answer === i ? 'border-primary bg-primary/20' : 'border-border bg-card'
                  }`}
                >
                  <div className="text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</div>
                  <div className="mt-1">{opt}</div>
                </button>
              ))}
            </div>

            {answer !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-primary"
              >
                <Check className="h-5 w-5" /> Risposta inviata. {t('play.waiting')}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

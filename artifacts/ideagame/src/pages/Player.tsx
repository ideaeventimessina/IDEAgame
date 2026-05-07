import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useT, useI18n, LOCALES } from '@/i18n';
import { useEventSocket } from '@/hooks/useEventSocket';

interface EventInfo { id: string; name: string; joinCode: string; brandColor: string }
interface TeamInfo { id: string; name: string; color: string }
interface PlayerInfo { id: string; nickname: string; avatarColor: string; teamId: string | null; eventId: string }
interface GameState { sessionId: string | null; currentRound: number; totalRounds: number; status: 'idle' | 'running' | 'paused' | 'ended'; gameSlug: string | null }
type Step = 'loading' | 'join' | 'joining' | 'play' | 'error';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

export default function Player() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const joinCodeFromUrl = searchParams.get('e')?.toUpperCase() ?? '';

  const [step, setStep] = useState<Step>(joinCodeFromUrl ? 'loading' : 'join');
  const [error, setError] = useState('');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [nick, setNick] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [gameState, setGameState] = useState<GameState>({ sessionId: null, currentRound: 0, totalRounds: 1, status: 'idle', gameSlug: null });
  const [buzzed, setBuzzed] = useState(false);

  const { connected, on } = useEventSocket(event?.id ?? null);

  const fetchEvent = useCallback(async (code: string) => {
    setStep('loading'); setError('');
    try {
      const data = await apiFetch(`/events/by-code/${encodeURIComponent(code)}`) as { event: EventInfo; teams: TeamInfo[] };
      setEvent(data.event); setTeams(data.teams);
      if (data.teams.length > 0) setSelectedTeam(data.teams[0]!.id);
      setStep('join');
    } catch (e) { setError((e as Error).message); setStep('error'); }
  }, []);

  useEffect(() => { if (joinCodeFromUrl) fetchEvent(joinCodeFromUrl); }, [joinCodeFromUrl, fetchEvent]);

  useEffect(() => {
    if (!event) return;
    const unsubs = [
      on<{ session: { id: string; currentRound: number; totalRounds: number; status: string; gameSlug: string } }>('game:started', ({ session }) => {
        setGameState({ sessionId: session.id, currentRound: session.currentRound, totalRounds: session.totalRounds, status: 'running', gameSlug: session.gameSlug });
        setBuzzed(false);
      }),
      on<{ session: { currentRound: number } }>('round:changed', ({ session }) => {
        setGameState(p => ({ ...p, currentRound: session.currentRound })); setBuzzed(false);
      }),
      on('game:paused', () => setGameState(p => ({ ...p, status: 'paused' }))),
      on('game:ended', () => setGameState(p => ({ ...p, status: 'ended' }))),
    ];
    return () => unsubs.forEach(u => u());
  }, [event, on]);

  const handleJoin = async () => {
    if (!event || !nick.trim()) return;
    setStep('joining'); setError('');
    try {
      const p = await apiFetch(`/events/${event.id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick.trim(), teamId: selectedTeam || null }),
      }) as PlayerInfo;
      setPlayer(p); setStep('play');
    } catch (e) { setError((e as Error).message); setStep('join'); }
  };

  const myTeam = player?.teamId ? teams.find(t => t.id === player.teamId) : teams.find(t => t.id === selectedTeam) ?? teams[0];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 12%), hsl(248 70% 4%))' }}>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-display font-black">I</div>
          <div className="text-display text-lg font-black">{t('app.title')}</div>
        </div>
        <div className="flex items-center gap-2">
          {step === 'play' && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs">
              {connected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400" />}
              <span className={connected ? 'text-green-400' : 'text-amber-400'}>{connected ? 'online' : 'riconnessione…'}</span>
            </div>
          )}
          <select value={locale} onChange={e => setLocale(e.target.value as 'it' | 'en' | 'es' | 'fr')}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs">
            {LOCALES.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {step === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-muted-foreground">Recupero evento…</div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-6">
            <AlertTriangle className="h-14 w-14 text-destructive" />
            <div className="text-center">
              <div className="text-display text-xl font-black text-destructive">Errore</div>
              <div className="mt-2 text-muted-foreground">{error}</div>
            </div>
            <button onClick={() => joinCodeFromUrl ? fetchEvent(joinCodeFromUrl) : setStep('join')}
              className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 font-bold hover:bg-card">
              <RefreshCw className="h-4 w-4" /> Riprova
            </button>
          </motion.div>
        )}

        {(step === 'join' || step === 'joining') && event && (
          <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col">
            <div className="text-display text-4xl font-black">{t('play.title')}</div>
            <div className="mt-1 text-muted-foreground">{event.name}</div>
            {error && <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

            <label className="mt-8 block text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.nickname')}</label>
            <input value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Marco" maxLength={24}
              className="mt-2 w-full rounded-2xl border border-border bg-card px-5 py-4 text-2xl font-bold text-foreground outline-none focus:border-primary" />

            {teams.length > 0 && (
              <>
                <div className="mt-8 text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('play.team')}</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {teams.map(tm => (
                    <button key={tm.id} onClick={() => setSelectedTeam(tm.id)}
                      className="rounded-2xl border-2 px-4 py-5 text-left transition-all"
                      style={{ borderColor: tm.color, background: selectedTeam === tm.id ? `${tm.color}22` : 'transparent',
                               opacity: selectedTeam === tm.id ? 1 : 0.7, transform: selectedTeam === tm.id ? 'scale(1.02)' : 'scale(1)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full" style={{ background: tm.color }} />
                        <div className="text-display text-lg font-bold">{tm.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button disabled={!nick.trim() || step === 'joining'} onClick={handleJoin}
              className="mt-auto flex w-full items-center justify-center gap-3 rounded-3xl bg-primary py-5 text-2xl font-black text-primary-foreground disabled:opacity-40">
              {step === 'joining' && <Loader2 className="h-6 w-6 animate-spin" />}
              {t('play.join')}
            </button>
          </motion.div>
        )}

        {step === 'play' && player && (
          <motion.div key="play" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-background text-display font-black"
                   style={{ background: player.avatarColor }}>{player.nickname[0]?.toUpperCase()}</div>
              <div>
                <div className="text-display text-lg font-bold">{player.nickname}</div>
                <div className="text-xs text-muted-foreground">{myTeam?.name ?? 'Nessuna squadra'}</div>
              </div>
              <div className="ml-auto">{connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-amber-400 animate-pulse" />}</div>
            </div>

            {gameState.status === 'idle' && (
              <div className="mt-8 flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="text-xl font-bold">In attesa dell&apos;animatore…</div>
                <div className="text-sm text-muted-foreground">Il gioco inizierà a breve</div>
              </div>
            )}

            {gameState.status === 'paused' && (
              <div className="mt-8 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-6 py-5 text-center">
                <div className="text-display text-xl font-black text-amber-400">⏸ Pausa</div>
                <div className="mt-1 text-sm text-muted-foreground">Il gioco è in pausa</div>
              </div>
            )}

            {gameState.status === 'ended' && (
              <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/10 px-6 py-5 text-center">
                <div className="text-display text-xl font-black text-primary">🏆 Gioco terminato!</div>
              </div>
            )}

            {gameState.status === 'running' && (
              <>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2 text-sm">
                  <span className="text-muted-foreground capitalize">{gameState.gameSlug?.replace(/-/g, ' ') ?? '—'}</span>
                  <span className="font-bold">Round {gameState.currentRound}/{gameState.totalRounds}</span>
                </div>
                <motion.button onClick={() => setBuzzed(true)} animate={buzzed ? { scale: [1, 0.92, 1] } : {}} disabled={buzzed}
                  className="mt-6 flex aspect-square w-full items-center justify-center rounded-full text-display text-5xl font-black text-background shadow-2xl disabled:opacity-60"
                  style={{ background: `radial-gradient(circle at 35% 30%, ${myTeam?.color ?? '#8B5CF6'}, #1a1535 95%)`, boxShadow: `0 20px 60px ${myTeam?.color ?? '#8B5CF6'}66` }}>
                  <Zap className="mr-3 h-12 w-12" />
                  {buzzed ? 'Inviato!' : t('play.buzzer')}
                </motion.button>
                {buzzed && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-primary">
                    <Check className="h-5 w-5" /> {t('play.waiting')}
                    <button onClick={() => setBuzzed(false)} className="ml-auto text-xs text-muted-foreground underline">reset</button>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

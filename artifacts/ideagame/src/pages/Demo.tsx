import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Users, BarChart3, Home, Brain, Trophy,
  Heart, Zap, CheckCircle2, ExternalLink,
  Loader2, AlertTriangle, RotateCcw, QrCode,
  Power, MonitorOff, ChevronRight, ChevronLeft,
  Copy, Check, ShieldAlert, Rocket, FileText,
  Smartphone, Monitor, Info, AlertCircle,
} from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { useListCardSets } from '@workspace/api-client-react';

interface CurrentUser { id: string; email: string; role: string; tenantId: string | null }

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as Record<string, unknown>;
}

function absUrl(path: string) {
  return `${ORIGIN}${BASE.replace(/\/$/, '')}${path}`;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface DemoTeam { id: string; name: string; color: string }
interface DemoSetup {
  eventId: string;
  joinCode: string;
  teams: DemoTeam[];
  coppieSessionId: string;
  quizzoneSessionId: string;
}
type SetupPhase = 'idle' | 'running' | 'done' | 'error';

// ─── Guided steps ─────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  {
    id: 1, icon: Users, color: '#06B6D4',
    label: 'Apri Lobby',
    desc: 'Mostra ai giocatori la sala d\'attesa. Verifica che i telefoni siano connessi al Wi-Fi e abbiano inquadrato il QR.',
    projectorPath: '/lobby',
    tip: 'Apri la Lobby sul proiettore, poi chiedi ai partecipanti di scansionare il QR con il telefono.',
  },
  {
    id: 2, icon: Heart, color: '#EC4899',
    label: 'Avvia Gioco Coppie',
    desc: 'Vai su LiveControl → seleziona la sessione Gioco Coppie → Inizializza board → apri il proiettore Coppie.',
    projectorPath: null, // dynamic: /coppie?s=...
    tip: 'Prima di aprire la board, assicurati di aver selezionato un deck in LiveControl e premuto "Inizializza".',
  },
  {
    id: 3, icon: BarChart3, color: '#F59E0B',
    label: 'Scoreboard intermedio',
    desc: 'Mostra il podio parziale dopo il Gioco Coppie. I punteggi vengono aggiornati automaticamente.',
    projectorPath: null, // dynamic: /scoreboard?e=...
    tip: 'Mantieni la schermata del podio per 30–60 secondi per creare suspense.',
  },
  {
    id: 4, icon: Home, color: '#8B5CF6',
    label: 'Torna all\'Hub',
    desc: 'Mostra la griglia dei giochi sul proiettore e annuncia il prossimo gioco: Quizzone.',
    projectorPath: '/',
    tip: 'Usa questo momento per far prendere acqua ai partecipanti e ricaricare l\'energia.',
  },
  {
    id: 5, icon: Brain, color: '#10B981',
    label: 'Avvia Quizzone',
    desc: 'Vai su LiveControl → seleziona la sessione Quizzone → seleziona pack → avvia la prima domanda.',
    projectorPath: null, // dynamic: /quizzone?s=...
    tip: 'Premi "Avvia domanda 1" in LiveControl, poi rivela la risposta prima di passare alla successiva.',
  },
  {
    id: 6, icon: Trophy, color: '#F59E0B',
    label: 'Podio Finale',
    desc: 'Fine serata — mostra la classifica finale con il podio animato. Applausi garantiti.',
    projectorPath: null, // dynamic: /scoreboard?e=...
    tip: 'Leggi ad alta voce i nomi delle squadre dal terzo al primo posto per creare drammaticità.',
  },
];

// ─── TABS ─────────────────────────────────────────────────────────────────────

type Tab = 'setup' | 'guide' | 'panic' | 'report';

const TABS: { id: Tab; label: string; icon: typeof Rocket }[] = [
  { id: 'setup',  label: 'Setup Evento',     icon: Rocket },
  { id: 'guide',  label: 'Guida Animatore',  icon: Play },
  { id: 'panic',  label: 'Anti-panico',      icon: ShieldAlert },
  { id: 'report', label: 'Report Tecnico',   icon: FileText },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Demo() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('setup');
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('idle');
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const [setupError, setSetupError] = useState('');
  const [demoData, setDemoData] = useState<DemoSetup | null>(() => {
    try { return JSON.parse(localStorage.getItem('ideagame_demo') ?? 'null') as DemoSetup | null; }
    catch { return null; }
  });
  const [guideStep, setGuideStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [black, setBlack] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState('');
  const [addPlayers, setAddPlayers] = useState(true);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [selectedCardSetId, setSelectedCardSetId] = useState('');
  const [quizPacks, setQuizPacks] = useState<Array<{ id: string; title: string; totalRounds: number }>>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null | 'loading'>('loading');
  const { data: cardSets = [] } = useListCardSets();

  // Detect current user on mount
  useEffect(() => {
    apiFetch('/auth/me')
      .then(d => setCurrentUser(d as unknown as CurrentUser))
      .catch(() => setCurrentUser(null));
  }, []);

  // Persist demo data
  useEffect(() => {
    if (demoData) localStorage.setItem('ideagame_demo', JSON.stringify(demoData));
    else localStorage.removeItem('ideagame_demo');
  }, [demoData]);

  // Load quiz packs
  useEffect(() => {
    apiFetch('/quiz-packs')
      .then(d => {
        const packs = (d as unknown as Array<{ id: string; title: string; totalRounds: number; status: string }>)
          .filter(p => p.status === 'approved' || p.status === 'generated');
        setQuizPacks(packs);
        if (packs.length > 0 && !selectedPackId) setSelectedPackId(packs[0]!.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cardSets.length > 0 && !selectedCardSetId) setSelectedCardSetId(cardSets[0]!.id);
  }, [cardSets, selectedCardSetId]);

  const log = useCallback((msg: string) => setSetupLog(l => [...l, msg]), []);

  // ─── Setup Demo Event ────────────────────────────────────────────────────

  const handleSetup = async () => {
    setSetupPhase('running');
    setSetupLog([]);
    setSetupError('');
    try {
      // 1. Create event
      log('Creazione evento "Demo Serata"…');
      const event = await apiFetch('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Serata', venue: 'IDEAgame Demo', status: 'live', enabledGames: ['gioco-delle-coppie', 'quizzone'] }),
      });
      const eventId = event.id as string;
      const joinCode = (event.joinCode as string) ?? '???';
      log(`✓ Evento creato — join code: ${joinCode}`);

      // 2. Create 2 teams
      log('Creazione squadre…');
      const teamA = await apiFetch(`/events/${eventId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Le Stelle', color: '#F59E0B' }),
      });
      const teamB = await apiFetch(`/events/${eventId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'La Luna', color: '#06B6D4' }),
      });
      const teams: DemoTeam[] = [
        { id: teamA.id as string, name: 'Le Stelle', color: '#F59E0B' },
        { id: teamB.id as string, name: 'La Luna', color: '#06B6D4' },
      ];
      log('✓ Squadre create: Le Stelle (oro) + La Luna (cyan)');

      // 3. Optional demo players
      if (addPlayers) {
        log('Aggiunta giocatori demo…');
        const demoPlayers = [
          { nickname: 'Marco', avatarColor: '#8B5CF6', teamId: teams[0]!.id },
          { nickname: 'Sofia', avatarColor: '#EC4899', teamId: teams[0]!.id },
          { nickname: 'Luca',  avatarColor: '#10B981', teamId: teams[1]!.id },
          { nickname: 'Emma',  avatarColor: '#F59E0B', teamId: teams[1]!.id },
        ];
        for (const p of demoPlayers) {
          await apiFetch(`/events/${eventId}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p),
          }).catch(() => null); // non-blocking
        }
        log('✓ 4 giocatori demo aggiunti');
      }

      // 4. Create Coppie session
      log('Preparazione sessione Gioco Coppie…');
      const totalRoundsCoppie = 1;
      const coppieSession = await apiFetch(`/events/${eventId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: 'gioco-coppie', totalRounds: totalRoundsCoppie }),
      });
      const coppieSessionId = coppieSession.id as string;

      // Init coppie board if we have a card set
      if (selectedCardSetId) {
        await apiFetch(`/coppie/sessions/${coppieSessionId}/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardSetId: selectedCardSetId, difficulty: 'medium', mode: 'teams', teamIds: [teams[0]!.id, teams[1]!.id] }),
        }).catch(() => null);
        log('✓ Sessione Coppie creata + board inizializzata');
      } else {
        log('✓ Sessione Coppie creata (nessun deck — inizializza da LiveControl)');
      }

      // 5. Create Quizzone session
      log('Preparazione sessione Quizzone…');
      const pack = quizPacks.find(p => p.id === selectedPackId);
      const totalRoundsQuiz = pack?.totalRounds ?? 10;
      const quizSession = await apiFetch(`/events/${eventId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: 'quizzone', totalRounds: totalRoundsQuiz }),
      });
      const quizzoneSessionId = quizSession.id as string;
      log(`✓ Sessione Quizzone creata (${totalRoundsQuiz} domande)`);

      const setup: DemoSetup = { eventId, joinCode, teams, coppieSessionId, quizzoneSessionId };
      setDemoData(setup);
      setSetupPhase('done');
      log('');
      log('🚀 Demo pronta! Passa alla tab "Guida Animatore".');
    } catch (e) {
      setSetupError((e as Error).message);
      setSetupPhase('error');
    }
  };

  const handleReset = () => {
    if (!confirm('Cancella tutti i dati demo salvati e ricomincia?')) return;
    setDemoData(null);
    setSetupPhase('idle');
    setSetupLog([]);
    setGuideStep(0);
    setCompletedSteps([]);
  };

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  // ─── URL helpers ────────────────────────────────────────────────────────

  const playerUrl   = demoData ? absUrl(`/play?e=${demoData.joinCode}`) : '';
  const projectorUrl = absUrl('/');
  const coppieUrl   = demoData ? absUrl(`/coppie?s=${demoData.coppieSessionId}&e=${demoData.eventId}`) : '';
  const quizzoneUrl = demoData ? absUrl(`/quizzone?s=${demoData.quizzoneSessionId}&e=${demoData.eventId}`) : '';
  const scoreUrl    = demoData ? absUrl(`/scoreboard?e=${demoData.eventId}`) : '';
  const lobbyUrl    = absUrl('/lobby');
  const controlUrl  = absUrl('/control');

  const stepDynamicUrl = (idx: number) => {
    const s = GUIDE_STEPS[idx];
    if (!s) return absUrl('/');
    if (s.projectorPath) return absUrl(s.projectorPath);
    if (idx === 1) return coppieUrl;
    if (idx === 2 || idx === 5) return scoreUrl;
    if (idx === 4) return quizzoneUrl;
    return absUrl('/');
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 10%), hsl(248 70% 3%))' }}>

      {/* ── Blackout overlay ─── */}
      {black && (
        <div className="fixed inset-0 z-[200] bg-black cursor-pointer" onClick={() => setBlack(false)}>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/30 text-sm">click per togliere il black screen</div>
        </div>
      )}

      {/* ── QR modal ─── */}
      <AnimatePresence>
        {showQr && demoData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowQr(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              className="rounded-3xl border border-border bg-card p-8 text-center shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">Scansiona per giocare</div>
              <QrPlaceholder text={playerUrl} size={260} />
              <div className="mt-4 text-display text-4xl font-black text-primary">{demoData.joinCode}</div>
              <div className="mt-1 text-xs text-muted-foreground break-all">{playerUrl}</div>
              <button onClick={() => setShowQr(false)} className="mt-5 rounded-xl border border-border px-6 py-2.5 text-sm font-bold hover-elevate">
                Chiudi
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─── */}
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-bold hover-elevate">
            <ChevronLeft className="h-4 w-4" /> Hub
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-display text-lg font-black">Modalità Demo Evento</div>
              <div className="text-xs text-muted-foreground">Simulazione serata reale</div>
            </div>
          </div>
          {demoData && (
            <div className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-bold text-green-400">
              ● Demo attiva
            </div>
          )}
          {!demoData && <div className="w-20" />}
        </div>

        {/* ── Tabs ─── */}
        <div className="mb-5 flex gap-1 rounded-2xl border border-border bg-card/40 p-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm ${
                  activeTab === tab.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.id === 'setup' ? 'Setup' : tab.id === 'guide' ? 'Guida' : tab.id === 'panic' ? 'Panico' : 'Report'}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════ TAB: SETUP ═══════════════════════ */}
          {activeTab === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">

              {/* Already done */}
              {demoData && (
                <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                    <div className="text-display font-black text-green-400">Demo evento pronto!</div>
                    <button onClick={handleReset} className="ml-auto text-xs text-muted-foreground underline hover:text-destructive">Reset</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border bg-card/60 p-3">
                      <div className="text-xs text-muted-foreground">Join code</div>
                      <div className="text-display text-2xl font-black text-primary">{demoData.joinCode}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-card/60 p-3">
                      <div className="text-xs text-muted-foreground">Squadre</div>
                      <div className="space-y-1 mt-1">
                        {demoData.teams.map(t => (
                          <div key={t.id} className="flex items-center gap-1.5 text-sm font-bold">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                            {t.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setShowQr(true)}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-2.5 text-sm font-bold hover-elevate">
                      <QrCode className="h-4 w-4" /> Mostra QR
                    </button>
                    <button onClick={() => { setActiveTab('guide'); }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-black text-primary-foreground hover-elevate">
                      <Play className="h-4 w-4" /> Avvia serata →
                    </button>
                  </div>
                </div>
              )}

              {/* Setup form */}
              {!demoData && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
                  <div className="text-display font-black">Configura demo serata</div>

                  {/* Auth warning */}
                  {currentUser === 'loading' && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifica sessione…
                    </div>
                  )}
                  {currentUser === null && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="inline h-4 w-4 mr-1.5" />
                      Non sei loggato.{' '}
                      <button onClick={() => navigate('/login')} className="underline font-bold">Vai al login</button>
                      {' '}(usa owner@mango.events / ideagame)
                    </div>
                  )}
                  {currentUser !== null && currentUser !== 'loading' && !currentUser.tenantId && (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                      <AlertTriangle className="inline h-4 w-4 mr-1.5" />
                      Loggato come <strong>{currentUser.email}</strong> (super_admin — nessun tenant).
                      Per creare eventi serve un account tenant.{' '}
                      <button onClick={() => navigate('/login')} className="underline font-bold">Cambia account</button>
                      {' '}→ <code className="text-xs">owner@mango.events</code>
                    </div>
                  )}
                  {currentUser !== null && currentUser !== 'loading' && currentUser.tenantId && (
                    <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Loggato come <strong>{currentUser.email}</strong> — pronto per creare l&apos;evento.
                    </div>
                  )}

                  {/* Quiz pack */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Quiz pack per Quizzone</div>
                    {quizPacks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-400">
                        Nessun quiz pack approvato. Generane uno in Admin → Quiz AI oppure procedi senza (puoi assegnarlo in LiveControl).
                      </div>
                    ) : (
                      <select value={selectedPackId} onChange={e => setSelectedPackId(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                        {quizPacks.map(p => <option key={p.id} value={p.id}>{p.title} ({p.totalRounds} domande)</option>)}
                      </select>
                    )}
                  </div>

                  {/* Card set */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Deck per Gioco Coppie</div>
                    {cardSets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-400">
                        Nessun deck disponibile. Creane uno in Admin → Card Sets.
                      </div>
                    ) : (
                      <select value={selectedCardSetId} onChange={e => setSelectedCardSetId(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                        <option value="">— nessun deck (inizializza manualmente) —</option>
                        {cardSets.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Players toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`h-5 w-10 rounded-full transition-colors ${addPlayers ? 'bg-primary' : 'bg-border'}`}
                         onClick={() => setAddPlayers(v => !v)}>
                      <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${addPlayers ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">Aggiungi 4 giocatori demo</div>
                      <div className="text-xs text-muted-foreground">Marco, Sofia, Luca, Emma — utili per testare la lobby</div>
                    </div>
                  </label>

                  {setupPhase === 'error' && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {setupError}
                    </div>
                  )}

                  <button onClick={handleSetup} disabled={setupPhase === 'running'}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-black text-primary-foreground disabled:opacity-40 hover-elevate">
                    {setupPhase === 'running'
                      ? <><Loader2 className="h-5 w-5 animate-spin" /> Creazione in corso…</>
                      : <><Rocket className="h-5 w-5" /> Avvia demo serata</>}
                  </button>
                </div>
              )}

              {/* Setup log */}
              {setupLog.length > 0 && (
                <div className="rounded-2xl border border-border bg-card/40 p-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Log setup</div>
                  <div className="space-y-1 font-mono text-xs">
                    {setupLog.map((line, i) => (
                      <div key={i} className={line.startsWith('✓') ? 'text-green-400' : line.startsWith('🚀') ? 'text-primary' : 'text-muted-foreground'}>
                        {line || <span className="opacity-0">.</span>}
                      </div>
                    ))}
                    {setupPhase === 'running' && <div className="text-primary animate-pulse">…</div>}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════ TAB: GUIDE ═══════════════════════ */}
          {activeTab === 'guide' && (
            <motion.div key="guide" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">

              {!demoData && (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-sm text-amber-300">
                  <AlertCircle className="inline h-4 w-4 mr-2" />
                  Crea prima un demo evento nella tab <strong>Setup</strong>.
                </div>
              )}

              {/* Progress bar */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Avanzamento serata</div>
                  <div className="text-display font-black text-primary">{completedSteps.length}/{GUIDE_STEPS.length}</div>
                </div>
                <div className="flex gap-1">
                  {GUIDE_STEPS.map((s, i) => (
                    <div key={s.id} className={`h-2 flex-1 rounded-full transition-all ${
                      completedSteps.includes(i) ? 'bg-primary' :
                      i === guideStep ? 'bg-primary/50 animate-pulse' :
                      'bg-border'
                    }`} />
                  ))}
                </div>
              </div>

              {/* Steps list */}
              <div className="space-y-2">
                {GUIDE_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const isActive = i === guideStep;
                  const isDone = completedSteps.includes(i);
                  const url = stepDynamicUrl(i);
                  return (
                    <motion.div key={step.id}
                      animate={{ scale: isActive ? 1.01 : 1 }}
                      className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                        isActive
                          ? 'border-primary/60 bg-primary/10 shadow-lg shadow-primary/10'
                          : isDone
                          ? 'border-green-500/30 bg-green-500/5 opacity-70'
                          : 'border-border bg-card/40'
                      }`}
                      onClick={() => setGuideStep(i)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Step icon */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                             style={{ background: `${step.color}22`, color: step.color }}>
                          {isDone ? <CheckCircle2 className="h-5 w-5" style={{ color: '#22c55e' }} /> : <Icon className="h-5 w-5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step {step.id}</span>
                            {isActive && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">CORRENTE</span>}
                            {isDone && <span className="text-xs text-green-400">✓ completato</span>}
                          </div>
                          <div className="text-display font-black text-base">{step.label}</div>
                          {isActive && (
                            <div className="mt-1.5 text-sm text-muted-foreground">{step.desc}</div>
                          )}
                        </div>
                      </div>

                      {/* Expanded: actions */}
                      {isActive && (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 flex gap-2 text-xs text-amber-300">
                            <Info className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{step.tip}</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {/* Projector URL button */}
                            {demoData && url && (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover-elevate">
                                <Monitor className="h-4 w-4 text-primary" />
                                Apri sul proiettore
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </a>
                            )}
                            {/* Control button for steps that need LiveControl */}
                            {(i === 1 || i === 4) && demoData && (
                              <a href={controlUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover-elevate">
                                <Zap className="h-4 w-4 text-amber-400" />
                                LiveControl
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </a>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {i > 0 && (
                              <button onClick={e => { e.stopPropagation(); setGuideStep(i - 1); }}
                                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover-elevate">
                                <ChevronLeft className="h-4 w-4" /> Indietro
                              </button>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setCompletedSteps(s => s.includes(i) ? s : [...s, i]);
                                if (i < GUIDE_STEPS.length - 1) setGuideStep(i + 1);
                              }}
                              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-black text-primary-foreground hover-elevate">
                              {isDone ? 'Rivai →' : i === GUIDE_STEPS.length - 1 ? '🏆 Serata terminata!' : 'Completato →'}
                              {i < GUIDE_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Reset steps */}
              {completedSteps.length > 0 && (
                <button onClick={() => { setCompletedSteps([]); setGuideStep(0); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover-elevate">
                  <RotateCcw className="h-4 w-4" /> Ricomincia percorso
                </button>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════ TAB: PANIC ═══════════════════════ */}
          {activeTab === 'panic' && (
            <motion.div key="panic" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">

              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <div className="text-display font-black">Controlli di emergenza</div>
                </div>
                <div className="text-xs text-muted-foreground">Pulsanti rapidi per gestire situazioni impreviste durante la serata.</div>
              </div>

              {/* PRIMARY CONTROLS */}
              <div className="grid grid-cols-2 gap-3">

                <button onClick={() => navigate('/')}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 hover-elevate">
                  <Home className="h-7 w-7 text-primary" />
                  <div className="text-sm font-black">Torna Hub</div>
                  <div className="text-xs text-muted-foreground text-center">Schermo principale griglia giochi</div>
                </button>

                <button onClick={() => setShowQr(true)} disabled={!demoData}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 hover-elevate disabled:opacity-40">
                  <QrCode className="h-7 w-7 text-cyan-400" />
                  <div className="text-sm font-black">Mostra QR</div>
                  <div className="text-xs text-muted-foreground text-center">Join code a schermo intero</div>
                </button>

                <button onClick={() => demoData && navigate(`/scoreboard?e=${demoData.eventId}`)} disabled={!demoData}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 hover-elevate disabled:opacity-40">
                  <Trophy className="h-7 w-7 text-amber-400" />
                  <div className="text-sm font-black">Mostra Podio</div>
                  <div className="text-xs text-muted-foreground text-center">Scoreboard evento corrente</div>
                </button>

                <button onClick={() => setBlack(b => !b)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-5 hover-elevate ${black ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border bg-card'}`}>
                  <MonitorOff className="h-7 w-7" />
                  <div className="text-sm font-black">Black Screen</div>
                  <div className="text-xs opacity-60 text-center">{black ? 'Attivo — clicca per disattivare' : 'Oscura proiettore'}</div>
                </button>

                <button onClick={() => navigate('/control')}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 hover-elevate">
                  <Zap className="h-7 w-7 text-amber-400" />
                  <div className="text-sm font-black">LiveControl</div>
                  <div className="text-xs text-muted-foreground text-center">Pannello controllo animatore</div>
                </button>

                <button onClick={() => navigate('/lobby')}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 hover-elevate">
                  <Users className="h-7 w-7 text-purple-400" />
                  <div className="text-sm font-black">Apri Lobby</div>
                  <div className="text-xs text-muted-foreground text-center">Sala attesa giocatori</div>
                </button>
              </div>

              {/* RESET SESSION */}
              {demoData && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="text-sm font-black text-muted-foreground uppercase tracking-widest">Reset / chiudi sessioni</div>

                  <div className="space-y-2">
                    {[
                      { label: 'Chiudi sessione Coppie', sessionId: demoData.coppieSessionId, color: '#EC4899' },
                      { label: 'Chiudi sessione Quizzone', sessionId: demoData.quizzoneSessionId, color: '#10B981' },
                    ].map(item => (
                      <button key={item.sessionId}
                        onClick={() => {
                          if (!confirm(`Terminare la sessione "${item.label}"? I punteggi vengono mantenuti.`)) return;
                          apiFetch(`/sessions/${item.sessionId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'ended' }),
                          }).catch(() => null);
                        }}
                        className="w-full flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-bold hover:border-destructive/40 hover:bg-destructive/5 hover-elevate">
                        <Power className="h-4 w-4 text-destructive" />
                        {item.label}
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{item.sessionId.slice(0, 8)}…</span>
                      </button>
                    ))}
                  </div>

                  <button onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-bold text-destructive hover-elevate">
                    <RotateCcw className="h-4 w-4" /> Reset completo demo
                  </button>
                </div>
              )}

              {/* Quick URLs */}
              {demoData && (
                <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">URL rapidi</div>
                  {[
                    { label: '📱 Telefoni giocatori', url: playerUrl },
                    { label: '🖥 Coppie (proiettore)', url: coppieUrl },
                    { label: '🧠 Quizzone (proiettore)', url: quizzoneUrl },
                    { label: '🏆 Podio', url: scoreUrl },
                  ].map(item => (
                    <div key={item.url} className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-44 shrink-0">{item.label}</div>
                      <div className="flex-1 min-w-0 font-mono text-xs text-foreground/60 truncate">{item.url}</div>
                      <button onClick={() => copyToClipboard(item.url, item.url)}
                        className="shrink-0 rounded-lg border border-border p-1.5 hover-elevate">
                        {copied === item.url ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════ TAB: REPORT ══════════════════════ */}
          {activeTab === 'report' && (
            <motion.div key="report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">

              {/* URLS TABLE */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-display font-black mb-4 flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-primary" /> Pagine per maxi schermo (proiettore)
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { page: 'Hub / Griglia giochi', url: '/', status: '✅ Reale', note: 'Richiede login admin' },
                    { page: 'Lobby attesa giocatori', url: '/lobby', status: '🟡 Mock', note: 'Giocatori da polling real-time' },
                    { page: 'Gioco delle Coppie', url: coppieUrl || '/coppie?s=SESSION_ID&e=EVENT_ID', status: '✅ Reale', note: 'Fully real, socket-driven' },
                    { page: 'Quizzone (board)', url: quizzoneUrl || '/quizzone?s=SESSION_ID&e=EVENT_ID', status: '✅ Reale', note: 'Domande da pack DB' },
                    { page: 'Scoreboard / Podio', url: scoreUrl || '/scoreboard?e=EVENT_ID', status: '✅ Reale', note: 'Socket + polling 8s' },
                    { page: 'GameStage /game/:slug', url: '/game/percorso-a-risate', status: '🟡 Demo', note: 'Animazioni locali, nessun DB' },
                  ].map(r => (
                    <div key={r.page} className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-0.5 rounded-xl border border-border/40 bg-background/50 px-4 py-3">
                      <div>
                        <div className="font-bold">{r.page}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.url.length > 60 ? r.url.slice(0, 57) + '…' : r.url}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">{r.note}</div>
                      </div>
                      <div className="text-xs font-bold whitespace-nowrap">{r.status}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PHONE URLs */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-display font-black mb-4 flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-cyan-400" /> Pagine per telefoni giocatori
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { page: 'Player (join + controller)', url: playerUrl || '/play?e=JOINCODE', status: '✅ Reale', note: 'Auto-switch controller per gioco attivo' },
                    { page: 'Coppie controller (phone)', url: 'automatico su /play', status: '✅ Reale', note: 'Si attiva automaticamente via socket' },
                    { page: 'Quizzone (risposta)', url: 'automatico su /play', status: '✅ Reale', note: 'Bottoni risposta + countdown' },
                    { page: 'Buzzer generico', url: 'automatico su /play', status: '✅ Reale', note: 'Per giochi senza controller' },
                  ].map(r => (
                    <div key={r.page} className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-background/50 px-4 py-3">
                      <div>
                        <div className="font-bold">{r.page}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.url}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">{r.note}</div>
                      </div>
                      <div className="text-xs font-bold whitespace-nowrap shrink-0">{r.status}</div>
                    </div>
                  ))}
                </div>
                {playerUrl && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 font-mono text-xs text-primary break-all">{playerUrl}</div>
                    <button onClick={() => copyToClipboard(playerUrl, 'player')}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover-elevate">
                      {copied === 'player' ? <><Check className="h-3.5 w-3.5 text-green-400" /> Copiato!</> : <><Copy className="h-3.5 w-3.5" /> Copia URL</>}
                    </button>
                  </div>
                )}
              </div>

              {/* WHAT'S REAL vs DEMO */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-display font-black mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-amber-400" /> Cosa è reale vs demo
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { item: 'Login / sessione admin', real: true },
                    { item: 'Creazione evento + squadre', real: true },
                    { item: 'Join giocatori via QR', real: true },
                    { item: 'Gioco Coppie (board, flip, punteggi)', real: true },
                    { item: 'Quizzone (domande, risposte, punteggi)', real: true },
                    { item: 'Scoreboard / Podio', real: true },
                    { item: 'Socket realtime (coppie + quiz)', real: true },
                    { item: 'LiveControl (start/pause/end sessione)', real: true },
                    { item: 'Lobby (contatore giocatori)', real: true },
                    { item: 'GameStage /game/:slug (animazioni)', real: false },
                    { item: 'Buzzer generico → scoring automatico', real: false },
                    { item: 'Upload media (usa URL paste)', real: false },
                    { item: 'Modifica evento/utente da UI (PATCH)', real: false },
                  ].map(r => (
                    <div key={r.item} className="flex items-center gap-3">
                      <span className={`h-4 w-4 shrink-0 rounded-full text-xs flex items-center justify-center ${r.real ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {r.real ? '✓' : '○'}
                      </span>
                      <span className={r.real ? '' : 'text-muted-foreground'}>{r.item}</span>
                      <span className="ml-auto text-xs font-bold">{r.real ? '✅ Reale' : '🟡 Mock'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RISKS */}
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
                <div className="text-display font-black mb-4 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Rischi live
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    { risk: 'Hub richiede login admin', severity: 'alta', fix: 'Effettua il login PRIMA di aprire sul proiettore. La sessione dura fino al logout.' },
                    { risk: 'Socket.IO disconnesso su rete lenta', severity: 'media', fix: 'Il client ha polling di fallback (5–8s). Mostra l\'indicatore Wifi nell\'angolo.' },
                    { risk: 'Nessun CSRF / rate-limit su login', severity: 'media', fix: 'Non aprire a reti non fidate. Per evento pubblico aggiungere rate-limit.' },
                    { risk: 'Join code collisione (DEMO + eventi reali)', severity: 'bassa', fix: 'Il setup demo genera un codice casuale (DEMO10–99). Evita di creare eventi con lo stesso codice.' },
                    { risk: 'user_sessions persa al restart DB', severity: 'bassa', fix: 'Ricrea la tabella con lo snippet nel replit.md (sezione Gotchas).' },
                    { risk: 'Quizzone senza pack approvato', severity: 'bassa', fix: 'Genera e approva un pack in Admin → Quiz AI prima della serata.' },
                  ].map(r => (
                    <div key={r.risk} className="rounded-xl border border-border/40 bg-card/60 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${r.severity === 'alta' ? 'bg-destructive/20 text-destructive' : r.severity === 'media' ? 'bg-amber-400/15 text-amber-400' : 'bg-border/40 text-muted-foreground'}`}>
                          {r.severity}
                        </span>
                        <div>
                          <div className="font-bold">{r.risk}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{r.fix}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CHECKLIST 2 PHONES */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-display font-black mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-400" /> Checklist test con 2 telefoni reali
                </div>
                <ChecklistSection items={[
                  { label: 'Entrambi i telefoni connessi alla stessa rete Wi-Fi' },
                  { label: 'Admin loggato su browser proiettore (admin@ideagame.app / ideagame)' },
                  { label: 'Setup Demo completato: evento + squadre + sessioni create' },
                  { label: 'Telefono 1: apri ' + (playerUrl || '/play?e=JOINCODE') + ' → nick "Marco" → squadra A' },
                  { label: 'Telefono 2: apri ' + (playerUrl || '/play?e=JOINCODE') + ' → nick "Sofia" → squadra B' },
                  { label: 'Proiettore: verifica che i 2 giocatori appaiano nella Lobby' },
                  { label: 'LiveControl: avvia sessione Coppie → inizializza board' },
                  { label: 'Proiettore: apri ' + (coppieUrl || '/coppie?s=...') },
                  { label: 'Telefoni: verifica che appaia la mini-griglia Coppie' },
                  { label: 'Tap su una carta → verifica flip a schermo su proiettore' },
                  { label: 'Trova una coppia → verifica +punteggio in tempo reale' },
                  { label: 'Proiettore: scoreboard → verifica punteggi corretti' },
                  { label: 'LiveControl: avvia sessione Quizzone → seleziona pack → avvia D1' },
                  { label: 'Proiettore: apri ' + (quizzoneUrl || '/quizzone?s=...') },
                  { label: 'Telefoni: verifica che appaia la domanda con 4 risposte + countdown' },
                  { label: 'Risposta su entrambi i telefoni → verifica contatore risposte in LiveControl' },
                  { label: 'LiveControl: rivela risposta → verifica colori verde/rosso sui telefoni' },
                  { label: 'Proiettore: podio finale → verifica classifica aggiornata' },
                ]} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Checklist component ──────────────────────────────────────────────────────

function ChecklistSection({ items }: { items: { label: string }[] }) {
  const [checked, setChecked] = useState<number[]>([]);
  const toggle = (i: number) => setChecked(c => c.includes(i) ? c.filter(x => x !== i) : [...c, i]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{checked.length}/{items.length} completati</span>
        <button onClick={() => setChecked([])} className="underline hover:text-foreground">Reset</button>
      </div>
      {items.map((item, i) => (
        <button key={i} onClick={() => toggle(i)}
          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-all hover-elevate ${
            checked.includes(i)
              ? 'border-green-500/30 bg-green-500/10 text-green-300 line-through opacity-70'
              : 'border-border bg-background/50 hover:border-primary/30'
          }`}>
          <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked.includes(i) ? 'border-green-400 bg-green-400/20' : 'border-border'}`}>
            {checked.includes(i) && <Check className="h-3 w-3 text-green-400" />}
          </div>
          <span className="leading-relaxed">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

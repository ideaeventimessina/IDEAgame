import { useState, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { Wand2, Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle, Import, RefreshCw, Trash2, Sparkles, AlertCircle, Eye, EyeOff, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ────────────────────────────────────────────────────────────────────

type Audience = 'bambini' | 'famiglie' | 'adulti' | 'aziendale' | 'matrimonio' | 'compleanno' | 'diciottesimo';
type Tone = 'elegante' | 'comico' | 'trash-controllato' | 'luxury' | 'competitivo' | 'romantico' | 'ironico';
type Difficulty = 'easy' | 'medium' | 'hard';

interface GeneratedItem {
  id: string;
  gameSlug: string;
  itemType: string;
  title: string;
  payload: Record<string, unknown>;
  status: 'draft' | 'approved' | 'rejected' | 'imported';
  targetEntityId?: string;
  createdAt: string;
}

interface Generation {
  id: string;
  title: string;
  theme: string;
  targetAudience: string;
  tone: string;
  status: 'draft' | 'generating' | 'generated' | 'approved' | 'failed';
  errorMessage?: string;
  createdAt: string;
  items: GeneratedItem[];
}

const GAMES = [
  { slug: 'percorso-a-risate',  label: 'Percorso a Risate',  emoji: '🏃' },
  { slug: 'quizzone',           label: 'Quizzone',           emoji: '🧠' },
  { slug: 'gioco-delle-coppie', label: 'Gioco delle Coppie', emoji: '💑' },
  { slug: 'adult-only',         label: 'Adult Only',         emoji: '🔞' },
  { slug: 'parola-alle-spalle', label: 'Parola alle Spalle', emoji: '🗣️' },
  { slug: 'karaoke-battle',     label: 'Karaoke Battle',     emoji: '🎤' },
  { slug: 'freestyle-battle',   label: 'Freestyle Battle',   emoji: '🎵' },
];

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'bambini', label: '👶 Bambini' },
  { value: 'famiglie', label: '👨‍👩‍👧 Famiglie' },
  { value: 'adulti', label: '🍸 Adulti' },
  { value: 'aziendale', label: '💼 Aziendale' },
  { value: 'matrimonio', label: '💍 Matrimonio' },
  { value: 'compleanno', label: '🎂 Compleanno' },
  { value: 'diciottesimo', label: '🎉 Diciottesimo' },
];

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'elegante', label: '🎩 Elegante' },
  { value: 'comico', label: '😂 Comico' },
  { value: 'trash-controllato', label: '🎪 Trash controllato' },
  { value: 'luxury', label: '✨ Luxury' },
  { value: 'competitivo', label: '🏆 Competitivo' },
  { value: 'romantico', label: '💗 Romantico' },
  { value: 'ironico', label: '😏 Ironico' },
];

// ── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
const selectCls = `${inputCls} cursor-pointer`;

// ── Payload preview ──────────────────────────────────────────────────────────

function PayloadPreview({ gameSlug, payload }: { gameSlug: string; payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  const renderPercorso = () => {
    const steps = (payload.steps as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        {!!payload.hostIntro && <p className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-3">🎤 {payload.hostIntro as string}</p>}
        <div className="text-xs uppercase tracking-widest text-muted-foreground mt-2">{steps.length} sfide:</div>
        {steps.slice(0, expanded ? 999 : 4).map((s, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{s.title as string}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{s.challengeType as string}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{s.description as string}</p>
            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
              <span>⏱ {s.timeLimit as number}s</span><span>🏆 {s.points as number}pt</span>
              {!!s.jonnyLine && <span className="text-accent">💬 {s.jonnyLine as string}</span>}
            </div>
          </div>
        ))}
        {steps.length > 4 && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary hover:underline">
            {expanded ? 'Mostra meno ▲' : `Mostra tutte (${steps.length}) ▼`}
          </button>
        )}
      </div>
    );
  };

  const renderQuizzone = () => {
    const rounds = (payload.rounds as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        {!!payload.hostIntro && <p className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-3">🎤 {payload.hostIntro as string}</p>}
        <div className="text-xs uppercase tracking-widest text-muted-foreground mt-2">{rounds.length} domande:</div>
        {rounds.slice(0, expanded ? 999 : 4).map((r, i) => {
          const answers = (r.answers as string[]) || [];
          return (
            <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Q{i + 1}</span>
                <span className="text-xs font-bold text-muted-foreground">{r.difficulty as string} · {r.points as number}pt</span>
              </div>
              <p className="text-sm font-semibold">{r.questionText as string}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {answers.map((a, ai) => (
                  <div key={ai} className={`rounded px-2 py-1 text-[11px] ${ai === (r.correctAnswer as number) ? 'bg-green-500/20 text-green-400 font-bold' : 'bg-card/60 text-muted-foreground'}`}>
                    {String.fromCharCode(65 + ai)}. {a}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {rounds.length > 4 && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary hover:underline">
            {expanded ? 'Mostra meno ▲' : `Mostra tutte (${rounds.length}) ▼`}
          </button>
        )}
      </div>
    );
  };

  const renderWordBack = () => {
    const cards = (payload.cards as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{cards.length} parole:</div>
        <div className="flex flex-wrap gap-2">
          {cards.slice(0, expanded ? 999 : 16).map((c, i) => (
            <span key={i} className="rounded-full border border-border bg-card/60 px-2.5 py-1 text-sm font-bold">
              {c.word as string}
            </span>
          ))}
          {!expanded && cards.length > 16 && (
            <button onClick={() => setExpanded(true)} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary">+{cards.length - 16} altre</button>
          )}
        </div>
      </div>
    );
  };

  const renderAdultOnly = () => {
    const cards = (payload.cards as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{cards.length} carte:</div>
        {cards.slice(0, expanded ? 999 : 4).map((c, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{c.title as string}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(c.level as string) === 'spicy' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>{c.level as string}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.body as string}</p>
          </div>
        ))}
        {cards.length > 4 && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary hover:underline">
            {expanded ? 'Mostra meno ▲' : `Mostra tutte (${cards.length}) ▼`}
          </button>
        )}
      </div>
    );
  };

  const renderKaraoke = () => {
    const tracks = (payload.tracks as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{tracks.length} canzoni:</div>
        {tracks.slice(0, expanded ? 999 : 6).map((t, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{t.title as string}</span>
              <span className="text-xs text-muted-foreground">{t.artist as string}</span>
            </div>
            {!!t.lyricSnippet && <p className="mt-1 text-xs text-muted-foreground italic">{(t.lyricSnippet as string).slice(0, 80)}…</p>}
            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
              <span>🎵 {t.category as string}</span><span>⏱ {t.durationSeconds as number}s</span>
            </div>
          </div>
        ))}
        {tracks.length > 6 && <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary hover:underline">{expanded ? 'Mostra meno ▲' : `Mostra tutte (${tracks.length}) ▼`}</button>}
      </div>
    );
  };

  const renderFreestyle = () => {
    const words = (payload.words as string[]) || [];
    return (
      <div className="space-y-2 mt-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{words.length} parole:</div>
        <div className="flex flex-wrap gap-1.5">
          {words.slice(0, expanded ? 999 : 20).map((w, i) => (
            <span key={i} className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">{w}</span>
          ))}
          {!expanded && words.length > 20 && (
            <button onClick={() => setExpanded(true)} className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">+{words.length - 20}</button>
          )}
        </div>
      </div>
    );
  };

  const renderCoppie = () => {
    const pairs = (payload.pairs as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2 mt-3">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          ⚠️ Le coppie richiedono upload manuale delle immagini. Usa Admin → Deck di carte dopo l'import.
        </div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mt-2">{pairs.length} coppie:</div>
        {pairs.slice(0, expanded ? 999 : 4).map((p, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-2.5">
            <div className="text-sm font-bold">{p.label as string}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">📷 A: {p.imageDescription as string}</p>
            <p className="text-[11px] text-muted-foreground">📷 B: {p.imageDescriptionB as string}</p>
          </div>
        ))}
        {pairs.length > 4 && <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary hover:underline">{expanded ? '▲' : `+${pairs.length - 4} altre ▼`}</button>}
      </div>
    );
  };

  const renderMap: Record<string, () => React.ReactNode> = {
    'percorso-a-risate': renderPercorso,
    'quizzone': renderQuizzone,
    'parola-alle-spalle': renderWordBack,
    'adult-only': renderAdultOnly,
    'karaoke-battle': renderKaraoke,
    'freestyle-battle': renderFreestyle,
    'gioco-delle-coppie': renderCoppie,
  };

  const render = renderMap[gameSlug];
  if (!render) return <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-40">{JSON.stringify(payload, null, 2)}</pre>;
  return <>{render()}</>;
}

// ── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item, onApprove, onReject, onImport, onUpdate,
}: {
  item: GeneratedItem;
  onApprove: () => void;
  onReject: () => void;
  onImport: () => Promise<void>;
  onUpdate: (patch: Partial<GeneratedItem>) => void;
}) {
  const [open, setOpen] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const game = GAMES.find(g => g.slug === item.gameSlug);

  const handleImport = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      await onImport();
      setImportMsg('✅ Importato con successo!');
    } catch (e) {
      setImportMsg(`❌ ${e instanceof Error ? e.message : 'Errore import'}`);
    } finally {
      setImporting(false);
    }
  };

  const statusColor = {
    draft: 'border-border text-muted-foreground',
    approved: 'border-green-500/60 text-green-400',
    rejected: 'border-red-500/60 text-red-400',
    imported: 'border-blue-500/60 text-blue-400',
  }[item.status];

  return (
    <motion.div
      layout
      className={`rounded-2xl border bg-card/60 overflow-hidden ${statusColor}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl">{game?.emoji ?? '🎮'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black truncate">{item.title}</div>
          <div className="text-xs text-muted-foreground">{game?.label ?? item.gameSlug}</div>
        </div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusColor}`}>
          {item.status}
        </div>
        <button onClick={() => setOpen(o => !o)} className="p-1 text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-4 pb-4 pt-3">
              <PayloadPreview gameSlug={item.gameSlug} payload={item.payload} />

              {importMsg && (
                <div className="mt-3 rounded-xl bg-card/60 border border-border px-3 py-2 text-xs">{importMsg}</div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === 'draft' && (
                  <>
                    <button onClick={onApprove}
                      className="flex items-center gap-1.5 rounded-xl bg-green-500/15 border border-green-500/40 px-3 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/25">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approva
                    </button>
                    <button onClick={onReject}
                      className="flex items-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20">
                      <XCircle className="h-3.5 w-3.5" /> Rifiuta
                    </button>
                  </>
                )}
                {item.status === 'rejected' && (
                  <button onClick={onApprove}
                    className="flex items-center gap-1.5 rounded-xl bg-green-500/15 border border-green-500/40 px-3 py-1.5 text-xs font-bold text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Riapprova
                  </button>
                )}
                {(item.status === 'approved') && (
                  <button onClick={handleImport} disabled={importing}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-60">
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {importing ? 'Import…' : 'Importa nel gioco'}
                  </button>
                )}
                {item.status === 'imported' && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 border border-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Importato
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function JonnyCreator() {
  // Form state
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [audience, setAudience] = useState<Audience>('adulti');
  const [tone, setTone] = useState<Tone>('comico');
  const [language, setLanguage] = useState('it');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [duration, setDuration] = useState('120');
  const [teams, setTeams] = useState('4');
  const [selectedGames, setSelectedGames] = useState<string[]>(['percorso-a-risate', 'quizzone']);
  const [notes, setNotes] = useState('');

  // UI state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const toggleGame = (slug: string) => {
    setSelectedGames(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleGenerate = async () => {
    if (!title.trim() || !theme.trim() || selectedGames.length === 0) {
      setError('Compila titolo, tema e scegli almeno un gioco.');
      return;
    }
    setError(null);
    setGenerating(true);
    setGeneration(null);
    try {
      const res = await fetch('/api/jonny/generations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          theme: theme.trim(),
          targetAudience: audience,
          tone,
          language,
          difficulty,
          durationMinutes: duration,
          numberOfTeams: teams,
          selectedGames,
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore generazione');
      }
      const data = await res.json() as Generation;
      setGeneration(data);
      setHistory(prev => [data, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setGenerating(false);
    }
  };

  const updateItemStatus = useCallback(async (itemId: string, status: string) => {
    const res = await fetch(`/api/jonny/items/${itemId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setGeneration(prev => prev ? { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, ...updated } : i) } : prev);
  }, []);

  const importItem = useCallback(async (itemId: string) => {
    const res = await fetch(`/api/jonny/items/${itemId}/import`, {
      method: 'POST', credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Import fallito');
    }
    const data = await res.json();
    const updatedItem = data.item as GeneratedItem;
    setGeneration(prev => prev ? { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, ...updatedItem } : i) } : prev);
  }, []);

  const approveAll = async () => {
    if (!generation) return;
    const draftItems = generation.items.filter(i => i.status === 'draft');
    for (const item of draftItems) {
      await updateItemStatus(item.id, 'approved');
    }
  };

  const importAll = async () => {
    if (!generation) return;
    const approved = generation.items.filter(i => i.status === 'approved');
    for (const item of approved) {
      try { await importItem(item.id); } catch { /* continue */ }
    }
  };

  const approvedCount = generation?.items.filter(i => i.status === 'approved').length ?? 0;
  const importedCount = generation?.items.filter(i => i.status === 'imported').length ?? 0;
  const draftCount = generation?.items.filter(i => i.status === 'draft').length ?? 0;

  return (
    <AdminLayout title="Jonny AI Creator">
      <div className="flex h-full min-h-0 gap-0 lg:gap-6">

        {/* ── LEFT: Form ─────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto pb-8 pr-0 lg:w-[320px] lg:shrink-0 lg:pr-2">

          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/90 pb-2 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-display text-lg font-black text-primary">Jonny AI Creator</h1>
                <p className="text-xs text-muted-foreground">Genera contenuti per la serata</p>
              </div>
            </div>
          </div>

          <Field label="Titolo serata / evento">
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="es. Compleanno Sorrento 40" />
          </Field>

          <Field label="Tema principale *">
            <input className={inputCls} value={theme} onChange={e => setTheme(e.target.value)} placeholder="es. La Bella e la Bestia · Disney · Anni '90" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pubblico">
              <select className={selectCls} value={audience} onChange={e => setAudience(e.target.value as Audience)}>
                {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Tono">
              <select className={selectCls} value={tone} onChange={e => setTone(e.target.value as Tone)}>
                {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Lingua">
              <select className={selectCls} value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="it">🇮🇹 IT</option>
                <option value="en">🇬🇧 EN</option>
                <option value="es">🇪🇸 ES</option>
                <option value="fr">🇫🇷 FR</option>
              </select>
            </Field>
            <Field label="Difficoltà">
              <select className={selectCls} value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>
                <option value="easy">Facile</option>
                <option value="medium">Media</option>
                <option value="hard">Alta</option>
              </select>
            </Field>
            <Field label="Squadre">
              <select className={selectCls} value={teams} onChange={e => setTeams(e.target.value)}>
                {['2','3','4','5','6','8'].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Durata serata (minuti)">
            <input className={inputCls} type="number" value={duration} onChange={e => setDuration(e.target.value)} min="30" max="360" step="30" />
          </Field>

          <Field label="Giochi da includere *">
            <div className="grid grid-cols-1 gap-1.5">
              {GAMES.map(g => (
                <label key={g.slug}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    selectedGames.includes(g.slug)
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border bg-card/40 text-muted-foreground'
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={selectedGames.includes(g.slug)} onChange={() => toggleGame(g.slug)} />
                  <span className="text-lg">{g.emoji}</span>
                  <span className="font-semibold">{g.label}</span>
                  {selectedGames.includes(g.slug) && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Note libere (opzionale)">
            <textarea className={`${inputCls} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Indicazioni particolari, personaggi da citare, cose da evitare…" />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleGenerate} disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-60"
          >
            {generating
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Jonny sta generando…</>
              : <><Sparkles className="h-5 w-5" /> Genera contenuti</>
            }
          </button>

          {generating && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-primary">Jonny è al lavoro…</strong><br/>
              La generazione AI richiede 20–40 secondi. Non chiudere la pagina.
            </div>
          )}
        </div>

        {/* ── RIGHT: Preview + Status ────────────────────────────── */}
        <div className="hidden flex-1 flex-col gap-4 overflow-y-auto pb-8 lg:flex">

          {!generation && !generating && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
                <Wand2 className="h-10 w-10 text-primary/40" />
              </div>
              <div className="text-display text-xl font-black text-muted-foreground/40">Pronto a creare</div>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
                Compila il form a sinistra e clicca "Genera contenuti" per far lavorare Jonny AI.
              </p>
            </div>
          )}

          {generating && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <motion.div
                animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10"
              >
                <Wand2 className="h-10 w-10 text-primary" />
              </motion.div>
              <div className="text-display text-xl font-black">Jonny sta creando…</div>
              <p className="mt-2 text-sm text-muted-foreground">Generazione AI in corso per {selectedGames.length} giochi</p>
              <div className="mt-4 flex gap-1">
                {selectedGames.map((_, i) => (
                  <motion.div key={i} className="h-2 w-2 rounded-full bg-primary"
                    animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }} />
                ))}
              </div>
            </div>
          )}

          {generation && !generating && (
            <>
              {/* Status bar */}
              <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
                <div>
                  <div className="text-sm font-black">{generation.title}</div>
                  <div className="text-xs text-muted-foreground">Tema: {generation.theme}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-lg font-black text-muted-foreground">{draftCount}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">draft</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-green-400">{approvedCount}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">approvati</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-blue-400">{importedCount}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">importati</div>
                  </div>
                </div>
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2">
                {draftCount > 0 && (
                  <button onClick={approveAll}
                    className="flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-400 hover:bg-green-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approva tutti ({draftCount})
                  </button>
                )}
                {approvedCount > 0 && (
                  <button onClick={importAll}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:opacity-90">
                    <Download className="h-3.5 w-3.5" /> Importa tutti approvati ({approvedCount})
                  </button>
                )}
              </div>

              {/* Items */}
              <div className="space-y-3">
                {generation.items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onApprove={() => updateItemStatus(item.id, 'approved')}
                    onReject={() => updateItemStatus(item.id, 'rejected')}
                    onImport={() => importItem(item.id)}
                    onUpdate={patch => setGeneration(prev => prev
                      ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, ...patch } : i) }
                      : prev
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── MOBILE: show result below form ─────────────────────── */}
        {generation && !generating && (
          <div className="lg:hidden w-full mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-400">
              <CheckCircle2 className="h-4 w-4" /> {generation.items.length} contenuti generati per {generation.title}
            </div>
            {draftCount > 0 && (
              <button onClick={approveAll}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2.5 text-sm font-bold text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Approva tutti e importa
              </button>
            )}
            {generation.items.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                onApprove={() => updateItemStatus(item.id, 'approved')}
                onReject={() => updateItemStatus(item.id, 'rejected')}
                onImport={() => importItem(item.id)}
                onUpdate={patch => setGeneration(prev => prev
                  ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, ...patch } : i) }
                  : prev
                )}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

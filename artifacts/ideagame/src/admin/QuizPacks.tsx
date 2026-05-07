import { useState, useCallback, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  Sparkles, Plus, Trash2, ChevronDown, ChevronUp, Check, X, Edit3,
  Loader2, AlertCircle, CheckCircle2, Clock, Globe, Target, Mic2,
  Play, RefreshCw, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuizRound {
  orderIndex: number;
  type: string;
  questionText: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  points: number;
  timeLimit: number;
  optionalMediaIds: string[];
}

interface QuizPack {
  id: string;
  tenantId: string | null;
  eventId: string | null;
  title: string;
  themePrompt: string;
  language: string;
  difficulty: string;
  targetAudience: string;
  tone: string;
  totalRounds: number;
  useMediaLibrary: string;
  status: 'draft' | 'generating' | 'generated' | 'approved' | 'failed';
  generatedJson: QuizRound[] | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  multiple_choice: { label: 'Scelta multipla', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  true_false:      { label: 'Vero/Falso',       color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  image_compare:   { label: 'Confronta immagini',color: 'text-purple-400 bg-purple-400/10 border-purple-400/30' },
  guess_who:       { label: 'Indovina chi',      color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  fast_answer:     { label: 'Risposta rapida',   color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  bonus_final:     { label: '🏆 Bonus finale',   color: 'text-pink-400 bg-pink-400/10 border-pink-400/30' },
};

const DIFF_BADGE: Record<string, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-red-400',
};

const STATUS_INFO: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  draft:      { label: 'Bozza',      icon: Edit3,         color: 'text-muted-foreground' },
  generating: { label: 'Generando…', icon: Loader2,       color: 'text-blue-400 animate-spin' },
  generated:  { label: 'Generato',   icon: CheckCircle2,  color: 'text-yellow-400' },
  approved:   { label: 'Approvato',  icon: CheckCircle2,  color: 'text-green-400' },
  failed:     { label: 'Fallito',    icon: AlertCircle,   color: 'text-red-400' },
};

export default function QuizPacks() {
  const [packs, setPacks] = useState<QuizPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<QuizPack | null>(null);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Generation form state
  const [form, setForm] = useState({
    themePrompt: '', targetAudience: 'adulti', tone: 'divertente',
    difficulty: 'medium', language: 'it', totalRounds: 20, useMediaLibrary: false,
  });

  const loadPacks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/quiz-packs') as QuizPack[];
      setPacks(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Initial load
  useEffect(() => { void loadPacks(); }, [loadPacks]);

  async function generate() {
    if (!form.themePrompt.trim()) { setError('Inserisci un tema'); return; }
    setBusy(true); setError('');
    try {
      const pack = await apiFetch('/quiz-packs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, totalRounds: Number(form.totalRounds) }),
      }) as QuizPack;
      setPacks(prev => [pack, ...prev]);
      setShowGenDialog(false);
      setSelectedPack(pack);
      setForm({ themePrompt: '', targetAudience: 'adulti', tone: 'divertente', difficulty: 'medium', language: 'it', totalRounds: 20, useMediaLibrary: false });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function approve(pack: QuizPack) {
    try {
      const updated = await apiFetch(`/quiz-packs/${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }) as QuizPack;
      setPacks(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      setSelectedPack(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
    } catch (e) { setError((e as Error).message); }
  }

  async function deletePack(id: string) {
    if (!confirm('Eliminare questo quiz pack?')) return;
    try {
      await apiFetch(`/quiz-packs/${id}`, { method: 'DELETE' });
      setPacks(prev => prev.filter(p => p.id !== id));
      if (selectedPack?.id === id) setSelectedPack(null);
    } catch (e) { setError((e as Error).message); }
  }

  async function updateRound(packId: string, idx: number, round: Partial<QuizRound>) {
    try {
      const updated = await apiFetch(`/quiz-packs/${packId}/rounds/${idx}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(round),
      }) as QuizPack;
      setPacks(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedPack(updated);
    } catch (e) { setError((e as Error).message); }
  }

  // When selected pack changes, fetch full version (with generatedJson)
  async function openPack(p: QuizPack) {
    try {
      const full = await apiFetch(`/quiz-packs/${p.id}`) as QuizPack;
      setSelectedPack(full);
    } catch { setSelectedPack(p); }
  }

  return (
    <AdminLayout title="Quiz AI">
      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-[320px_1fr] gap-6 h-[calc(100vh-10rem)]">
        {/* LEFT: pack list */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <button onClick={() => { setShowGenDialog(true); setError(''); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90">
            <Sparkles className="h-4 w-4" /> Genera quiz da tema
          </button>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : packs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                <div className="text-sm text-muted-foreground">Nessun quiz generato ancora.</div>
                <div className="text-xs text-muted-foreground/60 mt-1">Clicca "Genera quiz da tema" per iniziare.</div>
              </div>
            ) : (
              packs.map(p => {
                const si = STATUS_INFO[p.status] ?? STATUS_INFO['draft']!;
                const StatusIcon = si.icon;
                return (
                  <motion.div key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => void openPack(p)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${selectedPack?.id === p.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:border-border/60'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-sm">{p.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.themePrompt}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); void deletePack(p.id); }}
                        className="text-muted-foreground/40 hover:text-red-400 flex-shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs font-semibold ${si.color}`}>
                        <StatusIcon className="h-3 w-3" /> {si.label}
                      </span>
                      <span className="text-xs text-muted-foreground/60">·</span>
                      <span className="text-xs text-muted-foreground">{p.totalRounds} round</span>
                      <span className="text-xs text-muted-foreground/60">·</span>
                      <span className="text-xs text-muted-foreground uppercase">{p.language}</span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          <button onClick={loadPacks} className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/20">
            <RefreshCw className="h-3 w-3" /> Aggiorna lista
          </button>
        </div>

        {/* RIGHT: pack detail */}
        <div className="overflow-y-auto rounded-xl border border-border bg-card">
          {!selectedPack ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-12">
              <BarChart3 className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <div className="text-muted-foreground">Seleziona un quiz pack per revisionarlo</div>
            </div>
          ) : (
            <PackDetail
              pack={selectedPack}
              onApprove={() => void approve(selectedPack)}
              onUpdateRound={(idx, round) => void updateRound(selectedPack.id, idx, round)}
            />
          )}
        </div>
      </div>

      {/* Generation dialog */}
      <AnimatePresence>
        {showGenDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-display text-xl font-black">Genera quiz da tema</div>
                  <div className="text-xs text-muted-foreground">Il quiz verrà salvato nel database e usabile offline</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tema *</label>
                  <input value={form.themePrompt} onChange={e => setForm(f => ({ ...f, themePrompt: e.target.value }))}
                    placeholder='es. "La Bella e la Bestia", "Anni 80 italiani", "Formula 1"'
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/50" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pubblico target</label>
                    <select value={form.targetAudience} onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none">
                      <option value="adulti">Adulti</option>
                      <option value="famiglie">Famiglie</option>
                      <option value="bambini">Bambini</option>
                      <option value="teenagers">Teenagers</option>
                      <option value="professionisti">Professionisti</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tono</label>
                    <select value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none">
                      <option value="divertente">Divertente</option>
                      <option value="educativo">Educativo</option>
                      <option value="competitivo">Competitivo</option>
                      <option value="nostalgico">Nostalgico</option>
                      <option value="drammatico">Drammatico</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Difficoltà</label>
                    <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none">
                      <option value="easy">Facile</option>
                      <option value="medium">Media</option>
                      <option value="hard">Difficile</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lingua</label>
                    <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none">
                      <option value="it">Italiano</option>
                      <option value="en">Inglese</option>
                      <option value="es">Spagnolo</option>
                      <option value="fr">Francese</option>
                      <option value="de">Tedesco</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Numero round</label>
                    <input type="number" min={5} max={40} value={form.totalRounds}
                      onChange={e => setForm(f => ({ ...f, totalRounds: Number(e.target.value) }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none" />
                  </div>
                  <div className="flex flex-col justify-end pb-0.5">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`relative h-6 w-11 rounded-full transition-colors ${form.useMediaLibrary ? 'bg-primary' : 'bg-border'}`}
                        onClick={() => setForm(f => ({ ...f, useMediaLibrary: !f.useMediaLibrary }))}>
                        <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.useMediaLibrary ? 'translate-x-6' : 'translate-x-1'}`} />
                      </div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Media library</span>
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button onClick={() => { setShowGenDialog(false); setError(''); }}
                  className="flex-1 rounded-xl border border-border py-3 text-sm font-bold hover:bg-secondary/20">
                  Annulla
                </button>
                <button onClick={() => void generate()} disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</> : <><Sparkles className="h-4 w-4" /> Genera</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}

function PackDetail({ pack, onApprove, onUpdateRound }: {
  pack: QuizPack;
  onApprove: () => void;
  onUpdateRound: (idx: number, round: Partial<QuizRound>) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<QuizRound>>({});
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const rounds: QuizRound[] = Array.isArray(pack.generatedJson) ? pack.generatedJson : [];

  function startEdit(r: QuizRound) {
    setEditingIdx(r.orderIndex);
    setEditDraft({ ...r });
    setExpandedIdx(r.orderIndex);
  }

  async function saveEdit(idx: number) {
    setSavingIdx(idx);
    onUpdateRound(idx, editDraft);
    setEditingIdx(null);
    setSavingIdx(null);
  }

  // Type distribution stats
  const typeCounts = rounds.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const si = STATUS_INFO[pack.status] ?? STATUS_INFO['draft']!;
  const StatusIcon = si.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`flex items-center gap-1.5 text-xs font-bold ${si.color}`}>
              <StatusIcon className="h-3.5 w-3.5" /> {si.label}
            </span>
            {pack.status === 'failed' && pack.errorMessage && (
              <span className="text-xs text-red-400 truncate">{pack.errorMessage}</span>
            )}
          </div>
          <h2 className="text-display text-2xl font-black mt-1 leading-tight">{pack.title}</h2>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {pack.language.toUpperCase()}</span>
            <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {pack.targetAudience}</span>
            <span className="flex items-center gap-1"><Mic2 className="h-3 w-3" /> {pack.tone}</span>
            <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {pack.difficulty}</span>
            <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {rounds.length} round</span>
          </div>
        </div>
        {(pack.status === 'generated' || pack.status === 'approved') && (
          <button onClick={onApprove} disabled={pack.status === 'approved'}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold flex-shrink-0 ${pack.status === 'approved' ? 'border border-green-500/30 bg-green-500/10 text-green-400' : 'bg-primary text-primary-foreground hover:opacity-90'}`}>
            {pack.status === 'approved' ? <><CheckCircle2 className="h-4 w-4" /> Approvato</> : <><Check className="h-4 w-4" /> Approva</>}
          </button>
        )}
      </div>

      {/* Type distribution */}
      {rounds.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-6 py-3 flex-shrink-0">
          {Object.entries(typeCounts).map(([type, count]) => {
            const tl = TYPE_LABELS[type] ?? { label: type, color: 'text-muted-foreground bg-muted/20 border-border' };
            return (
              <span key={type} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tl.color}`}>
                {tl.label} ×{count}
              </span>
            );
          })}
        </div>
      )}

      {/* Rounds list */}
      {pack.status === 'generating' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-lg font-bold">Generazione in corso…</div>
          <div className="text-sm text-muted-foreground">L'AI sta creando {pack.totalRounds} domande sul tema "{pack.themePrompt}"</div>
          <div className="text-xs text-muted-foreground/60">Questo può richiedere 20-40 secondi</div>
        </div>
      ) : rounds.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          {pack.status === 'failed' ? 'Generazione fallita. Riprova dalla lista.' : 'Nessun round trovato.'}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {rounds.map((r, i) => {
            const isExpanded = expandedIdx === i;
            const isEditing = editingIdx === i;
            const tl = TYPE_LABELS[r.type] ?? { label: r.type, color: 'text-muted-foreground bg-muted/20 border-border' };
            return (
              <div key={i} className="px-6 py-4">
                {/* Round header */}
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedIdx(isExpanded ? null : i)}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-black flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.questionText}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${tl.color}`}>{tl.label}</span>
                      <span className={`text-xs font-semibold ${DIFF_BADGE[r.difficulty] ?? 'text-muted-foreground'}`}>{r.difficulty}</span>
                      <span className="text-xs text-muted-foreground">{r.points}pt</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{r.timeLimit}s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); startEdit(r); }}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary hover:border-primary/40">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-3">
                      {isEditing ? (
                        <EditRoundForm draft={editDraft} onChange={setEditDraft}
                          onSave={() => void saveEdit(i)} onCancel={() => setEditingIdx(null)} saving={savingIdx === i} />
                      ) : (
                        <RoundDetail round={r} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoundDetail({ round }: { round: QuizRound }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3 text-sm">
      <div>
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Risposte</div>
        <div className="space-y-1.5">
          {round.answers.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${i === round.correctAnswer ? 'border border-green-500/30 bg-green-500/10' : 'border border-border bg-card/60'}`}>
              <span className="text-xs font-black w-4 text-center">{String.fromCharCode(65 + i)}</span>
              <span>{a}</span>
              {i === round.correctAnswer && <CheckCircle2 className="ml-auto h-4 w-4 text-green-400 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
      {round.explanation && (
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Spiegazione</div>
          <div className="text-muted-foreground text-xs italic">{round.explanation}</div>
        </div>
      )}
    </div>
  );
}

function EditRoundForm({ draft, onChange, onSave, onCancel, saving }: {
  draft: Partial<QuizRound>;
  onChange: (d: Partial<QuizRound>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const answers = draft.answers ?? ['', '', '', ''];
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-sm">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Domanda</label>
        <textarea value={draft.questionText ?? ''} onChange={e => onChange({ ...draft, questionText: e.target.value })}
          rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus:border-primary/50" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {['easy', 'medium', 'hard'].map(d => (
          <button key={d} onClick={() => onChange({ ...draft, difficulty: d })}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${draft.difficulty === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40'}`}>
            {d}
          </button>
        ))}
        <div>
          <label className="text-xs text-muted-foreground">Punti</label>
          <input type="number" value={draft.points ?? 100} onChange={e => onChange({ ...draft, points: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tempo (s)</label>
          <input type="number" value={draft.timeLimit ?? 30} onChange={e => onChange({ ...draft, timeLimit: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none" />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Risposte (clicca per selezionare la corretta)</label>
        <div className="mt-1.5 space-y-1.5">
          {answers.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${i === draft.correctAnswer ? 'border-green-500/50 bg-green-500/10' : 'border-border'}`}>
              <button onClick={() => onChange({ ...draft, correctAnswer: i })}
                className={`h-5 w-5 rounded-full border flex-shrink-0 flex items-center justify-center ${i === draft.correctAnswer ? 'border-green-400 bg-green-400' : 'border-border'}`}>
                {i === draft.correctAnswer && <Check className="h-3 w-3 text-white" />}
              </button>
              <input value={a} onChange={e => {
                const na = [...answers]; na[i] = e.target.value;
                onChange({ ...draft, answers: na });
              }} className="flex-1 bg-transparent text-sm outline-none" placeholder={`Risposta ${String.fromCharCode(65 + i)}`} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Spiegazione</label>
        <input value={draft.explanation ?? ''} onChange={e => onChange({ ...draft, explanation: e.target.value })}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-border py-2 text-sm font-bold hover:bg-secondary/20">
          Annulla
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salva
        </button>
      </div>
    </div>
  );
}

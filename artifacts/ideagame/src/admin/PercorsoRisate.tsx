import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, Trash2, ChevronUp, ChevronDown, Edit2, Check, X, Loader2, ImageIcon, Grid, Link } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { useAuth } from '@/auth/roles';
import { JonnyGenerateBanner } from '@/components/JonnyGenerateBanner';
import { useListMedia } from '@workspace/api-client-react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PathSet {
  id: string; name: string; description: string; tenantId: string | null;
  createdAt: string;
}
interface PathStep {
  id: string; setId: string; title: string; description: string;
  challengeType: string; points: number; timeLimit: number;
  optionalMediaUrl: string | null; orderIndex: number; isActive: boolean;
}

/* ─── Challenge type config ──────────────────────────────────────────────── */
const CHALLENGE_TYPES = [
  { value: 'sfida',    emoji: '⚡', label: 'Sfida fisica' },
  { value: 'domanda',  emoji: '❓', label: 'Domanda' },
  { value: 'mimo',     emoji: '🎭', label: 'Mimo' },
  { value: 'ballo',    emoji: '💃', label: 'Ballo' },
  { value: 'veloce',   emoji: '🏃', label: 'Veloce' },
  { value: 'coppia',   emoji: '👫', label: 'Coppia' },
  { value: 'reazione', emoji: '😱', label: 'Reazione' },
  { value: 'fantasia', emoji: '🌟', label: 'Fantasia' },
];

const CHALLENGE_COLORS: Record<string, string> = {
  sfida: '#F5B642', domanda: '#60a5fa', mimo: '#a78bfa', ballo: '#f472b6',
  veloce: '#34d399', coppia: '#fb923c', reazione: '#f87171', fantasia: '#c084fc',
};

/* ─── API helper ─────────────────────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

/* ─── Empty step form ────────────────────────────────────────────────────── */
const emptyForm = (): Omit<PathStep, 'id' | 'setId' | 'createdAt'> => ({
  title: '', description: '', challengeType: 'sfida',
  points: 100, timeLimit: 30, optionalMediaUrl: null, orderIndex: 0, isActive: true,
});

/* ─── Media picker field ─────────────────────────────────────────────────── */
function MediaPickerField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { data: allMedia = [] } = useListMedia();
  const [mode, setMode] = useState<'picker' | 'url'>('picker');
  const [search, setSearch] = useState('');

  const mediaItems = allMedia.filter(m =>
    (m.kind === 'image' || m.kind === 'video') &&
    ((m.tags ?? []) as string[]).includes('percorso-a-risate') ||
    (m.kind === 'image' || m.kind === 'video')
  );

  const filtered = search
    ? mediaItems.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : mediaItems;

  const selected = allMedia.find(m => m.url === value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3 w-3" /> Media opzionale</span>
        </label>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode('picker')}
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-all ${mode === 'picker' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Grid className="h-3 w-3 inline mr-1" />Libreria
          </button>
          <button type="button" onClick={() => setMode('url')}
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-all ${mode === 'url' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Link className="h-3 w-3 inline mr-1" />URL
          </button>
        </div>
      </div>

      {mode === 'url' ? (
        <div>
          <input value={value ?? ''} onChange={e => onChange(e.target.value || null)}
            placeholder="https://…"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none" />
          {value && (
            <img src={value} alt="" className="mt-2 h-24 w-auto rounded-lg object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background/50 p-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nella libreria…"
            className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary" />
          {value && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-2 py-1.5">
              {selected?.kind === 'image' && selected.url && (
                <img src={selected.url} className="h-8 w-12 rounded object-cover" alt="" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{selected?.name ?? value}</div>
              </div>
              <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
            {filtered.slice(0, 30).map(m => (
              <button key={m.id} type="button" onClick={() => onChange(m.url ?? null)}
                className={`rounded-lg overflow-hidden border-2 transition-all ${value === m.url ? 'border-primary' : 'border-transparent hover:border-border'}`}>
                {m.kind === 'image' && m.url ? (
                  <img src={m.url} alt={m.name} className="w-full aspect-video object-cover" />
                ) : (
                  <div className="w-full aspect-video bg-secondary flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-3 py-4 text-center text-xs text-muted-foreground">
                Nessun media. Aggiungine uno dalla sezione Media.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function PercorsoRisate() {
  useAuth(); // ensure auth

  const [sets, setSets] = useState<PathSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<PathSet | null>(null);
  const [steps, setSteps] = useState<PathStep[]>([]);

  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [setsError, setSetsError] = useState('');
  const [stepsError, setStepsError] = useState('');

  // New set form
  const [newSetName, setNewSetName] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [creatingSet, setCreatingSet] = useState(false);

  // Step modal
  const [stepModal, setStepModal] = useState<{ mode: 'create' | 'edit'; step?: PathStep } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [savingStep, setSavingStep] = useState(false);
  const [stepError, setStepError] = useState('');

  // Delete confirmations
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);

  /* ── Load sets ──────────────────────────────────────────────────────── */
  const loadSets = useCallback(async () => {
    setLoadingSets(true); setSetsError('');
    try {
      const data = await apiFetch('/percorso/sets') as PathSet[];
      setSets(data);
    } catch (e) {
      setSetsError((e as Error).message);
    } finally { setLoadingSets(false); }
  }, []);

  useEffect(() => { void loadSets(); }, [loadSets]);

  /* ── Load steps for selected set ───────────────────────────────────── */
  const loadSteps = useCallback(async (setId: string) => {
    setLoadingSteps(true); setStepsError('');
    try {
      const data = await apiFetch(`/percorso/sets/${setId}/steps`) as PathStep[];
      setSteps(data);
    } catch (e) {
      setStepsError((e as Error).message);
    } finally { setLoadingSteps(false); }
  }, []);

  useEffect(() => {
    if (selectedSet) void loadSteps(selectedSet.id);
    else setSteps([]);
  }, [selectedSet, loadSteps]);

  /* ── Create set ─────────────────────────────────────────────────────── */
  const handleCreateSet = async () => {
    if (!newSetName.trim()) return;
    setCreatingSet(true); setSetsError('');
    try {
      const created = await apiFetch('/percorso/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSetName.trim(), description: newSetDesc.trim() }),
      }) as PathSet;
      setSets(s => [...s, created]);
      setSelectedSet(created);
      setNewSetName(''); setNewSetDesc('');
    } catch (e) {
      setSetsError((e as Error).message);
    } finally { setCreatingSet(false); }
  };

  /* ── Delete set ─────────────────────────────────────────────────────── */
  const handleDeleteSet = async (id: string) => {
    setDeletingSetId(id);
    try {
      await apiFetch(`/percorso/sets/${id}`, { method: 'DELETE' });
      setSets(s => s.filter(x => x.id !== id));
      if (selectedSet?.id === id) { setSelectedSet(null); setSteps([]); }
    } catch (e) {
      setSetsError((e as Error).message);
    } finally { setDeletingSetId(null); }
  };

  /* ── Open step modal ────────────────────────────────────────────────── */
  const openCreate = () => {
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.orderIndex)) + 1 : 0;
    setForm({ ...emptyForm(), orderIndex: maxOrder });
    setStepModal({ mode: 'create' });
    setStepError('');
  };
  const openEdit = (step: PathStep) => {
    setForm({
      title: step.title, description: step.description, challengeType: step.challengeType,
      points: step.points, timeLimit: step.timeLimit, optionalMediaUrl: step.optionalMediaUrl ?? null,
      orderIndex: step.orderIndex, isActive: step.isActive,
    });
    setStepModal({ mode: 'edit', step });
    setStepError('');
  };

  /* ── Save step ──────────────────────────────────────────────────────── */
  const handleSaveStep = async () => {
    if (!form.title.trim()) { setStepError('Il titolo è obbligatorio'); return; }
    if (!selectedSet) return;
    setSavingStep(true); setStepError('');
    try {
      if (stepModal?.mode === 'create') {
        const created = await apiFetch(`/percorso/sets/${selectedSet.id}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }) as PathStep;
        setSteps(s => [...s, created].sort((a, b) => a.orderIndex - b.orderIndex));
      } else if (stepModal?.step) {
        const updated = await apiFetch(`/percorso/steps/${stepModal.step.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }) as PathStep;
        setSteps(s => s.map(x => x.id === updated.id ? updated : x).sort((a, b) => a.orderIndex - b.orderIndex));
      }
      setStepModal(null);
    } catch (e) {
      setStepError((e as Error).message);
    } finally { setSavingStep(false); }
  };

  /* ── Delete step ────────────────────────────────────────────────────── */
  const handleDeleteStep = async (id: string) => {
    setDeletingStepId(id);
    try {
      await apiFetch(`/percorso/steps/${id}`, { method: 'DELETE' });
      setSteps(s => s.filter(x => x.id !== id));
    } catch (e) {
      setStepsError((e as Error).message);
    } finally { setDeletingStepId(null); }
  };

  /* ── Move step ──────────────────────────────────────────────────────── */
  const handleMoveStep = async (step: PathStep, dir: 'up' | 'down') => {
    const sorted = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex(s => s.id === step.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx]!;
    const a = step.orderIndex, b = other.orderIndex;
    try {
      await Promise.all([
        apiFetch(`/percorso/steps/${step.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIndex: b }) }),
        apiFetch(`/percorso/steps/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIndex: a }) }),
      ]);
      setSteps(s => s.map(x => x.id === step.id ? { ...x, orderIndex: b } : x.id === other.id ? { ...x, orderIndex: a } : x).sort((x, y) => x.orderIndex - y.orderIndex));
    } catch { /* silent */ }
  };

  /* ── Toggle active ──────────────────────────────────────────────────── */
  const handleToggleActive = async (step: PathStep) => {
    try {
      const updated = await apiFetch(`/percorso/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !step.isActive }),
      }) as PathStep;
      setSteps(s => s.map(x => x.id === updated.id ? updated : x));
    } catch { /* silent */ }
  };

  /* ─── Render ──────────────────────────────────────────────────────────── */
  return (
    <AdminLayout title="Percorso a Risate">

      {/* ── Step editor modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {stepModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 space-y-5 my-auto">
              <div className="flex items-center justify-between">
                <div className="text-display text-xl font-black">
                  {stepModal.mode === 'create' ? 'Nuova sfida' : 'Modifica sfida'}
                </div>
                <button onClick={() => setStepModal(null)} className="rounded-full border border-border p-2 hover:bg-secondary/30">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {stepError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {stepError}
                </div>
              )}

              {/* Challenge type */}
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipo sfida</div>
                <div className="grid grid-cols-4 gap-2">
                  {CHALLENGE_TYPES.map(ct => (
                    <button key={ct.value} onClick={() => setForm(f => ({ ...f, challengeType: ct.value }))}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all ${
                        form.challengeType === ct.value
                          ? 'border-current opacity-100'
                          : 'border-border opacity-60 hover:opacity-80'
                      }`}
                      style={form.challengeType === ct.value ? { color: CHALLENGE_COLORS[ct.value], borderColor: CHALLENGE_COLORS[ct.value] } : {}}>
                      <span className="text-2xl">{ct.emoji}</span>
                      <span>{ct.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Titolo *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="es. Imita una star della TV"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Descrizione</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Istruzioni aggiuntive per i giocatori"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none focus:border-primary focus:outline-none" />
              </div>

              {/* Points + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Punti</label>
                  <input type="number" min={10} max={1000} step={10} value={form.points}
                    onChange={e => setForm(f => ({ ...f, points: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Tempo (sec)</label>
                  <input type="number" min={10} max={600} step={5} value={form.timeLimit}
                    onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" />
                </div>
              </div>

              {/* Optional media — picker from Media library */}
              <MediaPickerField
                value={form.optionalMediaUrl}
                onChange={v => setForm(f => ({ ...f, optionalMediaUrl: v }))}
              />

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
                <span className="text-sm font-bold">Sfida attiva</span>
                <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.isActive ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStepModal(null)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold hover:bg-secondary/30">
                  Annulla
                </button>
                <button onClick={() => void handleSaveStep()} disabled={savingStep || !form.title.trim()}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40 inline-flex items-center justify-center gap-2">
                  {savingStep && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  {stepModal.mode === 'create' ? 'Aggiungi sfida' : 'Salva modifiche'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-6">
        <JonnyGenerateBanner gameSlug="percorso-a-risate" gameLabel="Percorso a Risate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">

        {/* ── Left: sets list ───────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Set sfide</div>
              <div className="text-xs text-muted-foreground">{sets.length} set</div>
            </div>

            {setsError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{setsError}</div>
            )}

            {/* Create new set */}
            <div className="space-y-2">
              <input value={newSetName} onChange={e => setNewSetName(e.target.value)}
                placeholder="Nome del set…"
                onKeyDown={e => e.key === 'Enter' && void handleCreateSet()}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              <input value={newSetDesc} onChange={e => setNewSetDesc(e.target.value)}
                placeholder="Descrizione (opzionale)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              <button onClick={() => void handleCreateSet()} disabled={!newSetName.trim() || creatingSet}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {creatingSet ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                Crea set
              </button>
            </div>

            {/* Sets list */}
            {loadingSets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Nessun set creato
              </div>
            ) : (
              <div className="space-y-2">
                {sets.map(set => (
                  <motion.div key={set.id} layout
                    onClick={() => setSelectedSet(s => s?.id === set.id ? null : set)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:border-primary/40 ${
                      selectedSet?.id === set.id ? 'border-primary bg-primary/10' : 'border-border bg-background/50'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{set.name}</div>
                      {set.description && <div className="text-xs text-muted-foreground truncate">{set.description}</div>}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); void handleDeleteSet(set.id); }}
                      disabled={deletingSetId === set.id}
                      className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-40">
                      {deletingSetId === set.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: steps for selected set ────────────────────────── */}
        <div>
          {!selectedSet ? (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border">
              <div className="text-center">
                <div className="text-4xl mb-3">🎯</div>
                <div className="text-muted-foreground">Seleziona un set per gestire le sfide</div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-display text-xl font-black">{selectedSet.name}</div>
                  {selectedSet.description && <div className="text-xs text-muted-foreground mt-0.5">{selectedSet.description}</div>}
                </div>
                <button onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate">
                  <PlusCircle className="h-4 w-4" /> Nuova sfida
                </button>
              </div>

              {stepsError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{stepsError}</div>
              )}

              {loadingSteps ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : steps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                  <div className="text-3xl mb-3">✨</div>
                  <div className="text-muted-foreground">Nessuna sfida nel set</div>
                  <button onClick={openCreate} className="mt-3 text-sm text-primary underline">Aggiungi la prima sfida</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {steps.map((step, idx) => {
                    const cfg = CHALLENGE_TYPES.find(t => t.value === step.challengeType) ?? CHALLENGE_TYPES[0]!;
                    const color = CHALLENGE_COLORS[step.challengeType] ?? '#F5B642';
                    return (
                      <motion.div key={step.id} layout
                        className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                          step.isActive ? 'border-border bg-background/50' : 'border-border/40 bg-background/20 opacity-60'
                        }`}>
                        {/* Order controls */}
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => void handleMoveStep(step, 'up')} disabled={idx === 0}
                            className="rounded p-0.5 hover:bg-secondary/30 disabled:opacity-20">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => void handleMoveStep(step, 'down')} disabled={idx === steps.length - 1}
                            className="rounded p-0.5 hover:bg-secondary/30 disabled:opacity-20">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Type badge */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-xl"
                          style={{ borderColor: `${color}50`, background: `${color}15` }}>
                          {cfg.emoji}
                        </div>

                        {/* Step info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold truncate">{step.title}</span>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color, background: `${color}20` }}>
                              {cfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span>⏱ {step.timeLimit}s</span>
                            <span>⭐ {step.points} pt</span>
                            {step.description && <span className="truncate">{step.description}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Active toggle */}
                          <button onClick={() => void handleToggleActive(step)}
                            className={`rounded-lg border px-2 py-1 text-xs font-bold transition-all ${
                              step.isActive
                                ? 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                : 'border-border bg-card text-muted-foreground hover:bg-secondary/30'
                            }`}>
                            {step.isActive ? '✓ On' : 'Off'}
                          </button>
                          <button onClick={() => openEdit(step)}
                            className="rounded-lg border border-border bg-card p-1.5 hover:border-primary/40 hover:bg-primary/10">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => void handleDeleteStep(step.id)} disabled={deletingStepId === step.id}
                            className="rounded-lg border border-destructive/30 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-40">
                            {deletingStepId === step.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Summary */}
              {steps.length > 0 && (
                <div className="flex items-center gap-6 rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
                  <span><span className="font-bold text-foreground">{steps.filter(s => s.isActive).length}</span> sfide attive</span>
                  <span><span className="font-bold text-foreground">{steps.reduce((a, s) => a + (s.isActive ? s.timeLimit : 0), 0)}s</span> durata totale</span>
                  <span><span className="font-bold text-foreground">{steps.reduce((a, s) => a + (s.isActive ? s.points : 0), 0)}</span> pt possibili</span>
                </div>
              )}

              {/* Preview */}
              {steps.filter(s => s.isActive).length > 0 && (
                <PercorsoSlidePreview steps={steps.filter(s => s.isActive)} />
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PERCORSO SLIDE PREVIEW
══════════════════════════════════════════════════════════════════════════ */
function PercorsoSlidePreview({ steps }: { steps: PathStep[] }) {
  const [idx, setIdx] = useState(0);
  const step = steps[Math.min(idx, steps.length - 1)]!;
  const cfg = CHALLENGE_TYPES.find(t => t.value === step.challengeType) ?? CHALLENGE_TYPES[0]!;
  const color = CHALLENGE_COLORS[step.challengeType] ?? '#F5B642';

  return (
    <div className="mt-2 rounded-2xl border border-primary/20 bg-background/60 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <span>🎬</span> Anteprima proiettore
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30">← Prec</button>
          <span className="text-xs text-muted-foreground font-mono">{idx + 1} / {steps.length}</span>
          <button onClick={() => setIdx(i => Math.min(steps.length - 1, i + 1))} disabled={idx === steps.length - 1}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30">Succ →</button>
        </div>
      </div>

      {/* Slide */}
      <div className="relative flex flex-col items-center justify-center gap-2.5 px-6 py-5"
        style={{ background: `radial-gradient(ellipse at 60% 30%, ${color}18 0%, transparent 70%), linear-gradient(135deg, #0d0d0d 0%, #111 100%)` }}>

        {/* Type badge */}
        <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
          style={{ borderColor: `${color}60`, background: `${color}15`, color }}>
          <span className="text-base">{cfg.emoji}</span>
          <span className="uppercase tracking-widest text-[10px]">{cfg.label}</span>
        </div>

        {/* Title */}
        <div className="text-display text-lg md:text-xl font-black text-white text-center leading-tight max-w-xl">
          {step.title}
        </div>

        {/* Description */}
        {step.description && (
          <div className="text-white/60 text-xs text-center max-w-lg">{step.description}</div>
        )}

        {/* Optional image */}
        {step.optionalMediaUrl && (
          <img src={step.optionalMediaUrl} alt="" className="max-h-16 max-w-[180px] rounded-lg object-contain opacity-90"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}

        {/* Footer: timer + points */}
        <div className="flex items-center gap-4 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
          <span className="text-white/70 text-xs font-bold">⏱ {step.timeLimit}s</span>
          <span className="w-px h-3 bg-white/20" />
          <span className="font-bold text-xs" style={{ color }}>⭐ {step.points} pt</span>
        </div>
      </div>
    </div>
  );
}

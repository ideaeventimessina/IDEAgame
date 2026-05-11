import { useState, useRef } from 'react';
import { AdminLayout } from './AdminLayout';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Image as ImageIcon, Copy, Upload, Camera, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { JonnyGenerateBanner } from '@/components/JonnyGenerateBanner';
import {
  useListCardSets, useCreateCardSet, useDeleteCardSet,
  useListCards, useCreateCard,
  getListCardSetsQueryKey, getListCardsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  if (r.status === 204) return null;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface NewSetForm { slug: string; name: string; description: string; }
interface NewPairForm { label: string; imageA: string; imageB: string; }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export default function AdminCardSets() {
  const qc = useQueryClient();
  const { data: sets = [], isLoading } = useListCardSets();
  const createSet = useCreateCardSet();
  const deleteSet = useDeleteCardSet();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openNewSet, setOpenNewSet] = useState(false);
  const [newSet, setNewSet] = useState<NewSetForm>({ slug: '', name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshSets = () => qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() });
  const refreshCards = (id: string) => qc.invalidateQueries({ queryKey: getListCardsQueryKey(id) });

  async function handleCreateSet() {
    if (!newSet.slug || !newSet.name) { setError('Slug e nome obbligatori'); return; }
    setBusy(true); setError('');
    try {
      await createSet.mutateAsync({ data: { slug: newSet.slug, name: newSet.name, description: newSet.description } });
      setNewSet({ slug: '', name: '', description: '' });
      setOpenNewSet(false);
      refreshSets();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleDeleteSet(id: string, name: string) {
    if (!confirm(`Eliminare il deck "${name}"? Tutte le carte verranno cancellate.`)) return;
    await deleteSet.mutateAsync({ id });
    refreshSets();
  }

  return (
    <AdminLayout title="Deck di gioco">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex-1 text-sm text-muted-foreground">
          Gestisci i mazzi di carte per il Gioco delle Coppie. Ogni mazzo contiene coppie di immagini da trovare.
        </div>
        <button
          onClick={() => setOpenNewSet(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate"
        >
          <Plus className="h-4 w-4" /> Nuovo deck
        </button>
      </div>

      <div className="mb-6">
        <JonnyGenerateBanner gameSlug="gioco-delle-coppie" gameLabel="Gioco delle Coppie" />
      </div>

      {/* New set dialog */}
      {openNewSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-display text-xl font-black mb-5">Nuovo deck</div>
            {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Nome</label>
                <input value={newSet.name}
                  onChange={e => { setNewSet(p => ({ ...p, name: e.target.value, slug: p.slug || e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })); }}
                  placeholder="Animali del mondo"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Slug</label>
                <input value={newSet.slug}
                  onChange={e => setNewSet(p => ({ ...p, slug: e.target.value }))}
                  placeholder="animali-del-mondo"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Descrizione (opzionale)</label>
                <input value={newSet.description}
                  onChange={e => setNewSet(p => ({ ...p, description: e.target.value }))}
                  placeholder="Coppie di immagini di animali"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setOpenNewSet(false); setError(''); }} className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover-elevate">Annulla</button>
              <button onClick={handleCreateSet} disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50 hover-elevate">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          Nessun deck ancora. Crea il tuo primo mazzo per il Gioco delle Coppie.
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map(s => (
            <CardSetRow
              key={s.id}
              set={s as { id: string; slug: string; name: string; description: string }}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(prev => prev === s.id ? null : s.id)}
              onDelete={() => handleDeleteSet(s.id, s.name)}
              onRefreshCards={() => refreshCards(s.id)}
            />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COPPIE PAIR PREVIEW
══════════════════════════════════════════════════════════════════════════ */
type AnyCard = { id: string; imageUrl?: string | null; pairId?: string | null; prompts?: Record<string, string> };

function CoppiePreview({ pairs }: { pairs: [string, AnyCard[]][] }) {
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, pairs.length - 1);
  const [pairId, pairCards] = pairs[safeIdx]!;
  const label = (pairCards[0]?.prompts ?? {})['it'] ?? pairId;
  const imgA = pairCards[0]?.imageUrl ?? '';
  const imgB = pairCards[1]?.imageUrl ?? imgA;

  return (
    <div className="mx-5 mb-5 rounded-2xl border border-primary/20 bg-background/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <span>🃏</span> Anteprima coppie
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
            className="rounded-lg border border-border p-1 hover-elevate disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground font-mono">{safeIdx + 1} / {pairs.length}</span>
          <button onClick={() => setIdx(i => Math.min(pairs.length - 1, i + 1))} disabled={safeIdx === pairs.length - 1}
            className="rounded-lg border border-border p-1 hover-elevate disabled:opacity-30">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Slide: both cards of the pair */}
      <div className="relative flex flex-col items-center gap-4 px-6 py-8"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #F5B64218 0%, transparent 70%), linear-gradient(135deg, #0d0d0d 0%, #111 100%)' }}>

        {/* Hex bg decoration */}
        <div className="absolute inset-0 overflow-hidden opacity-5 pointer-events-none select-none flex items-center justify-center">
          <div className="text-[300px] leading-none text-[#F5B642]">⬡</div>
        </div>

        <div className="text-xs font-bold uppercase tracking-widest text-[#F5B642]/70">coppia da trovare</div>

        <div className="relative z-10 flex gap-4 w-full max-w-xl justify-center">
          {/* Card A */}
          <div className="flex-1 max-w-[220px] rounded-2xl overflow-hidden border-2 border-[#F5B642]/40 shadow-lg">
            {imgA ? (
              <img src={imgA} alt={label} className="w-full aspect-[4/3] object-cover" />
            ) : (
              <div className="w-full aspect-[4/3] bg-secondary flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Match indicator */}
          <div className="flex items-center justify-center">
            <div className="rounded-full border-2 border-[#F5B642]/40 bg-[#F5B642]/10 px-3 py-1.5 text-[#F5B642] font-black text-lg">↔</div>
          </div>

          {/* Card B */}
          <div className="flex-1 max-w-[220px] rounded-2xl overflow-hidden border-2 border-[#F5B642]/40 shadow-lg">
            {imgB ? (
              <img src={imgB} alt={label} className="w-full aspect-[4/3] object-cover" />
            ) : (
              <div className="w-full aspect-[4/3] bg-secondary flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
          </div>
        </div>

        {/* Label revealed */}
        <div className="relative z-10 rounded-full border border-[#F5B642]/30 bg-[#F5B642]/10 px-6 py-2 text-[#F5B642] font-black text-lg">
          {label}
        </div>
      </div>
    </div>
  );
}

function CardSetRow({
  set, expanded, onToggle, onDelete, onRefreshCards,
}: {
  set: { id: string; slug: string; name: string; description: string };
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRefreshCards: () => void;
}) {
  const qc = useQueryClient();
  const { data: cards = [], isLoading: cardsLoading } = useListCards(set.id, {
    query: { queryKey: getListCardsQueryKey(set.id), enabled: expanded },
  });
  const createCard = useCreateCard();

  const [openPair, setOpenPair] = useState(false);
  const [pairForm, setPairForm] = useState<NewPairForm>({ label: '', imageA: '', imageB: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File, field: 'imageA' | 'imageB') {
    const dataUrl = await readFileAsDataUrl(file);
    setPairForm(p => ({ ...p, [field]: dataUrl }));
  }

  const pairs = (() => {
    const map = new Map<string, (typeof cards)>();
    for (const c of cards) {
      const pid = (c as { pairId?: string }).pairId ?? '';
      if (!pid) continue;
      const existing = map.get(pid) ?? [];
      existing.push(c);
      map.set(pid, existing);
    }
    return [...map.entries()];
  })();

  const unpaired = cards.filter(c => !(c as { pairId?: string }).pairId);

  async function handleAddPair() {
    if (!pairForm.label || !pairForm.imageA) { setErr('Label e immagine A obbligatori'); return; }
    setBusy(true); setErr('');
    const pairId = crypto.randomUUID().slice(0, 8);
    const imageB = pairForm.imageB || pairForm.imageA;
    try {
      await createCard.mutateAsync({
        id: set.id,
        data: {
          kind: 'question',
          prompts: { it: pairForm.label },
          imageUrl: pairForm.imageA,
          pairId,
        } as Parameters<typeof createCard.mutateAsync>[0]['data'],
      });
      await createCard.mutateAsync({
        id: set.id,
        data: {
          kind: 'question',
          prompts: { it: pairForm.label },
          imageUrl: imageB,
          pairId,
        } as Parameters<typeof createCard.mutateAsync>[0]['data'],
      });
      setPairForm({ label: '', imageA: '', imageB: '' });
      setOpenPair(false);
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(set.id) });
      onRefreshCards();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await apiFetch(`/cards/${cardId}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(set.id) });
    } catch (e) { alert((e as Error).message); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Set header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-secondary/20 transition-colors" onClick={onToggle}>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-display">{set.name}</div>
          <div className="text-xs text-muted-foreground font-mono">{set.slug}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">{pairs.length} coppie</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg border border-border p-2 hover-elevate text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded card list */}
      {expanded && (
        <div className="border-t border-border bg-secondary/10">
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Coppie ({pairs.length})</span>
            <button
              onClick={() => setOpenPair(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover-elevate"
            >
              <Plus className="h-3.5 w-3.5" /> Aggiungi coppia
            </button>
          </div>

          {cardsLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : pairs.length === 0 && unpaired.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground text-center">Nessuna carta nel deck. Aggiungi la prima coppia!</div>
          ) : (
            <>
              <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {pairs.map(([pairId, pairCards]) => {
                  const card = pairCards[0]!;
                  const imageUrl = (card as { imageUrl?: string }).imageUrl ?? '';
                  const label = ((card as { prompts?: Record<string, string> }).prompts ?? {})['it'] ?? pairId;
                  return (
                    <div key={pairId} className="rounded-xl border border-border bg-card overflow-hidden group">
                      {imageUrl ? (
                        <div className="aspect-video relative overflow-hidden bg-secondary">
                          <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 gap-2">
                            {pairCards.map(c => (
                              <button key={c.id} onClick={() => handleDeleteCard(c.id)}
                                className="rounded-lg bg-destructive/80 p-1.5 text-white hover:bg-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
                          {pairCards.length === 2 && (
                            <div className="absolute top-1.5 right-1.5">
                              <Copy className="h-3 w-3 text-white/60" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="aspect-video bg-secondary flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="px-2.5 py-2">
                        <div className="text-sm font-bold truncate">{label}</div>
                        <div className="text-xs text-muted-foreground">{pairCards.length} cart{pairCards.length === 1 ? 'a' : 'e'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pair preview */}
              {pairs.length > 0 && (
                <CoppiePreview pairs={pairs} />
              )}
            </>
          )}
        </div>
      )}

      {/* Add pair dialog */}
      {openPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-display text-xl font-black mb-1">Aggiungi coppia</div>
            <div className="text-xs text-muted-foreground mb-5">Inserisci un'etichetta e gli URL delle immagini. Le 2 carte formeranno una coppia.</div>
            {err && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</div>}
            {/* hidden file inputs */}
            <input ref={fileARef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files?.[0]) void handleFileUpload(e.target.files[0], 'imageA'); }} />
            <input ref={fileBRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files?.[0]) void handleFileUpload(e.target.files[0], 'imageB'); }} />

            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Etichetta</label>
                <input value={pairForm.label}
                  onChange={e => setPairForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="Gatto"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Image A */}
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Immagine A</label>
                  <div className="mt-1 flex gap-1.5">
                    <input value={pairForm.imageA.startsWith('data:') ? '' : pairForm.imageA}
                      onChange={e => setPairForm(p => ({ ...p, imageA: e.target.value }))}
                      placeholder="https://..."
                      className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                    <button type="button" title="Carica file" onClick={() => fileARef.current?.click()}
                      className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors">
                      <Upload className="h-4 w-4" />
                    </button>
                    <button type="button" title="Scatta foto" onClick={() => {
                      if (fileARef.current) { fileARef.current.removeAttribute('capture'); fileARef.current.setAttribute('capture', 'environment'); fileARef.current.click(); }
                    }} className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors">
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>
                  {pairForm.imageA && (
                    <div className="mt-2 relative group">
                      <img src={pairForm.imageA} alt="" className="w-full aspect-video object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
                      <button type="button" onClick={() => setPairForm(p => ({ ...p, imageA: '' }))}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] font-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">✕</button>
                      {pairForm.imageA.startsWith('data:') && <div className="text-[10px] text-muted-foreground mt-1">📁 File locale</div>}
                    </div>
                  )}
                </div>
                {/* Image B */}
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Immagine B (opz.)</label>
                  <div className="mt-1 flex gap-1.5">
                    <input value={pairForm.imageB.startsWith('data:') ? '' : pairForm.imageB}
                      onChange={e => setPairForm(p => ({ ...p, imageB: e.target.value }))}
                      placeholder="Uguale ad A se vuoto"
                      className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                    <button type="button" title="Carica file" onClick={() => fileBRef.current?.click()}
                      className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors">
                      <Upload className="h-4 w-4" />
                    </button>
                    <button type="button" title="Scatta foto" onClick={() => {
                      if (fileBRef.current) { fileBRef.current.setAttribute('capture', 'environment'); fileBRef.current.click(); }
                    }} className="rounded-lg border border-border bg-background p-2 hover:bg-secondary transition-colors">
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>
                  {pairForm.imageB && (
                    <div className="mt-2 relative group">
                      <img src={pairForm.imageB} alt="" className="w-full aspect-video object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
                      <button type="button" onClick={() => setPairForm(p => ({ ...p, imageB: '' }))}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] font-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">✕</button>
                      {pairForm.imageB.startsWith('data:') && <div className="text-[10px] text-muted-foreground mt-1">📁 File locale</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setOpenPair(false); setErr(''); }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover-elevate">Annulla</button>
              <button onClick={handleAddPair} disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50 hover-elevate">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

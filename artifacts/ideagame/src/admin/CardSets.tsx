import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Image as ImageIcon, Copy } from 'lucide-react';
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
            <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Etichetta</label>
                <input value={pairForm.label}
                  onChange={e => setPairForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="Gatto"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Immagine A (URL)</label>
                  <input value={pairForm.imageA}
                    onChange={e => setPairForm(p => ({ ...p, imageA: e.target.value }))}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  {pairForm.imageA && (
                    <img src={pairForm.imageA} alt="" className="mt-2 w-full aspect-video object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Immagine B (opz.)</label>
                  <input value={pairForm.imageB}
                    onChange={e => setPairForm(p => ({ ...p, imageB: e.target.value }))}
                    placeholder="Uguale ad A se vuoto"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  {pairForm.imageB && (
                    <img src={pairForm.imageB} alt="" className="mt-2 w-full aspect-video object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = 'none')} />
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

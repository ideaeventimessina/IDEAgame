import { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import { Trash2, Plus, Loader2, BookOpen, Tag, Zap, Clock, Edit2, Check, X } from 'lucide-react';
import { JonnyGenerateBanner } from '@/components/JonnyGenerateBanner';

interface WordBackSet {
  id: string; title: string; description: string; language: string;
  isActive: boolean; createdAt: string;
}
interface WordBackCard {
  id: string; setId: string; word: string; hint: string | null;
  category: string; difficulty: string; points: number;
  timeLimit: number; orderIndex: number; isActive: boolean;
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

const CATEGORIES = ['animali','oggetti','film','personaggi','azioni','mestieri','eventi','parole assurde'];
const DIFFICULTIES = ['easy','medium','hard'];
const DIFF_LABEL: Record<string, string> = { easy: 'Facile', medium: 'Medio', hard: 'Difficile' };
const DIFF_COLOR: Record<string, string> = { easy: 'text-green-400', medium: 'text-yellow-400', hard: 'text-red-400' };
const CAT_EMOJI: Record<string, string> = {
  animali: '🐾', oggetti: '📦', film: '🎬', personaggi: '🎭',
  azioni: '⚡', mestieri: '👷', eventi: '🎉', 'parole assurde': '🤪',
};

export default function AdminWordBack() {
  const [sets, setSets] = useState<WordBackSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [cards, setCards] = useState<WordBackCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // New set form
  const [newSetTitle, setNewSetTitle] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [creatingSet, setCreatingSet] = useState(false);

  // New card form
  const [newWord, setNewWord] = useState('');
  const [newHint, setNewHint] = useState('');
  const [newCategory, setNewCategory] = useState('oggetti');
  const [newDifficulty, setNewDifficulty] = useState('medium');
  const [newPoints, setNewPoints] = useState(150);
  const [newTimeLimit, setNewTimeLimit] = useState(45);
  const [addingCard, setAddingCard] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);

  // Inline edit
  const [editingCardId, setEditingCardId] = useState('');
  const [editWord, setEditWord] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDifficulty, setEditDifficulty] = useState('');
  const [editPoints, setEditPoints] = useState(150);
  const [editTimeLimit, setEditTimeLimit] = useState(45);
  const [savingCard, setSavingCard] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    void loadSets();
  }, []);

  useEffect(() => {
    if (selectedSetId) void loadCards(selectedSetId);
    else setCards([]);
  }, [selectedSetId]);

  async function loadSets() {
    setLoading(true);
    try {
      const d = await apiFetch('/word-back/sets') as WordBackSet[];
      setSets(d);
      if (d.length > 0 && !selectedSetId) setSelectedSetId(d[0]!.id);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function loadCards(setId: string) {
    setLoading(true);
    try {
      const d = await apiFetch(`/word-back/sets/${setId}/cards`) as WordBackCard[];
      setCards(d);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function handleCreateSet() {
    if (!newSetTitle.trim()) return;
    setCreatingSet(true); setError('');
    try {
      await apiFetch('/word-back/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSetTitle.trim(), description: newSetDesc.trim() }),
      });
      setNewSetTitle(''); setNewSetDesc('');
      await loadSets();
    } catch (e) { setError((e as Error).message); }
    finally { setCreatingSet(false); }
  }

  async function handleDeleteSet(id: string) {
    if (!window.confirm('Eliminare questo mazzo e tutte le sue parole?')) return;
    try {
      await apiFetch(`/word-back/sets/${id}`, { method: 'DELETE' });
      if (selectedSetId === id) setSelectedSetId('');
      await loadSets();
    } catch (e) { setError((e as Error).message); }
  }

  async function handleAddCard() {
    if (!newWord.trim() || !selectedSetId) return;
    setAddingCard(true); setError('');
    try {
      await apiFetch(`/word-back/sets/${selectedSetId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: newWord.trim(), hint: newHint.trim() || null,
          category: newCategory, difficulty: newDifficulty,
          points: newPoints, timeLimit: newTimeLimit,
          orderIndex: cards.length,
        }),
      });
      setNewWord(''); setNewHint(''); setShowAddCard(false);
      await loadCards(selectedSetId);
    } catch (e) { setError((e as Error).message); }
    finally { setAddingCard(false); }
  }

  function startEdit(c: WordBackCard) {
    setEditingCardId(c.id);
    setEditWord(c.word); setEditHint(c.hint ?? '');
    setEditCategory(c.category); setEditDifficulty(c.difficulty);
    setEditPoints(c.points); setEditTimeLimit(c.timeLimit);
  }

  async function handleSaveCard(cardId: string) {
    setSavingCard(true); setError('');
    try {
      await apiFetch(`/word-back/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: editWord.trim(), hint: editHint.trim() || null,
          category: editCategory, difficulty: editDifficulty,
          points: editPoints, timeLimit: editTimeLimit,
        }),
      });
      setEditingCardId('');
      await loadCards(selectedSetId);
    } catch (e) { setError((e as Error).message); }
    finally { setSavingCard(false); }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await apiFetch(`/word-back/cards/${cardId}`, { method: 'DELETE' });
      await loadCards(selectedSetId);
    } catch (e) { setError((e as Error).message); }
  }

  async function handleToggleCard(c: WordBackCard) {
    try {
      await apiFetch(`/word-back/cards/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      await loadCards(selectedSetId);
    } catch (e) { setError((e as Error).message); }
  }

  const filteredCards = categoryFilter
    ? cards.filter(c => c.category === categoryFilter)
    : cards;
  const activeCount = cards.filter(c => c.isActive).length;
  const selectedSet = sets.find(s => s.id === selectedSetId);

  return (
    <AdminLayout title="Parola alle Spalle — Mazzi">
      <div className="space-y-6">
        <JonnyGenerateBanner gameSlug="parola-alle-spalle" gameLabel="Parola alle Spalle" />

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ─── Set selector + create ─────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest">Mazzi di parole</h2>
          </div>

          {loading && sets.length === 0 && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

          <div className="flex flex-wrap gap-2">
            {sets.map(s => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedSetId(s.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                    selectedSetId === s.id
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {s.title}
                </button>
                <button onClick={() => void handleDeleteSet(s.id)}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)}
              placeholder="Nome mazzo" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <input value={newSetDesc} onChange={e => setNewSetDesc(e.target.value)}
              placeholder="Descrizione (opzionale)" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <button onClick={() => void handleCreateSet()} disabled={!newSetTitle.trim() || creatingSet}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-background disabled:opacity-40">
              {creatingSet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crea
            </button>
          </div>
        </div>

        {/* ─── Cards section ─────────────────────────────────────── */}
        {selectedSet && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-widest">{selectedSet.title}</h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {activeCount} / {cards.length} attive
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs">
                  <option value="">Tutte le categorie</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>
                  ))}
                </select>
                <button onClick={() => setShowAddCard(p => !p)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-background">
                  <Plus className="h-3.5 w-3.5" /> Aggiungi parola
                </button>
              </div>
            </div>

            {/* Add card form */}
            {showAddCard && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Parola *</label>
                    <input value={newWord} onChange={e => setNewWord(e.target.value)}
                      placeholder="es. Elefante"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Suggerimento (opzionale)</label>
                    <input value={newHint} onChange={e => setNewHint(e.target.value)}
                      placeholder="es. Grande animale grigio"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Difficoltà</label>
                    <select value={newDifficulty} onChange={e => setNewDifficulty(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Punti</label>
                    <input type="number" value={newPoints} onChange={e => setNewPoints(+e.target.value)}
                      min={50} max={500} step={50}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Timer (secondi)</label>
                    <input type="number" value={newTimeLimit} onChange={e => setNewTimeLimit(+e.target.value)}
                      min={15} max={120} step={5}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void handleAddCard()} disabled={!newWord.trim() || addingCard}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-background disabled:opacity-40">
                    {addingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Aggiungi
                  </button>
                  <button onClick={() => setShowAddCard(false)}
                    className="rounded-xl border border-border px-4 py-2 text-sm">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

            {filteredCards.length === 0 && !loading && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nessuna parola — aggiungi la prima!
              </div>
            )}

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredCards.map(card => (
                <div key={card.id} className={`rounded-xl border p-3 transition-colors ${
                  card.isActive ? 'border-border bg-background' : 'border-border/40 bg-background/40 opacity-60'
                }`}>
                  {editingCardId === card.id ? (
                    /* Inline edit mode */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editWord} onChange={e => setEditWord(e.target.value)}
                          placeholder="Parola" className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold" />
                        <input value={editHint} onChange={e => setEditHint(e.target.value)}
                          placeholder="Suggerimento" className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm" />
                        <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                        </select>
                        <select value={editDifficulty} onChange={e => setEditDifficulty(e.target.value)}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                          {DIFFICULTIES.map(d => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
                        </select>
                        <input type="number" value={editPoints} onChange={e => setEditPoints(+e.target.value)}
                          min={50} max={500} step={50}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm" />
                        <input type="number" value={editTimeLimit} onChange={e => setEditTimeLimit(+e.target.value)}
                          min={15} max={120} step={5}
                          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => void handleSaveCard(card.id)} disabled={savingCard}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                          {savingCard ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salva
                        </button>
                        <button onClick={() => setEditingCardId('')}
                          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs">
                          <X className="h-3 w-3" /> Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal view */
                    <div className="flex items-center gap-3">
                      <div className="text-lg">{CAT_EMOJI[card.category] ?? '🎯'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm truncate">{card.word}</span>
                          <span className={`text-xs font-bold ${DIFF_COLOR[card.difficulty]}`}>
                            {DIFF_LABEL[card.difficulty]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{card.category}</span>
                          <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{card.points} pt</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{card.timeLimit}s</span>
                          {card.hint && <span className="italic truncate max-w-[150px]">💡 {card.hint}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => void handleToggleCard(card)}
                          className={`rounded-lg border px-2 py-1 text-xs font-bold ${
                            card.isActive
                              ? 'border-green-500/40 bg-green-500/10 text-green-400'
                              : 'border-border text-muted-foreground'
                          }`}>
                          {card.isActive ? '✓' : '○'}
                        </button>
                        <button onClick={() => startEdit(card)}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => void handleDeleteCard(card.id)}
                          className="rounded-lg border border-destructive/40 bg-destructive/10 p-1.5 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

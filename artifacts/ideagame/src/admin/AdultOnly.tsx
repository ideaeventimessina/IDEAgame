import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { Trash2, Plus, ChevronRight, ToggleLeft, ToggleRight, Loader2, Lock } from 'lucide-react';
import { JonnyGenerateBanner } from '@/components/JonnyGenerateBanner';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface Deck { id: string; name: string; description: string; }
interface Card {
  id: string; deckId: string; title: string; body: string;
  category: string; points: number; timeLimit: number;
  level: string; isActive: boolean; orderIndex: number;
}

const CATEGORIES = [
  { value: 'domande-piccanti-leggere', label: '🔥 Domande piccanti leggere' },
  { value: 'vero-falso',               label: '✅ Vero / Falso' },
  { value: 'mondo-animale-curioso',    label: '🦁 Mondo animale curioso' },
  { value: 'coppie-challenge',         label: '💑 Coppie / Challenge' },
  { value: 'yoga-pose-ironiche',       label: '🧘 Yoga pose ironiche' },
  { value: 'imitazioni-vocali-soft',   label: '🎙️ Imitazioni vocali soft' },
];

const LEVELS = [
  { value: 'soft',    label: '🌶️ Soft' },
  { value: 'spicy',   label: '🌶️🌶️ Spicy' },
  { value: 'extreme', label: '🌶️🌶️🌶️ Extreme' },
];

const CAT_EMOJI: Record<string, string> = {
  'domande-piccanti-leggere': '🔥',
  'vero-falso':               '✅',
  'mondo-animale-curioso':    '🦁',
  'coppie-challenge':         '💑',
  'yoga-pose-ironiche':       '🧘',
  'imitazioni-vocali-soft':   '🎙️',
};
const LEVEL_EMOJI: Record<string, string> = {
  soft: '🌶️', spicy: '🌶️🌶️', extreme: '🌶️🌶️🌶️',
};

export default function AdminAdultOnly() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [error, setError] = useState('');

  // Deck form
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);

  // Card form
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [cardBody, setCardBody] = useState('');
  const [cardCategory, setCardCategory] = useState('domande-piccanti-leggere');
  const [cardPoints, setCardPoints] = useState(100);
  const [cardTimeLimit, setCardTimeLimit] = useState(30);
  const [cardLevel, setCardLevel] = useState('soft');
  const [creatingCard, setCreatingCard] = useState(false);

  const loadDecks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/adult-only/decks') as Deck[];
      setDecks(data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const loadCards = useCallback(async (deckId: string) => {
    setCardsLoading(true);
    try {
      const data = await apiFetch(`/adult-only/decks/${deckId}/cards`) as Card[];
      setCards(data);
    } catch { setCards([]); }
    finally { setCardsLoading(false); }
  }, []);

  useEffect(() => { void loadDecks(); }, [loadDecks]);

  useEffect(() => {
    if (!selectedDeckId) { setCards([]); return; }
    void loadCards(selectedDeckId);
  }, [selectedDeckId, loadCards]);

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    setCreatingDeck(true);
    try {
      await apiFetch('/adult-only/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeckName.trim(), description: newDeckDesc.trim() }),
      });
      setNewDeckName(''); setNewDeckDesc('');
      await loadDecks();
    } catch (e) { setError((e as Error).message); }
    finally { setCreatingDeck(false); }
  };

  const handleDeleteDeck = async (id: string) => {
    if (!confirm('Eliminare il mazzo e tutte le sue carte?')) return;
    try {
      await apiFetch(`/adult-only/decks/${id}`, { method: 'DELETE' });
      if (selectedDeckId === id) { setSelectedDeckId(''); setCards([]); }
      await loadDecks();
    } catch (e) { setError((e as Error).message); }
  };

  const handleCreateCard = async () => {
    if (!cardTitle.trim() || !cardBody.trim() || !selectedDeckId) return;
    setCreatingCard(true);
    try {
      await apiFetch(`/adult-only/decks/${selectedDeckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cardTitle.trim(), body: cardBody.trim(),
          category: cardCategory, points: cardPoints,
          timeLimit: cardTimeLimit, level: cardLevel,
          orderIndex: cards.length,
        }),
      });
      setCardTitle(''); setCardBody('');
      setCardCategory('domande-piccanti-leggere');
      setCardPoints(100); setCardTimeLimit(30); setCardLevel('soft');
      setShowCardForm(false);
      await loadCards(selectedDeckId);
    } catch (e) { setError((e as Error).message); }
    finally { setCreatingCard(false); }
  };

  const handleToggleCard = async (card: Card) => {
    try {
      await apiFetch(`/adult-only/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !card.isActive }),
      });
      await loadCards(selectedDeckId);
    } catch (e) { setError((e as Error).message); }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Eliminare questa carta?')) return;
    try {
      await apiFetch(`/adult-only/cards/${id}`, { method: 'DELETE' });
      await loadCards(selectedDeckId);
    } catch (e) { setError((e as Error).message); }
  };

  const activeCount = cards.filter(c => c.isActive).length;

  return (
    <AdminLayout title="Adult Only 🔞">
      <div className="flex h-full flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔞</span>
            <div>
              <h1 className="text-display text-xl font-black">Adult Only</h1>
              <p className="text-xs text-muted-foreground">Mazzi e carte per il gioco adulti — nessun contenuto esplicito</p>
            </div>
          </div>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <JonnyGenerateBanner gameSlug="adult-only" gameLabel="Adult Only" />
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-xs underline">Chiudi</button>
          </div>
        )}

        <div className="flex flex-1 gap-0 min-h-0 overflow-hidden">
          {/* ── Left panel: Decks ─────────────────────────────────────── */}
          <div className="flex w-72 shrink-0 flex-col border-r border-border overflow-y-auto">
            <div className="p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Mazzi</div>

              {/* Create deck form */}
              <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                <input
                  value={newDeckName}
                  onChange={e => setNewDeckName(e.target.value)}
                  placeholder="Nome mazzo…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                />
                <input
                  value={newDeckDesc}
                  onChange={e => setNewDeckDesc(e.target.value)}
                  placeholder="Descrizione (opzionale)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                />
                <button
                  onClick={() => void handleCreateDeck()}
                  disabled={!newDeckName.trim() || creatingDeck}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-pink-600 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {creatingDeck ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Crea mazzo
                </button>
              </div>

              {loading && <div className="text-center py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}

              {decks.map(deck => (
                <button key={deck.id}
                  onClick={() => setSelectedDeckId(deck.id)}
                  className={`w-full flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-all ${
                    selectedDeckId === deck.id
                      ? 'border-pink-500/50 bg-pink-500/10'
                      : 'border-border hover:border-pink-500/30 hover:bg-card'
                  }`}>
                  <span className="text-lg shrink-0">🃏</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{deck.name}</div>
                    {deck.description && (
                      <div className="text-xs text-muted-foreground truncate">{deck.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedDeckId === deck.id && <ChevronRight className="h-3.5 w-3.5 text-pink-400" />}
                    <button
                      onClick={e => { e.stopPropagation(); void handleDeleteDeck(deck.id); }}
                      className="rounded-lg p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              ))}

              {!loading && decks.length === 0 && (
                <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Nessun mazzo — creane uno
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: Cards ────────────────────────────────────── */}
          <div className="flex flex-1 flex-col min-w-0 overflow-y-auto">
            {!selectedDeckId ? (
              <div className="flex flex-1 items-center justify-center text-center text-muted-foreground p-8">
                <div>
                  <div className="text-4xl mb-3">🃏</div>
                  <div className="text-sm">Seleziona un mazzo per gestire le carte</div>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Cards header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{decks.find(d => d.id === selectedDeckId)?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {activeCount} carte attive / {cards.length} totali
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCardForm(v => !v)}
                    className="flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-700">
                    <Plus className="h-4 w-4" />
                    Aggiungi carta
                  </button>
                </div>

                {/* New card form */}
                {showCardForm && (
                  <div className="rounded-2xl border border-pink-500/30 bg-pink-500/5 p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-pink-400">Nuova carta</div>
                    <input
                      value={cardTitle}
                      onChange={e => setCardTitle(e.target.value)}
                      placeholder="Titolo della carta…"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                    />
                    <textarea
                      value={cardBody}
                      onChange={e => setCardBody(e.target.value)}
                      placeholder="Testo completo della carta — domanda, sfida, o istruzione…"
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Categoria</div>
                        <select value={cardCategory} onChange={e => setCardCategory(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                          {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Livello</div>
                        <select value={cardLevel} onChange={e => setCardLevel(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                          {LEVELS.map(l => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Punti</div>
                        <input type="number" value={cardPoints} min={0} max={500}
                          onChange={e => setCardPoints(Number(e.target.value))}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Timer (secondi)</div>
                        <input type="number" value={cardTimeLimit} min={0} max={300}
                          onChange={e => setCardTimeLimit(Number(e.target.value))}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void handleCreateCard()}
                        disabled={!cardTitle.trim() || !cardBody.trim() || creatingCard}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-pink-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                        {creatingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Crea carta
                      </button>
                      <button onClick={() => setShowCardForm(false)}
                        className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                        Annulla
                      </button>
                    </div>
                  </div>
                )}

                {/* Cards list */}
                {cardsLoading ? (
                  <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                ) : (
                  <div className="space-y-2">
                    {cards.map((card, idx) => (
                      <div key={card.id}
                        className={`rounded-2xl border px-4 py-3 transition-all ${card.isActive ? 'border-border bg-card' : 'border-border/40 bg-card/40 opacity-60'}`}>
                        <div className="flex items-start gap-3">
                          <div className="text-xl shrink-0 mt-0.5">{CAT_EMOJI[card.category] ?? '🎯'}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-bold text-sm">{card.title}</span>
                              <span className="text-xs text-muted-foreground">{LEVEL_EMOJI[card.level] ?? '🌶️'} {card.level}</span>
                              <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground">{card.points}pt</span>
                              {card.timeLimit > 0 && <span className="text-xs text-muted-foreground">⏱ {card.timeLimit}s</span>}
                            </div>
                            <div className="text-sm text-muted-foreground leading-snug">{card.body}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => void handleToggleCard(card)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                              title={card.isActive ? 'Disattiva' : 'Attiva'}>
                              {card.isActive
                                ? <ToggleRight className="h-5 w-5 text-green-400" />
                                : <ToggleLeft className="h-5 w-5" />}
                            </button>
                            <button onClick={() => void handleDeleteCard(card.id)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border py-10 text-center text-muted-foreground text-sm">
                        Nessuna carta — aggiungine una
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

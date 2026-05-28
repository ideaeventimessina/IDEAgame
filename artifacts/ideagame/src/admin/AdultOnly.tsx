import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { Trash2, Plus, Pencil, Copy, Check, X, Loader2, ChevronLeft } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface Card {
  id: string; deckId: string; title: string; body: string;
  category: string; points: number; timeLimit: number;
  level: string; isActive: boolean; orderIndex: number;
}
interface Deck { id: string; name: string; description: string; }

const LEVELS = ['1','2','3','4','5'] as const;
const LEVEL_LABELS: Record<string, string> = {
  '1': 'Livello 1 — Soft',
  '2': 'Livello 2 — Leggero',
  '3': 'Livello 3 — Medio',
  '4': 'Livello 4 — Piccante',
  '5': 'Livello 5 — Estremo',
};
const LEVEL_COLORS: Record<string, string> = {
  '1': '#10B981', '2': '#60A5FA', '3': '#F59E0B', '4': '#F97316', '5': '#EF4444',
};

type CardType = 'verita' | 'obbligo';

interface EditState { id: string; body: string; title: string; level: string; }

export default function AdminAdultOnly() {
  const [deckId, setDeckId] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeType, setActiveType] = useState<CardType>('verita');
  const [activeLevel, setActiveLevel] = useState<'1'|'2'|'3'|'4'|'5'>('1');

  const [showAddForm, setShowAddForm] = useState(false);
  const [addBody, setAddBody] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addLevel, setAddLevel] = useState<'1'|'2'|'3'|'4'|'5'>('1');
  const [saving, setSaving] = useState(false);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const loadCards = useCallback(async (id: string) => {
    try {
      const data = await apiFetch(`/adult-only/decks/${id}/cards`) as Card[];
      setCards(data);
    } catch { setCards([]); }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        let decks = await apiFetch('/adult-only/decks') as Deck[];
        if (decks.length === 0) {
          await apiFetch('/adult-only/decks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "Jonny's World", description: 'Contenuti Adult Only predefiniti' }),
          });
          decks = await apiFetch('/adult-only/decks') as Deck[];
        }
        const id = decks[0]!.id;
        setDeckId(id);
        await loadCards(id);
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [loadCards]);

  const filtered = cards.filter(c => c.category === activeType && c.level === activeLevel);

  const countFor = (type: CardType, level: string) =>
    cards.filter(c => c.category === type && c.level === level).length;
  const totalFor = (type: CardType) => cards.filter(c => c.category === type).length;

  const handleAdd = async () => {
    if (!addBody.trim() || !deckId) return;
    setSaving(true);
    try {
      await apiFetch(`/adult-only/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addTitle.trim() || (activeType === 'verita' ? 'Verità' : 'Obbligo'),
          body: addBody.trim(),
          category: activeType,
          level: addLevel,
          points: 100,
          timeLimit: 30,
          orderIndex: cards.length,
        }),
      });
      setAddBody(''); setAddTitle(''); setAddLevel(activeLevel);
      setShowAddForm(false);
      await loadCards(deckId);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa carta?')) return;
    try {
      await apiFetch(`/adult-only/cards/${id}`, { method: 'DELETE' });
      await loadCards(deckId);
    } catch (e) { setError((e as Error).message); }
  };

  const handleDuplicate = async (card: Card) => {
    try {
      await apiFetch(`/adult-only/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: card.title, body: card.body, category: card.category,
          level: card.level, points: card.points, timeLimit: card.timeLimit,
          orderIndex: cards.length,
        }),
      });
      await loadCards(deckId);
    } catch (e) { setError((e as Error).message); }
  };

  const handleEditSave = async () => {
    if (!editState) return;
    setEditSaving(true);
    try {
      await apiFetch(`/adult-only/cards/${editState.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editState.title, body: editState.body, level: editState.level }),
      });
      setEditState(null);
      await loadCards(deckId);
    } catch (e) { setError((e as Error).message); }
    finally { setEditSaving(false); }
  };

  if (loading) {
    return (
      <AdminLayout title="Adult Only 🔞">
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const typeColor = activeType === 'verita' ? '#60A5FA' : '#EF4444';
  const levelColor = LEVEL_COLORS[activeLevel] ?? '#F59E0B';

  return (
    <AdminLayout title="Adult Only 🔞">
      <div className="max-w-4xl mx-auto space-y-5">

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <X className="h-4 w-4" />{error}
            <button className="ml-auto text-xs underline" onClick={() => setError('')}>OK</button>
          </div>
        )}

        {/* Type switcher */}
        <div className="grid grid-cols-2 gap-3">
          {(['verita','obbligo'] as CardType[]).map(type => {
            const isActive = activeType === type;
            const color = type === 'verita' ? '#60A5FA' : '#EF4444';
            const emoji = type === 'verita' ? '👀' : '🔥';
            const label = type === 'verita' ? 'VERITÀ' : 'OBBLIGHI';
            return (
              <button
                key={type}
                onClick={() => { setActiveType(type); setShowAddForm(false); }}
                className="relative rounded-2xl p-5 text-left transition-all border"
                style={{
                  borderColor: isActive ? color : 'rgba(255,255,255,0.1)',
                  background: isActive
                    ? `linear-gradient(135deg, ${color}22, ${color}0a)`
                    : 'rgba(255,255,255,0.03)',
                  boxShadow: isActive ? `0 0 20px ${color}25` : 'none',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">{emoji}</span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black"
                    style={{ background: `${color}22`, color }}
                  >
                    {totalFor(type)} carte
                  </span>
                </div>
                <div
                  className="text-xl font-black tracking-wider"
                  style={{ color: isActive ? color : 'rgba(255,255,255,0.5)' }}
                >
                  {label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {type === 'verita' ? 'Domande da rispondere onestamente' : 'Sfide da eseguire davanti a tutti'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Level tabs */}
        <div className="flex gap-2 flex-wrap">
          {LEVELS.map(lv => {
            const isActive = activeLevel === lv;
            const col = LEVEL_COLORS[lv]!;
            const cnt = countFor(activeType, lv);
            return (
              <button
                key={lv}
                onClick={() => { setActiveLevel(lv); setShowAddForm(false); }}
                className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-all"
                style={{
                  borderColor: isActive ? col : 'rgba(255,255,255,0.1)',
                  background: isActive ? `${col}20` : 'transparent',
                  color: isActive ? col : 'rgba(255,255,255,0.45)',
                }}
              >
                Livello {lv}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-black min-w-[20px] text-center"
                  style={{ background: isActive ? `${col}30` : 'rgba(255,255,255,0.08)', color: isActive ? col : 'rgba(255,255,255,0.4)' }}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section header + add button */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-black text-base" style={{ color: typeColor }}>
              {activeType === 'verita' ? '👀 VERITÀ' : '🔥 OBBLIGHI'} — {LEVEL_LABELS[activeLevel]}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} {filtered.length === 1 ? 'carta' : 'carte'}
            </div>
          </div>
          <button
            onClick={() => { setShowAddForm(v => !v); setAddLevel(activeLevel); }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all"
            style={{ background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40` }}
          >
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? 'Annulla' : activeType === 'verita' ? '+ Nuova verità' : '+ Nuovo obbligo'}
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{ borderColor: `${typeColor}40`, background: `${typeColor}08` }}
          >
            <div className="text-sm font-bold" style={{ color: typeColor }}>
              {activeType === 'verita' ? '👀 Nuova Verità' : '🔥 Nuovo Obbligo'}
            </div>
            <input
              placeholder="Titolo breve (opzionale, es. Animali, Coppia…)"
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <textarea
              placeholder={activeType === 'verita'
                ? 'Scrivi la verità… es. Qual è la cosa più imbarazzante che ti sia mai capitata?'
                : 'Scrivi l\'obbligo… es. Fai 10 flessioni cantando una canzone a scelta.'}
              value={addBody}
              onChange={e => setAddBody(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-muted-foreground">Livello:</label>
              <div className="flex gap-1.5">
                {LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => setAddLevel(lv)}
                    className="rounded-lg px-2.5 py-1 text-xs font-bold border transition-all"
                    style={{
                      borderColor: addLevel === lv ? LEVEL_COLORS[lv] : 'rgba(255,255,255,0.1)',
                      background: addLevel === lv ? `${LEVEL_COLORS[lv]}25` : 'transparent',
                      color: addLevel === lv ? LEVEL_COLORS[lv] : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {lv}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAdd}
                disabled={saving || !addBody.trim()}
                className="ml-auto flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: typeColor, color: '#fff' }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salva
              </button>
            </div>
          </div>
        )}

        {/* Cards list */}
        <div className="space-y-2">
          {filtered.length === 0 && !showAddForm && (
            <div
              className="rounded-2xl border border-dashed py-14 text-center"
              style={{ borderColor: `${typeColor}30` }}
            >
              <div className="text-4xl mb-3">{activeType === 'verita' ? '👀' : '🔥'}</div>
              <div className="text-sm text-muted-foreground mb-4">
                Nessuna {activeType === 'verita' ? 'verità' : 'obbligo'} per il livello {activeLevel} ancora.
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
                style={{ background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}35` }}
              >
                <Plus className="h-4 w-4" />
                {activeType === 'verita' ? 'Aggiungi la prima verità' : 'Aggiungi il primo obbligo'}
              </button>
            </div>
          )}

          {filtered.map((card, idx) => {
            const isEditing = editState?.id === card.id;
            return (
              <div
                key={card.id}
                className="group rounded-2xl border p-4 transition-all"
                style={{
                  borderColor: isEditing ? `${typeColor}50` : 'rgba(255,255,255,0.08)',
                  background: isEditing ? `${typeColor}08` : 'rgba(255,255,255,0.03)',
                }}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      value={editState.title}
                      onChange={e => setEditState(s => s ? { ...s, title: e.target.value } : s)}
                      placeholder="Titolo"
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <textarea
                      value={editState.body}
                      onChange={e => setEditState(s => s ? { ...s, body: e.target.value } : s)}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-muted-foreground">Livello:</label>
                      <div className="flex gap-1">
                        {LEVELS.map(lv => (
                          <button
                            key={lv}
                            onClick={() => setEditState(s => s ? { ...s, level: lv } : s)}
                            className="rounded-md px-2 py-0.5 text-xs font-bold border transition-all"
                            style={{
                              borderColor: editState.level === lv ? LEVEL_COLORS[lv] : 'rgba(255,255,255,0.1)',
                              background: editState.level === lv ? `${LEVEL_COLORS[lv]}25` : 'transparent',
                              color: editState.level === lv ? LEVEL_COLORS[lv] : 'rgba(255,255,255,0.4)',
                            }}
                          >
                            {lv}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setEditState(null)} className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover-elevate">
                        Annulla
                      </button>
                      <button
                        onClick={handleEditSave}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
                        style={{ background: typeColor, color: '#fff' }}
                      >
                        {editSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Salva
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-black min-w-[24px] text-center mt-0.5"
                      style={{ background: `${levelColor}25`, color: levelColor, border: `1px solid ${levelColor}35` }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {card.title && card.title !== 'Verità' && card.title !== 'Obbligo' && (
                        <div className="text-xs font-bold text-muted-foreground mb-1">{card.title}</div>
                      )}
                      <div className="text-sm leading-relaxed text-foreground">{card.body}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        title="Modifica"
                        onClick={() => setEditState({ id: card.id, body: card.body, title: card.title, level: card.level })}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover-elevate"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Duplica"
                        onClick={() => handleDuplicate(card)}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover-elevate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Elimina"
                        onClick={() => handleDelete(card.id)}
                        className="rounded-lg border border-border p-1.5 text-destructive hover-elevate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </AdminLayout>
  );
}

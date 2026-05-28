import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import {
  PackageOpen, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Search, Filter, RefreshCw, Sparkles,
  Globe, Lock, Zap, Eye, EyeOff, ListPlus, X, Check, AlertCircle
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GameContentPack {
  id: string;
  tenantId: string | null;
  gameSlug: string;
  modeAvailability: "home" | "live" | "both";
  title: string;
  description: string | null;
  theme: string | null;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  language: string;
  isActive: boolean;
  createdBy: "admin" | "jonny";
  status: "draft" | "review" | "published" | "archived";
  version: number;
  tags: string[] | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GameContentItem {
  id: string;
  packId: string;
  gameSlug: string;
  type: string;
  title: string;
  payloadJson: unknown;
  mediaJson: unknown;
  difficulty: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GAME_SLUGS = [
  { value: "saramusica",        label: "🎵 Sara'Musica" },
  { value: "parola-alle-spalle", label: "💬 Parola alle Spalle" },
  { value: "quizzone",          label: "🎯 Quizzone" },
  { value: "gioco-coppie",      label: "🃏 Gioco delle Coppie" },
  { value: "percorso-a-risate", label: "🎭 Percorso a Risate" },
  { value: "adult-only",        label: "🔥 Adult Only" },
  { value: "karaoke-battle",    label: "🎤 Karaoke Battle" },
  { value: "sfida-ballo",       label: "💃 Sfida di Ballo" },
  { value: "freestyle",         label: "🎙️ Freestyle Battle" },
];

const DIFFICULTIES = [
  { value: "easy",   label: "Facile" },
  { value: "medium", label: "Medio" },
  { value: "hard",   label: "Difficile" },
  { value: "mixed",  label: "Misto" },
];

const STATUSES = [
  { value: "draft",     label: "Bozza",       color: "bg-zinc-700 text-zinc-300" },
  { value: "review",    label: "In Revisione", color: "bg-amber-900/60 text-amber-300" },
  { value: "published", label: "Pubblicato",   color: "bg-emerald-900/60 text-emerald-300" },
  { value: "archived",  label: "Archiviato",   color: "bg-zinc-800 text-zinc-500" },
];

const MODES = [
  { value: "home", label: "🏠 Home Mode" },
  { value: "live", label: "🎪 Live Show" },
  { value: "both", label: "✨ Entrambi" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const s = STATUSES.find(x => x.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s?.color ?? "bg-zinc-700 text-zinc-300"}`}>
      {s?.label ?? status}
    </span>
  );
}

function diffBadge(diff: string) {
  const colors: Record<string, string> = {
    easy: "text-emerald-400", medium: "text-amber-400",
    hard: "text-red-400", mixed: "text-purple-400",
  };
  return <span className={`text-xs font-bold ${colors[diff] ?? "text-zinc-400"}`}>{diff.toUpperCase()}</span>;
}

function modeBadge(mode: string) {
  const map: Record<string, string> = { home: "🏠", live: "🎪", both: "✨" };
  return <span className="text-xs text-zinc-400">{map[mode] ?? mode}</span>;
}

function gameName(slug: string) {
  return GAME_SLUGS.find(g => g.value === slug)?.label ?? slug;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

// ── CreatePackModal ───────────────────────────────────────────────────────────

function CreatePackModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: GameContentPack) => void }) {
  const [form, setForm] = useState({
    gameSlug: "saramusica",
    title: "",
    description: "",
    theme: "",
    difficulty: "medium",
    modeAvailability: "both",
    language: "it",
    status: "published",
    tags: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Titolo obbligatorio"); return; }
    setSaving(true); setError("");
    try {
      const pack = await apiFetch("/game-content-packs", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tags: form.tags ? form.tags.split(",").map(s => s.trim()).filter(Boolean) : [],
        }),
      });
      onCreated(pack as GameContentPack);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Nuovo Pack</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted/40"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Gioco *</label>
              <select value={form.gameSlug} onChange={set("gameSlug")} className="input-field w-full">
                {GAME_SLUGS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Titolo *</label>
              <input value={form.title} onChange={set("title")} placeholder="es. Anni 80 Classici" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Tema</label>
              <input value={form.theme} onChange={set("theme")} placeholder="es. anni80" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Difficoltà</label>
              <select value={form.difficulty} onChange={set("difficulty")} className="input-field w-full">
                {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Modalità</label>
              <select value={form.modeAvailability} onChange={set("modeAvailability")} className="input-field w-full">
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Stato</label>
              <select value={form.status} onChange={set("status")} className="input-field w-full">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Descrizione</label>
              <textarea value={form.description} onChange={set("description")} rows={2} className="input-field w-full resize-none" placeholder="Breve descrizione del pack..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Tag (separati da virgola)</label>
              <input value={form.tags} onChange={set("tags")} placeholder="es. classico, famiglia, estate" className="input-field w-full" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annulla</button>
            <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm flex items-center gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Creando…" : "Crea Pack"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EditPackDrawer ────────────────────────────────────────────────────────────

function EditPackDrawer({ pack, onClose, onUpdated, onDeleted }: {
  pack: GameContentPack;
  onClose: () => void;
  onUpdated: (p: GameContentPack) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: pack.title,
    description: pack.description ?? "",
    theme: pack.theme ?? "",
    difficulty: pack.difficulty,
    modeAvailability: pack.modeAvailability,
    status: pack.status,
    tags: (pack.tags ?? []).join(", "),
  });
  const [items, setItems] = useState<GameContentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"info" | "items">("info");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemType, setNewItemType] = useState("default");
  const [addingItem, setAddingItem] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (tab === "items") {
      apiFetch(`/game-content-packs/${pack.id}/items`)
        .then(d => setItems(d as GameContentItem[]))
        .catch(() => {});
    }
  }, [pack.id, tab]);

  async function handleSave() {
    setSaving(true); setError("");
    try {
      const updated = await apiFetch(`/game-content-packs/${pack.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          tags: form.tags ? form.tags.split(",").map(s => s.trim()).filter(Boolean) : [],
        }),
      });
      onUpdated(updated as GameContentPack);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await apiFetch(`/game-content-packs/${pack.id}`, { method: "DELETE" });
    onDeleted(pack.id);
  }

  async function handleAddItem() {
    if (!newItemTitle.trim()) return;
    setAddingItem(true);
    try {
      const item = await apiFetch(`/game-content-packs/${pack.id}/items`, {
        method: "POST",
        body: JSON.stringify({ title: newItemTitle, type: newItemType }),
      });
      setItems(prev => [...prev, item as GameContentItem]);
      setNewItemTitle("");
    } catch (err) {
      setError(String(err));
    } finally {
      setAddingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    await apiFetch(`/game-content-items/${itemId}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function handleToggleItem(item: GameContentItem) {
    const updated = await apiFetch(`/game-content-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    setItems(prev => prev.map(i => i.id === item.id ? updated as GameContentItem : i));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{gameName(pack.gameSlug).split(" ")[0]}</span>
              <h2 className="truncate text-base font-bold">{pack.title}</h2>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {statusBadge(pack.status)}
              {modeBadge(pack.modeAvailability)}
              <span>v{pack.version}</span>
            </div>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 rounded-lg p-1.5 hover:bg-muted/40"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["info", "items"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "info" ? "Info Pack" : `Contenuti (${pack.itemCount})`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "info" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Titolo</label>
                <input value={form.title} onChange={set("title")} className="input-field w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Tema</label>
                  <input value={form.theme} onChange={set("theme")} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Difficoltà</label>
                  <select value={form.difficulty} onChange={set("difficulty")} className="input-field w-full">
                    {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Modalità</label>
                  <select value={form.modeAvailability} onChange={set("modeAvailability")} className="input-field w-full">
                    {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Stato</label>
                  <select value={form.status} onChange={set("status")} className="input-field w-full">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Descrizione</label>
                <textarea value={form.description} onChange={set("description")} rows={3} className="input-field w-full resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Tag</label>
                <input value={form.tags} onChange={set("tags")} className="input-field w-full" placeholder="separati da virgola" />
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/20 p-3 text-xs text-muted-foreground">
                <div><span className="font-semibold">Creato da:</span> {pack.createdBy === "jonny" ? "🤖 Jonny" : "👤 Admin"}</div>
                <div><span className="font-semibold">Lingua:</span> {pack.language.toUpperCase()}</div>
                <div><span className="font-semibold">Aggiornato:</span> {new Date(pack.updatedAt).toLocaleDateString("it-IT")}</div>
                <div><span className="font-semibold">Versione:</span> {pack.version}</div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/20 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Add item form */}
              <div className="flex gap-2">
                <input
                  value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddItem()}
                  placeholder="Nuovo contenuto..."
                  className="input-field flex-1 text-sm"
                />
                <input
                  value={newItemType}
                  onChange={e => setNewItemType(e.target.value)}
                  placeholder="tipo"
                  className="input-field w-24 text-sm"
                />
                <button
                  onClick={handleAddItem}
                  disabled={addingItem || !newItemTitle.trim()}
                  className="btn-primary flex items-center gap-1 px-3 py-2 text-sm"
                >
                  {addingItem ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                </button>
              </div>

              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  Nessun contenuto ancora. Aggiungi il primo item sopra.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item, idx) => (
                    <div key={item.id} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 ${!item.isActive ? "opacity-50" : ""}`}>
                      <span className="w-5 shrink-0 text-xs text-muted-foreground">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{item.title || "(senza titolo)"}</div>
                        <div className="text-xs text-muted-foreground">{item.type} · {item.difficulty}</div>
                      </div>
                      <button onClick={() => handleToggleItem(item)} className="shrink-0 rounded p-1 hover:bg-muted/40">
                        {item.isActive ? <Eye className="h-3.5 w-3.5 text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-500" />}
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)} className="shrink-0 rounded p-1 hover:bg-destructive/20">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          {tab === "info" && (
            <div className="flex items-center justify-between gap-3">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-destructive">Sicuro? Operazione irreversibile.</span>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="btn-ghost px-3 py-1.5 text-sm">Annulla</button>
                    <button onClick={handleDelete} className="rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground">Elimina</button>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm text-destructive hover:underline">
                    <Trash2 className="h-4 w-4" /> Elimina pack
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-5 py-2 text-sm">
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {saving ? "Salvando…" : "Salva modifiche"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminContentPacks() {
  const [packs, setPacks] = useState<GameContentPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterGame, setFilterGame] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDiff, setFilterDiff] = useState("");
  const [filterMode, setFilterMode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<GameContentPack | null>(null);

  const loadPacks = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterGame)   params.set("gameSlug", filterGame);
      if (filterStatus) params.set("status", filterStatus);
      if (filterDiff)   params.set("difficulty", filterDiff);
      if (filterMode)   params.set("mode", filterMode);
      const data = await apiFetch(`/game-content-packs?${params}`);
      setPacks(data as GameContentPack[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [filterGame, filterStatus, filterDiff, filterMode]);

  useEffect(() => { void loadPacks(); }, [loadPacks]);

  async function handleToggleActive(pack: GameContentPack) {
    const updated = await apiFetch(`/game-content-packs/${pack.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !pack.isActive }),
    });
    setPacks(prev => prev.map(p => p.id === pack.id ? updated as GameContentPack : p));
    if (selected?.id === pack.id) setSelected(updated as GameContentPack);
  }

  const filtered = packs.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.theme ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, GameContentPack[]>>((acc, p) => {
    (acc[p.gameSlug] ??= []).push(p); return acc;
  }, {});

  return (
    <AdminLayout title="Content Packs">
      <div className="flex h-full flex-col">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border bg-background/80 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca pack…"
                className="input-field w-full pl-9 text-sm"
              />
            </div>

            {/* Filters */}
            <select value={filterGame} onChange={e => setFilterGame(e.target.value)} className="input-field text-sm py-2">
              <option value="">Tutti i giochi</option>
              {GAME_SLUGS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm py-2">
              <option value="">Tutti gli stati</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)} className="input-field text-sm py-2">
              <option value="">Difficoltà</option>
              {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="input-field text-sm py-2">
              <option value="">Modalità</option>
              {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            <button onClick={loadPacks} title="Aggiorna" className="btn-ghost rounded-lg p-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
              <Plus className="h-4 w-4" /> Nuovo Pack
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/20 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <PackageOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-lg font-semibold text-muted-foreground">Nessun pack trovato</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Crea il primo pack con il pulsante "Nuovo Pack"</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 flex items-center gap-2 px-5 py-2.5 text-sm">
                <Plus className="h-4 w-4" /> Crea Pack
              </button>
            </div>
          )}

          {!loading && Object.entries(grouped).map(([slug, gamePacks]) => (
            <div key={slug} className="mb-8">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {gameName(slug)} <span className="ml-2 text-xs text-muted-foreground/50">({gamePacks.length})</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {gamePacks.map(pack => (
                  <div
                    key={pack.id}
                    className={`group relative cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg ${!pack.isActive ? "opacity-60" : ""}`}
                    onClick={() => setSelected(pack)}
                  >
                    {/* Status dot */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(pack.status)}
                          {modeBadge(pack.modeAvailability)}
                          {pack.createdBy === "jonny" && (
                            <span className="flex items-center gap-1 rounded-full bg-purple-900/40 px-2 py-0.5 text-xs text-purple-300">
                              <Sparkles className="h-3 w-3" /> Jonny
                            </span>
                          )}
                        </div>
                        <h4 className="mt-2 font-bold leading-tight">{pack.title}</h4>
                        {pack.theme && <p className="text-xs text-muted-foreground mt-0.5">tema: {pack.theme}</p>}
                      </div>
                    </div>

                    {pack.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{pack.description}</p>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      {diffBadge(pack.difficulty)}
                      <span>{pack.itemCount} item{pack.itemCount !== 1 ? "s" : ""}</span>
                      {pack.tags && pack.tags.length > 0 && (
                        <span className="truncate">{pack.tags.slice(0, 2).join(", ")}</span>
                      )}
                    </div>

                    {/* Actions overlay */}
                    <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleActive(pack); }}
                        title={pack.isActive ? "Disattiva" : "Attiva"}
                        className="rounded-lg p-1.5 hover:bg-muted/60"
                      >
                        {pack.isActive
                          ? <ToggleRight className="h-4 w-4 text-emerald-400" />
                          : <ToggleLeft className="h-4 w-4 text-zinc-500" />}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setSelected(pack); }}
                        className="rounded-lg p-1.5 hover:bg-muted/60"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreatePackModal
          onClose={() => setShowCreate(false)}
          onCreated={pack => {
            setPacks(prev => [pack, ...prev]);
            setShowCreate(false);
            setSelected(pack);
          }}
        />
      )}

      {selected && (
        <EditPackDrawer
          pack={selected}
          onClose={() => setSelected(null)}
          onUpdated={updated => {
            setPacks(prev => prev.map(p => p.id === updated.id ? updated : p));
            setSelected(updated);
          }}
          onDeleted={id => {
            setPacks(prev => prev.filter(p => p.id !== id));
            setSelected(null);
          }}
        />
      )}
    </AdminLayout>
  );
}

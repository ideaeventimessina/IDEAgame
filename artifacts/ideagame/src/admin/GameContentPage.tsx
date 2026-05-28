import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from './AdminLayout';
import { ArrowLeft, Sparkles, Plus, Edit2, Trash2, Copy, Home, Tv, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Game definitions ──────────────────────────────────────────────────────────

const GAMES: Record<string, { label: string; emoji: string; color: string; desc: string; themes: string[] }> = {
  'adult-only': {
    label: 'Adult Only',
    emoji: '🔞',
    color: '#EF4444',
    desc: 'Verità e obblighi per livello 1–5',
    themes: ['Serata classica', 'Matrimonio hot', 'Compleanno', 'Amici del cuore', 'Ufficio', 'Estate', 'Capodanno', 'Custom'],
  },
  'saramusica': {
    label: 'SaraMusica',
    emoji: '🎵',
    color: '#60A5FA',
    desc: 'Round musicali e clip YouTube',
    themes: ['Anni 80', 'Anni 90', 'Anni 2000', 'Sanremo', 'Sigle TV', 'Disney', 'Rock', 'Dance', 'Trap/Urban', 'Misto'],
  },
  'quizzone': {
    label: 'Quizzone',
    emoji: '❓',
    color: '#10B981',
    desc: 'Domande multi-lingua per il quiz show',
    themes: ['Cultura Generale', 'Cinema', 'Musica', 'Sport', 'Matrimonio', 'Anni 90', 'Sicilia', 'Bambini', 'Custom'],
  },
  'parola-alle-spalle': {
    label: 'Parola alle Spalle',
    emoji: '🗣️',
    color: '#8B5CF6',
    desc: 'Parole e categorie per indovinare',
    themes: ['Cinema', 'Animali', 'Cibo italiano', 'Sport', 'Celebrity', 'Oggetti casa', 'Professioni', 'Custom'],
  },
  'percorso-risate': {
    label: 'Percorso a Risate',
    emoji: '⚡',
    color: '#F59E0B',
    desc: 'Set di sfide: mimo, ballo, veloce…',
    themes: ['Serata classica', 'Matrimonio', 'Compleanno 40', 'Estate', 'Natale', 'Team building', 'Custom'],
  },
  'karaoke-battle': {
    label: 'Karaoke Battle',
    emoji: '🎤',
    color: '#F97316',
    desc: 'Canzoni e testi per il karaoke',
    themes: ['Anni 80', 'Anni 90', 'Anni 2000', 'Classici italiani', 'Pop internazionale', 'Tormentoni estate', 'Custom'],
  },
};

// ── Media slot definitions per game ──────────────────────────────────────────

type SlotType = 'youtube' | 'image' | 'audio';
interface MediaSlotDef { key: string; label: string; type: SlotType; icon: string; hint: string }

const MEDIA_SLOTS: Record<string, MediaSlotDef[]> = {
  'adult-only': [
    { key: 'background_music',    label: 'Musica di sottofondo',  type: 'youtube', icon: '🎵', hint: 'URL YouTube — la music loopata durante il gioco' },
    { key: 'spin_bottle_sound',   label: 'Suono bottiglia spin',   type: 'youtube', icon: '🍾', hint: 'URL YouTube — effetto gira-gira' },
    { key: 'success_sound',       label: 'Suono successo ✅',       type: 'youtube', icon: '✅', hint: 'URL YouTube — sfida completata' },
    { key: 'failure_sound',       label: 'Suono fallimento ❌',     type: 'youtube', icon: '❌', hint: 'URL YouTube — sfida fallita' },
    { key: 'jonny_reaction_url',  label: 'Jonny reaction (image)', type: 'image',   icon: '🤖', hint: 'URL immagine — Jonny sticker/GIF' },
  ],
  'saramusica': [
    { key: 'intro_sting',         label: 'Jingle intro',           type: 'youtube', icon: '🎬', hint: 'URL YouTube — stacchetto apertura' },
    { key: 'correct_sound',       label: 'Risposta corretta',       type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara risposta giusta' },
    { key: 'wrong_sound',         label: 'Risposta sbagliata',      type: 'youtube', icon: '❌', hint: 'URL YouTube — suono risposta errata' },
    { key: 'countdown_music',     label: 'Musica countdown',        type: 'youtube', icon: '⏳', hint: 'URL YouTube — loop attesa' },
    { key: 'youtube_playlist',    label: 'Playlist clip YouTube',   type: 'youtube', icon: '📺', hint: 'URL YouTube — playlist clip musicali' },
  ],
  'parola-alle-spalle': [
    { key: 'thinking_loop',       label: 'Musica attesa',           type: 'youtube', icon: '🤔', hint: 'URL YouTube — loop durante il turno' },
    { key: 'correct_reveal',      label: 'Risposta corretta',       type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara successo' },
    { key: 'wrong_reveal',        label: 'Risposta sbagliata',      type: 'youtube', icon: '❌', hint: 'URL YouTube — suono fallimento' },
    { key: 'jonny_idle',          label: 'Jonny posa idle',         type: 'image',   icon: '🤖', hint: 'URL immagine — Jonny in attesa' },
    { key: 'jonny_celebration',   label: 'Jonny celebration',       type: 'image',   icon: '🎉', hint: 'URL immagine — Jonny festeggia' },
  ],
  'quizzone': [
    { key: 'question_reveal',     label: 'Reveal domanda',          type: 'youtube', icon: '❓', hint: 'URL YouTube — stacchetto domanda' },
    { key: 'timer_tick',          label: 'Tick timer',              type: 'youtube', icon: '⏱️', hint: 'URL YouTube — countdown sound' },
    { key: 'correct_sound',       label: 'Risposta corretta',       type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara risposta giusta' },
    { key: 'wrong_sound',         label: 'Risposta sbagliata',      type: 'youtube', icon: '❌', hint: 'URL YouTube — suono errore' },
  ],
  'percorso-risate': [
    { key: 'laugh_track',         label: 'Laugh track',             type: 'youtube', icon: '😂', hint: 'URL YouTube — risate pubblico' },
    { key: 'mission_intro',       label: 'Intro missione',          type: 'youtube', icon: '⚡', hint: 'URL YouTube — stacchetto sfida' },
    { key: 'timer_loop',          label: 'Loop timer',              type: 'youtube', icon: '⏳', hint: 'URL YouTube — musica countdown' },
    { key: 'audience_reaction',   label: 'Reazione pubblico',       type: 'youtube', icon: '👏', hint: 'URL YouTube — applausi/boato' },
  ],
  'karaoke-battle': [
    { key: 'intro_music',         label: 'Musica intro',            type: 'youtube', icon: '🎤', hint: 'URL YouTube — apertura karaoke' },
    { key: 'battle_sting',        label: 'Battle intro sting',      type: 'youtube', icon: '⚔️', hint: 'URL YouTube — sfida suono' },
    { key: 'applause',            label: 'Applausi',                type: 'youtube', icon: '👏', hint: 'URL YouTube — public applaude' },
    { key: 'boo_sound',           label: 'Buuu',                    type: 'youtube', icon: '😤', hint: 'URL YouTube — fischi pubblico' },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pack {
  id: string;
  title: string;
  theme: string | null;
  difficulty: string;
  modeAvailability: string;
  isActive: boolean;
  itemCount: number;
  createdBy: string;
  status: string;
  createdAt: string;
}

interface MediaSlot {
  id: string;
  slotKey: string;
  value: string;
  valueType: string;
  label: string;
}

interface PackItem {
  id: string;
  type: string;
  title: string;
  payloadJson: Record<string, unknown> | null;
  sortOrder: number;
  isActive: boolean;
}

// ── Adult Only level config ───────────────────────────────────────────────────

const ADULT_LEVELS = [
  { level: 1, label: 'Sociale',  emoji: '🥂',  color: '#34D399' },
  { level: 2, label: 'Flirt',    emoji: '💋',  color: '#FB7185' },
  { level: 3, label: 'Hot',      emoji: '🔥',  color: '#EF4444' },
  { level: 4, label: 'Spinto',   emoji: '🔒',  color: '#A855F7' },
  { level: 5, label: 'Esclusivo',emoji: '🌙',  color: '#818CF8' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function modeHomeActive(mode: string)  { return mode === 'home' || mode === 'both'; }
function modeLiveActive(mode: string)  { return mode === 'live' || mode === 'both'; }
function toggleMode(mode: string, home: boolean, live: boolean): string {
  if (home && live)  return 'both';
  if (home)          return 'home';
  if (live)          return 'live';
  return 'none';
}

const DIFF_LABELS: Record<string, { emoji: string; color: string }> = {
  easy:   { emoji: '🟢', color: '#34D399' },
  medium: { emoji: '🟡', color: '#FBBF24' },
  hard:   { emoji: '🔴', color: '#F87171' },
  mixed:  { emoji: '🌈', color: '#A78BFA' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameContentPage({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const game = GAMES[slug];
  const C = game?.color ?? '#60A5FA';

  // ── Generator state ─────────────────────────────────────────────────────────
  const [themeName,  setThemeName]  = useState('');
  const [themeInput, setThemeInput] = useState('');
  const [showThemeSugg, setShowThemeSugg] = useState(false);
  const [difficulty,   setDifficulty]   = useState<'easy' | 'medium' | 'hard'>('medium');
  const [genCount,     setGenCount]     = useState(10);
  const [generating,   setGenerating]   = useState(false);
  const [genMsg,       setGenMsg]       = useState('');

  // ── Packs state ─────────────────────────────────────────────────────────────
  const [packs,    setPacks]    = useState<Pack[]>([]);
  const [loadingP, setLoadingP] = useState(true);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // ── Pack item expansion state ─────────────────────────────────────────────────
  const [expandedPackId,   setExpandedPackId]   = useState<string | null>(null);
  const [packItems,        setPackItems]        = useState<PackItem[]>([]);
  const [loadingItems,     setLoadingItems]     = useState(false);
  const [addingCell,       setAddingCell]       = useState<string | null>(null); // "verita_1" format
  const [addText,          setAddText]          = useState('');

  // ── Media slots state ────────────────────────────────────────────────────────
  const [slots,     setSlots]     = useState<MediaSlot[]>([]);
  const [slotEdits, setSlotEdits] = useState<Record<string, string>>({});
  const [slotSaved, setSlotSaved] = useState<Record<string, boolean>>({});

  // ── Load packs ───────────────────────────────────────────────────────────────
  const loadPacks = useCallback(async () => {
    setLoadingP(true);
    try {
      const r = await fetch(`/api/game-content-packs?gameSlug=${encodeURIComponent(slug)}`, { credentials: 'include' });
      const data = await r.json() as Pack[];
      setPacks(Array.isArray(data) ? data : []);
    } finally {
      setLoadingP(false);
    }
  }, [slug]);

  // ── Load media slots ─────────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    const r = await fetch(`/api/game-media-slots?gameSlug=${encodeURIComponent(slug)}`, { credentials: 'include' });
    const data = await r.json() as MediaSlot[];
    setSlots(Array.isArray(data) ? data : []);
    const edits: Record<string, string> = {};
    (Array.isArray(data) ? data : []).forEach(s => { edits[s.slotKey] = s.value; });
    setSlotEdits(edits);
  }, [slug]);

  useEffect(() => { void loadPacks(); void loadSlots(); }, [loadPacks, loadSlots]);

  // ── Load pack items ───────────────────────────────────────────────────────────
  const loadPackItems = useCallback(async (packId: string) => {
    setLoadingItems(true);
    try {
      const r = await fetch(`/api/game-content-packs/${packId}/items`, { credentials: 'include' });
      const data = await r.json() as PackItem[];
      setPackItems(Array.isArray(data) ? data : []);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const toggleExpand = async (packId: string) => {
    if (expandedPackId === packId) {
      setExpandedPackId(null);
      setPackItems([]);
    } else {
      setExpandedPackId(packId);
      await loadPackItems(packId);
    }
  };

  const deleteItem = async (itemId: string) => {
    await fetch(`/api/game-content-items/${itemId}`, { method: 'DELETE', credentials: 'include' });
    if (expandedPackId) await loadPackItems(expandedPackId);
    await loadPacks();
  };

  const addItem = async (category: 'verita' | 'obbligo', level: number) => {
    if (!addText.trim() || !expandedPackId) return;
    await fetch(`/api/game-content-packs/${expandedPackId}/items`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: category,
        title: addText.trim(),
        payloadJson: { category, text: addText.trim(), level, durationSeconds: 60 },
        difficulty: level <= 2 ? 'easy' : level <= 3 ? 'medium' : 'hard',
      }),
    });
    setAddText('');
    setAddingCell(null);
    await loadPackItems(expandedPackId);
    await loadPacks();
  };

  // ── Generate ─────────────────────────────────────────────────────────────────
  const generate = async () => {
    const name = themeName.trim() || themeInput.trim();
    if (!name) { setGenMsg('Inserisci un nome per il tema'); return; }
    setGenerating(true);
    setGenMsg('');
    try {
      const r = await fetch('/api/game-content-packs/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: slug, themeName: name, difficulty, count: genCount }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as Record<string,unknown>;
        setGenMsg(`❌ ${String(err['error'] ?? `Errore ${r.status}`)}`);
        return;
      }
      const data = await r.json() as { itemCount?: number; source?: string; warning?: string };
      const sourceLabel = data.source === 'ai' ? '⭐ AI' : '📦 statico';
      const warnPart = data.warning ? ` · ${data.warning}` : '';
      setGenMsg(`✅ "${name}" — ${data.itemCount ?? 0} elementi [${sourceLabel}]${warnPart}`);
      setThemeName(''); setThemeInput('');
      await loadPacks();
    } catch { setGenMsg('❌ Errore di rete'); }
    finally { setGenerating(false); }
  };

  // ── Toggle home/live ─────────────────────────────────────────────────────────
  const togglePackMode = async (pack: Pack, which: 'home' | 'live') => {
    const home = which === 'home' ? !modeHomeActive(pack.modeAvailability) : modeHomeActive(pack.modeAvailability);
    const live = which === 'live' ? !modeLiveActive(pack.modeAvailability) : modeLiveActive(pack.modeAvailability);
    const newMode = toggleMode(pack.modeAvailability, home, live);
    await fetch(`/api/game-content-packs/${pack.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modeAvailability: newMode }),
    });
    await loadPacks();
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deletePack = async (id: string, title: string) => {
    if (!confirm(`Elimina "${title}"? Saranno eliminati anche tutti gli elementi.`)) return;
    await fetch(`/api/game-content-packs/${id}`, { method: 'DELETE', credentials: 'include' });
    await loadPacks();
  };

  // ── Duplicate ────────────────────────────────────────────────────────────────
  const duplicatePack = async (id: string) => {
    await fetch(`/api/game-content-packs/${id}/duplicate`, { method: 'POST', credentials: 'include' });
    await loadPacks();
  };

  // ── Rename ───────────────────────────────────────────────────────────────────
  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    await fetch(`/api/game-content-packs/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editName.trim() }),
    });
    setEditId(null);
    await loadPacks();
  };

  // ── Save media slot ──────────────────────────────────────────────────────────
  const saveSlot = async (def: MediaSlotDef) => {
    const value = (slotEdits[def.key] ?? '').trim();
    await fetch('/api/game-media-slots', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSlug: slug, slotKey: def.key, value, valueType: def.type, label: def.label }),
    });
    setSlotSaved(p => ({ ...p, [def.key]: true }));
    setTimeout(() => setSlotSaved(p => ({ ...p, [def.key]: false })), 2000);
    await loadSlots();
  };

  if (!game) return (
    <AdminLayout title="Gioco non trovato">
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🎮</div>
        <div className="text-muted-foreground">Gioco "{slug}" non trovato.</div>
        <button onClick={() => navigate('/admin/giochi')} className="mt-6 rounded-xl px-5 py-2 text-sm font-bold border border-border hover-elevate">← Torna ai Giochi</button>
      </div>
    </AdminLayout>
  );

  const slotDefs = MEDIA_SLOTS[slug] ?? [];

  return (
    <AdminLayout title={`${game.emoji} ${game.label}`}>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => navigate('/admin/giochi')} className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Giochi
          </button>
          <span>/</span>
          <span style={{ color: C }} className="font-bold">{game.label}</span>
        </div>

        {/* ── SECTION 1: AI Generator ─────────────────────────────────────── */}
        <div className="rounded-3xl p-6 space-y-5"
          style={{ background: `linear-gradient(135deg, ${C}12, ${C}05, rgba(0,0,0,0.4))`, border: `1.5px solid ${C}35` }}>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-xl" style={{ background: `${C}22`, border: `1.5px solid ${C}44` }}>
              <Sparkles className="h-5 w-5" style={{ color: C }} />
            </div>
            <div>
              <div className="font-black text-foreground text-base">✨ Genera Nuovo Tema con AI</div>
              <div className="text-xs text-muted-foreground">Jonny crea contenuti su misura per questo gioco</div>
            </div>
          </div>

          {/* Theme name */}
          <div className="relative">
            <input
              value={themeInput}
              onChange={e => { setThemeInput(e.target.value); setThemeName(''); }}
              onFocus={() => setShowThemeSugg(true)}
              onBlur={() => setTimeout(() => setShowThemeSugg(false), 150)}
              placeholder="Nome del tema (es. Compleanno 40, Estate 2025…)"
              className="w-full rounded-2xl px-4 py-3 text-sm font-bold bg-card border border-border focus:outline-none focus:ring-1 placeholder:text-muted-foreground/40"
              style={{ '--tw-ring-color': C } as React.CSSProperties}
            />
            {themeName && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: C }}>
                ✓ {themeName}
              </div>
            )}

            {/* Suggestion dropdown */}
            {showThemeSugg && game.themes.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-2xl overflow-hidden border border-border bg-card shadow-2xl">
                {game.themes.map(t => (
                  <button key={t}
                    onMouseDown={() => { setThemeName(t); setThemeInput(t); setShowThemeSugg(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-accent transition-colors">
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Difficulty + count row */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as const).map(d => {
                const { emoji, color } = DIFF_LABELS[d]!;
                return (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className="rounded-xl px-4 py-2 text-xs font-black transition-all border"
                    style={{
                      background: difficulty === d ? `${color}25` : 'transparent',
                      borderColor: difficulty === d ? `${color}80` : 'rgba(255,255,255,0.1)',
                      color: difficulty === d ? color : 'rgba(255,255,255,0.5)',
                      boxShadow: difficulty === d ? `0 0 12px ${color}40` : 'none',
                    }}>
                    {emoji} {d === 'easy' ? 'Facile' : d === 'medium' ? 'Medio' : 'Difficile'}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">Elementi:</span>
              {[5, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setGenCount(n)}
                  className="rounded-xl px-3 py-1.5 text-xs font-black transition-all border"
                  style={{
                    background: genCount === n ? `${C}22` : 'transparent',
                    borderColor: genCount === n ? `${C}60` : 'rgba(255,255,255,0.1)',
                    color: genCount === n ? C : 'rgba(255,255,255,0.4)',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => void generate()}
              disabled={generating || (!themeInput.trim() && !themeName)}
              className="flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-black text-black disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${C}, ${C}aa)`, boxShadow: generating ? 'none' : `0 0 30px ${C}55` }}>
              {generating ? (
                <><span className="animate-spin">⭐</span> Jonny sta generando…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> GENERA</>
              )}
            </button>
            {genMsg && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="text-sm font-bold" style={{ color: genMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>
                {genMsg}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── SECTION 2: Theme list ────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-black text-foreground text-lg">📦 Temi Creati</div>
            <div className="text-sm text-muted-foreground">{packs.length} tema{packs.length !== 1 ? 'i' : ''}</div>
          </div>

          {loadingP ? (
            <div className="flex items-center gap-3 py-8 text-muted-foreground text-sm">
              <div className="animate-spin">⭐</div> Caricamento…
            </div>
          ) : packs.length === 0 ? (
            <div className="rounded-2xl py-12 text-center border border-dashed border-border">
              <div className="text-4xl mb-3">🎭</div>
              <div className="text-muted-foreground text-sm font-bold">Nessun tema creato</div>
              <div className="text-muted-foreground/60 text-xs mt-1">Usa il generatore qui sopra per creare il primo tema</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AnimatePresence>
                {packs.map(pack => {
                  const diff = DIFF_LABELS[pack.difficulty] ?? DIFF_LABELS['medium']!;
                  const homeOn = modeHomeActive(pack.modeAvailability);
                  const liveOn = modeLiveActive(pack.modeAvailability);
                  const isEditing = editId === pack.id;

                  return (
                    <motion.div key={pack.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-2xl p-4 flex flex-col gap-3"
                      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${pack.isActive ? C + '30' : 'rgba(255,255,255,0.08)'}` }}>

                      {/* Header */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                className="flex-1 rounded-xl px-3 py-1.5 text-sm font-bold bg-card border border-border focus:outline-none"
                                autoFocus onKeyDown={e => { if (e.key === 'Enter') void saveRename(pack.id); if (e.key === 'Escape') setEditId(null); }} />
                              <button onClick={() => void saveRename(pack.id)}
                                className="rounded-xl px-3 py-1.5 text-xs font-black bg-primary text-primary-foreground">✓</button>
                              <button onClick={() => setEditId(null)} className="rounded-xl px-3 py-1.5 text-xs text-muted-foreground border border-border">✕</button>
                            </div>
                          ) : (
                            <div className="font-black text-sm text-foreground leading-tight truncate">{pack.title}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs font-bold" style={{ color: diff.color }}>{diff.emoji} {pack.difficulty}</span>
                            <span className="text-muted-foreground/40 text-xs">·</span>
                            <span className="text-xs text-muted-foreground">{pack.itemCount} elem.</span>
                            {pack.createdBy === 'jonny' && (
                              <><span className="text-muted-foreground/40 text-xs">·</span>
                              <span className="text-xs font-bold" style={{ color: C }}>⭐ AI</span></>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Home / Live toggles */}
                      <div className="flex gap-2">
                        <button onClick={() => void togglePackMode(pack, 'home')}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all"
                          style={{
                            background: homeOn ? 'rgba(96,165,250,0.2)'  : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${homeOn ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            color: homeOn ? '#60A5FA' : 'rgba(255,255,255,0.3)',
                          }}>
                          <Home className="h-3 w-3" /> HOME {homeOn ? 'ON' : 'OFF'}
                        </button>
                        <button onClick={() => void togglePackMode(pack, 'live')}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all"
                          style={{
                            background: liveOn ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${liveOn ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            color: liveOn ? '#F97316' : 'rgba(255,255,255,0.3)',
                          }}>
                          <Tv className="h-3 w-3" /> LIVE {liveOn ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => void toggleExpand(pack.id)}
                          className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all"
                          style={{
                            background: expandedPackId === pack.id ? `${C}22` : 'transparent',
                            border: `1.5px solid ${expandedPackId === pack.id ? C + '60' : 'rgba(255,255,255,0.12)'}`,
                            color: expandedPackId === pack.id ? C : 'rgba(255,255,255,0.5)',
                          }}>
                          {expandedPackId === pack.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {expandedPackId === pack.id ? 'Nascondi carte' : 'Sfoglia carte'}
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => { setEditId(pack.id); setEditName(pack.title); }}
                          className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground border border-border hover-elevate transition-colors">
                          <Edit2 className="h-3 w-3" /> Rinomina
                        </button>
                        <button onClick={() => void duplicatePack(pack.id)}
                          className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground border border-border hover-elevate transition-colors">
                          <Copy className="h-3 w-3" /> Duplica
                        </button>
                        <button onClick={() => void deletePack(pack.id, pack.title)}
                          className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 transition-colors">
                          <Trash2 className="h-3 w-3" /> Elimina
                        </button>
                      </div>

                      {/* ── Adult Only expanded items ─────────────────────── */}
                      <AnimatePresence>
                      {expandedPackId === pack.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-3 border-t border-border/40 space-y-4">
                            {loadingItems ? (
                              <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                                <span className="animate-spin">⭐</span> Caricamento carte…
                              </div>
                            ) : slug === 'adult-only' ? (
                              /* Adult Only: grid Livelli × Categoria */
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                  {(['verita', 'obbligo'] as const).map(cat => (
                                    <div key={cat} className="text-center text-xs font-black uppercase tracking-widest py-1.5 rounded-xl"
                                      style={{
                                        background: cat === 'verita' ? 'rgba(96,165,250,0.15)' : 'rgba(249,115,22,0.15)',
                                        color: cat === 'verita' ? '#60A5FA' : '#F97316',
                                        border: `1px solid ${cat === 'verita' ? 'rgba(96,165,250,0.3)' : 'rgba(249,115,22,0.3)'}`,
                                      }}>
                                      {cat === 'verita' ? '💬 Verità' : '🎯 Obblighi'}
                                    </div>
                                  ))}
                                </div>

                                {ADULT_LEVELS.map(lvl => {
                                  const rowItems = packItems.filter(it => {
                                    const pay = it.payloadJson ?? {};
                                    const itemLevel = Number((pay as Record<string,unknown>)['level'] ?? 1);
                                    return itemLevel === lvl.level || (lvl.level === 1 && itemLevel === 0);
                                  });

                                  return (
                                    <div key={lvl.level} className="rounded-2xl overflow-hidden"
                                      style={{ border: `1px solid ${lvl.color}25` }}>
                                      {/* Level header */}
                                      <div className="flex items-center gap-2 px-3 py-2"
                                        style={{ background: `${lvl.color}12` }}>
                                        <span className="text-base">{lvl.emoji}</span>
                                        <span className="text-xs font-black" style={{ color: lvl.color }}>
                                          Livello {lvl.level} — {lvl.label}
                                        </span>
                                        <span className="ml-auto text-[10px] text-muted-foreground">
                                          {rowItems.length} carte
                                        </span>
                                      </div>

                                      {/* 2 columns: verità | obblighi */}
                                      <div className="grid grid-cols-2 gap-0 divide-x divide-border/30">
                                        {(['verita', 'obbligo'] as const).map(cat => {
                                          const cellKey = `${cat}_${lvl.level}`;
                                          const cellItems = rowItems.filter(it => it.type === cat);
                                          const isAdding = addingCell === cellKey;

                                          return (
                                            <div key={cat} className="p-2 space-y-1.5">
                                              {cellItems.map(item => (
                                                <div key={item.id}
                                                  className="group flex items-start gap-1.5 rounded-xl px-2 py-1.5 text-xs text-foreground/80"
                                                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                  <span className="flex-1 leading-relaxed">{item.title}</span>
                                                  <button
                                                    onClick={() => void deleteItem(item.id)}
                                                    className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-red-400/60 hover:text-red-400 transition-all">
                                                    <X className="h-2.5 w-2.5" />
                                                  </button>
                                                </div>
                                              ))}

                                              {isAdding ? (
                                                <div className="space-y-1">
                                                  <textarea
                                                    autoFocus
                                                    value={addText}
                                                    onChange={e => setAddText(e.target.value)}
                                                    placeholder="Testo della carta…"
                                                    rows={2}
                                                    className="w-full rounded-xl px-2 py-1.5 text-xs bg-card border border-border focus:outline-none resize-none"
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addItem(cat, lvl.level); }
                                                      if (e.key === 'Escape') { setAddingCell(null); setAddText(''); }
                                                    }}
                                                  />
                                                  <div className="flex gap-1">
                                                    <button onClick={() => void addItem(cat, lvl.level)}
                                                      className="flex-1 rounded-lg py-1 text-[10px] font-black"
                                                      style={{ background: `${lvl.color}30`, color: lvl.color }}>✓ Aggiungi</button>
                                                    <button onClick={() => { setAddingCell(null); setAddText(''); }}
                                                      className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground border border-border">✕</button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <button
                                                  onClick={() => { setAddingCell(cellKey); setAddText(''); }}
                                                  className="w-full flex items-center gap-1 rounded-xl px-2 py-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-border/40 hover:border-border/60 transition-colors">
                                                  <Plus className="h-2.5 w-2.5" /> Aggiungi
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Generic items list for other games */
                              <div className="space-y-1.5">
                                {packItems.length === 0 ? (
                                  <div className="text-xs text-muted-foreground/60 py-2">Nessun elemento — genera il tema con AI per popolare.</div>
                                ) : packItems.map(item => (
                                  <div key={item.id}
                                    className="group flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <span className="font-mono text-muted-foreground/40 w-5 text-right shrink-0">{item.sortOrder + 1}</span>
                                    <span className="flex-1 text-foreground/80 leading-relaxed">{item.title}</span>
                                    <span className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5"
                                      style={{ background: `${C}15`, color: C }}>{item.type}</span>
                                    <button onClick={() => void deleteItem(item.id)}
                                      className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-red-400/60 hover:text-red-400 transition-all">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Media Boxes ───────────────────────────────────────── */}
        {slotDefs.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="font-black text-foreground text-lg">🎛️ Media Assets</div>
              <div className="text-xs text-muted-foreground rounded-full px-2 py-0.5 border border-border">
                Audio/Video: YouTube URL &nbsp;·&nbsp; Immagini: URL diretto
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slotDefs.map(def => {
                const saved = slotSaved[def.key];
                const currentVal = slotEdits[def.key] ?? '';

                return (
                  <div key={def.key} className="rounded-2xl p-4 space-y-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{def.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-foreground">{def.label}</div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{def.hint}</div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5"
                        style={{
                          background: def.type === 'youtube' ? 'rgba(239,68,68,0.15)' : def.type === 'image' ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)',
                          color: def.type === 'youtube' ? '#f87171' : def.type === 'image' ? '#60A5FA' : '#a78bfa',
                        }}>
                        {def.type}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={currentVal}
                        onChange={e => setSlotEdits(p => ({ ...p, [def.key]: e.target.value }))}
                        placeholder={def.type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                        className="flex-1 rounded-xl px-3 py-2 text-xs bg-card border border-border focus:outline-none placeholder:text-muted-foreground/30"
                        onKeyDown={e => { if (e.key === 'Enter') void saveSlot(def); }}
                      />
                      <button onClick={() => void saveSlot(def)}
                        className="rounded-xl px-3 py-2 text-xs font-black transition-all flex items-center gap-1"
                        style={{
                          background: saved ? 'rgba(34,197,94,0.2)' : `${C}22`,
                          border: `1px solid ${saved ? 'rgba(34,197,94,0.5)' : C + '44'}`,
                          color: saved ? '#4ade80' : C,
                        }}>
                        {saved ? <Check className="h-3 w-3" /> : 'Salva'}
                      </button>
                    </div>

                    {currentVal && (
                      <div className="text-[10px] text-muted-foreground/50 truncate">{currentVal}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rules reminder */}
        <div className="rounded-2xl p-4 flex items-start gap-3 text-xs"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-lg shrink-0">📋</div>
          <div className="space-y-1 text-muted-foreground">
            <div><span className="text-foreground font-bold">Testo:</span> generato da AI Jonny</div>
            <div><span className="text-foreground font-bold">Immagini:</span> generate da AI OPPURE URL placeholder</div>
            <div><span className="text-foreground font-bold">Audio/Suoni:</span> solo YouTube URL OPPURE DB media library</div>
            <div><span className="text-foreground font-bold">Animazioni:</span> asset media salvati o pose Jonny</div>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}

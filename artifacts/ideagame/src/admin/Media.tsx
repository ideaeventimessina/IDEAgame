import { useRef, useState, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { Image as ImageIcon, Music, Video, Upload, Trash2, Loader2, Link, Search, Youtube, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useListMedia, useCreateMedia, useDeleteMedia,
  getListMediaQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

// ── Game media slot definitions ────────────────────────────────────────────────

type SlotType = 'youtube' | 'image' | 'audio';
interface SlotDef { key: string; label: string; type: SlotType; icon: string; hint: string }

const GAME_ORDER: { slug: string; label: string; emoji: string; color: string; slots: SlotDef[] }[] = [
  {
    slug: 'adult-only', label: 'Adult Only', emoji: '🔞', color: '#EF4444',
    slots: [
      { key: 'background_music',  label: 'Musica di sottofondo',     type: 'youtube', icon: '🎵', hint: 'URL YouTube — loop durante il gioco' },
      { key: 'spin_bottle_sound', label: 'Suono bottiglia spin',      type: 'youtube', icon: '🍾', hint: 'URL YouTube — effetto gira-gira' },
      { key: 'success_sound',     label: 'Suono successo ✅',          type: 'youtube', icon: '✅', hint: 'URL YouTube — sfida completata' },
      { key: 'failure_sound',     label: 'Suono fallimento ❌',        type: 'youtube', icon: '❌', hint: 'URL YouTube — sfida fallita' },
      { key: 'vote_open_sound',   label: 'Suono apertura voto',       type: 'youtube', icon: '🗳️', hint: 'URL YouTube — voto aperto' },
      { key: 'jonny_reaction_url',label: 'Jonny reaction (immagine)', type: 'image',   icon: '🤖', hint: 'URL immagine — Jonny sticker/GIF' },
    ],
  },
  {
    slug: 'saramusica', label: 'SaraMusica', emoji: '🎵', color: '#60A5FA',
    slots: [
      { key: 'intro_sting',      label: 'Jingle intro',             type: 'youtube', icon: '🎬', hint: 'URL YouTube — stacchetto apertura' },
      { key: 'correct_sound',    label: 'Risposta corretta',         type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara risposta giusta' },
      { key: 'wrong_sound',      label: 'Risposta sbagliata',        type: 'youtube', icon: '❌', hint: 'URL YouTube — suono errore' },
      { key: 'countdown_music',  label: 'Musica countdown',          type: 'youtube', icon: '⏳', hint: 'URL YouTube — loop attesa' },
      { key: 'youtube_playlist', label: 'Playlist clip YouTube',     type: 'youtube', icon: '📺', hint: 'URL YouTube — playlist clip musicali' },
      { key: 'background_visual',label: 'Sfondo visivo',             type: 'image',   icon: '🌅', hint: 'URL immagine — sfondo proiettore' },
    ],
  },
  {
    slug: 'quizzone', label: 'Quizzone', emoji: '❓', color: '#10B981',
    slots: [
      { key: 'question_reveal',  label: 'Reveal domanda',            type: 'youtube', icon: '❓', hint: 'URL YouTube — stacchetto domanda' },
      { key: 'timer_tick',       label: 'Tick timer',                type: 'youtube', icon: '⏱️', hint: 'URL YouTube — countdown sound' },
      { key: 'correct_sound',    label: 'Risposta corretta',         type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara risposta giusta' },
      { key: 'wrong_sound',      label: 'Risposta sbagliata',        type: 'youtube', icon: '❌', hint: 'URL YouTube — suono errore' },
      { key: 'background_image', label: 'Sfondo proiettore',         type: 'image',   icon: '🖼️', hint: 'URL immagine — sfondo quiz' },
    ],
  },
  {
    slug: 'parola-alle-spalle', label: 'Parola alle Spalle', emoji: '🗣️', color: '#8B5CF6',
    slots: [
      { key: 'thinking_loop',     label: 'Musica attesa',             type: 'youtube', icon: '🤔', hint: 'URL YouTube — loop durante il turno' },
      { key: 'correct_reveal',    label: 'Risposta corretta',         type: 'youtube', icon: '✅', hint: 'URL YouTube — fanfara successo' },
      { key: 'wrong_reveal',      label: 'Risposta sbagliata',        type: 'youtube', icon: '❌', hint: 'URL YouTube — suono fallimento' },
      { key: 'time_expired',      label: 'Tempo scaduto',             type: 'youtube', icon: '⏰', hint: 'URL YouTube — suono fine tempo' },
      { key: 'jonny_idle',        label: 'Jonny posa idle',           type: 'image',   icon: '🤖', hint: 'URL immagine — Jonny in attesa' },
      { key: 'jonny_celebration', label: 'Jonny celebration',         type: 'image',   icon: '🎉', hint: 'URL immagine — Jonny festeggia' },
    ],
  },
  {
    slug: 'percorso-risate', label: 'Percorso a Risate', emoji: '⚡', color: '#F59E0B',
    slots: [
      { key: 'red_alarm',        label: 'Red alarm sound',           type: 'youtube', icon: '🚨', hint: 'URL YouTube — allarme rosso sfida' },
      { key: 'laugh_track',      label: 'Laugh track',               type: 'youtube', icon: '😂', hint: 'URL YouTube — risate pubblico' },
      { key: 'mission_intro',    label: 'Intro missione',            type: 'youtube', icon: '⚡', hint: 'URL YouTube — stacchetto sfida' },
      { key: 'timer_loop',       label: 'Loop timer',                type: 'youtube', icon: '⏳', hint: 'URL YouTube — musica countdown' },
      { key: 'audience_reaction',label: 'Reazione pubblico',         type: 'youtube', icon: '👏', hint: 'URL YouTube — applausi/boato' },
      { key: 'jonny_idle',       label: 'Jonny posa idle',           type: 'image',   icon: '🤖', hint: 'URL immagine — Jonny in attesa' },
    ],
  },
  {
    slug: 'karaoke-battle', label: 'Karaoke Battle', emoji: '🎤', color: '#F97316',
    slots: [
      { key: 'intro_music',    label: 'Musica intro',                type: 'youtube', icon: '🎤', hint: 'URL YouTube — apertura karaoke' },
      { key: 'battle_sting',   label: 'Battle intro sting',          type: 'youtube', icon: '⚔️', hint: 'URL YouTube — suono sfida' },
      { key: 'applause',       label: 'Applausi',                    type: 'youtube', icon: '👏', hint: 'URL YouTube — pubblico applaude' },
      { key: 'boo_sound',      label: 'Buuu / fischi',               type: 'youtube', icon: '😤', hint: 'URL YouTube — fischi pubblico' },
      { key: 'transition',     label: 'Transizione canzone',         type: 'youtube', icon: '🎶', hint: 'URL YouTube — stacchetto cambio brano' },
      { key: 'queue_background',label: 'Sfondo coda',                type: 'image',   icon: '🌅', hint: 'URL immagine — sfondo lista canzoni' },
    ],
  },
  {
    slug: 'card-sets', label: 'Gioco delle Coppie', emoji: '🃏', color: '#EC4899',
    slots: [
      { key: 'card_back_image', label: 'Retro carta',                type: 'image',   icon: '🃏', hint: 'URL immagine — retro delle carte' },
      { key: 'match_sound',     label: 'Suono match ✅',              type: 'youtube', icon: '✅', hint: 'URL YouTube — coppia trovata' },
      { key: 'mismatch_sound',  label: 'Suono mismatch ❌',           type: 'youtube', icon: '❌', hint: 'URL YouTube — coppia sbagliata' },
      { key: 'reveal_sound',    label: 'Suono reveal',               type: 'youtube', icon: '✨', hint: 'URL YouTube — flip carta' },
      { key: 'win_fanfare',     label: 'Fanfara vittoria',            type: 'youtube', icon: '🏆', hint: 'URL YouTube — qualcuno vince' },
    ],
  },
  {
    slug: 'sfida-ballo', label: 'Sfida di Ballo', emoji: '💃', color: '#A855F7',
    slots: [
      { key: 'dance_intro',    label: 'Intro ballo',                 type: 'youtube', icon: '💃', hint: 'URL YouTube — intro sfida danza' },
      { key: 'round_start',    label: 'Inizio round',                type: 'youtube', icon: '▶️', hint: 'URL YouTube — round start sound' },
      { key: 'round_end',      label: 'Fine round',                  type: 'youtube', icon: '⏹️', hint: 'URL YouTube — round end sound' },
      { key: 'energy_boost',   label: 'Energy boost',                type: 'youtube', icon: '⚡', hint: 'URL YouTube — boost energetico' },
      { key: 'background_loop',label: 'Loop musicale sfondo',        type: 'youtube', icon: '🎵', hint: 'URL YouTube — musica di sfondo' },
    ],
  },
];

// ── Generic library types ─────────────────────────────────────────────────────

type MediaKind = 'image' | 'audio' | 'video';

interface FilterDef {
  key: string; label: string; emoji: string;
  match: (kind: string, tags: string[]) => boolean;
  defaultKind: MediaKind;
}

const MEDIA_FILTERS: FilterDef[] = [
  { key: 'all',     label: 'Tutti',    emoji: '📁', match: () => true,                                                      defaultKind: 'image' },
  { key: 'image',   label: 'Immagini', emoji: '🖼️',  match: (k) => k === 'image',                                           defaultKind: 'image' },
  { key: 'audio',   label: 'Audio',    emoji: '🎵', match: (k) => k === 'audio',                                           defaultKind: 'audio' },
  { key: 'youtube', label: 'YouTube',  emoji: '▶️',  match: (_, t) => t.includes('youtube') || t.includes('yt'),            defaultKind: 'video' },
  { key: 'sfondo',  label: 'Sfondi',   emoji: '🌅', match: (_, t) => t.includes('sfondo') || t.includes('background'),     defaultKind: 'image' },
];

async function uploadFileToStorage(file: File): Promise<string> {
  const res = await fetch('/api/storage/uploads/request-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
  });
  if (!res.ok) throw new Error('Errore ottenimento URL di upload');
  const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };
  await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  return `/api/storage${objectPath}`;
}

// ── Game Slot Editor ──────────────────────────────────────────────────────────

interface SlotRow { id: string; slotKey: string; value: string; valueType: string; label: string }

function GameSlotSection({ game }: { game: typeof GAME_ORDER[number] }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const C = game.color;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/game-media-slots?gameSlug=${encodeURIComponent(game.slug)}`, { credentials: 'include' });
      const data = await r.json() as SlotRow[];
      setSlots(Array.isArray(data) ? data : []);
      const e: Record<string, string> = {};
      (Array.isArray(data) ? data : []).forEach(s => { e[s.slotKey] = s.value; });
      setEdits(e);
    } finally { setLoading(false); }
  }, [game.slug]);

  const toggle = () => {
    if (!open) { setOpen(true); void load(); }
    else setOpen(false);
  };

  const save = async (def: SlotDef) => {
    const value = (edits[def.key] ?? '').trim();
    await fetch('/api/game-media-slots', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSlug: game.slug, slotKey: def.key, value, valueType: def.type, label: def.label }),
    });
    setSaved(p => ({ ...p, [def.key]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [def.key]: false })), 2000);
    void load();
  };

  const filledCount = game.slots.filter(s => (edits[s.key] ?? '').trim()).length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C}30` }}>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 p-4 text-left transition-all hover:opacity-90"
        style={{ background: `linear-gradient(135deg, ${C}12, ${C}06, rgba(0,0,0,0.3))` }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0"
          style={{ background: `${C}22`, border: `1.5px solid ${C}44` }}>
          {game.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-foreground">{game.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {filledCount}/{game.slots.length} slot configurati
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filledCount > 0 && (
            <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black"
              style={{ background: `${C}20`, color: C, border: `1px solid ${C}40` }}>
              {filledCount} ✓
            </div>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="p-4 pt-3 border-t space-y-3" style={{ borderColor: `${C}20` }}>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <span className="animate-spin">⭐</span> Caricamento slot…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {game.slots.map(def => {
                const isSaved = saved[def.key];
                const val = edits[def.key] ?? '';
                const typeBg = def.type === 'youtube' ? 'rgba(239,68,68,0.15)' : def.type === 'image' ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)';
                const typeC = def.type === 'youtube' ? '#f87171' : def.type === 'image' ? '#60A5FA' : '#a78bfa';

                return (
                  <div key={def.key} className="rounded-xl p-3 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{def.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-foreground">{def.label}</div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{def.hint}</div>
                      </div>
                      <span className="text-[10px] font-black uppercase rounded-full px-1.5 py-0.5 shrink-0"
                        style={{ background: typeBg, color: typeC }}>{def.type}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={val}
                        onChange={e => setEdits(p => ({ ...p, [def.key]: e.target.value }))}
                        placeholder={def.type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                        className="flex-1 rounded-lg px-2.5 py-1.5 text-xs bg-card border border-border focus:outline-none placeholder:text-muted-foreground/30"
                        onKeyDown={e => { if (e.key === 'Enter') void save(def); }}
                      />
                      <button onClick={() => void save(def)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-black transition-all flex items-center gap-1 shrink-0"
                        style={{
                          background: isSaved ? 'rgba(34,197,94,0.2)' : `${C}22`,
                          border: `1px solid ${isSaved ? 'rgba(34,197,94,0.5)' : C + '44'}`,
                          color: isSaved ? '#4ade80' : C,
                        }}>
                        {isSaved ? <Check className="h-3 w-3" /> : 'Salva'}
                      </button>
                    </div>
                    {val && (
                      <div className="text-[10px] text-muted-foreground/40 truncate">{val}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Media() {
  const [activeTab, setActiveTab] = useState<'slots' | 'library'>('slots');

  const qc = useQueryClient();
  const { data: media = [], isLoading } = useListMedia();
  const create = useCreateMedia();
  const del = useDeleteMedia();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'image' as MediaKind, url: '', tags: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  const refresh = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });
  const filterDef = MEDIA_FILTERS.find(f => f.key === activeFilter) ?? MEDIA_FILTERS[0]!;
  const filtered = media.filter(m => {
    const tags: string[] = (m.tags ?? []) as string[];
    return filterDef.match(m.kind, tags) && (!search || m.name.toLowerCase().includes(search.toLowerCase()));
  });
  const countFor = (f: FilterDef) => media.filter(m => f.match(m.kind, (m.tags ?? []) as string[])).length;

  const openAddModal = () => {
    setForm({ name: '', kind: filterDef.defaultKind, url: '', tags: activeFilter !== 'all' ? activeFilter : '' });
    setUploadMode('file'); setUploadError(null); setOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const url = await uploadFileToStorage(file);
      const kind: MediaKind = file.type.startsWith('audio') ? 'audio' : file.type.startsWith('video') ? 'video' : 'image';
      setForm(f => ({ ...f, url, kind, name: f.name || file.name.replace(/\.[^.]+$/, '') }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fallito');
    } finally { setUploading(false); if (e.target) e.target.value = ''; }
  };

  const handleSave = async () => {
    if (!form.name || !form.url) return;
    const tags = form.tags.split(',').map(tg => tg.trim()).filter(Boolean);
    await create.mutateAsync({ data: { name: form.name, kind: form.kind, url: form.url, tags, sizeBytes: 0 } });
    setOpen(false); setForm({ name: '', kind: 'image', url: '', tags: '' }); setUploadError(null); refresh();
  };

  const kindTone = (kind: string) => kind === 'image' ? '#F5B642' : kind === 'audio' ? '#9B5DE5' : '#00F5A0';

  return (
    <AdminLayout title="Media 🎛️">

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 rounded-2xl p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {([
          { key: 'slots',   label: '🎛️ Slot Giochi',   desc: 'Audio/Video/Immagini per gioco' },
          { key: 'library', label: '🗂️ Libreria Media', desc: 'Archivio generale upload' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex-1 flex flex-col items-center py-3 rounded-xl text-sm font-black transition-all"
            style={{
              background: activeTab === tab.key ? 'rgba(245,182,66,0.15)' : 'transparent',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--muted-foreground)',
              border: activeTab === tab.key ? '1.5px solid rgba(245,182,66,0.4)' : '1.5px solid transparent',
            }}>
            {tab.label}
            <span className="text-[10px] font-normal mt-0.5 opacity-60">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: Slot Giochi ─────────────────────────────────────────────────── */}
      {activeTab === 'slots' && (
        <div className="space-y-3 max-w-4xl">
          <div className="rounded-2xl p-3 flex items-center gap-3 text-xs"
            style={{ background: 'rgba(245,182,66,0.06)', border: '1px solid rgba(245,182,66,0.15)' }}>
            <span className="text-lg shrink-0">💡</span>
            <span className="text-muted-foreground">
              Incolla URL YouTube per audio/suoni. Incolla URL immagine diretta per sfondi e Jonny poses.
              I valori vengono usati automaticamente durante il gioco in Home Mode e LiveControl.
            </span>
          </div>
          {GAME_ORDER.map(game => (
            <GameSlotSection key={game.slug} game={game} />
          ))}
        </div>
      )}

      {/* ── TAB: Libreria Media ───────────────────────────────────────────────── */}
      {activeTab === 'library' && (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {MEDIA_FILTERS.map(f => {
              const cnt = countFor(f);
              const active = activeFilter === f.key;
              return (
                <button key={f.key} onClick={() => setActiveFilter(f.key)}
                  className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    borderColor: active ? 'var(--primary)' : 'var(--border)',
                    background:  active ? 'rgba(245,182,66,0.12)' : 'transparent',
                    color:       active ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}>
                  {f.emoji} {f.label}
                  <span className="ml-1 rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px]">{cnt}</span>
                </button>
              );
            })}
          </div>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome…"
                className="w-full rounded-xl border border-border bg-background/40 pl-9 pr-4 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <button onClick={openAddModal}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground whitespace-nowrap">
              <Upload className="h-4 w-4" />
              {activeFilter !== 'all' ? `+ ${filterDef.emoji} ${filterDef.label}` : 'Aggiungi media'}
            </button>
          </div>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(m => {
                const tags: string[] = (m.tags ?? []) as string[];
                const tone = kindTone(m.kind);
                return (
                  <div key={m.id} className="rounded-2xl border border-border bg-card overflow-hidden group">
                    {m.kind === 'image' && m.url ? (
                      <div className="flex h-36 items-center justify-center overflow-hidden bg-secondary/30">
                        <img src={m.url} alt={m.name} className="h-full w-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    ) : m.kind === 'audio' && m.url ? (
                      <div className="flex h-36 flex-col items-center justify-center gap-2 px-4"
                        style={{ background: `linear-gradient(135deg,${tone}22,transparent)`, color: tone }}>
                        <Music className="h-9 w-9" />
                        <audio controls src={m.url} className="w-full h-8" style={{ colorScheme: 'dark' }} />
                      </div>
                    ) : m.kind === 'video' && tags.some(t => t === 'youtube' || t === 'yt') ? (
                      <div className="flex h-36 items-center justify-center"
                        style={{ background: 'linear-gradient(135deg,#FF000022,transparent)' }}>
                        <Youtube className="h-12 w-12 text-red-500" />
                      </div>
                    ) : (
                      <div className="flex h-36 items-center justify-center"
                        style={{ background: `linear-gradient(135deg,${tone}33,transparent)`, color: tone }}>
                        <ImageIcon className="h-12 w-12" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-display font-bold truncate text-sm">{m.name}</div>
                        <button onClick={async () => { if (confirm('Eliminare?')) { await del.mutateAsync({ id: m.id }); refresh(); } }}
                          className="rounded-lg border border-border p-1.5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tags.map(tg => <span key={tg} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{tg}</span>)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/40 py-16 text-center">
                  <div className="text-4xl mb-2">{filterDef.emoji}</div>
                  <div className="text-sm text-muted-foreground">
                    {search ? `Nessun risultato per "${search}"` : `Nessun media per ${filterDef.label} ancora.`}
                  </div>
                  <button onClick={openAddModal}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 border border-primary/40 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/25">
                    <Upload className="h-3.5 w-3.5" /> Aggiungi il primo
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black mb-1">Aggiungi media</div>
            <div className="mb-3 text-sm text-muted-foreground">
              Filtro: <span className="font-bold text-primary">{filterDef.emoji} {filterDef.label}</span>
            </div>
            <div className="flex gap-1 mb-4 rounded-xl border border-border bg-secondary/30 p-1">
              <button onClick={() => setUploadMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'file' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
                <Upload className="h-3.5 w-3.5" /> Upload file
              </button>
              <button onClick={() => setUploadMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'url' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
                <Link className="h-3.5 w-3.5" /> Incolla URL
              </button>
            </div>
            <div className="space-y-3">
              {uploadMode === 'file' ? (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*" onChange={handleFileChange} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/20 py-8 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50">
                    {uploading
                      ? <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Upload in corso…</span></>
                      : <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clicca per scegliere un file</span></>}
                  </button>
                  {form.url && <div className="mt-2 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 break-all">✓ {form.url}</div>}
                  {uploadError && <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">{uploadError}</div>}
                </div>
              ) : (
                <input placeholder="https://…" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary" />
              )}
              <input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as MediaKind })}
                className="w-full rounded-lg border border-border bg-background/40 px-3 py-2">
                <option value="image">🖼️ Immagine</option>
                <option value="audio">🎵 Audio</option>
                <option value="video">🎬 Video</option>
              </select>
              <input placeholder="Tag separati da virgola (es. youtube, sfondo)" value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })}
                className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => { setOpen(false); setUploadError(null); }}
                className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button disabled={create.isPending || uploading || !form.name || !form.url}
                onClick={handleSave}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">
                {create.isPending ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

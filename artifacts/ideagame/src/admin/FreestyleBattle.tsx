import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Mic, Music } from "lucide-react";
import { AdminLayout } from "@/admin/AdminLayout";
import { JonnyGenerateBanner } from "@/components/JonnyGenerateBanner";
import { ProjectorPreview } from "@/admin/ProjectorPreview";

const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${import.meta.env.BASE_URL}api${path}`, { credentials: "include", ...opts }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    if (r.status === 204) return null;
    return r.json();
  });

interface FreestyleSet { id: string; title: string; description: string; language: string; beatUrl: string | null; isActive: boolean; }
interface FreestyleWordRow { id: string; setId: string; word: string; orderIndex: number; isActive: boolean; }

export default function AdminFreestyleBattle() {
  const qc = useQueryClient();
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [newSetBeat, setNewSetBeat] = useState("");
  const [newWord, setNewWord] = useState("");
  const [msg, setMsg] = useState("");

  const { data: sets = [] } = useQuery<FreestyleSet[]>({
    queryKey: ["freestyle-sets"],
    queryFn: () => apiFetch("/freestyle/sets"),
  });

  const { data: words = [] } = useQuery<FreestyleWordRow[]>({
    queryKey: ["freestyle-words", selectedSetId],
    queryFn: () => apiFetch(`/freestyle/sets/${selectedSetId}/words`),
    enabled: !!selectedSetId,
  });

  const createSet = useMutation({
    mutationFn: () => apiFetch("/freestyle/sets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSetTitle.trim(), beatUrl: newSetBeat.trim() || undefined }),
    }),
    onSuccess: (row: FreestyleSet) => {
      qc.invalidateQueries({ queryKey: ["freestyle-sets"] });
      setNewSetTitle(""); setNewSetBeat("");
      setSelectedSetId(row.id);
      setMsg("✓ Set creato");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const deleteSet = useMutation({
    mutationFn: (id: string) => apiFetch(`/freestyle/sets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["freestyle-sets"] }); setSelectedSetId(null); },
  });

  const addWord = useMutation({
    mutationFn: () => apiFetch(`/freestyle/sets/${selectedSetId}/words`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: newWord.trim(), orderIndex: words.length }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["freestyle-words", selectedSetId] }); setNewWord(""); },
    onError: (e: Error) => setMsg(e.message),
  });

  const deleteWord = useMutation({
    mutationFn: (id: string) => apiFetch(`/freestyle/words/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freestyle-words", selectedSetId] }),
  });

  const selectedSet = sets.find((s) => s.id === selectedSetId);

  return (
    <AdminLayout title="Freestyle Battle">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Mic className="h-6 w-6 text-orange-400" />
          <div>
            <h1 className="text-display text-2xl font-black">Freestyle Battle</h1>
            <p className="text-sm text-muted-foreground">Gestisci i set di parole per il rap improvvisato</p>
          </div>
        </div>

        <JonnyGenerateBanner gameSlug="freestyle-battle" gameLabel="Freestyle Battle" />

        <FreestyleBeatsManager />

        {msg && (
          <div className={`rounded-xl px-4 py-2 text-sm ${msg.startsWith("✓") ? "border border-green-500/40 bg-green-500/10 text-green-400" : "border border-destructive/40 bg-destructive/10 text-destructive"}`}>
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Left: Set list */}
          <div className="md:col-span-1 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Set di parole</div>

            {/* Create new set */}
            <div className="rounded-2xl border border-dashed border-orange-500/30 bg-card p-4 space-y-2">
              <input
                value={newSetTitle}
                onChange={(e) => setNewSetTitle(e.target.value)}
                placeholder="Nome set…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={newSetBeat}
                onChange={(e) => setNewSetBeat(e.target.value)}
                placeholder="URL beat (opzionale)…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={!newSetTitle.trim() || createSet.isPending}
                onClick={() => createSet.mutate()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Crea set
              </button>
            </div>

            {sets.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedSetId(s.id)}
                className={`cursor-pointer rounded-2xl border p-3 transition-all ${selectedSetId === s.id ? "border-orange-500/60 bg-orange-500/10" : "border-border bg-card hover:border-orange-500/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm">{s.title}</div>
                    {s.beatUrl && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Music className="h-3 w-3" /> Beat configurato
                      </div>
                    )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSet.mutate(s.id); }}
                    className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  </div>
                </div>
              </div>
            ))}

            {sets.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">Nessun set — creane uno</div>
            )}
          </div>

          {/* Right: Word editor */}
          <div className="md:col-span-2">
            {!selectedSet ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground text-sm py-16">
                Seleziona un set per gestire le parole
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-lg">{selectedSet.title}</div>
                    <div className="text-xs text-muted-foreground">{words.length} parole · min 15 per una round completa</div>
                  </div>
                  {words.length < 15 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
                      ⚠ Aggiungi almeno {15 - words.length} parole
                    </span>
                  )}
                  {words.length >= 15 && (
                    <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-400">
                      ✓ Set completo
                    </span>
                  )}
                </div>

                {/* Beat URL editor */}
                {selectedSet.beatUrl && (
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 flex items-center gap-3">
                    <Music className="h-4 w-4 text-orange-400 shrink-0" />
                    <a href={selectedSet.beatUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-orange-300 underline truncate flex-1">
                      {selectedSet.beatUrl}
                    </a>
                  </div>
                )}

                {/* Add word */}
                <div className="flex gap-2">
                  <input
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newWord.trim() && addWord.mutate()}
                    placeholder="Nuova parola…"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!newWord.trim() || addWord.isPending}
                    onClick={() => addWord.mutate()}
                    className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Word grid */}
                <div className="flex flex-wrap gap-2">
                  {words.map((w) => (
                    <div key={w.id} className="group flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5">
                      <span className="text-sm font-bold text-orange-200">{w.word}</span>
                      <button
                        onClick={() => deleteWord.mutate(w.id)}
                        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-destructive hover:bg-destructive/10 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {words.length === 0 && (
                    <div className="text-xs text-muted-foreground py-2">Nessuna parola ancora</div>
                  )}
                </div>

                {/* ─── Anteprima proiettore ──────────────────── */}
                {words.length > 0 && (
                  <ProjectorPreview total={words.length} accentColor="#fb923c">
                    {idx => {
                      const w = words[idx]!;
                      return (
                        <div className="flex flex-col items-center justify-center gap-6 px-8 py-10 text-center min-h-[260px]">
                          <div className="flex items-center gap-2 text-orange-400 text-sm font-bold uppercase tracking-widest">
                            <Mic className="h-5 w-5" /> Freestyle Battle
                          </div>
                          <div className="text-display font-black text-white leading-none"
                            style={{ fontSize: 'clamp(3.5rem,10vw,6rem)' }}>
                            {w.word}
                          </div>
                          <div className="text-white/40 text-xs font-mono">
                            {selectedSet?.title} · {idx + 1}/{words.length}
                          </div>
                        </div>
                      );
                    }}
                  </ProjectorPreview>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── 10 basi beat (id/titolo rispecchiano FREESTYLE_BEATS lato server) ─────────
const BEAT_SLOTS: { id: string; title: string; bpm: number }[] = [
  { id: "beat-01", title: "Trap Roma",       bpm: 140 },
  { id: "beat-02", title: "Boom Bap Milano", bpm:  90 },
  { id: "beat-03", title: "Drill Napoli",    bpm: 135 },
  { id: "beat-04", title: "Lo-fi Venezia",   bpm:  75 },
  { id: "beat-05", title: "RnB Roma",        bpm:  85 },
  { id: "beat-06", title: "Afrobeat Italia", bpm: 100 },
  { id: "beat-07", title: "Latin Remix",     bpm: 110 },
  { id: "beat-08", title: "Old School 90s",  bpm:  95 },
  { id: "beat-09", title: "Electronic Drop", bpm: 128 },
  { id: "beat-10", title: "Acoustic Vibes",  bpm:  70 },
];

async function uploadBeatFile(file: File): Promise<string> {
  const base = (import.meta.env.BASE_URL as string) ?? "/";
  const res = await fetch(`${base}api/storage/uploads/request-url`.replace(/\/\//g, "/"), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "audio/mpeg" }),
  });
  if (!res.ok) throw new Error("Errore URL upload");
  const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };
  const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "audio/mpeg" } });
  if (!put.ok) throw new Error("Upload fallito");
  return `/api/storage${objectPath}`;
}

function FreestyleBeatsManager() {
  const qc = useQueryClient();
  const { data: slots = [] } = useQuery<{ slotKey: string; value: string }[]>({
    queryKey: ["freestyle-beats"],
    queryFn: () => apiFetch("/game-media-slots?gameSlug=freestyle-battle"),
  });
  const valueByKey = new Map(slots.map((s) => [s.slotKey, s.value]));
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (b: { id: string; title: string; url: string }) =>
      apiFetch("/game-media-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug: "freestyle-battle", slotKey: b.id, value: b.url, valueType: "audio", label: b.title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freestyle-beats"] }),
  });

  async function onFile(beat: { id: string; title: string }, file: File) {
    setUploadingId(beat.id);
    try {
      const url = await uploadBeatFile(file);
      await save.mutateAsync({ id: beat.id, title: beat.title, url });
    } catch { /* noop */ } finally { setUploadingId(null); }
  }

  const filledCount = BEAT_SLOTS.filter((b) => (drafts[b.id] ?? valueByKey.get(b.id) ?? "").trim()).length;

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Music className="h-5 w-5 text-orange-400" />
        <div className="font-black">Le 10 basi beat</div>
        <div className="ml-auto text-xs text-muted-foreground">{filledCount}/10 pronte</div>
      </div>
      <p className="text-xs text-muted-foreground">Carica un file audio o incolla un URL per ogni base. Girano a caso durante le battle freestyle.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {BEAT_SLOTS.map((beat) => {
          const current = valueByKey.get(beat.id) ?? "";
          const draft = drafts[beat.id] ?? current;
          const filled = !!current.trim();
          return (
            <div key={beat.id} className="rounded-xl border border-border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <span>{filled ? "🎵" : "⬜"}</span> {beat.title}
                <span className="text-xs font-normal text-muted-foreground">{beat.bpm} BPM</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [beat.id]: e.target.value }))}
                  placeholder="URL audio…"
                  className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
                />
                <button
                  onClick={() => save.mutate({ id: beat.id, title: beat.title, url: draft.trim() })}
                  disabled={save.isPending}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                >Salva</button>
                <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover-elevate">
                  {uploadingId === beat.id ? "…" : "📁"}
                  <input type="file" accept="audio/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(beat, f); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

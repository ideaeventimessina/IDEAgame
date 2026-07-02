/**
 * /admin/show — punto d'ingresso della Modalità Live.
 * Crea una stanza Live (che crea anche la Home session collegata) e mostra
 * per ogni stanza: codici (TV / Presentatore / Giocatori), QR ingresso
 * giocatori e link per aprire TV / Presentatore / Regia in nuove tab.
 */
import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, MonitorPlay, Mic2, SlidersHorizontal, Plus, StopCircle } from 'lucide-react';
import { AdminLayout } from './AdminLayout';

const BASE_URL = (import.meta.env.BASE_URL as string) ?? '/';
const api = (path: string) => `${BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`.replace(/\/\/+/g, '/');
const appUrl = (path: string) => `${window.location.origin}${api(path)}`;

interface LiveRow {
  live: {
    id: string; name: string; status: 'active' | 'ended';
    tvCode: string; presenterCode: string; homeSessionId: string | null; createdAt: string;
  };
  home: { id: string; joinCode: string; status: string; gameSlug: string | null } | null;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}: </span>
      <span className="font-mono text-sm font-black">{value}</span>
    </div>
  );
}

export default function AdminShow() {
  const [rows, setRows] = useState<LiveRow[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(api('api/live/sessions'), { credentials: 'include' });
      if (!r.ok) { setErr(`Errore caricamento (${r.status})`); return; }
      setRows(await r.json() as LiveRow[]);
      setErr(null);
    } catch { setErr('Connessione fallita'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true); setErr(null);
    try {
      const r = await fetch(api('api/live/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr((b as { error?: string }).error ?? `Errore ${r.status}`);
        return;
      }
      setName('');
      await load();
    } catch { setErr('Connessione fallita'); }
    finally { setCreating(false); }
  }

  async function endRoom(id: string) {
    if (!window.confirm('Terminare questa stanza Live? La TV e i telefoni verranno scollegati.')) return;
    await fetch(api(`api/live/sessions/${id}/end`), { method: 'POST', credentials: 'include' }).catch(() => {});
    await load();
  }

  const active = (rows ?? []).filter(r => r.live.status === 'active');
  const ended = (rows ?? []).filter(r => r.live.status !== 'active');

  return (
    <AdminLayout title="Show / Live">
      <div className="mx-auto max-w-4xl">
        {/* ── Crea stanza ── */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-1 text-lg font-black">Nuova stanza Live</div>
          <p className="mb-3 text-sm text-muted-foreground">
            Crea la stanza e la sua Home session collegata: la TV Live mostra la stessa esperienza della
            modalità Home (QR gigante, board, giochi) — Presentatore e Regia la comandano.
          </p>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80}
              onKeyDown={e => { if (e.key === 'Enter') void create(); }}
              placeholder="Nome serata (es. Matrimonio Anna & Marco)"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary" />
            <button onClick={() => void create()} disabled={creating || !name.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-40">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crea stanza
            </button>
          </div>
          {err && <div className="mt-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">{err}</div>}
        </div>

        {/* ── Stanze attive ── */}
        <div className="mt-6">
          {rows === null && <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
          {rows !== null && active.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nessuna stanza Live attiva — creane una qui sopra.
            </div>
          )}
          <div className="flex flex-col gap-4">
            {active.map(({ live, home }) => {
              const joinUrl = home ? `${window.location.origin}/home/join?s=${home.joinCode}` : '';
              return (
                <div key={live.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xl font-black">{live.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Live {live.id.slice(0, 8)} · Home {home?.id.slice(0, 8) ?? '—'} · {home?.gameSlug ? `In gioco: ${home.gameSlug}` : 'In attesa'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip label="Giocatori" value={home?.joinCode ?? '—'} />
                        <Chip label="TV" value={live.tvCode} />
                        <Chip label="Presenter" value={live.presenterCode} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => window.open(appUrl(`live-tv?code=${live.tvCode}`), '_blank')}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold hover-elevate">
                          <MonitorPlay className="h-4 w-4" /> Apri TV
                        </button>
                        <button onClick={() => window.open(appUrl(`live-presenter?code=${live.presenterCode}`), '_blank')}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold hover-elevate">
                          <Mic2 className="h-4 w-4" /> Apri Presentatore
                        </button>
                        <button onClick={() => window.open(appUrl(`live-regia?code=${live.presenterCode}`), '_blank')}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold hover-elevate">
                          <SlidersHorizontal className="h-4 w-4" /> Apri Regia
                        </button>
                        <button onClick={() => void endRoom(live.id)}
                          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">
                          <StopCircle className="h-4 w-4" /> Termina
                        </button>
                      </div>
                    </div>
                    {joinUrl && (
                      <div className="shrink-0 text-center">
                        <div className="rounded-xl bg-white p-2"><QRCodeSVG value={joinUrl} size={120} bgColor="#ffffff" fgColor="#0a0820" level="M" /></div>
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">QR giocatori</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Terminate ── */}
        {ended.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Terminate</div>
            <div className="flex flex-col gap-2">
              {ended.map(({ live }) => (
                <div key={live.id} className="flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-2.5 text-sm">
                  <span className="font-bold text-muted-foreground">{live.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(live.createdAt).toLocaleDateString('it-IT')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

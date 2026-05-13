import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Wifi, WifiOff, Mic2, Play, Users } from 'lucide-react';
import { useLocation } from 'wouter';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/([^:])\/\//g, '$1/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) {
    const err = new Error('AUTH_REQUIRED') as Error & { authRequired?: boolean };
    err.authRequired = true;
    throw err;
  }
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
  return body;
}

interface LiveEvent {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  enabledGames?: string[];
}

interface Player {
  id: string;
  nickname?: string;
  name?: string;
  isConnected?: boolean;
  avatarColor?: string;
}

const GAME_LABELS: Record<string, string> = {
  quizzone: 'Quizzone',
  'gioco-coppie': 'Gioco delle Coppie',
  'gioco-delle-coppie': 'Gioco delle Coppie',
  'percorso-a-risate': 'Percorso a Risate',
  'adult-only': 'Adult Only',
  'sfida-ballo': 'Sfida di Ballo',
  'parola-alle-spalle': 'Parola alle Spalle',
  'karaoke-battle': 'Karaoke Battle',
  'freestyle-battle': 'Freestyle Battle',
  saramusica: 'SaraMusica',
};

export default function PresenterLive() {
  const [, navigate] = useLocation();
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [connected, setConnected] = useState(false);
  const [dashboardLive, setDashboardLive] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const state = await apiFetch('/events/public/live-state') as { event: LiveEvent | null; players: Player[] };
      const live = state.event;
      setEvent(live);
      setPlayers(Array.isArray(state.players) ? state.players : []);
      if (!live) {
        setDashboardLive(false);
      }
      setConnected(true);
    } catch (e) {
      setConnected(false);
      if ((e as { authRequired?: boolean })?.authRequired) {
        navigate(`/login?next=${encodeURIComponent('/presenter')}`);
      }
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleAuthError = (e: unknown) => {
    if ((e as { authRequired?: boolean })?.authRequired) {
      navigate(`/login?next=${encodeURIComponent('/presenter')}`);
      return true;
    }
    return false;
  };

  const showDashboard = async () => {
    if (!event?.id) return;
    setBusy(true);
    try {
      await apiFetch(`/panic/events/${event.id}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'hub:phase', payload: { phase: 'gameboard' } }),
      });
      setDashboardLive(true);
    } catch (e) {
      if (!handleAuthError(e)) console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const startGame = async (slug: string) => {
    if (!event?.id) return;
    setBusy(true);
    try {
      await apiFetch(`/events/${event.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: slug, totalRounds: slug === 'quizzone' ? 20 : 1 }),
      });
      await apiFetch(`/panic/events/${event.id}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'hub:phase', payload: { phase: 'gameboard' } }),
      });
    } catch (e) {
      if (!handleAuthError(e)) console.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen select-none px-5 py-6 text-white"
        style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
        <button onClick={() => navigate('/cockpit')} className="mb-8 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70">
          <ArrowLeft className="h-4 w-4" /> Cockpit
        </button>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
          <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-amber-400/35 bg-amber-400/10">
            <Clock className="h-10 w-10 text-amber-300" />
          </div>
          <div className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">Presentatore in attesa</div>
          <h1 className="mt-3 text-3xl font-black">Aspetto la Regia</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            La regia deve premere Avvia partita. Poi qui compariranno giocatori e comandi.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
            {connected ? <Wifi className="h-3.5 w-3.5 text-green-400" /> : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
            Collegamento pronto
          </div>
        </div>
      </div>
    );
  }

  const enabledGames = Array.isArray(event.enabledGames) && event.enabledGames.length > 0
    ? event.enabledGames
    : ['quizzone'];

  return (
    <div className="min-h-screen select-none px-4 py-5 text-white"
      style={{ background: 'radial-gradient(ellipse 160% 90% at 50% -10%, #2d0d52 0%, #130628 45%, #060213 100%)' }}>
      <header className="mb-5 flex items-center justify-between">
        <button onClick={() => navigate('/cockpit')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70">
          <ArrowLeft className="inline h-4 w-4" /> Cockpit
        </button>
        <div className="flex items-center gap-2 text-sm font-black text-amber-300">
          <Mic2 className="h-4 w-4" />
          PRESENTATORE
        </div>
        {connected ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
      </header>

      <div className="rounded-2xl border border-green-500/25 bg-green-500/10 px-4 py-3">
        <div className="text-[10px] uppercase tracking-widest text-green-300/80">Evento live</div>
        <div className="mt-1 text-xl font-black">{event.name}</div>
        <div className="mt-1 text-xs text-white/50">Codice {event.joinCode}</div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-300" />
          <div className="text-sm font-black">Giocatori collegati: {players.length}</div>
        </div>

        {players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/55">
            In attesa che i giocatori entrino dal QR code.
          </div>
        ) : (
          <div className="grid gap-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="h-3 w-3 rounded-full" style={{ background: p.avatarColor ?? '#F5B642' }} />
                <span className="flex-1 font-bold">{p.nickname ?? p.name ?? 'Giocatore'}</span>
                <span className={p.isConnected === false ? 'text-red-300' : 'text-green-300'}>
                  {p.isConnected === false ? 'offline' : 'online'}
                </span>
              </div>
            ))}
          </div>
        )}

        {!dashboardLive ? (
          <button
            onClick={showDashboard}
            disabled={busy}
            className="mt-5 w-full rounded-2xl bg-primary px-5 py-4 text-base font-black text-primary-foreground disabled:opacity-40"
          >
            <Play className="mr-2 inline h-5 w-5" />
            {busy ? 'Avvio...' : 'Avvia partita'}
          </button>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="text-xs uppercase tracking-widest text-amber-300">Scegli gioco</div>
            <div className="grid gap-2">
              {enabledGames.map((slug) => (
                <button
                  key={slug}
                  onClick={() => startGame(slug)}
                  disabled={busy}
                  className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-left font-black text-amber-100 disabled:opacity-40"
                >
                  {GAME_LABELS[slug] ?? slug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

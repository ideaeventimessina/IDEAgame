/**
 * /live-tv?code=TV_CODE
 * TV Live: NESSUNA TV custom — renderizza la Home runtime collegata
 * (/home?s=HOME_SESSION_ID) in un iframe full-viewport, identica alla modalità Home:
 * stesso waiting screen, stesso QR gigante, stessi board/timer/classifiche.
 * L'overlay "Accedi" apre Admin/Regia/Presenter in NUOVE TAB (window.open),
 * senza mai sostituire la pagina TV.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const BASE_URL = (import.meta.env.BASE_URL as string) ?? '/';
const api = (path: string) => `${BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`.replace(/\/\/+/g, '/');
const appUrl = (path: string) => `${window.location.origin}${api(path)}`;

interface ResolveResponse {
  live: { id: string; name: string; status: string; tvCode: string };
  home: { id: string; joinCode: string; status: string };
  role: 'tv' | 'presenter';
}

export default function LiveTv() {
  const urlCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase().trim() ?? '';
  const [code, setCode] = useState(urlCode);
  const [codeInput, setCodeInput] = useState('');
  const [info, setInfo] = useState<ResolveResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);

  // Poll del resolve ogni 5s: se la home session collegata viene ricreata
  // (self-healing lato server), l'iframe si riaggancia da solo.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    async function resolve() {
      try {
        const r = await fetch(api(`api/live/resolve/${code}`), { credentials: 'include' });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          if (!cancelled) { setErr((b as { error?: string }).error ?? `Errore ${r.status}`); setInfo(null); }
          return;
        }
        const d = await r.json() as ResolveResponse;
        if (!cancelled) { setErr(null); setInfo(d); }
      } catch {
        if (!cancelled) setErr('Connessione al server fallita');
      }
    }
    void resolve();
    const t = setInterval(resolve, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [code]);

  if (!code) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6" style={{ background: '#0a0820' }}>
        <div className="text-3xl font-black text-white">📺 TV Live</div>
        <div className="text-sm" style={{ color: '#ffffff88' }}>Inserisci il codice TV della stanza (lo trovi in Admin → Show)</div>
        <input value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} maxLength={6}
          placeholder="ABC123" autoFocus
          className="w-56 rounded-2xl bg-transparent px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.3em] text-white outline-none"
          style={{ border: '2px solid rgba(245,182,66,0.5)' }} />
        <button onClick={() => { if (codeInput.length === 6) { setCode(codeInput); window.history.replaceState(null, '', `?code=${codeInput}`); } }}
          disabled={codeInput.length !== 6}
          className="rounded-2xl px-8 py-3 font-black disabled:opacity-35" style={{ background: '#F5B642', color: '#0a0820' }}>
          Apri TV
        </button>
      </div>
    );
  }

  if (err && !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#0a0820' }}>
        <div className="text-5xl">😕</div>
        <div className="text-xl font-black text-white">{err}</div>
        <button onClick={() => { setCode(''); setErr(null); }} className="rounded-2xl px-6 py-3 font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
          Cambia codice
        </button>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ background: '#0a0820' }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#F5B642' }} />
        <div className="font-bold" style={{ color: '#ffffff88' }}>Collegamento alla stanza…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: '#07061a' }}>
      {/* La stessa identica esperienza TV della modalità Home */}
      <iframe
        key={info.home.id}
        src={api(`home?s=${info.home.id}`)}
        title={`Home runtime — ${info.live.name}`}
        allow="autoplay; fullscreen"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 0 }}
      />

      {/* ── Accedi: apre pannelli in NUOVE TAB, mai sostituire la TV ── */}
      <button onClick={() => setAccessOpen(v => !v)}
        className="fixed right-3 top-3 z-[100] rounded-xl px-3 py-1.5 text-xs font-bold transition hover:opacity-100"
        style={{ background: 'rgba(10,8,32,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffffaa', backdropFilter: 'blur(8px)', opacity: 0.55 }}>
        🔑 Accedi
      </button>

      {accessOpen && (
        <div className="fixed right-3 top-12 z-[100] flex w-64 flex-col gap-2 rounded-2xl p-3"
          style={{ background: 'rgba(10,8,32,0.92)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)' }}>
          <div className="px-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: '#ffffff66' }}>
            {info.live.name} · TV {info.live.tvCode}
          </div>
          <button onClick={() => { window.open(appUrl('admin/show'), '_blank'); setAccessOpen(false); }}
            className="rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition active:scale-95"
            style={{ background: 'rgba(245,182,66,0.14)', border: '1px solid rgba(245,182,66,0.45)' }}>
            ⚙️ Admin (Show)
          </button>
          <button onClick={() => { window.open(appUrl('live-regia'), '_blank'); setAccessOpen(false); }}
            className="rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition active:scale-95"
            style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.4)' }}>
            🎛️ Regia
          </button>
          <button onClick={() => { window.open(appUrl('live-presenter'), '_blank'); setAccessOpen(false); }}
            className="rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition active:scale-95"
            style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.4)' }}>
            🎤 Presentatore
          </button>
          <div className="px-1 text-[10px]" style={{ color: '#ffffff55' }}>
            Regia e Presentatore chiedono il codice presentatore (la TV non lo conosce, per sicurezza).
          </div>
        </div>
      )}
    </div>
  );
}

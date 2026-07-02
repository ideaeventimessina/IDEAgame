/**
 * LiveRemote — telecomando della Home session collegata a una stanza Live.
 * Usato da /live-presenter (base) e /live-regia (extended).
 * Regola: ogni pulsante invia un comando REALE a /api/live/sessions/:id/command;
 * nessun pulsante scollegato dallo stato.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2 } from 'lucide-react';
import { useEventSocket } from '../hooks/useEventSocket';

const BASE_URL = (import.meta.env.BASE_URL as string) ?? '/';
const api = (path: string) => `${BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`.replace(/\/\/+/g, '/');

// Etichette dei giochi Home (slug identici a quelli del runtime Home)
const GAMES: { slug: string; name: string; emoji: string }[] = [
  { slug: 'percorso-a-risate',  name: 'Percorso a Risate',  emoji: '😂' },
  { slug: 'gioco-coppie',       name: 'Gioco delle Coppie', emoji: '💞' },
  { slug: 'quizzone',           name: 'Quizzone',           emoji: '⭐' },
  { slug: 'saramusica',         name: 'SaraMusica',         emoji: '🎵' },
  { slug: 'adult-only',         name: 'Adult Only',         emoji: '🔥' },
  { slug: 'sfida-ballo',        name: 'Sfida di Ballo',     emoji: '🕺' },
  { slug: 'parola-alle-spalle', name: 'Parola alle Spalle', emoji: '🗣️' },
  { slug: 'karaoke-battle',     name: 'Karaoke Battle',     emoji: '🎤' },
];

interface LiveInfo {
  live: { id: string; name: string; status: string; tvCode: string };
  home: { id: string; joinCode: string; status: string; gameSlug: string | null; currentRound: number; totalRounds: number };
  role: 'tv' | 'presenter';
  presenterCode?: string;
}

interface HomePlayer { id: string; nickname: string; avatarColor: string; score: number; isConnected: boolean }
interface HomeSessionState {
  id: string; joinCode: string; status: string; gameSlug: string | null;
  currentRound: number; totalRounds: number;
  gameConfig?: Record<string, unknown>; roundPayload?: Record<string, unknown>;
}

// Upload a due step (presigned URL) — stesso pattern di admin/CardSets
export async function uploadFileToStorage(file: File): Promise<string> {
  const res = await fetch(api('api/storage/uploads/request-url'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'image/jpeg' }),
  });
  if (!res.ok) throw new Error('Errore URL upload');
  const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };
  const put = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
  if (!put.ok) throw new Error('Upload fallito');
  return `/api/storage${objectPath}`;
}

function CodeChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-2"
      style={{ background: accent ? 'rgba(245,182,66,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${accent ? 'rgba(245,182,66,0.5)' : 'rgba(255,255,255,0.14)'}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#ffffff66' }}>{label}</div>
      <div className="font-mono text-sm font-black" style={{ color: accent ? '#F5B642' : '#fff' }}>{value}</div>
    </div>
  );
}

function BigButton({ label, emoji, onClick, disabled, busy, color = '#F5B642', danger }: {
  label: string; emoji: string; onClick: () => void; disabled?: boolean; busy?: boolean; color?: string; danger?: boolean;
}) {
  const c = danger ? '#F87171' : color;
  return (
    <button onClick={onClick} disabled={disabled || busy}
      className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-3 font-black transition active:scale-95 disabled:opacity-35"
      style={{ background: `${c}1f`, border: `1px solid ${c}77`, color: c, fontSize: '0.85rem' }}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-2xl leading-none">{emoji}</span>}
      <span>{label}</span>
    </button>
  );
}

// ── Coppie Live — 10 coppie reali, 2 foto ciascuna ─────────────────────────────
interface CoupleRow { name: string; imageA: string; imageB: string }

function CoppieLivePanel({ onLaunch, onClose, launching }: {
  onLaunch: (couples: CoupleRow[]) => void; onClose: () => void; launching: boolean;
}) {
  const [rows, setRows] = useState<CoupleRow[]>(Array.from({ length: 10 }, (_, i) => ({ name: `Coppia ${i + 1}`, imageA: '', imageB: '' })));
  const [uploading, setUploading] = useState<string | null>(null); // "idx-A" | "idx-B"
  const [err, setErr] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<CoupleRow>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  async function handleFile(i: number, side: 'A' | 'B', file: File) {
    setUploading(`${i}-${side}`); setErr(null);
    try {
      const url = await uploadFileToStorage(file);
      setRow(i, side === 'A' ? { imageA: url } : { imageB: url });
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(null); }
  }

  const complete = rows.filter(r => r.imageA && r.imageB);
  const ready = complete.length >= 2;

  return (
    <div className="fixed inset-0 z-[500] flex flex-col overflow-hidden" style={{ background: '#0a0820' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <div className="text-xl font-black text-white">💞 Coppie Live</div>
          <div className="text-xs" style={{ color: '#ffffff88' }}>
            Scatta o carica 2 foto per ogni coppia in sala (partner A e partner B). Coppie pronte: {complete.length}/{rows.length}
          </div>
        </div>
        <button onClick={onClose} className="rounded-xl px-4 py-2 font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>✕ Chiudi</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input value={r.name} onChange={e => setRow(i, { name: e.target.value })}
                className="w-36 shrink-0 rounded-lg bg-transparent px-2 py-1.5 text-sm font-bold text-white outline-none"
                style={{ border: '1px solid rgba(255,255,255,0.18)' }} />
              {(['A', 'B'] as const).map(side => {
                const url = side === 'A' ? r.imageA : r.imageB;
                const key = `${i}-${side}`;
                return (
                  <label key={side} className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl"
                    style={{ border: `2px dashed ${url ? '#34D399' : 'rgba(255,255,255,0.25)'}`, background: 'rgba(0,0,0,0.3)' }}>
                    {uploading === key
                      ? <Loader2 className="h-5 w-5 animate-spin text-white" />
                      : url
                        ? <img src={url} alt={`${r.name} ${side}`} className="h-full w-full object-cover" />
                        : <span className="text-center text-[10px] font-bold" style={{ color: '#ffffff77' }}>📷 Partner {side}</span>}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(i, side, f); e.target.value = ''; }} />
                  </label>
                );
              })}
              {r.imageA && r.imageB && <span className="text-lg">✅</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {rows.length < 15 && (
            <button onClick={() => setRows(p => [...p, { name: `Coppia ${p.length + 1}`, imageA: '', imageB: '' }])}
              className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>+ Aggiungi coppia</button>
          )}
          {rows.length > 2 && (
            <button onClick={() => setRows(p => p.slice(0, -1))}
              className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>− Rimuovi ultima</button>
          )}
        </div>
        {err && <div className="mt-3 rounded-xl px-4 py-2 text-sm font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>{err}</div>}
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => onLaunch(complete)} disabled={!ready || launching}
          className="w-full rounded-2xl py-4 text-lg font-black transition active:scale-[0.98] disabled:opacity-35"
          style={{ background: 'linear-gradient(135deg,#F472B6,#F5B642)', color: '#0a0820' }}>
          {launching ? 'Creo il mazzo…' : `🚀 AVVIA COPPIE LIVE (${complete.length} coppie · ${complete.length * 2} foto)`}
        </button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function LiveRemote({ extended }: { extended: boolean }) {
  const urlCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase().trim() ?? '';
  const [code, setCode] = useState(urlCode);
  const [codeInput, setCodeInput] = useState('');
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [homeState, setHomeState] = useState<HomeSessionState | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gamePicker, setGamePicker] = useState(false);
  const [coppiePanel, setCoppiePanel] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [blackoutOn, setBlackoutOn] = useState(false);
  const [rankingOn, setRankingOn] = useState(false);
  const presenterCodeRef = useRef<string>('');

  const { on, emit, connected } = useEventSocket(null);

  // ── Resolve (poll 5s: self-healing lato server può cambiare homeSessionId) ──
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    async function resolve() {
      try {
        const r = await fetch(api(`api/live/resolve/${code}`), { credentials: 'include' });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          if (!cancelled) { setResolveErr((b as { error?: string }).error ?? `Errore ${r.status}`); setInfo(null); }
          return;
        }
        const d = await r.json() as LiveInfo;
        if (cancelled) return;
        if (d.role !== 'presenter') {
          setResolveErr('Questo è un codice TV: serve il codice Presentatore/Regia.');
          setInfo(null);
          return;
        }
        presenterCodeRef.current = d.presenterCode ?? code;
        setResolveErr(null);
        setInfo(d);
      } catch {
        if (!cancelled) setResolveErr('Connessione al server fallita');
      }
    }
    void resolve();
    const t = setInterval(resolve, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [code]);

  const homeId = info?.home.id ?? null;
  const liveId = info?.live.id ?? null;

  // ── Socket: entra nella stanza home per stato in tempo reale ─────────────────
  useEffect(() => {
    if (!homeId) return;
    emit('join:home', homeId);
    return () => { emit('leave:home', homeId); };
  }, [homeId, emit]);

  useEffect(() => {
    const u1 = on<{ session: HomeSessionState; players: HomePlayer[] }>('home:state', d => { setHomeState(d.session); setPlayers(d.players); });
    const u2 = on<{ session: HomeSessionState; players: HomePlayer[] }>('home:game_started', d => { setHomeState(d.session); setPlayers(d.players); });
    const u3 = on<{ session: HomeSessionState; players: HomePlayer[] }>('home:game_ended', d => { setHomeState(d.session); setPlayers(d.players); });
    const u4 = on<{ session: HomeSessionState; players: HomePlayer[] }>('home:board', d => { setHomeState(d.session); setPlayers(d.players); });
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  }, [on]);

  // ── Polling fallback 4s ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!homeId) return;
    const t = setInterval(() => {
      fetch(api(`api/home/sessions/${homeId}`), { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((d: { session: HomeSessionState; players: HomePlayer[] } | null) => {
          if (!d) return;
          setHomeState(d.session); setPlayers(d.players);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [homeId]);

  // ── Comandi ───────────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
    if (!liveId) return false;
    setBusyCmd(command); setFeedback(null);
    try {
      const r = await fetch(api(`api/live/sessions/${liveId}/command`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-presenter-code': presenterCodeRef.current },
        credentials: 'include',
        body: JSON.stringify({ command, ...extra }),
      });
      const b = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (!r.ok) { setFeedback(`⚠️ ${(b as { error?: string }).error ?? `Errore ${r.status}`}`); return false; }
      return true;
    } catch {
      setFeedback('⚠️ Connessione fallita');
      return false;
    } finally {
      setBusyCmd(null);
    }
  }, [liveId]);

  const [launchingCoppie, setLaunchingCoppie] = useState(false);
  const launchCoppie = useCallback(async (couples: CoupleRow[]) => {
    if (!liveId) return;
    setLaunchingCoppie(true); setFeedback(null);
    try {
      const r = await fetch(api(`api/live/sessions/${liveId}/coppie`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-presenter-code': presenterCodeRef.current },
        credentials: 'include',
        body: JSON.stringify({ couples }),
      });
      const b = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (!r.ok) { setFeedback(`⚠️ ${(b as { error?: string }).error ?? `Errore ${r.status}`}`); return; }
      setCoppiePanel(false);
      setFeedback(`✅ Coppie Live avviato (${String(b['couples'] ?? couples.length)} coppie)`);
    } catch {
      setFeedback('⚠️ Connessione fallita');
    } finally {
      setLaunchingCoppie(false);
    }
  }, [liveId]);

  const playing = homeState?.status === 'playing';
  const joinCode = homeState?.joinCode ?? info?.home.joinCode ?? '';
  const joinUrl = joinCode ? `${window.location.origin}/home/join?s=${joinCode}` : '';
  const currentGame = useMemo(() => GAMES.find(g => g.slug === (homeState?.gameSlug ?? info?.home.gameSlug)), [homeState?.gameSlug, info?.home.gameSlug]);

  // ── Codice mancante → inserimento manuale ────────────────────────────────────
  if (!code) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6" style={{ background: '#0a0820' }}>
        <div className="text-3xl font-black text-white">{extended ? '🎛️ Regia Live' : '🎤 Presentatore Live'}</div>
        <div className="text-sm" style={{ color: '#ffffff88' }}>Inserisci il codice Presentatore della stanza (lo trovi in Admin → Show)</div>
        <input value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} maxLength={6}
          placeholder="ABC123" autoFocus
          className="w-56 rounded-2xl bg-transparent px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.3em] text-white outline-none"
          style={{ border: '2px solid rgba(245,182,66,0.5)' }} />
        <button onClick={() => { if (codeInput.length === 6) { setCode(codeInput); window.history.replaceState(null, '', `?code=${codeInput}`); } }}
          disabled={codeInput.length !== 6}
          className="rounded-2xl px-8 py-3 font-black disabled:opacity-35" style={{ background: '#F5B642', color: '#0a0820' }}>
          Entra
        </button>
      </div>
    );
  }

  if (resolveErr && !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#0a0820' }}>
        <div className="text-5xl">😕</div>
        <div className="text-xl font-black text-white">{resolveErr}</div>
        <button onClick={() => { setCode(''); setResolveErr(null); }} className="rounded-2xl px-6 py-3 font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
          Cambia codice
        </button>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#0a0820' }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#F5B642' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: '#0a0820' }}>
      {coppiePanel && <CoppieLivePanel onLaunch={c => void launchCoppie(c)} onClose={() => setCoppiePanel(false)} launching={launchingCoppie} />}

      {/* ── Identità stanza ── */}
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#F5B642' }}>
              {extended ? 'Regia Live' : 'Presentatore Live'}
            </div>
            <div className="text-2xl font-black text-white">{info.live.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-bold">
              <span className="h-2 w-2 rounded-full" style={{ background: connected ? '#34D399' : '#F87171' }} />
              <span style={{ color: connected ? '#34D399' : '#F87171' }}>{connected ? 'Collegato' : 'Disconnesso'}</span>
              <span style={{ color: '#ffffff55' }}>· {players.length} giocatori · {playing ? `In gioco: ${currentGame?.emoji ?? ''} ${currentGame?.name ?? homeState?.gameSlug}` : 'In attesa'}</span>
            </div>
          </div>
          {joinUrl && (
            <div className="shrink-0 rounded-xl bg-white p-2">
              <QRCodeSVG value={joinUrl} size={92} bgColor="#ffffff" fgColor="#0a0820" level="M" />
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <CodeChip label="Codice giocatori" value={joinCode || '—'} accent />
          <CodeChip label="Codice TV" value={info.live.tvCode} />
          <CodeChip label="Codice presenter" value={presenterCodeRef.current || '—'} />
          <CodeChip label="Stanza Live" value={info.live.id.slice(0, 8)} />
          <CodeChip label="Home session" value={info.home.id.slice(0, 8)} />
          <CodeChip label="Round" value={playing ? `${(homeState?.currentRound ?? 0) + 1}/${homeState?.totalRounds ?? '—'}` : '—'} />
        </div>
      </div>

      {feedback && (
        <div className="mx-5 mt-3 rounded-xl px-4 py-2 text-sm font-bold"
          style={{ background: feedback.startsWith('✅') ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: feedback.startsWith('✅') ? '#34D399' : '#F87171' }}>
          {feedback}
        </div>
      )}

      {/* ── Scegli gioco ── */}
      <div className="px-5 pt-4">
        <button onClick={() => setGamePicker(v => !v)}
          className="w-full rounded-2xl py-4 text-lg font-black transition active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg,#F5B642,#F59E0B)', color: '#0a0820' }}>
          🎮 {playing ? 'Cambia gioco' : 'Scegli gioco'}
        </button>
        {gamePicker && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {GAMES.map(g => (
              <button key={g.slug}
                onClick={() => {
                  setGamePicker(false);
                  if (g.slug === 'gioco-coppie') { setCoppiePanel(true); return; }
                  void sendCommand('select-game', { gameSlug: g.slug });
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold text-white transition active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
                <span className="text-xl">{g.emoji}</span> {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Comandi principali ── */}
      <div className="grid grid-cols-3 gap-2 px-5 pt-3">
        <BigButton emoji="📺" label="Mostra board" busy={busyCmd === 'board'} onClick={() => void sendCommand('board')} />
        <BigButton emoji="⏸" label="Pausa" busy={busyCmd === 'pause'} disabled={!playing} onClick={() => void sendCommand('pause')} />
        <BigButton emoji="▶️" label="Riprendi" busy={busyCmd === 'resume'} disabled={!playing} onClick={() => void sendCommand('resume')} />
        <BigButton emoji="⏭" label="Avanti" busy={busyCmd === 'next'} disabled={!playing} onClick={() => void sendCommand('next')} />
        <BigButton emoji="🎭" label="Rivela" busy={busyCmd === 'reveal'} disabled={!playing} onClick={() => void sendCommand('reveal')} />
        <BigButton emoji="🏆" label={rankingOn ? 'Nascondi classifica' : 'Classifica'} busy={busyCmd === 'ranking'}
          onClick={() => { const next = !rankingOn; void sendCommand('ranking', { show: next }).then(ok => { if (ok) setRankingOn(next); }); }} />
        <BigButton emoji={audioOn ? '🔇' : '🔊'} label={audioOn ? 'Stop audio' : 'Riattiva audio'} busy={busyCmd === 'audio'}
          onClick={() => { const next = !audioOn; void sendCommand('audio', { action: next ? 'resume' : 'stop' }).then(ok => { if (ok) setAudioOn(next); }); }} />
        <BigButton emoji="💞" label="Coppie Live" color="#F472B6" onClick={() => setCoppiePanel(true)} />
        <BigButton emoji="🛑" label="Termina gioco" danger busy={busyCmd === 'end-game'} disabled={!playing} onClick={() => void sendCommand('end-game')} />
      </div>

      {/* ── Controlli estesi (Regia) ── */}
      {extended && (
        <>
          <div className="px-5 pt-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: '#ffffff55' }}>Regia</div>
          <div className="grid grid-cols-2 gap-2 px-5 pt-2">
            <BigButton emoji="⬛" label={blackoutOn ? 'Blackout OFF' : 'Blackout'} danger={blackoutOn} busy={busyCmd === 'blackout'}
              onClick={() => { const next = !blackoutOn; void sendCommand('blackout', { on: next }).then(ok => { if (ok) setBlackoutOn(next); }); }} />
            <BigButton emoji="📺" label="Apri TV" color="#22D3EE"
              onClick={() => window.open(`${window.location.origin}${BASE_URL}live-tv?code=${info.live.tvCode}`.replace(/([^:])\/\//g, '$1/'), '_blank')} />
          </div>
          <div className="px-5 pt-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: '#ffffff55' }}>Punteggi</div>
          <div className="flex flex-col gap-2 px-5 pt-2">
            {[...players].sort((a, b) => b.score - a.score).map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.avatarColor }} />
                <span className="flex-1 truncate text-sm font-bold text-white">{p.nickname}</span>
                <span className="w-14 text-right font-mono text-sm font-black" style={{ color: '#F5B642' }}>{p.score}</span>
                {[-50, 50].map(d => (
                  <button key={d} onClick={() => void sendCommand('score', { playerId: p.id, delta: d })}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-black transition active:scale-90"
                    style={{ background: d > 0 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: d > 0 ? '#34D399' : '#F87171' }}>
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            ))}
            {players.length === 0 && <div className="text-sm" style={{ color: '#ffffff55' }}>Nessun giocatore collegato — fai scansionare il QR.</div>}
          </div>
        </>
      )}
    </div>
  );
}

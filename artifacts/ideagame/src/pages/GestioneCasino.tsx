/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — CASINO (frontend) ───────────────────────────────────
   Ruoli in base ai parametri URL:
   ?player=CODICE → vista GIOCATORE (il suo QR + saldo fish)
   ?code=CODICE   → risolto come MASTER, DEALER o iscrizione GIOCATORE
   Dealer: inquadra il QR del giocatore (BarcodeDetector, fallback codice) e
   paga/preleva fish. Sync via polling 2s. ─────────────────────────────────── */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API = (import.meta.env.BASE_URL as string || '/') + 'api';
const ORIGIN = window.location.origin + (import.meta.env.BASE_URL as string || '/');
const GOLD = '#F5B642';

type Player = { id: string; nickname: string; playerCode: string; fishBalance: number; tableId: string | null };
type Table = { id: string; tableNumber: number; name: string; dealerCode: string };
type State = { session: { id: string; name: string; status: string; joinCode: string; masterCode: string }; tables: Table[]; players: Player[]; standings: Player[]; cassaTotale: number; perTable: { tableId: string; tableNumber: number; name: string; total: number; players: number }[] };

const api = (path: string, body?: unknown, method = 'POST') =>
  fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }).then(r => r.json());

export default function GestioneCasino() {
  const params = new URLSearchParams(window.location.search);
  const playerCode = params.get('player');
  const code = (params.get('code') ?? '').toUpperCase();
  if (playerCode) return <PlayerView code={playerCode.toUpperCase()} />;
  return <CasinoResolver code={code} />;
}

function CasinoResolver({ code }: { code: string }) {
  const [res, setRes] = useState<{ role: string; sessionId: string; tableId?: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!code) { setErr('Nessun codice'); return; }
    fetch(`${API}/gestione/casino/resolve/${code}`).then(r => r.ok ? r.json() : Promise.reject()).then(setRes).catch(() => setErr('Serata non trovata'));
  }, [code]);
  if (err) return <Center>{err}</Center>;
  if (!res) return <Center>Carico…</Center>;
  if (res.role === 'master') return <MasterView sessionId={res.sessionId} />;
  if (res.role === 'dealer') return <DealerView dealerCode={code} />;
  return <JoinView sessionId={res.sessionId} />;
}

function useCasinoState(sessionId: string, ms = 2000) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/sessions/${sessionId}`).then(r => r.ok ? r.json() : null).then(s => { if (alive && s) setState(s); }).catch(() => {});
    pull(); const t = setInterval(pull, ms);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, ms]);
  return state;
}

// ══════════════════ MASTER ══════════════════
function MasterView({ sessionId }: { sessionId: string }) {
  const state = useCasinoState(sessionId);
  const [busy, setBusy] = useState(false);
  const addTable = async () => { setBusy(true); try { await api(`/gestione/casino/sessions/${sessionId}/tables`, {}); } finally { setBusy(false); } };
  if (!state) return <Center>Carico…</Center>;
  return (
    <Shell title={`🎰 ${state.session.name} — Master`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 20 }}>
        <Card title="Cassa fish">
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 'clamp(40px,6vw,72px)', fontWeight: 900, color: GOLD }}>{state.cassaTotale.toLocaleString()}</div>
            <div style={{ opacity: 0.5 }}>fish in gioco · {state.players.length} giocatori</div>
          </div>
          <div style={{ marginTop: 10, textAlign: 'center', background: '#ffffff0a', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.5 }}>QR iscrizione giocatori</div>
            <div style={{ background: '#fff', display: 'inline-block', padding: 8, borderRadius: 10, margin: '8px 0' }}>
              <QRCodeSVG value={`${ORIGIN}gestione/casino?code=${state.session.joinCode}`} size={120} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '0.2em', color: GOLD }}>{state.session.joinCode}</div>
          </div>
          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, opacity: 0.6 }}>
            🔑 Codice regia (per rientrare): <b style={{ color: GOLD, letterSpacing: '0.15em' }}>{state.session.masterCode}</b><br/>salva questo link per tornare come Master
          </div>
        </Card>

        <Card title={`Tavoli (${state.tables.length})`}>
          <button onClick={addTable} disabled={busy} style={{ ...btn(GOLD), width: '100%', marginBottom: 12 }}>+ Aggiungi tavolo</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.tables.map(t => {
              const pt = state.perTable.find(x => x.tableId === t.id);
              return (
                <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#ffffff0a', borderRadius: 12, padding: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 2 }}>QR DEALER</div>
                    <div style={{ background: '#fff', padding: 4, borderRadius: 8 }}>
                      <QRCodeSVG value={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} size={56} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{t.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>codice {t.dealerCode} · {pt?.players ?? 0} giocatori</div>
                    <a href={`${ORIGIN}gestione/casino?code=${t.dealerCode}`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 4, color: GOLD, fontSize: 13, fontWeight: 800 }}>🎰 Apri banco dealer ↗</a>
                  </div>
                  <div style={{ fontWeight: 900, color: GOLD }}>{pt?.total ?? 0}</div>
                </div>
              );
            })}
            {state.tables.length === 0 && <div style={{ opacity: 0.4 }}>Aggiungi il primo tavolo (crea l'accesso dealer)</div>}
          </div>
        </Card>

        <Card title="Classifica serata">
          <PlayersList players={state.standings} />
        </Card>
      </div>
    </Shell>
  );
}

// ══════════════════ DEALER ══════════════════
function DealerView({ dealerCode }: { dealerCode: string }) {
  const [data, setData] = useState<{ table: Table; sessionName: string; sessionId: string; tablePlayers: Player[]; allPlayers: Player[] } | null>(null);
  const [target, setTarget] = useState<Player | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => { fetch(`${API}/gestione/casino/dealer/${dealerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setData(d); }).catch(() => {}); }, [dealerCode]);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);

  const resolvePlayer = useCallback(async (raw: string) => {
    // Il QR può contenere il codice grezzo o un URL ?player=CODE
    const m = raw.match(/player=([A-Z0-9]+)/i);
    const pc = (m ? m[1] : raw).toUpperCase().trim();
    const r = await fetch(`${API}/gestione/casino/player/${pc}`);
    if (!r.ok) { setMsg('Giocatore non trovato'); return; }
    const d = await r.json();
    setTarget(d.player); setScanning(false); setMsg('');
  }, []);

  const tx = async (delta: number) => {
    if (!target) return;
    const r = await api(`/gestione/casino/tx`, { dealerCode, playerId: target.id, delta });
    if (r.ok) { setTarget(r.player); setMsg(delta > 0 ? `+${delta} pagati ✓` : `${delta} prelevati ✓`); load(); }
    else setMsg(r.error || 'Errore');
  };

  if (!data) return <Center>Carico tavolo…</Center>;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#3d2a08,#0a0602 70%)', color: '#fff', padding: 16, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div style={{ fontWeight: 900, fontSize: 20 }}>{data.table.name}</div><div style={{ opacity: 0.5, fontSize: 13 }}>{data.sessionName} · Dealer</div></div>
      </div>

      {!target ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          {scanning
            ? <QrScanner onResult={resolvePlayer} onClose={() => setScanning(false)} />
            : <button onClick={() => setScanning(true)} style={{ ...btn(GOLD), width: '100%', maxWidth: 420, padding: 20, fontSize: 20 }}>📷 Inquadra il QR del giocatore</button>}
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
            <input value={manual} onChange={e => setManual(e.target.value)} placeholder="…oppure codice giocatore" style={{ ...inp, textTransform: 'uppercase', letterSpacing: '0.1em' }} onKeyDown={e => e.key === 'Enter' && resolvePlayer(manual)} />
            <button onClick={() => resolvePlayer(manual)} style={btn('#ffffff22')}>OK</button>
          </div>
          {msg && <div style={{ color: '#f87171' }}>{msg}</div>}
          <div style={{ width: '100%', maxWidth: 420, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>CLASSIFICA TAVOLO</div>
            <PlayersList players={[...data.tablePlayers].sort((a, b) => b.fishBalance - a.fishBalance)} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', maxWidth: 460, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{target.nickname}</div>
            <div style={{ fontSize: 'clamp(44px,12vw,72px)', fontWeight: 900, color: GOLD }}>{target.fishBalance}</div>
            <div style={{ opacity: 0.5 }}>fish</div>
          </div>
          {msg && <div style={{ color: msg.includes('✓') ? '#4ade80' : '#f87171', fontWeight: 800 }}>{msg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
            {[10, 25, 50, 100].map(n => <button key={'p' + n} onClick={() => tx(n)} style={{ ...btn('#4ade80'), padding: 18, fontSize: 18 }}>+{n}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
            {[10, 25, 50, 100].map(n => <button key={'t' + n} onClick={() => tx(-n)} style={{ ...btn('#f87171'), padding: 18, fontSize: 18 }}>−{n}</button>)}
          </div>
          <QuickAmount onPay={n => tx(n)} onTake={n => tx(-n)} />
          <button onClick={() => { setTarget(null); setMsg(''); }} style={{ ...btn('#ffffff22'), width: '100%', marginTop: 4 }}>← Prossimo giocatore</button>
        </div>
      )}
    </div>
  );
}

function QuickAmount({ onPay, onTake }: { onPay: (n: number) => void; onTake: (n: number) => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
      <input type="number" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} placeholder="importo" style={inp} />
      <button onClick={() => { if (v) { onPay(Number(v)); setV(''); } }} style={btn('#4ade80')}>Paga</button>
      <button onClick={() => { if (v) { onTake(Number(v)); setV(''); } }} style={btn('#f87171')}>Preleva</button>
    </div>
  );
}

// ══════════════════ GIOCATORE ══════════════════
function JoinView({ sessionId }: { sessionId: string }) {
  const [nick, setNick] = useState(''); const [busy, setBusy] = useState(false);
  const join = async () => {
    if (!nick.trim()) return;
    setBusy(true);
    try { const p = await api(`/gestione/casino/sessions/${sessionId}/players`, { nickname: nick }); if (p?.playerCode) window.location.href = `${ORIGIN}gestione/casino?player=${p.playerCode}`; }
    finally { setBusy(false); }
  };
  return (
    <Center>
      <div style={{ textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: 48 }}>🎰</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Entra al Casinò</div>
        <input value={nick} onChange={e => setNick(e.target.value)} placeholder="Il tuo nome" onKeyDown={e => e.key === 'Enter' && join()} style={{ ...inp, width: '100%', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
        <button onClick={join} disabled={busy} style={{ ...btn(GOLD), width: '100%', padding: 16, fontSize: 18 }}>{busy ? '…' : 'Entra'}</button>
      </div>
    </Center>
  );
}

function PlayerView({ code }: { code: string }) {
  const [data, setData] = useState<{ player: Player; sessionName: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    const pull = () => fetch(`${API}/gestione/casino/player/${code}`).then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (alive) setData(d); }).catch(() => setErr('Giocatore non trovato'));
    pull(); const t = setInterval(pull, 2000); return () => { alive = false; clearInterval(t); };
  }, [code]);
  if (err) return <Center>{err}</Center>;
  if (!data) return <Center>Carico…</Center>;
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#3d2a08,#0a0602 70%)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ opacity: 0.6 }}>{data.sessionName}</div>
      <div style={{ fontSize: 30, fontWeight: 900 }}>{data.player.nickname}</div>
      <div style={{ fontSize: 'clamp(64px,20vw,120px)', fontWeight: 900, color: GOLD, lineHeight: 1 }}>{data.player.fishBalance}</div>
      <div style={{ opacity: 0.5, marginTop: -8 }}>le tue fish</div>
      <div style={{ background: '#fff', padding: 14, borderRadius: 16, marginTop: 10 }}>
        <QRCodeSVG value={data.player.playerCode} size={180} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.25em', color: GOLD }}>{data.player.playerCode}</div>
      <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', maxWidth: 300 }}>Mostra questo QR al dealer per ricevere o consegnare le fish</div>
    </div>
  );
}

// ── Scanner QR (BarcodeDetector nativo, fallback: codice manuale sopra) ─────────
function QrScanner({ onResult, onClose }: { onResult: (v: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    if (!BD) { setErr('Scanner non supportato su questo telefono — usa il codice manuale'); return; }
    const detector = new BD({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try { const codes = await detector.detect(videoRef.current); if (codes[0]?.rawValue) { onResult(codes[0].rawValue); return; } } catch { /**/ }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch { setErr('Camera non accessibile — usa il codice manuale'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onResult]);
  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      {err ? <div style={{ color: '#f87171', textAlign: 'center', padding: 12 }}>{err}</div>
        : <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 16, border: `3px solid ${GOLD}`, aspectRatio: '1', objectFit: 'cover' }} />}
      <button onClick={onClose} style={{ ...btn('#ffffff22'), width: '100%', marginTop: 8 }}>Annulla</button>
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #ffffff26', background: '#ffffff11', color: '#fff', fontSize: 16, minWidth: 0 };
const btn = (c: string): React.CSSProperties => ({ padding: '12px 16px', borderRadius: 10, border: 'none', background: c, color: c.startsWith('#ff') || c === GOLD || c === '#4ade80' ? '#150c02' : '#fff', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 });

function PlayersList({ players }: { players: Player[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
      {players.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: i < 3 ? `${GOLD}14` : '#ffffff08' }}>
          <span style={{ width: 26, fontWeight: 900, color: i === 0 ? '#FCD34D' : '#ffffff66' }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700 }}>{p.nickname}</span>
          <span style={{ fontWeight: 900, color: GOLD }}>{p.fishBalance}</span>
        </div>
      ))}
      {players.length === 0 && <div style={{ opacity: 0.4 }}>Nessun giocatore</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: '#ffffff08', border: '1px solid #ffffff14', borderRadius: 18, padding: 18 }}>
    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 15, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>{children}</div>;
}
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top,#3d2a08,#0a0602 72%)', color: '#fff', padding: 'clamp(14px,2.5vw,28px)', fontFamily: "'Outfit',system-ui,sans-serif" }}>
    <div style={{ fontSize: 'clamp(20px,3vw,32px)', fontWeight: 900, marginBottom: 20 }}>{title}</div>{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0602', color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 20, padding: 20, textAlign: 'center' }}>{children}</div>;
}

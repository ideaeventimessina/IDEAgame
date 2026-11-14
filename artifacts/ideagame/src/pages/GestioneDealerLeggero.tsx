/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── DEALER UNIVERSALE — galleria facce della serata + filtro "a questo tavolo" ──
   Un dealerCode (di QUALUNQUE tavolo) identifica la serata. Il dealer vede TUTTE le
   facce degli ospiti entrati (foto grande) e assegna/toglie PUNTI a mano guardando
   la faccia di chi ha davanti. Un filtro mette in cima / isola chi è a questo tavolo.
   Niente soldi/fiche: è un SEGNAPUNTI. Usato da ?sicdealer / ?sprintdealer /
   ?pooldealer (e riusabile dentro i mazzieri pieni 7½/Blackjack). */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { DealerFab } from '../casino-ui/DealerFab';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const api = (path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

export type LightKind = 'sicilia' | 'sprint' | 'pool';
type RosterPlayer = { id: string; nickname: string | null; avatarUrl: string | null; balance: number; atTable: boolean };
const grp = (n: number) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const CSS = `
@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${BASE}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}
@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${BASE}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}
.dld{position:fixed;inset:0;overflow:auto;background:radial-gradient(ellipse at 50% 0%,#0a3d1c,#02190c 70%);color:#ede8d8;font-family:"Baskerville Casino",Georgia,serif;}
.dld .wrap{max-width:560px;margin:0 auto;padding:12px 12px 40px;}
.dld h1{font:700 22px/1.1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;margin:6px 0 2px;}
.dld .sub{text-align:center;color:#bfe6cc;font-size:13px;margin-bottom:10px;}
.dld .bar{position:sticky;top:0;z-index:5;background:#02190cf0;padding:8px 0 10px;backdrop-filter:blur(3px);}
.dld .seg{display:flex;gap:8px;margin-bottom:8px;}
.dld .seg button{flex:1;padding:10px;border-radius:11px;border:2px solid #6e5320;background:#121511;color:#cbd8c9;font:700 14px/1.1 "Baskerville Casino",serif;cursor:pointer;}
.dld .seg button.on{background:linear-gradient(180deg,#ffe694,#d59a34);color:#231503;border-color:#f3dea0;}
.dld .search{width:100%;box-sizing:border-box;padding:11px 14px;border-radius:11px;border:2px solid #6e5320;background:#0b1a10;color:#ffe9a6;font:700 16px "Baskerville Casino",serif;}
.dld .plist{display:flex;flex-direction:column;gap:12px;}
.dld .pl{display:flex;align-items:center;gap:14px;background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #6e5320;border-radius:16px;padding:12px 14px;}
.dld .pl.at{border-color:#5fe08a;box-shadow:0 0 0 1px #5fe08a44,0 0 14px #1aa64b33;}
.dld .pl .face{width:84px;height:84px;border-radius:14px;object-fit:cover;border:3px solid #c6992f;flex:none;box-shadow:0 2px 8px #0008;}
.dld .pl .faceph{width:84px;height:84px;border-radius:14px;display:grid;place-items:center;background:#143421;border:3px solid #6e5320;color:#e7d6a2;font:700 32px/1 "Baskerville Casino",serif;flex:none;}
.dld .pl .nm{font:700 21px/1.05 "Baskerville Casino",serif;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dld .pl .tag{font:700 10px/1 "Baskerville Casino",serif;color:#07240f;background:linear-gradient(180deg,#5fe08a,#1aa64b);border-radius:999px;padding:3px 8px;}
.dld .pl .bal{color:#ffe9a6;font:700 16px/1 "Baskerville Casino",serif;margin-top:3px;}
.dld .pl .mid{flex:1;min-width:0;}
.dld .tx{display:flex;gap:7px;margin-top:10px;}
.dld .tx button{flex:1;padding:13px 2px;border-radius:10px;border:2px solid #6e5320;background:#0b1a10;font:700 17px/1 "Baskerville Casino",serif;cursor:pointer;}
.dld .tx button.up{color:#8ee6a8;}
.dld .tx button.down{color:#ff9b9b;}
.dld .tx button:disabled{opacity:.5;cursor:default;}
`;

/* La GALLERIA: lista facce della serata, filtro tavolo + ricerca, +/− punti.
   Riusabile ovunque (prende solo il dealerCode). Poll roster ogni 1.2s. */
export function DealerGallery({ dealerCode }: { dealerCode: string }) {
  const [roster, setRoster] = useState<{ tableName: string; players: RosterPlayer[]; atTableCount: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyTable, setOnlyTable] = useState(true);
  const [q, setQ] = useState('');
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/dealer-roster/${dealerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.players) setRoster(d); }).catch(() => {});
    load(); const t = setInterval(load, 1200); return () => { on = false; clearInterval(t); };
  }, [dealerCode]);
  const tx = useCallback(async (playerId: string, delta: number) => {
    setBusy(playerId);
    try { await api('/gestione/casino/dealer-tx-any', { dealerCode, playerId, delta }); } finally { setBusy(null); }
  }, [dealerCode]);

  const shown = useMemo(() => {
    const all = roster?.players ?? [];
    const base = onlyTable ? all.filter(p => p.atTable) : all;
    const needle = q.trim().toLowerCase();
    return needle ? base.filter(p => (p.nickname ?? '').toLowerCase().includes(needle)) : base;
  }, [roster, onlyTable, q]);

  const atCount = roster?.atTableCount ?? 0;
  const total = roster?.players.length ?? 0;
  return (
    <div className="dld"><style>{CSS}</style>
      <DealerFab dealerCode={dealerCode} />
      <div className="wrap">
        <h1>Dealer · {roster?.tableName ?? 'Tavolo'}</h1>
        <div className="sub">Segnapunti · tocca la faccia e assegna i punti</div>
        <div className="bar">
          <div className="seg">
            <button className={onlyTable ? 'on' : ''} onClick={() => setOnlyTable(true)}>A questo tavolo ({atCount})</button>
            <button className={!onlyTable ? 'on' : ''} onClick={() => setOnlyTable(false)}>Tutti ({total})</button>
          </div>
          <input className="search" placeholder="Cerca per nome…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="plist">
          {!roster ? <div className="sub">Carico…</div>
            : shown.length === 0 ? <div className="sub">{onlyTable ? 'Nessun ospite a questo tavolo ancora. Tocca "Tutti" per vedere tutta la serata.' : 'Nessun ospite trovato.'}</div>
            : shown.map(p => (
              <div key={p.id} className={`pl${p.atTable ? ' at' : ''}`}>
                {p.avatarUrl
                  ? <img className="face" src={p.avatarUrl} alt="" />
                  : <div className="faceph">{(p.nickname ?? '?').trim().slice(0, 2).toUpperCase()}</div>}
                <div className="mid">
                  <div className="nm">{p.nickname ?? '—'}{p.atTable && <span className="tag">a questo tavolo</span>}</div>
                  <div className="bal">{grp(p.balance)} punti</div>
                  <div className="tx">
                    <button className="up" disabled={busy === p.id} onClick={() => tx(p.id, 25)}>+25</button>
                    <button className="up" disabled={busy === p.id} onClick={() => tx(p.id, 100)}>+100</button>
                    <button className="down" disabled={busy === p.id} onClick={() => tx(p.id, -25)}>−25</button>
                    <button className="down" disabled={busy === p.id} onClick={() => tx(p.id, -100)}>−100</button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Compat: i dispatch ?sicdealer/?sprintdealer/?pooldealer passano kind, ma la
// galleria lavora solo col dealerCode (la serata). Manteniamo la firma.
export function LightDealerView({ dealerCode }: { kind?: LightKind; dealerCode: string }) {
  return <DealerGallery dealerCode={dealerCode} />;
}

/* Pannello DEALER riusabile nelle regie (lega/slega + QR). Auto-stilato con stili
   inline, così entra in qualunque regia senza dipendere dalle sue classi CSS. */
const bindBtn: CSSProperties = { padding: '12px 14px', borderRadius: 12, border: '1px solid #f1d98c', background: 'linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34)', color: '#231503', font: '700 16px "Baskerville Casino",serif', cursor: 'pointer', width: '100%', boxSizing: 'border-box' };
const bindGhost: CSSProperties = { padding: '10px 14px', borderRadius: 12, border: '1px solid #f1d98c66', background: '#ffffff12', color: '#ffe9a6', font: '700 14px "Baskerville Casino",serif', cursor: 'pointer' };
export function LightDealerBind({ kind, sessionId, tableId, hasDealer, origin }: { kind: LightKind; sessionId: string; tableId: string; hasDealer: boolean; origin: string }) {
  const [busy, setBusy] = useState(false);
  const [dealerCode, setDealerCode] = useState<string | null>(null);
  const param = kind === 'sicilia' ? 'sicdealer' : kind === 'sprint' ? 'sprintdealer' : 'pooldealer';
  const family = kind === 'sicilia' ? 'sicilia-tables' : kind === 'sprint' ? 'sprint-tables' : 'pool-tables';
  const bind = async (assign: boolean) => {
    setBusy(true);
    try { const r = await api(`/gestione/casino/sessions/${sessionId}/${family}/${tableId}/dealer`, { assign }); setDealerCode(assign ? (r?.dealerCode ?? null) : null); } finally { setBusy(false); }
  };
  const box: CSSProperties = { borderRadius: 12, border: '2px solid #c6992f66', background: '#ffffff0e', padding: 12 };
  if (!hasDealer && !dealerCode) {
    return (
      <div style={box}>
        <div style={{ font: '700 16px "Baskerville Casino",serif', color: '#ffe9a6', marginBottom: 6 }}>👔 Dealer del tavolo (segnapunti)</div>
        <p style={{ color: '#cfe0f5', fontSize: 13, margin: '0 0 10px' }}>Lega un dealer: dal suo telefono vede i giocatori e <b>assegna/toglie punti a mano</b>, guardando la faccia. La partita resta digitale.</p>
        <button style={bindBtn} disabled={busy} onClick={() => bind(true)}>👤 Assegna un dealer</button>
      </div>
    );
  }
  const url = dealerCode ? `${origin}gestione/casino?${param}=${dealerCode}` : null;
  return (
    <div style={box}>
      <div style={{ font: '700 16px "Baskerville Casino",serif', color: '#ffe9a6', marginBottom: 8 }}>👔 Dealer del tavolo {hasDealer ? '✓' : ''}</div>
      {url
        ? <div style={{ textAlign: 'center' }}><div style={{ background: '#fff', padding: 14, borderRadius: 12, display: 'inline-block' }}><QRCodeSVG value={url} size={150} /></div><div style={{ color: '#ffe9a6', marginTop: 8, fontSize: 14 }}>Telefono del dealer · inquadra il QR</div></div>
        : <div style={{ color: '#9fe0b4', fontSize: 14 }}>Dealer legato ✓ · premi "Mostra QR" per rivederne il link</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
        {!dealerCode && <button style={bindGhost} disabled={busy} onClick={() => bind(true)}>🔳 Mostra QR dealer</button>}
        <button style={{ ...bindGhost, borderColor: '#8a2f2f', color: '#ff9b9b' }} disabled={busy} onClick={() => bind(false)}>✕ Slega dealer</button>
      </div>
    </div>
  );
}

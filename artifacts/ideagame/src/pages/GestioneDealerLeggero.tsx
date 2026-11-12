/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Dealer LEGGERO (Corsa Siciliana / Sprint / Biliardo) ─────────────────────
   Il mazziere è legato dal tavolo (dalla regia o dalla plancia) e dal suo telefono
   VEDE i giocatori/puntate di quel tavolo e accredita/preleva fish a mano. NON tocca
   la partita: le carte e la gara restano digitali. È il "leggero sul resto" rispetto
   al mazziere PIENO di Blackjack/7½ (che segna anche gli esiti). Una sola vista
   riusata dai tre tavoli: cambia solo la riga che descrive la puntata.
   - `?sicdealer=` Corsa Siciliana   - `?sprintdealer=` Sprint   - `?pooldealer=` Biliardo */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const api = (path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

export type LightKind = 'sicilia' | 'sprint' | 'pool';
type LightPlayer = { id: string; nickname: string | null; avatarUrl: string | null; balance: number; note: string };

const ENDPOINT: Record<LightKind, string> = { sicilia: 'sicilia', sprint: 'sprint', pool: 'pool' };
const TITLE: Record<LightKind, string> = { sicilia: 'Corsa Siciliana', sprint: 'Ippodromo Sprint', pool: 'Biliardo Club' };
const SUIT_LBL: Record<string, string> = { coppe: 'Coppe', denari: 'Denari', spade: 'Spade', bastoni: 'Bastoni' };
const grp = (n: number) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* Estrae la lista giocatori normalizzata dallo stato del tavolo (shape per gioco). */
function playersFrom(kind: LightKind, table: any): LightPlayer[] {
  if (!table) return [];
  if (kind === 'sicilia') {
    return (table.players ?? []).map((p: any): LightPlayer => ({
      id: p.id, nickname: p.nickname, avatarUrl: p.avatarUrl ?? null, balance: Number(p.balance) || 0,
      note: p.suit ? `Punta ${p.stake} su ${SUIT_LBL[p.suit] ?? p.suit}` : 'Nessuna puntata',
    }));
  }
  if (kind === 'sprint') {
    return (table.seats ?? []).filter((s: any) => s.playerId).map((s: any): LightPlayer => ({
      id: s.playerId, nickname: s.nickname, avatarUrl: s.avatarUrl ?? null, balance: Number(s.balance) || 0,
      note: `Pilota · ${s.name}`,
    }));
  }
  // pool: seats { 0:{...}, 1:{...} } con campo fish
  const seats = table.seats ?? {};
  return [seats[0], seats[1]].filter((s: any) => s && s.playerId).map((s: any): LightPlayer => ({
    id: s.playerId, nickname: s.nickname, avatarUrl: s.avatarUrl ?? null, balance: Number(s.fish) || 0,
    note: 'Giocatore al tavolo',
  }));
}

const CSS = `
@font-face{font-family:"Baskerville Casino";font-weight:400;src:url(${BASE}casino/libre-baskerville-latin-400-normal.woff2) format("woff2");font-display:swap}
@font-face{font-family:"Baskerville Casino";font-weight:700;src:url(${BASE}casino/libre-baskerville-latin-700-normal.woff2) format("woff2");font-display:swap}
.dld{position:fixed;inset:0;overflow:auto;background:radial-gradient(ellipse at 50% 0%,#0a3d1c,#02190c 70%);color:#ede8d8;font-family:"Baskerville Casino",Georgia,serif;}
.dld .wrap{max-width:540px;margin:0 auto;padding:14px 14px 40px;}
.dld h1{font:700 22px/1.1 "Baskerville Casino",serif;color:#ffe9a6;text-align:center;margin:6px 0 2px;}
.dld .sub{text-align:center;color:#bfe6cc;font-size:13px;margin-bottom:12px;}
.dld .card{background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #c6992f;border-radius:16px;padding:14px;margin-bottom:12px;}
.dld .hint{color:#9fe0b4;font-size:12px;text-align:center;margin:2px 0 10px;}
.dld .plist{display:flex;flex-direction:column;gap:12px;}
.dld .pl{display:flex;align-items:center;gap:14px;background:linear-gradient(160deg,#0d2a19,#061710);border:2px solid #6e5320;border-radius:16px;padding:12px 14px;}
.dld .pl .face{width:76px;height:76px;border-radius:14px;object-fit:cover;border:3px solid #c6992f;flex:none;box-shadow:0 2px 8px #0008;}
.dld .pl .faceph{width:76px;height:76px;border-radius:14px;display:grid;place-items:center;background:#143421;border:3px solid #6e5320;color:#e7d6a2;font:700 30px/1 "Baskerville Casino",serif;flex:none;}
.dld .pl .nm{font:700 20px/1.1 "Baskerville Casino",serif;color:#fff;}
.dld .pl .bal{color:#ffe9a6;font:700 15px/1 "Baskerville Casino",serif;margin-top:2px;}
.dld .pl .note{color:#9fc8a8;font-size:12px;margin-top:2px;}
.dld .pl .mid{flex:1;min-width:0;}
.dld .tx{display:flex;gap:7px;margin-top:9px;}
.dld .tx button{flex:1;padding:12px 2px;border-radius:10px;border:2px solid #6e5320;background:#0b1a10;font:700 16px/1 "Baskerville Casino",serif;cursor:pointer;}
.dld .tx button.up{color:#8ee6a8;}
.dld .tx button.down{color:#ff9b9b;}
.dld .tx button:disabled{opacity:.5;cursor:default;}
`;

export function LightDealerView({ kind, dealerCode }: { kind: LightKind; dealerCode: string }) {
  const [table, setTable] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/${ENDPOINT[kind]}/${dealerCode}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setTable(d.table); }).catch(() => {});
    load(); const t = setInterval(load, 1200); return () => { on = false; clearInterval(t); };
  }, [kind, dealerCode]);
  const tx = useCallback(async (playerId: string, delta: number) => {
    setBusy(true);
    try { await api('/gestione/casino/light-dealer-tx', { dealerCode, playerId, delta }); } finally { setBusy(false); }
  }, [dealerCode]);

  const players = playersFrom(kind, table);
  return (
    <div className="dld"><style>{CSS}</style>
      <div className="wrap">
        <h1>Dealer · {table?.name ?? TITLE[kind]}</h1>
        <div className="sub">{TITLE[kind]} · segnapunti · assegna i punti guardando la faccia</div>

        <div className="card">
          <div className="hint">Assegna o togli punti a mano ai giocatori del tavolo</div>
          <div className="plist">
            {!table ? <div className="sub" style={{ margin: 0 }}>Carico…</div>
              : players.length === 0 ? <div className="sub" style={{ margin: 0 }}>Nessun giocatore al tavolo.</div>
              : players.map(p => (
                <div key={p.id} className="pl">
                  {p.avatarUrl
                    ? <img className="face" src={p.avatarUrl} alt="" />
                    : <div className="faceph">{(p.nickname ?? '?').trim().slice(0, 2).toUpperCase()}</div>}
                  <div className="mid">
                    <div className="nm">{p.nickname ?? '—'}</div>
                    <div className="bal">{grp(p.balance)} punti</div>
                    <div className="note">{p.note}</div>
                    <div className="tx">
                      <button className="up" disabled={busy} onClick={() => tx(p.id, 25)}>+25</button>
                      <button className="up" disabled={busy} onClick={() => tx(p.id, 100)}>+100</button>
                      <button className="down" disabled={busy} onClick={() => tx(p.id, -25)}>−25</button>
                      <button className="down" disabled={busy} onClick={() => tx(p.id, -100)}>−100</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {kind === 'sicilia' && table?.pot && (
          <div className="card">
            <div className="hint">Puntate sul tavolo</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffe9a6', fontSize: 14 }}>
              <span>Coppe {grp(table.pot.coppe)}</span><span>Denari {grp(table.pot.denari)}</span>
              <span>Spade {grp(table.pot.spade)}</span><span>Bastoni {grp(table.pot.bastoni)}</span>
            </div>
            <div style={{ textAlign: 'center', color: '#9fc8a8', fontSize: 12, marginTop: 6 }}>Totale in palio {grp(table.pot.total)}</div>
          </div>
        )}
      </div>
    </div>
  );
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

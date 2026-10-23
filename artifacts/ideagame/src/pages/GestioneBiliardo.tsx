/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ════════════════════════════════════════════════════════════════════════════
   BILIARDO CLUB — nuovo tavolo del casinò IDEAgame. 8-ball "casino veloce": 2
   giocatori, al meglio di 3 rack; OGNI palla imbucata accredita fish (palla +
   bonus rack + bonus partita). Giocabile da MONITOR 80" touch e da TELEFONO.
   Server AUTOREVOLE su turno/identità/fish (routes /gestione/casino/pool/*); la
   FISICA gira sul monitor che riporta l'esito con /pool/resolve.

   FEDELTÀ (metodo mockup-replica): il TAVOLO è l'asset dipinto approvato
   (biliardo/tavolo.png), le BILIE+stecca sono 3D (Three.js ortografica 1:1 coi
   pixel) sopra un canvas trasparente; la barra comandi è il chrome dipinto del
   mockup (biliardo/barra-bottom.png) con overlay vivi.

   Viste (dispatch in GestioneCasino.tsx):
     monitor 80"  → ?pool=CODE
     telefono     → ?poolplay=CODE
   ════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { QRCodeSVG } from 'qrcode.react';
import { useTableMusic } from '@/audio/useTableMusic';

const BASE = (import.meta.env.BASE_URL as string) || '/';
const API = BASE + 'api';
const ASSET = BASE + 'biliardo/';
const ORIGIN = window.location.origin + BASE;
const api = (path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

/* ── geometria (px del tavolo dipinto) — IDENTICA al server ── */
const CW = 1536, CH = 1024, BR = 23, BX0 = 132, BX1 = 1404, BY0 = 200, BY1 = 784, CAP = 42;
const POCKETS: [number, number][] = [[164, 103], [770, 116], [1372, 85], [177, 926], [768, 937], [1363, 930]];
const DT = 1 / 240, DECEL = 900, E_CUSH = 0.75, E_BALL = 0.94, MAXV = 2400, STOPV = 8;
const COLORS: Record<number, string> = { 1: '#f2c21b', 2: '#1f4ea8', 3: '#cf2a1c', 4: '#5c2d86', 5: '#e07a1e', 6: '#157a3e', 7: '#7c2420', 8: '#121416', 9: '#f2c21b', 10: '#1f4ea8', 11: '#cf2a1c', 12: '#5c2d86', 13: '#e07a1e', 14: '#157a3e', 15: '#7c2420' };

type Ball = { id: number; x: number; y: number; in: boolean };
type Seat = { playerId: string | null; nickname: string | null; avatarUrl: string | null; fish: number };
type PoolPending = { by: 0 | 1; angle: number; power: number; spinX: number; spinY: number; id: string; seq: number } | null;
type PoolTbl = {
  id: string; name: string; displayCode: string; status: 'lobby' | 'playing' | 'finished';
  turn: 0 | 1; rack: number; wins: [number, number]; winner: 0 | 1 | null;
  seats: { 0: Seat; 1: Seat }; balls: Ball[]; pending: PoolPending; suspended: boolean; winRacks: number; serverTime: number;
};
type PoolState = { table: PoolTbl; sessionId: string };

function usePool(code: string, ms = 400): PoolState | null {
  const [st, setSt] = useState<PoolState | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`${API}/gestione/casino/pool/${code}`).then(r => r.ok ? r.json() : null).then(d => { if (on && d?.table) setSt(d); }).catch(() => {});
    load(); const t = setInterval(load, ms); return () => { on = false; clearInterval(t); };
  }, [code, ms]);
  return st;
}

/* texture sferica bilia (colore + numero) */
function ballTexture(n: number): THREE.CanvasTexture {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  const col = n === 0 ? '#f3ecd6' : COLORS[n]!, striped = n >= 9;
  if (striped) { x.fillStyle = '#f6f0dd'; x.fillRect(0, 0, w, h); x.fillStyle = col; x.fillRect(0, h * 0.24, w, h * 0.52); }
  else { x.fillStyle = col; x.fillRect(0, 0, w, h); }
  if (n !== 0) for (const cx of [w * 0.25, w * 0.75]) {
    x.beginPath(); x.arc(cx, h * 0.5, h * 0.2, 0, 7); x.fillStyle = '#fbf7ea'; x.fill();
    x.fillStyle = '#14110c'; x.font = `bold ${h * 0.26}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), cx, h * 0.52);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ════════════════════════════════════════════════ MONITOR 80" ═══════════════ */
export function BiliardoMonitor({ displayCode }: { displayCode: string }) {
  useTableMusic('casino', 'lobby_loop');
  const st = usePool(displayCode, 400);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<PoolState | null>(null);
  const [dim, setDim] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  const [aimPow, setAimPow] = useState<number | null>(null);   // potenza mostrata durante la mira (null = a riposo)
  useEffect(() => { stateRef.current = st; }, [st]);
  useEffect(() => { const r = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(CW, CH, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new THREE.OrthographicCamera(-CW / 2, CW / 2, CH / 2, -CH / 2, -2000, 2000);
    cam.position.set(0, 600, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    const wx = (px: number) => px - CW / 2, wz = (py: number) => py - CH / 2;
    scene.add(new THREE.HemisphereLight('#fff3e0', '#20362a', 1.1));
    const key = new THREE.DirectionalLight('#fff2db', 2.2); key.position.set(60, 900, 120); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -900; key.shadow.camera.right = 900; key.shadow.camera.top = 600; key.shadow.camera.bottom = -600;
    key.shadow.camera.near = 1; key.shadow.camera.far = 2000; key.shadow.radius = 4; key.shadow.bias = -0.0005; scene.add(key);
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.ShadowMaterial({ opacity: 0.33 }));
    shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.receiveShadow = true; scene.add(shadowPlane);

    const ballGeo = new THREE.SphereGeometry(BR, 48, 32);
    const meshes = new Map<number, THREE.Mesh>();
    type B = { id: number; x: number; y: number; vx: number; vy: number; in: boolean };
    const balls: B[] = [];
    for (let n = 0; n <= 15; n++) {
      const mat = new THREE.MeshPhysicalMaterial({ map: ballTexture(n), roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.07, metalness: 0, envMapIntensity: 1.15 });
      const m = new THREE.Mesh(ballGeo, mat); m.castShadow = true; m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); meshes.set(n, m);
      balls.push({ id: n, x: 0, y: 0, vx: 0, vy: 0, in: false });
    }
    // stecca + guida mira
    const woodMat = new THREE.MeshStandardMaterial({ color: '#d9b071', roughness: 0.45 });
    const cueGrp = new THREE.Group(); cueGrp.visible = false;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 560, 20), woodMat); shaft.rotation.z = Math.PI / 2; shaft.position.x = -300; shaft.castShadow = true; cueGrp.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 200, 20), new THREE.MeshStandardMaterial({ color: '#15100a', roughness: 0.6 })); grip.rotation.z = Math.PI / 2; grip.position.x = -540; cueGrp.add(grip);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 16), new THREE.MeshStandardMaterial({ color: '#3a7bd0' })); tip.rotation.z = Math.PI / 2; tip.position.x = -14; cueGrp.add(tip);
    cueGrp.position.y = BR; scene.add(cueGrp);
    const aim = new THREE.Mesh(new THREE.PlaneGeometry(1, 3), new THREE.MeshBasicMaterial({ color: '#eef3e0', transparent: true, opacity: 0.6 })); aim.rotation.x = -Math.PI / 2; aim.position.y = 1; aim.visible = false; scene.add(aim);
    const ghost = new THREE.Mesh(new THREE.TorusGeometry(BR, 3, 8, 24), new THREE.MeshBasicMaterial({ color: '#eef3e0', transparent: true, opacity: 0.85 })); ghost.rotation.x = -Math.PI / 2; ghost.position.y = 2; ghost.visible = false; scene.add(ghost);

    const cueBall = () => balls[0]!;
    const moving = () => balls.some(b => b.in && (b.vx * b.vx + b.vy * b.vy) > STOPV * STOPV);
    // sincronizza le bilie locali con lo snapshot del server (quando fermo)
    function syncFromServer() {
      const t = stateRef.current?.table; if (!t) return;
      for (const sb of t.balls) { const b = balls[sb.id]; if (!b) continue; b.x = sb.x; b.y = sb.y; b.in = sb.in; b.vx = 0; b.vy = 0; }
    }
    function physStep(dt: number) {
      for (const b of balls) { if (!b.in) continue;
        const sp = Math.hypot(b.vx, b.vy); if (sp > 0) { const ns = Math.max(0, sp - DECEL * dt), k = ns / sp; b.vx *= k; b.vy *= k; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        for (const [px, py] of POCKETS) if (Math.hypot(b.x - px, b.y - py) < CAP) { b.in = false; pocketedThisShot.current.push(b.id); break; }
        if (!b.in) continue;
        if (b.x < BX0) { b.x = BX0; b.vx = Math.abs(b.vx) * E_CUSH; } else if (b.x > BX1) { b.x = BX1; b.vx = -Math.abs(b.vx) * E_CUSH; }
        if (b.y < BY0) { b.y = BY0; b.vy = Math.abs(b.vy) * E_CUSH; } else if (b.y > BY1) { b.y = BY1; b.vy = -Math.abs(b.vy) * E_CUSH; }
      }
      for (let i = 0; i < balls.length; i++) { const a = balls[i]!; if (!a.in) continue;
        for (let j = i + 1; j < balls.length; j++) { const b = balls[j]!; if (!b.in) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), mn = 2 * BR;
          if (d > 0 && d < mn) { const nx = dx / d, ny = dy / d, ov = (mn - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
            const av = a.vx * nx + a.vy * ny, bv = b.vx * nx + b.vy * ny; if (bv - av < 0) { const im = (av - bv) * E_BALL; a.vx -= im * nx; a.vy -= im * ny; b.vx += im * nx; b.vy += im * ny; } }
        } }
    }
    function syncMeshes(dt: number) {
      for (const b of balls) { const m = meshes.get(b.id)!; m.visible = b.in; if (!b.in) continue; m.position.set(wx(b.x), BR, wz(b.y));
        const sp = Math.hypot(b.vx, b.vy); if (sp > 1) { const ax = -b.vy / sp, az = b.vx / sp; m.rotateOnWorldAxis(new THREE.Vector3(ax, 0, az), sp * dt / BR); } }
    }

    // stato-macchina tiro
    let simulating = false;
    const pocketedThisShot = { current: [] as number[] };
    let playedSeq = -1, resolving = false, shotBy: 0 | 1 = 0;
    function startShot(angle: number, power: number, by: 0 | 1) {
      syncFromServer(); const cb = cueBall(); if (!cb.in) { cb.in = true; cb.x = BX0 + 150; cb.y = (BY0 + BY1) / 2; }
      cb.vx = Math.cos(angle) * MAXV * power; cb.vy = Math.sin(angle) * MAXV * power;
      pocketedThisShot.current = []; shotBy = by; simulating = true;
      cueGrp.visible = aim.visible = ghost.visible = false; setAimPow(null);
    }
    async function finishShot() {
      simulating = false;
      const snapshot = balls.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), in: b.in }));
      const pocketed = pocketedThisShot.current.slice();
      const shotId = stateRef.current?.table.pending?.id || `m${Date.now()}`;
      resolving = true;
      try { await api('/gestione/casino/pool/resolve', { displayCode, shotId, pocketed, balls: snapshot, by: shotBy }); }
      finally { resolving = false; }
    }

    // input mira (host sul monitor touch)
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BR);
    let aiming = false, aimAng = 0, aimPower = 0;
    function toTable(cx: number, cy: number) { const r = canvas!.getBoundingClientRect(); const nd = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)); ray.setFromCamera(nd, cam); const p = new THREE.Vector3(); ray.ray.intersectPlane(plane, p); return { x: p.x + CW / 2, y: p.z + CH / 2 }; }
    const canShootNow = () => { const t = stateRef.current?.table; return !!t && t.status === 'playing' && !t.pending && !simulating && !resolving && !t.suspended; };
    function updateAim(p: { x: number; y: number }) {
      const cb = cueBall(); const dx = p.x - cb.x, dy = p.y - cb.y, d = Math.hypot(dx, dy) || 1; aimAng = Math.atan2(dy, dx); aimPower = Math.min(1, d / ((BX1 - BX0) * 0.6));
      cueGrp.position.set(wx(cb.x), BR, wz(cb.y)); cueGrp.rotation.y = -aimAng + Math.PI; (cueGrp.children[0] as THREE.Mesh).position.x = -300 - aimPower * 120; cueGrp.visible = true;
      let hitT = 900; for (const b of balls) { if (!b.in || b.id === 0) continue; const ox = b.x - cb.x, oy = b.y - cb.y, pr = ox * Math.cos(aimAng) + oy * Math.sin(aimAng); if (pr <= 0) continue; const pp = Math.abs(-ox * Math.sin(aimAng) + oy * Math.cos(aimAng)); if (pp < 2 * BR) { const tt = pr - Math.sqrt(Math.max(0, (2 * BR) ** 2 - pp * pp)); if (tt < hitT && tt > 0) hitT = tt; } }
      aim.visible = true; aim.scale.y = hitT; aim.rotation.z = -aimAng + Math.PI / 2; aim.position.set(wx(cb.x + Math.cos(aimAng) * hitT / 2), 1, wz(cb.y + Math.sin(aimAng) * hitT / 2));
      ghost.visible = true; ghost.position.set(wx(cb.x + Math.cos(aimAng) * hitT), 2, wz(cb.y + Math.sin(aimAng) * hitT));
      setAimPow(aimPower);
    }
    const onDown = (e: PointerEvent) => { if (!canShootNow()) return; aiming = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* */ } updateAim(toTable(e.clientX, e.clientY)); };
    const onMove = (e: PointerEvent) => { if (aiming) updateAim(toTable(e.clientX, e.clientY)); };
    const onUp = () => { if (aiming && aimPower > 0.05 && canShootNow()) startShot(aimAng, aimPower, stateRef.current!.table.turn); else { cueGrp.visible = aim.visible = ghost.visible = false; setAimPow(null); } aiming = false; };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
    // TIRA dal monitor: spara la mira corrente
    const tiraBtn = document.getElementById('pool-tira');
    const onTira = () => { if (aimPower > 0.05 && canShootNow()) startShot(aimAng, aimPower, stateRef.current!.table.turn); };
    tiraBtn?.addEventListener('click', onTira);

    let raf = 0, acc = 0, last = performance.now(), was = false, inited = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
      const t = stateRef.current?.table;
      if (t && !inited) { syncFromServer(); inited = true; }
      // avvia un tiro inviato dal telefono (pending nuovo non ancora giocato)
      if (t?.pending && t.pending.seq > playedSeq && !simulating && !resolving && !moving()) { playedSeq = t.pending.seq; startShot(t.pending.angle, t.pending.power, t.pending.by); }
      // quando fermo e nessun tiro in corso, allinea alle posizioni del server
      if (t && !simulating && !resolving && !moving() && !aiming) syncFromServer();
      while (acc >= DT) { if (simulating && moving()) physStep(DT); acc -= DT; }
      syncMeshes(dt);
      const mv = moving();
      if (was && !mv && simulating) void finishShot();
      was = mv;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
      tiraBtn?.removeEventListener('click', onTira);
      renderer.dispose(); pmrem.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCode]);

  const scale = Math.min(dim.w / CW, dim.h / CH);
  const t = st?.table;
  const joinUrl = `${ORIGIN}gestione/casino?poolplay=${displayCode}`;
  const racks = (n: number) => Array.from({ length: Math.max(5, (t?.winRacks ?? 2)) }, (_, i) => i < n);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05100b', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <style>{`@font-face{font-family:"CinzelB";src:url(${ASSET}Cinzel-Variable.ttf) format("truetype");font-weight:400 900;font-display:swap}`}</style>
      <div style={{ position: 'relative', width: CW, height: CH, transform: `scale(${scale})`, transformOrigin: 'center center', fontFamily: '"CinzelB",Georgia,serif' }}>
        {/* TAVOLO dipinto (asset approvato, identico) */}
        <img src={`${ASSET}tavolo.png`} alt="" style={{ position: 'absolute', inset: 0, width: CW, height: CH, display: 'block', zIndex: 1 }} draggable={false} />
        {/* BILIE + stecca 3D */}
        <canvas ref={canvasRef} width={CW} height={CH} style={{ position: 'absolute', inset: 0, width: CW, height: CH, zIndex: 2 }} />
        {/* TOP BAR (dinamica) */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: CW, height: 95, zIndex: 3, background: 'linear-gradient(180deg,#141b16,#0a0f0a)', display: 'flex', alignItems: 'center' }}>
          <img src={`${ASSET}logo-originale.png`} alt="IDEA EVENTI" style={{ height: 74, marginLeft: 16, filter: 'drop-shadow(0 2px 4px #000)' }} />
          <PlayerPanel seat={t?.seats[0]} side="l" active={t?.turn === 0} wins={racks(t?.wins?.[0] ?? 0)} />
          <div style={{ position: 'absolute', left: '50%', top: 24, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#caa24a', fontSize: 15, margin: '0 14px' }}>◆</span>
            <b style={{ fontSize: 33, letterSpacing: '.16em', background: 'linear-gradient(180deg,#fff6d2,#e9c061 55%,#b9842a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>BILIARDO CLUB</b>
            <span style={{ color: '#caa24a', fontSize: 15, margin: '0 14px' }}>◆</span>
          </div>
          <PlayerPanel seat={t?.seats[1]} side="r" active={t?.turn === 1} wins={racks(t?.wins?.[1] ?? 0)} />
        </div>
        {/* BARRA COMANDI = chrome dipinto + overlay vivi */}
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: CW, height: 124, zIndex: 3, background: `url(${ASSET}barra-bottom.png) 0 0/${CW}px 124px no-repeat` }} />
        {aimPow != null && <>
          <div style={{ position: 'absolute', left: 540, top: 934, width: 392, height: 28, background: '#0a0f0a', borderRadius: 14, zIndex: 4 }} />
          <div style={{ position: 'absolute', left: 544, top: 938, height: 20, width: aimPow * 388, borderRadius: 10, background: 'linear-gradient(90deg,#caa24a,#ffe49a 70%,#fff6d2)', boxShadow: '0 0 10px #e8c87966', zIndex: 5 }} />
          <div style={{ position: 'absolute', left: 946, top: 922, width: 92, textAlign: 'center', color: '#f3e4b6', font: '700 30px/1 "CinzelB",serif', zIndex: 5 }}>{Math.round(aimPow * 100)}%</div>
        </>}
        <div id="pool-tira" style={{ position: 'absolute', left: 1250, top: 918, width: 272, height: 92, zIndex: 5, cursor: 'pointer' }} title="TIRA" />

        {/* LOBBY: QR per entrare */}
        {t?.status === 'lobby' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'grid', placeItems: 'center', background: 'rgba(4,16,10,.72)' }}>
            <div style={{ textAlign: 'center', color: '#f3e4b6' }}>
              <div style={{ background: '#fff', padding: 16, borderRadius: 14, display: 'inline-block', boxShadow: '0 0 0 3px #caa24a' }}><QRCodeSVG value={joinUrl} size={240} /></div>
              <div style={{ fontSize: 34, marginTop: 18 }}>Inquadra e gioca dal telefono</div>
              <div style={{ fontSize: 22, color: '#cdbf86', marginTop: 6, letterSpacing: '.2em' }}>CODICE TAVOLO <b style={{ color: '#ffe9a6' }}>{displayCode}</b></div>
              <div style={{ fontSize: 20, color: '#9fe0b4', marginTop: 14 }}>Giocatori: {((t.seats[0].playerId ? 1 : 0) + (t.seats[1].playerId ? 1 : 0))} / 2 · servono 2 giocatori</div>
            </div>
          </div>
        )}
        {/* VITTORIA */}
        {t?.status === 'finished' && t.winner != null && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 7, display: 'grid', placeItems: 'center', background: 'rgba(4,16,10,.8)' }}>
            <div style={{ textAlign: 'center', padding: '34px 70px', borderRadius: 24, border: '5px solid #e9c766', background: 'radial-gradient(ellipse at 50% 20%,#0d3321,#061a10)' }}>
              <h2 style={{ margin: 0, font: '800 60px/1 "CinzelB",serif', color: '#f0ca68' }}>VINCE {(t.seats[t.winner].nickname ?? '—').toUpperCase()}</h2>
              <div style={{ color: '#f3e4b6', fontSize: 34, marginTop: 14 }}>{t.seats[0].nickname ?? 'G1'} {t.wins[0]} — {t.wins[1]} {t.seats[1].nickname ?? 'G2'}</div>
              <button onClick={() => api('/gestione/casino/pool/new', { displayCode })} style={{ marginTop: 22, padding: '16px 44px', borderRadius: 16, border: '3px solid #e9c766', background: 'linear-gradient(180deg,#ffe694,#d59a34)', color: '#231503', font: '700 30px/1 "CinzelB",serif', cursor: 'pointer' }}>↻ RIVINCITA</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerPanel({ seat, side, active, wins }: { seat?: Seat; side: 'l' | 'r'; active?: boolean; wins: boolean[] }) {
  const av = (
    <div style={{ width: 62, height: 62, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${active ? (side === 'l' ? '#1f9d55' : '#d23b3b') : '#5a5440'}`, background: '#10140f', boxShadow: '0 2px 8px #000', flex: 'none' }}>
      {seat?.avatarUrl ? <img src={seat.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#8aa', fontSize: 26 }}>👤</div>}
    </div>
  );
  const dots = <div style={{ display: 'flex', gap: 9 }}>{wins.map((on, i) => <span key={i} style={{ width: 17, height: 17, borderRadius: '50%', border: '2px solid #7a6327', background: on ? 'radial-gradient(circle at 38% 32%,#ffe9a0,#c79a35)' : '#0c0f0a' }} />)}</div>;
  const nm = <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: active ? 1 : 0.7 }}>
    <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: '.04em', color: '#f3e4b6', textShadow: '0 2px 4px #000' }}>{(seat?.nickname ?? 'In attesa').toUpperCase()}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{dots}<span style={{ color: '#e9c766', fontSize: 16, fontWeight: 700 }}>🐟 {seat?.fish ?? 0}</span></div>
  </div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...(side === 'l' ? { marginLeft: 20 } : { marginLeft: 'auto', marginRight: 18, flexDirection: 'row-reverse' }) }}>
      {av}{nm}
    </div>
  );
}

/* ════════════════════════════════════════════════ TELEFONO ══════════════════ */
const PHONE_CSS = `
@font-face{font-family:"CinzelB";src:url(${ASSET}Cinzel-Variable.ttf) format("truetype");font-weight:400 900;font-display:swap}
.bp{position:fixed;inset:0;overflow:auto;color:#eafff2;font-family:"CinzelB",Georgia,serif;background:radial-gradient(ellipse 150% 80% at 50% 0%,#0f3a26,#07251a 60%,#041a12);display:flex;flex-direction:column;align-items:center}
.bp .wrap{width:100%;max-width:460px;min-height:100%;display:flex;flex-direction:column;padding:16px 16px 28px;gap:14px}
.bp .brand{text-align:center;font:800 24px/1 "CinzelB",serif;color:#f0ca68;letter-spacing:.06em;margin-top:6px}
.bp .brand small{display:block;color:#bfe6cf;font:600 13px/1 "CinzelB",serif;letter-spacing:.26em;margin-top:5px}
.bp .h2{text-align:center;color:#bfe6cf;font-size:15px}
.bp canvas{width:100%;aspect-ratio:1536/1024;background:#0b2a1b;border-radius:14px;border:2px solid #caa84f55;touch-action:none;display:block}
.bp .pad{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bp .lab{color:#cdbf86;font:700 13px/1 "CinzelB",serif;letter-spacing:.14em;text-align:center}
.bp .slider{width:100%}
.bp .cta{width:100%;padding:18px;border-radius:16px;border:none;font:800 24px/1 "CinzelB",serif;color:#231503;cursor:pointer;background:linear-gradient(180deg,#ffe694,#f0c357 52%,#d59a34);box-shadow:0 4px 0 #7a4d12}
.bp .cta:disabled{opacity:.45;box-shadow:none}
.bp .seatbtn{width:100%;padding:16px;border-radius:14px;border:2px solid #caa84f66;background:#ffffff0c;color:#eafff2;font:700 18px/1 "CinzelB",serif;cursor:pointer}
.bp .big{font:800 40px/1 "CinzelB",serif;color:#f6e7bf;text-align:center}
.bp .note{text-align:center;border-radius:14px;padding:14px;font:700 18px/1.3 "CinzelB",serif;background:#ffffff0c;color:#bfe6cf}
`;

export function BiliardoPhone({ displayCode }: { displayCode: string }) {
  const st = usePool(displayCode, 600);
  const [playerCode, setPlayerCode] = useState<string>(() => { try { return localStorage.getItem('casino_player') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [power, setPower] = useState(0.6);
  const [ang, setAng] = useState(0);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const t = st?.table;
  const mineRef = useRef<Set<string>>(new Set());
  const isMine = (pid: string | null) => mineRef.current.has(pid || '');
  const me: 0 | 1 | null = t ? (t.seats[0].playerId && isMine(t.seats[0].playerId) ? 0 : t.seats[1].playerId && isMine(t.seats[1].playerId) ? 1 : null) : null;

  const join = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      let pc = playerCode;
      if (!pc) { const info = await api(`/gestione/casino/pool/${displayCode}`); if (!info?.table) { setErr('Tavolo non trovato'); return; } }
      const r = await api('/gestione/casino/pool/join', { displayCode, playerCode: pc });
      if (r?.error) { setErr(r.error); return; }
      if (r?.you?.playerId) { mineRef.current.add(r.you.playerId); }
    } finally { setBusy(false); }
  }, [displayCode, playerCode]);

  // disegna il tavolo mini col posizionamento bilie
  useEffect(() => {
    const cv = cvRef.current; if (!cv || !t) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    cv.width = CW; cv.height = CH;
    const img = new Image(); img.src = `${ASSET}tavolo.png`;
    const draw = () => {
      ctx.clearRect(0, 0, CW, CH);
      if (img.complete) ctx.drawImage(img, 0, 0, CW, CH); else { ctx.fillStyle = '#0b2a1b'; ctx.fillRect(0, 0, CW, CH); }
      for (const b of t.balls) { if (!b.in) continue;
        ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, 7); ctx.fillStyle = b.id === 0 ? '#f3ecd6' : COLORS[b.id] || '#ccc'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#00000055'; ctx.stroke();
        if (b.id !== 0) { ctx.fillStyle = b.id >= 9 ? '#fff' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, BR * 0.5, 0, 7); ctx.fillStyle = '#fbf7ea'; ctx.fill(); ctx.fillStyle = '#14110c'; ctx.font = `bold ${BR}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.id), b.x, b.y + 1); }
      }
      const cue = t.balls.find(b => b.id === 0 && b.in);
      if (cue && me === t.turn) { ctx.strokeStyle = '#eef3e0'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(cue.x + Math.cos(ang) * 420, cue.y + Math.sin(ang) * 420); ctx.stroke(); ctx.setLineDash([]); }
    };
    img.onload = draw; draw();
  }, [t, ang, me]);

  // mira trascinando sul mini-tavolo
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0 && e.type === 'pointermove') return;
      const r = cv.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * CW, y = ((e.clientY - r.top) / r.height) * CH;
      const cue = st?.table.balls.find(b => b.id === 0 && b.in); if (!cue) return;
      setAng(Math.atan2(y - cue.y, x - cue.x));
    };
    cv.addEventListener('pointerdown', onMove); cv.addEventListener('pointermove', onMove);
    return () => { cv.removeEventListener('pointerdown', onMove); cv.removeEventListener('pointermove', onMove); };
  }, [st]);

  const shoot = async () => {
    setBusy(true); setErr('');
    try { const r = await api('/gestione/casino/pool/shoot', { displayCode, playerCode, angle: ang, power, spinX: 0, spinY: 0, commandId: `${displayCode}-${Date.now()}` }); if (r?.error) setErr(r.error); }
    finally { setBusy(false); }
  };

  const Shell = (inner: React.ReactNode) => (<div className="bp"><style>{PHONE_CSS}</style><div className="wrap"><div className="brand">BILIARDO CLUB<small>IDEA EVENTI</small></div>{err && <div className="note" style={{ color: '#ff9b9b' }}>{err}</div>}{inner}</div></div>);

  if (!t) return Shell(<div className="h2" style={{ marginTop: 20 }}>Carico il tavolo…</div>);
  if (me == null) return Shell(<>
    <div className="h2">Entra al tavolo ({((t.seats[0].playerId ? 1 : 0) + (t.seats[1].playerId ? 1 : 0))}/2)</div>
    <button className="cta" disabled={busy} onClick={join}>Prendi un posto ›</button>
    <div className="h2">Serve essere giocatori della serata (accesso dal QR della serata).</div>
  </>);
  if (t.status === 'finished') return Shell(<>
    <div className="big">{t.winner === me ? 'HAI VINTO 🏆' : 'Hai perso'}</div>
    <div className="h2">{t.seats[0].nickname ?? 'G1'} {t.wins[0]} — {t.wins[1]} {t.seats[1].nickname ?? 'G2'}</div>
    <div className="note">🐟 I tuoi fish: <b>{t.seats[me].fish}</b></div>
  </>);
  const myTurn = me === t.turn && t.status === 'playing' && !t.pending;
  return Shell(<>
    <div className="h2">{t.status === 'lobby' ? 'In attesa del secondo giocatore…' : myTurn ? 'È IL TUO TURNO — mira e tira' : t.pending ? 'Tiro in corso…' : `Turno di ${t.seats[t.turn].nickname ?? 'avversario'}`}</div>
    <canvas ref={cvRef} />
    <div className="lab">POTENZA {Math.round(power * 100)}%</div>
    <input className="slider" type="range" min={5} max={100} value={Math.round(power * 100)} onChange={e => setPower(+e.target.value / 100)} />
    <button className="cta" disabled={!myTurn || busy} onClick={shoot}>TIRA</button>
    <div className="h2">🐟 {t.seats[me].fish} fish · rack {t.wins[0]}–{t.wins[1]}</div>
  </>);
}

/**
 * GameFlowPhone — Phone-side universal pre-game flow controller.
 * Phases: theme_select (waiting) → booking → confirm → countdown
 *
 * Supports: sfida-ballo (generic booking), parola-alle-spalle (INDOVINO / SUGGERITORE role selection).
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { SensorBridge } from '../lib/SensorBridge';
import { type FlowPayload, type FlowBookedPlayer, FLOW_GAME_UI, useFlowCountdown } from './GameFlowEngine';

const MOTION_PERM_KEY = 'ideagame:motion-permission';
type SensorPerm = 'idle' | 'granted' | 'denied' | 'unsupported';

interface HomeSession {
  id: string;
  gameSlug: string | null;
  roundPayload: Record<string, unknown>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

// ── Role slot config (mirrors GameFlowEngine) ────────────────────────────────────

interface PhoneRoleSlot {
  role: 'guesser' | 'suggester';
  label: string;
  sublabel: string;
  color: string;
  emoji: string;
}

const GAME_ROLE_SLOTS: Record<string, PhoneRoleSlot[]> = {
  'parola-alle-spalle': [
    { role: 'guesser',   label: 'DIVENTA INDOVINO',    sublabel: 'Non vedrai la parola — devi indovinarla!',    color: '#A78BFA', emoji: '🙈' },
    { role: 'suggester', label: 'DIVENTA SUGGERITORE',  sublabel: 'Vedrai la parola — devi farla indovinare!',   color: '#22D3EE', emoji: '💬' },
  ],
};

// ── Ballo: il "prescelto" sceglie il brano YouTube da ballare ────────────────
interface BalloSong { videoId: string; title: string; channel: string; thumbnailUrl: string; durationSeconds: number }
function BalloPrescelto({ sessionId }: { sessionId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BalloSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true); setErr(null); setResults([]);
    try {
      const r = await fetch(`/api/home/sessions/${sessionId}/ballo/search`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const d = await r.json() as { ok?: boolean; results?: BalloSong[]; error?: string };
      if (!d.ok || !d.results?.length) { setErr('Nessun risultato — riprova con artista + titolo'); return; }
      setResults(d.results);
    } catch { setErr('Ricerca fallita'); }
    finally { setLoading(false); }
  }

  async function pick(song: BalloSong) {
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`/api/home/sessions/${sessionId}/ballo/set-video`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song),
      });
      if (!r.ok) { setErr('Errore nel salvare il brano'); return; }
      // Al successo, home:state aggiornerà il payload (balloVideo) e questo pannello sparisce.
    } catch { setErr('Connessione fallita'); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 py-4">
      <div className="text-center">
        <div className="text-4xl">🎲</div>
        <div className="text-display text-2xl font-black text-white">SEI IL PRESCELTO!</div>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Scegli il brano su cui balleranno tutti</div>
      </div>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void search(); }}
          placeholder="Artista + titolo (es. Måneskin Beggin)"
          className="flex-1 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white outline-none"
          style={{ border: '1px solid rgba(255,255,255,0.2)' }} />
        <button onClick={() => void search()} disabled={loading || !query.trim()}
          className="rounded-xl px-4 py-2.5 font-black disabled:opacity-40" style={{ background: '#A78BFA', color: '#0a0820' }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cerca'}
        </button>
      </div>
      {err && <div className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: '#FCA5A5' }}>{err}</div>}
      <div className="flex flex-col gap-2">
        {results.map(song => (
          <button key={song.videoId} onClick={() => void pick(song)} disabled={saving}
            className="flex items-center gap-3 rounded-xl p-2 text-left disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <img src={song.thumbnailUrl} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{song.title}</div>
              <div className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{song.channel}</div>
            </div>
            {saving ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <span className="text-lg">▶︎</span>}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export function GameFlowPhone({
  session,
  player,
  emit,
}: {
  session: HomeSession;
  player: HomePlayer;
  emit: (event: string, data: unknown) => void;
}) {
  const p = session.roundPayload as unknown as FlowPayload;
  const gameUI = FLOW_GAME_UI[p.gameSlug ?? ''] ?? { color: '#A78BFA', glow: '#C4B5FD', emoji: '🎮', name: 'Gioco' };

  const bookedPlayers = (p.bookedPlayers ?? []) as FlowBookedPlayer[];
  const maxPlayers = Number(p.maxPlayers ?? 2);
  const isBooked = bookedPlayers.some((b) => b.id === player.id);
  const isFull = bookedPlayers.length >= maxPlayers;
  const selectedTheme = p.selectedTheme as { id: string; name: string } | null;
  const roleSlots = GAME_ROLE_SLOTS[p.gameSlug ?? ''] ?? null;

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState<boolean | null>(null);

  // Sensor permission state — only meaningful when gameSlug === 'sfida-ballo'
  const [sensorPerm, setSensorPerm] = useState<SensorPerm>(() => {
    if (p.gameSlug !== 'sfida-ballo') return 'idle';
    try {
      if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
      const saved = localStorage.getItem(MOTION_PERM_KEY);
      if (saved === 'granted') return 'granted';
      if (saved === 'denied') return 'denied';
      // Also check global device preflight written by handleEnterRoom
      const rawCaps = sessionStorage.getItem('ideagame:device-capabilities');
      if (rawCaps) {
        const caps = JSON.parse(rawCaps) as { motionPermission?: string };
        if (caps.motionPermission === 'granted') return 'granted';
        if (caps.motionPermission === 'denied')  return 'denied';
      }
    } catch { /* ignore */ }
    return 'idle';
  });

  const { num, showGo } = useFlowCountdown(p.gameFlowPhase === 'countdown');

  async function book(action: 'book' | 'unbook', role?: 'guesser' | 'suggester') {
    if (booking) return;
    setBooking(true);

    let sensorReadyResult = false;

    if (action === 'book' && p.gameSlug === 'sfida-ballo') {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
      window.getSelection()?.removeAllRanges();

      const permPromise = SensorBridge.start();
      const perm = await permPromise;
      localStorage.setItem(MOTION_PERM_KEY, perm);
      setSensorPerm(perm);

      if (perm === 'granted') {
        await new Promise<void>(resolve => {
          const POLL = 50;
          const MAX  = 1500;
          let elapsed = 0;
          const tick = setInterval(() => {
            elapsed += POLL;
            const s = SensorBridge.getStatus();
            if (s.motionEvents + s.orientEvents > 0 || elapsed >= MAX) {
              clearInterval(tick);
              resolve();
            }
          }, POLL);
        });

        const s = SensorBridge.getStatus();
        sensorReadyResult = s.motionEvents + s.orientEvents > 0;
        console.log('[SensorBridge] pre-booking status —', { ...s, sensorReadyResult });
      }

      const _diag = {
        motionGranted: SensorBridge.getStatus().permMotion,
        orientGranted: SensorBridge.getStatus().permOrient,
        tempMotion:    SensorBridge.getStatus().motionEvents,
        tempOrient:    SensorBridge.getStatus().orientEvents,
        sensorReady:   sensorReadyResult,
        ts:            Date.now(),
      };
      try { sessionStorage.setItem('ideagame:ballo-diag', JSON.stringify(_diag)); } catch { /* ignore */ }
      console.log('[SensorFinal] booking complete —', _diag);
    }

    // Mic preflight for INDOVINO — request permission inside the user gesture before the API call
    if (action === 'book' && role === 'guesser' && navigator.mediaDevices?.getUserMedia) {
      console.log('[WordBackMicPreflight] booking role: guesser');
      console.log('[WordBackMicPreflight] getUserMedia start');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        try { sessionStorage.setItem('ideagame:wordback-mic-ready', 'true'); } catch { /* ignore */ }
        setMicReady(true);
        console.log('[WordBackMicPreflight] granted — micReady saved');
      } catch {
        try { sessionStorage.setItem('ideagame:wordback-mic-ready', 'false'); } catch { /* ignore */ }
        setMicReady(false);
        console.log('[WordBackMicPreflight] denied');
      }
    }

    try {
      setBookingError(null);
      const res = await fetch(`/api/home/sessions/${session.id}/flow/book-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          nickname: player.nickname,
          avatarColor: player.avatarColor,
          action,
          ...(role ? { role } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setBookingError(body.error ?? 'Prenotazione non riuscita');
      } else if (action === 'book' && p.gameSlug === 'sfida-ballo') {
        emit('home:player_sensor_ready', {
          sessionId: session.id,
          playerId: player.id,
          sensorReady: sensorReadyResult,
        });
      }
      if (res.ok && action === 'book') (window as any).MC?.event?.("prenotazione"); // Mission Control: conversione
    } finally { setBooking(false); }
  }

  async function activateSensors() {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    window.getSelection()?.removeAllRanges();
    if (typeof DeviceMotionEvent === 'undefined') { setSensorPerm('unsupported'); return; }
    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    const doe2 = (typeof DeviceOrientationEvent !== 'undefined')
      ? DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      : null;
    if (typeof dme.requestPermission === 'function') {
      let motionP: Promise<string>;
      try { motionP = dme.requestPermission(); }
      catch { motionP = Promise.resolve('denied'); }

      let orientP: Promise<string> = Promise.resolve('granted');
      if (typeof doe2?.requestPermission === 'function') {
        try { orientP = doe2.requestPermission(); }
        catch { orientP = Promise.resolve('denied'); }
      }

      let motionGranted = false;
      let orientGranted = false;
      try { motionGranted = (await motionP) === 'granted'; } catch { /* ignore */ }
      try { orientGranted = (await orientP) === 'granted'; } catch { /* ignore */ }

      const perm: SensorPerm = (motionGranted || orientGranted) ? 'granted' : 'denied';
      localStorage.setItem(MOTION_PERM_KEY, perm);
      setSensorPerm(perm);
    } else {
      localStorage.setItem(MOTION_PERM_KEY, 'granted');
      setSensorPerm('granted');
    }
  }

  console.log('[BalloFlow] GameFlowPhone render — phase:', p.gameFlowPhase, '| mode:', p.mode, '| player:', player.id.slice(-4));

  // ── BALLO: se sono il prescelto e non ho ancora scelto il brano, prendo il controllo ──
  if (p.gameSlug === 'sfida-ballo' && p.prescelto?.id === player.id && !p.balloVideo) {
    return <BalloPrescelto sessionId={session.id} />;
  }

  // ── WAITING FOR SUBTYPE (karaoke-battle only) ─────────────────────────────────

  if (p.gameFlowPhase === 'subtype_select') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-4">
        <motion.div className="text-5xl"
          animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          {gameUI.emoji}
        </motion.div>
        <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
        <div className="rounded-2xl px-5 py-4 text-center"
          style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
          <div className="text-sm font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>
            L'animatore sta scegliendo il formato…
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs font-semibold">In attesa</span>
        </div>
      </motion.div>
    );
  }

  // ── WAITING FOR THEME ─────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'theme_select') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-4">
        <motion.div className="text-5xl"
          animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          {gameUI.emoji}
        </motion.div>
        <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
        <div className="rounded-2xl px-5 py-4 text-center"
          style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
          <div className="text-sm font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>
            L'animatore sta scegliendo il tema…
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs font-semibold">In attesa</span>
        </div>
      </motion.div>
    );
  }

  // ── BOOKING ───────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'booking') {

    // No-booking variant (maxPlayers === 0)
    if (maxPlayers === 0) {
      return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 py-4">
          <motion.div className="text-5xl"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            {gameUI.emoji}
          </motion.div>
          <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
          {selectedTheme && (
            <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
              {selectedTheme.name}
            </div>
          )}
          <div className="rounded-2xl px-5 py-4 text-center"
            style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
            <div className="text-base font-black" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Tutti i giocatori partecipano!
            </div>
            <div className="mt-1 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Attendi che l'animatore avvii il gioco
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-semibold">In attesa dell'animatore…</span>
          </div>
        </motion.div>
      );
    }

    // Already booked
    if (isBooked) {
      const myBooking = bookedPlayers.find(b => b.id === player.id);
      const myRoleSlot = roleSlots?.find(s => s.role === myBooking?.role) ?? null;
      return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 py-4">
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            className="flex h-24 w-24 items-center justify-center rounded-full text-4xl font-black"
            style={{
              background: `linear-gradient(135deg,${myRoleSlot?.color ?? gameUI.color},${gameUI.glow})`,
              boxShadow: `0 0 50px ${myRoleSlot?.color ?? gameUI.color}66`,
              color: '#0a0015',
            }}>
            {myRoleSlot ? myRoleSlot.emoji : '✓'}
          </motion.div>
          <div className="text-display text-2xl font-black text-white">
            {myRoleSlot ? myRoleSlot.label : 'SEI IN GARA!'}
          </div>
          {myRoleSlot && (
            <div className="rounded-2xl px-5 py-3 text-center"
              style={{ background: `${myRoleSlot.color}14`, border: `1px solid ${myRoleSlot.color}33` }}>
              <div className="text-base font-black" style={{ color: myRoleSlot.color }}>
                {myRoleSlot.sublabel}
              </div>
            </div>
          )}
          <div className="rounded-2xl px-5 py-3 text-center"
            style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
            <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
              {selectedTheme?.name ?? gameUI.name}
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Attendi che l'animatore avvii la sfida
            </div>
          </div>

          {/* Mic readiness badge — guesser role only */}
          {myBooking?.role === 'guesser' && micReady !== null && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}>
              {micReady ? (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80' }}>
                  🎤 Microfono pronto
                </div>
              ) : (
                <div className="rounded-xl px-4 py-2 text-xs font-bold text-center"
                  style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', color: 'rgba(251,146,60,0.9)' }}>
                  ✏️ Microfono non autorizzato. Potrai usare la risposta scritta.
                </div>
              )}
            </motion.div>
          )}

          {/* Sensor status badge — Ballo only */}
          {p.gameSlug === 'sfida-ballo' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}>
              {sensorPerm === 'granted' && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80' }}>
                  ✅ Sensori pronti
                </div>
              )}
              {sensorPerm === 'denied' && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-center"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: 'rgba(255,100,100,0.8)' }}>
                  ⚠️ Sei in gara, ma i sensori non sono attivi
                </div>
              )}
              {sensorPerm === 'unsupported' && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                  📱 Sensori non supportati
                </div>
              )}
              {sensorPerm === 'idle' && (
                <button onClick={() => void activateSensors()}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black"
                  style={{ background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.4)', color: '#c084fc', cursor: 'pointer' }}>
                  📱 Attiva sensori movimento
                </button>
              )}
            </motion.div>
          )}

          <button onClick={() => void book('unbook')} disabled={booking}
            className="text-xs font-semibold underline disabled:opacity-50"
            style={{ color: 'rgba(255,255,255,0.25)' }}>
            {booking ? 'Annullamento…' : 'Annulla prenotazione'}
          </button>
        </motion.div>
      );
    }

    // ── PAROLA ALLE SPALLE: role selection UI ─────────────────────────────────
    if (roleSlots && !isFull) {
      const typedBooked = bookedPlayers as Array<FlowBookedPlayer & { role?: string }>;
      return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 py-4">
          <div className="text-5xl">{gameUI.emoji}</div>
          <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
          {selectedTheme && (
            <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
              {selectedTheme.name}
            </div>
          )}
          <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Scegli il tuo ruolo:
          </div>
          <div className="flex flex-col gap-3 w-full">
            {roleSlots.map((rs) => {
              const taken = typedBooked.some(b => b.role === rs.role);
              return (
                <motion.button key={rs.role}
                  onClick={() => !taken && void book('book', rs.role)}
                  disabled={booking || taken}
                  whileHover={{ scale: taken ? 1 : 1.03 }} whileTap={{ scale: taken ? 1 : 0.96 }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl px-6 py-5 text-center disabled:opacity-40"
                  style={taken
                    ? { background: 'rgba(255,255,255,0.04)', border: `2px solid ${rs.color}22` }
                    : { background: `linear-gradient(135deg,${rs.color}25,${rs.color}10)`, border: `2px solid ${rs.color}77`, boxShadow: `0 0 30px ${rs.color}33` }
                  }>
                  <div className="text-3xl">{rs.emoji}</div>
                  <div className="text-xl font-black" style={{ color: taken ? 'rgba(255,255,255,0.3)' : rs.color }}>
                    {booking ? <Loader2 className="h-5 w-5 animate-spin inline" /> : rs.label}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: taken ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)' }}>
                    {taken ? '✓ Ruolo già occupato' : rs.sublabel}
                  </div>
                </motion.button>
              );
            })}
          </div>
          {bookedPlayers.length > 0 && (
            <div className="flex gap-2 mt-1">
              {bookedPlayers.map((bp) => (
                <div key={bp.id} className="flex items-center gap-1.5 rounded-full px-3 py-1"
                  style={{ background: `${bp.avatarColor}22`, border: `1px solid ${bp.avatarColor}55` }}>
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: bp.avatarColor, color: '#0a0015' }}>
                    {bp.nickname[0]?.toUpperCase()}
                  </div>
                  <span className="text-xs font-black" style={{ color: bp.avatarColor }}>{bp.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      );
    }

    // Generic "posti esauriti" (full, not booked)
    if (isFull) {
      return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 py-4">
          <div className="text-5xl">👀</div>
          <div className="text-display text-2xl font-black text-white">SEI SPETTATORE</div>
          <div className="text-sm font-semibold text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
            I posti per questa sfida sono esauriti.<br />Tifa per i tuoi compagni!
          </div>
          <div className="flex gap-2 mt-1">
            {bookedPlayers.map((bp) => (
              <div key={bp.id}
                className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-black"
                style={{ background: bp.avatarColor, color: '#0a0015' }}>
                {bp.nickname[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    // Generic booking button (sfida-ballo and others)
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-4">
        <div className="text-5xl">{gameUI.emoji}</div>
        <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
        {selectedTheme && (
          <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
            {selectedTheme.name}
          </div>
        )}
        <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {bookedPlayers.length}/{maxPlayers} prenotati
        </div>
        {bookedPlayers.length > 0 && (
          <div className="flex gap-2">
            {bookedPlayers.map((bp) => (
              <div key={bp.id} className="flex items-center gap-1.5 rounded-full px-3 py-1"
                style={{ background: `${bp.avatarColor}22`, border: `1px solid ${bp.avatarColor}55` }}>
                <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: bp.avatarColor, color: '#0a0015' }}>
                  {bp.nickname[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-black" style={{ color: bp.avatarColor }}>{bp.nickname}</span>
              </div>
            ))}
          </div>
        )}
        <motion.button onClick={() => book('book')} disabled={booking}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 rounded-2xl px-8 py-4 text-xl font-black text-white disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg,${gameUI.color},${gameUI.glow})`,
            boxShadow: `0 0 45px ${gameUI.color}66`,
            border: 'none',
          }}>
          {booking ? <Loader2 className="h-5 w-5 animate-spin" /> : '🙋'}
          MI PRENOTO!
        </motion.button>
        {bookingError && (
          <div className="rounded-xl px-4 py-2 text-sm font-black text-center"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
            ❌ {bookingError}
          </div>
        )}
      </motion.div>
    );
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'confirm') {
    const myBooking = bookedPlayers.find(b => b.id === player.id);
    const myRoleSlot = roleSlots?.find(s => s.role === (myBooking as FlowBookedPlayer & { role?: string } | undefined)?.role) ?? null;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 py-4">
        <div className="text-5xl">{myRoleSlot ? myRoleSlot.emoji : gameUI.emoji}</div>
        <div className="text-display text-2xl font-black text-white">
          {isBooked
            ? (myRoleSlot ? myRoleSlot.label : 'SEI IN GARA!')
            : 'SEI SPETTATORE'}
        </div>
        <div className="flex items-center gap-2" style={{ color: gameUI.color }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-black text-sm">L'animatore sta per avviare…</span>
        </div>
      </motion.div>
    );
  }

  // ── COUNTDOWN ─────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'countdown') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center gap-4 py-8">
        <AnimatePresence mode="wait">
          {!showGo ? (
            <motion.div key={num}
              initial={{ scale: 1.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="text-display font-black leading-none select-none"
              style={{
                fontSize: '8rem',
                color: gameUI.color,
                textShadow: `0 0 60px ${gameUI.color}88`,
              }}>
              {num}
            </motion.div>
          ) : (
            <motion.div key="go"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 16 }}
              className="text-display font-black leading-none select-none"
              style={{
                fontSize: '5rem',
                color: '#F5B642',
                textShadow: '0 0 60px rgba(245,182,66,0.8)',
              }}>
              VIA!
            </motion.div>
          )}
        </AnimatePresence>
        <div className="text-base font-black" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {isBooked
            ? (showGo ? `${gameUI.emoji} VIA!` : 'Preparati…')
            : (showGo ? '👏 Forza!' : 'Prendi posizione…')}
        </div>
      </motion.div>
    );
  }

  return null;
}

/**
 * HomeJoin — Pagina telefono per Modalità HOME
 *
 * URL: /home/join?s=CODE
 *
 * Flusso: code → nickname → lobby → playing (controller per ogni gioco) → ended
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SensorBridge } from '../lib/SensorBridge';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Check, ChevronRight, Star, Music,
  Laugh, Zap, ShieldAlert, MessageSquare, Mic, Timer,
} from 'lucide-react';
import { useEventSocket, getSocket } from '@/hooks/useEventSocket';
import { RISATE_MISSIONS, REACTION_EMOJIS, type RisateState } from '@/data/risate-missions';
import {
  type KaraokeHomeState, type YTSearchResult, type VotingBallot,
  ALL_REACTIONS,
  formatCountdown, remainingSessionSeconds, getPlayerQueueItem,
  canQueueAnyMore, waitEstimateLabel, computeAwards,
} from '@/data/karaoke-home';
import { GameFlowPhone } from '@/components/GameFlowPhone';
import PressToTalkAnswer, { type AnswerResult } from '@/components/PressToTalkAnswer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  joinCode: string;
  gameSlug: string | null;
  gameConfig: Record<string, unknown>;
  status: 'lobby' | 'playing' | 'ended';
  currentRound: number;
  totalRounds: number;
  roundPayload: Record<string, unknown>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

const GAME_INFO: Record<string, { name: string; emoji: string; color: string; icon: React.ReactNode }> = {
  'percorso-a-risate':  { name:'Percorso a Risate',   emoji:'😂', color:'#34D399', icon:<Laugh className="h-5 w-5"/> },
  'gioco-coppie':       { name:'Gioco delle Coppie',  emoji:'💞', color:'#F472B6', icon:<Zap className="h-5 w-5"/> },
  'quizzone':           { name:'Quizzone',             emoji:'⭐', color:'#F5B642', icon:<Star className="h-5 w-5"/> },
  'saramusica':         { name:'SaraMusica',           emoji:'🎵', color:'#60A5FA', icon:<Music className="h-5 w-5"/> },
  'adult-only':         { name:'Adult Only',           emoji:'🔞', color:'#F87171', icon:<ShieldAlert className="h-5 w-5"/> },
  'sfida-ballo':        { name:'Sfida di Ballo',       emoji:'💃', color:'#A78BFA', icon:<span>💃</span> },
  'parola-alle-spalle': { name:'Parola alle Spalle',   emoji:'💬', color:'#22D3EE', icon:<MessageSquare className="h-5 w-5"/> },
  'karaoke-battle':     { name:'Karaoke Battle',       emoji:'🎤', color:'#FB923C', icon:<Mic className="h-5 w-5"/> },
};

// ── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ideagame:home:player';
function saveJoin(sessionId: string, joinCode: string, playerId: string, nick: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, joinCode, playerId, nickname: nick })); } catch { /* ignore */ }
}
function clearJoin() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
function getSavedJoin(): { sessionId: string; joinCode: string; playerId: string; nickname: string } | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) as { sessionId: string; joinCode: string; playerId: string; nickname: string } : null; } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BUILD_STAMP_JOIN = `bfb3131 · ${new Date().toISOString().slice(0,16).replace('T',' ')} · HomeJoin`;
export default function HomeJoin() {
  useEffect(() => {
    console.log('[BuildCheck] HomeJoin BUILD=' + BUILD_STAMP_JOIN);
  }, []);
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlCode = urlParams.get('s')?.toUpperCase().trim() ?? null;

  const [phase, _setPhase] = useState<'code' | 'nickname' | 'lobby' | 'playing' | 'ended'>(urlCode ? 'nickname' : 'code');
  const [code, setCode] = useState(urlCode ?? '');
  const [nickname, setNickname] = useState('');
  const [session, setSession] = useState<HomeSession | null>(null);
  const [player, _setPlayer] = useState<HomePlayer | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [wordbackSolved, setWordbackSolved] = useState(false);
  const [wordbackTimedOut, setWordbackTimedOut] = useState(false);
  const [adminSensitivity, setAdminSensitivity] = useState(3.0);
  const [coppiePreviewUntil, setCoppiePreviewUntil] = useState<number | null>(null);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [preflightMsg, setPreflightMsg] = useState<string | null>(null);
  const [preflightActive, setPreflightActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<'code' | 'nickname' | 'lobby' | 'playing' | 'ended'>('code');
  const playerRef = useRef<HomePlayer | null>(null);
  const prevGameSlugRef = useRef<string | null>(null);
  const prevCurrentRoundRef = useRef<number>(-1);
  // Tracks the last known roundPayload.mode so home:state can detect flow→game transitions
  // even when slug/round haven't changed (flow uses same slot: gameSlug=sfida-ballo, round=0).
  const currentModeRef = useRef<string>('');

  const { on, emit, connected: socketConnected } = useEventSocket(null);

  // Keep refs in sync with state so socket handlers always see current values
  const setPhase = useCallback((p: 'code' | 'nickname' | 'lobby' | 'playing' | 'ended') => {
    phaseRef.current = p;
    _setPhase(p);
  }, []);
  const setPlayer = useCallback((fn: HomePlayer | null | ((prev: HomePlayer | null) => HomePlayer | null)) => {
    if (typeof fn === 'function') {
      _setPlayer(prev => {
        const next = fn(prev);
        playerRef.current = next;
        return next;
      });
    } else {
      playerRef.current = fn;
      _setPlayer(fn);
    }
  }, []);

  // Restore saved session on mount
  useEffect(() => {
    const saved = getSavedJoin();

    if (urlCode) {
      // If we have a saved join for this exact code, restore directly — skip nickname prompt
      if (saved && saved.joinCode === urlCode) {
        fetch(`/api/home/sessions/${saved.sessionId}`)
          .then(r => r.ok ? r.json() : null)
          .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
            if (!d || d.session.status === 'ended') { clearJoin(); lookupSession(urlCode); return; }
            const p = d.players.find(pl => pl.id === saved.playerId);
            if (!p) { clearJoin(); lookupSession(urlCode); return; }
            setSession(d.session);
            setPlayers(d.players);
            setPlayer(p);
            setNickname(saved.nickname);
            if (d.session.status === 'playing') {
              setPhase('playing');
              setAnswered(null);
              setRevealed(false);
              startRoundTimer(d.session.roundPayload ?? {});
            } else {
              setPhase('lobby');
            }
          })
          .catch(() => { clearJoin(); lookupSession(urlCode); });
        return;
      }
      // No matching saved join — ask for nickname as before
      lookupSession(urlCode);
      return;
    }

    // No urlCode in URL — try restoring from any saved join
    if (!saved) return;
    fetch(`/api/home/sessions/${saved.sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
        if (!d || d.session.status === 'ended') { clearJoin(); return; }
        const p = d.players.find(pl => pl.id === saved.playerId);
        if (!p) { clearJoin(); return; }
        setSession(d.session);
        setPlayers(d.players);
        setPlayer(p);
        setNickname(saved.nickname);
        if (d.session.status === 'playing') {
          setPhase('playing');
          setAnswered(null);
          setRevealed(false);
          startRoundTimer(d.session.roundPayload ?? {});
        } else {
          setPhase('lobby');
        }
      })
      .catch(() => clearJoin());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join home socket room — re-join on socket reconnect to survive ping-timeout cycles
  useEffect(() => {
    if (!session?.id) return;
    const sid = session.id;
    emit('join:home', sid);
    const socket = getSocket();
    const onReconnect = () => {
      console.log('[HomeFlow] phone socket reconnected — re-joining home room', sid);
      emit('join:home', sid);
      // P1: Re-register player so server marks them isConnected=true again.
      // Without this, isConnected stays false after reconnect → quiz effectiveCount drops,
      // booking purge removes them, and host sees phantom disconnected players.
      if (playerRef.current?.id) {
        emit('home:player_register', { sessionId: sid, playerId: playerRef.current.id });
        console.log('[PlayerIdentity] re-registered after reconnect', { sid, playerId: playerRef.current.id });
      }
    };
    socket.on('connect', onReconnect);
    return () => {
      socket.off('connect', onReconnect);
      emit('leave:home', sid);
    };
  }, [session?.id, emit]);

  // Register phone for home-flow booking/disconnect tracking
  useEffect(() => {
    if (!session?.id || !player?.id) return;
    emit('home:player_register', { sessionId: session.id, playerId: player.id });
  }, [session?.id, player?.id, emit]);

  // ── Emergency resync ───────────────────────────────────────────────────────
  // Refetches server state, clears transient UI state, and re-emits socket room
  // join + player registration. Fixes stuck screens after missed socket events.
  const handleResync = useCallback(async () => {
    const sid = session?.id;
    const pid = player?.id;
    if (!sid || !pid || resyncLoading) return;
    console.log('[PhoneResync] start', { sessionId: sid, playerId: pid });
    setResyncLoading(true);
    try {
      const resp = await fetch(`/api/home/sessions/${sid}`);
      if (!resp.ok) { console.log('[PhoneResync] fetch failed', resp.status); return; }
      const data = await resp.json() as { session: HomeSession; players: HomePlayer[] };
      console.log('[PhoneResync] session fetched', { status: data.session.status, round: data.session.currentRound });

      setSession(data.session);
      setPlayers(data.players);
      const me = data.players.find(p => p.id === pid);
      if (me) { setPlayer(me); console.log('[PhoneResync] player found', { score: me.score }); }
      else { console.log('[PhoneResync] player not found in session'); }

      // Clear all transient game state so render uses fresh server payload
      setAnswered(null);
      setRevealed(false);
      setWordbackSolved(false);
      setCoppiePreviewUntil(null);
      console.log('[PhoneResync] state restored');

      // Re-join socket room and re-register player
      emit('join:home', sid);
      emit('home:player_register', { sessionId: sid, playerId: pid });
      console.log('[PhoneResync] socket rejoined');
    } catch (err) {
      console.log('[PhoneResync] error', err);
    } finally {
      setResyncLoading(false);
    }
  }, [session?.id, player?.id, resyncLoading, emit, setPlayer]);

  // Polling fallback in lobby
  useEffect(() => {
    if (phase !== 'lobby' || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!data) return;
          setPlayers(data.players);
          if (data.session.status === 'playing') {
            setSession(data.session);
            setPhase('playing');
            setAnswered(null);
            setRevealed(false);
            startRoundTimer(data.session.roundPayload ?? {});
          } else if (data.session.status === 'ended') {
            setSession(data.session);
            setPhase('ended');
            clearJoin();
          } else {
            setSession(data.session);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // Polling fallback in playing phase — recovers from missed home:game_started / home:game_ended / home:round
  // Also catches home-flow gameFlowPhase transitions (theme_select→booking, etc.) without slug/round change.
  const flowPhaseRef = useRef<string>('');
  flowPhaseRef.current = String(session?.roundPayload?.gameFlowPhase ?? '');
  const knownFlowModeRef = useRef<string>('');
  knownFlowModeRef.current = String(session?.roundPayload?.mode ?? '');

  useEffect(() => {
    if (phase !== 'playing' || !session?.id) return;
    const sid = session.id;
    const knownSlug = session.gameSlug;
    const knownRound = session.currentRound;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!data) return;
          setPlayers(data.players);
          const cur = playerRef.current;
          if (cur) { const me = data.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
          const slugChanged = data.session.gameSlug !== knownSlug;
          const roundChanged = data.session.currentRound !== knownRound;
          const notPlaying = data.session.status !== 'playing';
          const polledMode = String(data.session.roundPayload?.mode ?? '');
          const polledFlowPhase = String(data.session.roundPayload?.gameFlowPhase ?? '');
          const isFlow = polledMode === 'home-flow' || knownFlowModeRef.current === 'home-flow';
          const flowPhaseChanged = isFlow && polledFlowPhase !== flowPhaseRef.current;
          if (slugChanged || roundChanged || notPlaying || flowPhaseChanged) {
            if (flowPhaseChanged) {
              console.log('[HomeFlow] phone polling: gameFlowPhase', flowPhaseRef.current, '→', polledFlowPhase);
            }
            setSession(data.session);
            if (data.session.status === 'lobby') {
              setPhase('lobby');
            } else if (data.session.status === 'ended') {
              setPhase('ended');
              clearJoin();
            } else if (data.session.status === 'playing' && (slugChanged || roundChanged)) {
              prevGameSlugRef.current = data.session.gameSlug;
              prevCurrentRoundRef.current = data.session.currentRound;
              setAnswered(null);
              setRevealed(false);
              startRoundTimer(data.session.roundPayload ?? {});
            }
          }
        })
        .catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id, session?.gameSlug, session?.currentRound]);

  // Socket listeners — registered once per `on` instance.
  // Use phaseRef/playerRef (not state) to avoid re-registration on every phase change,
  // which would cause missed events during the cleanup/setup window.
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (d) => {
      const newMode  = String(d.session.roundPayload?.mode ?? '');
      const prevMode = currentModeRef.current;
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setSession(d.session);
      setPlayers(d.players);
      if (d.session.status === 'playing') {
        if (phaseRef.current === 'lobby') {
          setPhase('playing');
          setAnswered(null);
          setRevealed(false);
          currentModeRef.current = newMode;
          if (newMode !== 'home-flow') startRoundTimer(d.session.roundPayload ?? {});
        } else if (phaseRef.current === 'playing') {
          // ── Fallback: flow→real-game mode transition detected in home:state ──
          // Fires when home:round was missed but home:state arrived with the real game payload.
          // currentModeRef is updated by the home:round handler first (normal path),
          // so this branch only acts when home:round truly never arrived.
          if (prevMode === 'home-flow' && newMode !== 'home-flow' && newMode !== '') {
            console.log('[BalloFlow] home:state: flow→game transition (fallback)', prevMode, '→', newMode);
            setAnswered(null);
            setRevealed(false);
            currentModeRef.current = newMode;
            startRoundTimer(d.session.roundPayload ?? {});
          } else if (
            d.session.gameSlug !== prevGameSlugRef.current ||
            d.session.currentRound !== prevCurrentRoundRef.current
          ) {
            // Game changed OR round advanced — missed home:game_started / home:round event
            setAnswered(null);
            setRevealed(false);
            currentModeRef.current = newMode;
            startRoundTimer(d.session.roundPayload ?? {});
          } else {
            // Same game/round — just keep mode ref in sync
            currentModeRef.current = newMode;
          }
        }
        prevGameSlugRef.current = d.session.gameSlug;
        prevCurrentRoundRef.current = d.session.currentRound;
      }
      if (d.session.status === 'ended') setPhase('ended');
    });

    const u2 = on<{ session: HomeSession; players: HomePlayer[] }>('home:board', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('lobby');
    });

    const u3 = on<{ session: HomeSession; players: HomePlayer[]; payload: Record<string,unknown> }>('home:game_started', (d) => {
      prevGameSlugRef.current = d.session.gameSlug;
      setSession(d.session);
      setPlayers(d.players);
      setPhase('playing');
      setAnswered(null);
      setRevealed(false);
      // Flow pilot: no round timer during theme_select/booking/confirm/countdown
      if (String(d.session.roundPayload?.mode ?? '') !== 'home-flow') {
        startRoundTimer(d.payload ?? {});
      }
    });

    const u4 = on<{ round: number; payload: Record<string,unknown> }>('home:round', (d) => {
      const roundMode = String(d.payload?.mode ?? '');
      const prevMode  = currentModeRef.current;
      currentModeRef.current = roundMode;
      prevCurrentRoundRef.current = d.round;
      console.log('[BalloFlow] home:round → mode:', roundMode, '| prevMode:', prevMode, '| round:', d.round);
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setAnswered(null);
      setRevealed(false);
      setWordbackSolved(false);
      setWordbackTimedOut(false);
      console.log('[WordBackTimer] next round reset — wordbackSolved + wordbackTimedOut cleared');
      startRoundTimer(d.payload ?? {});
    });

    const u5 = on<{ session: HomeSession; players: HomePlayer[]; gameSlug: string }>('home:game_ended', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setPhase('lobby');
    });

    const u6 = on<{ session: HomeSession; players: HomePlayer[] }>('home:champion', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setPhase('ended');
      clearJoin();
    });

    const u7 = on<{ payload: Record<string,unknown>; players: HomePlayer[] }>('home:card_flip', (d) => {
      setSession(prev => prev ? { ...prev, roundPayload: d.payload } : prev);
      if (d.players) {
        setPlayers(d.players);
        const cur = playerRef.current;
        if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      }
    });

    // Ballo auto-scoring result — optimistically update this player's score;
    // the full round advance arrives moments later via home:round or home:game_ended
    const u8 = on<{ winnerId: string; winnerNickname: string; points: number }>('home:ballo_result', (d) => {
      const cur = playerRef.current;
      if (cur && cur.id === d.winnerId) {
        setPlayer(prev => prev ? { ...prev, score: prev.score + d.points } : prev);
      }
    });

    const u9 = on<{ sessionId: string; round: number; correctIndex: number }>('home:quiz_all_answered', (d) => {
      console.log('[QuizTrace:phone] received home:quiz_all_answered', d);
      // All players answered — reveal answer on phone even if this player hasn't answered yet
      if (timerRef.current) clearInterval(timerRef.current);
      setRevealed(true);
      console.log('[QuizTrace:phone] showing result');
    });

    // Admin sensitivity broadcast — TV host can adjust ballo sensitivity mid-session
    const u10 = on<{ sensitivity: number }>('home:ballo_sensitivity', (d) => {
      if (typeof d.sensitivity === 'number') setAdminSensitivity(d.sensitivity);
    });

    // TV host clicked "Attiva visibilità 10 secondi" — show all coppie cards on phone
    const u11 = on<{ sessionId: string; until: number }>('home:coppie_visibility_preview', (d) => {
      if (typeof d.until === 'number') {
        setCoppiePreviewUntil(d.until);
        // Auto-clear after the window expires
        setTimeout(() => setCoppiePreviewUntil(null), d.until - Date.now() + 200);
      }
    });

    const u12 = on<{ guesserId: string; guesserNickname?: string; word?: string; pts: number }>('home:wordback_correct', () => {
      console.log('[WordBackTimer] correct received on phone — stopping timer');
      if (timerRef.current) clearInterval(timerRef.current);
      setWordbackSolved(true);
      console.log('[WordBackTimer] timer stopped');
    });

    const u13Phone = on<{ reason: string; guesserId: string; suggesterId: string; word: string; bonusPlayerIds: string[]; bonusPoints: number }>('home:wordback_timeout', () => {
      console.log('[WordBackTimer] timeout received on phone — locking round');
      if (timerRef.current) clearInterval(timerRef.current);
      setWordbackTimedOut(true);
    });

    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); u8?.(); u9?.(); u10?.(); u11?.(); u12?.(); u13Phone?.(); };
  // Only re-register when the socket `on` function changes (new connection)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    let t = seconds;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) { clearInterval(timerRef.current!); setRevealed(true); }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Server-authoritative timer: derives remaining time from server-stamped roundStartedAt.
  // Prevents timer reset on phone reload — phones join mid-round with the correct countdown.
  const startRoundTimer = useCallback((payload: Record<string, unknown>) => {
    const tl = Number(payload.timeLimit ?? 30);
    const rsa = payload.roundStartedAt as string | null;
    const remaining = rsa
      ? Math.max(0, Math.ceil(tl - (Date.now() - new Date(rsa).getTime()) / 1000))
      : tl;
    if (remaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
      setRevealed(true);
    } else {
      startTimer(remaining);
    }
  }, [startTimer]);

  // ── API ───────────────────────────────────────────────────────────────────────

  const lookupSession = async (c: string) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/by-code/${c}`);
      if (!r.ok) { setError(r.status === 404 ? 'Codice non trovato' : 'Sessione non disponibile'); return; }
      const data = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(data.session);
      setPlayers(data.players);
      setPhase('nickname');
    } catch { setError('Errore di rete — riprova'); }
    finally { setLoading(false); }
  };

  const joinSession = async () => {
    if (!session || !nickname.trim()) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/join`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (!r.ok) { const err = await r.json() as { error: string }; setError(err.error ?? 'Errore'); return; }
      const p: HomePlayer = await r.json();
      setPlayer(p);
      saveJoin(session.id, session.joinCode, p.id, nickname.trim());
      // iOS Shake to Undo mitigation: clear nickname immediately so the input
      // value (and its undo stack) is gone before phase transition unmounts it.
      setNickname('');
      (document.activeElement as HTMLElement)?.blur?.();
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = 'none';
      document.body.style.setProperty('-webkit-user-select', 'none');
      document.body.style.touchAction = 'manipulation';

      // Fetch updated state
      try {
        const sr = await fetch(`/api/home/sessions/${session.id}`);
        if (sr.ok) {
          const sd = await sr.json() as { session: HomeSession; players: HomePlayer[] };
          setPlayers(sd.players);
          setSession(sd.session);
        }
      } catch { /* ignore */ }

      if (session.status === 'playing') {
        setPhase('playing');
        setAnswered(null); setRevealed(false);
        startRoundTimer(session.roundPayload ?? {});
      } else {
        setPhase('lobby');
      }
    } catch { setError('Errore di rete — riprova'); }
    finally { setLoading(false); }
  };

  /**
   * handleEnterRoom — wraps joinSession with a global device preflight.
   *
   * All permission requests (motion, orientation, microphone) are initiated
   * SYNCHRONOUSLY before the first await so iOS honours the gesture call stack.
   * join and preflight run in parallel; preflight is capped at 2 s.
   * Room entry is NEVER blocked by denied/unsupported permissions.
   */
  const handleEnterRoom = async () => {
    // ── VERY FIRST LINE — proof of execution ────────────────────────────────
    console.log('[DevicePreflight] HANDLE ENTER CALLED');

    if (!session || !nickname.trim() || loading) return;

    // Debug badge — visible for 3 s regardless of phase transition
    setPreflightActive(true);
    setTimeout(() => setPreflightActive(false), 3000);

    setPreflightMsg('Preparazione dispositivo…');

    // ── 1. Fire ALL permission requests synchronously ───────────────────────
    // Must happen before any `await` — iOS links requestPermission() to the
    // gesture call stack; an await breaks that link.
    console.log('[DevicePreflight] audio — unlocking AudioContext');
    let audioUnlocked = false;
    try {
      const ac = new AudioContext();
      audioUnlocked = true;
      void ac.suspend().then(() => ac.close());
    } catch { /* ignore — iOS 14 quirk */ }

    const dme = typeof DeviceMotionEvent !== 'undefined'
      ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
      : null;
    const doe = typeof DeviceOrientationEvent !== 'undefined'
      ? (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      : null;

    let motionPermP: Promise<string>;
    if (dme && typeof dme.requestPermission === 'function') {
      let p: Promise<string>;
      try { p = dme.requestPermission(); } catch { p = Promise.resolve('denied'); }
      motionPermP = p;
      console.log('[DevicePreflight] motion — requestPermission kicked');
    } else {
      motionPermP = Promise.resolve(typeof DeviceMotionEvent !== 'undefined' ? 'granted' : 'unsupported');
      console.log('[DevicePreflight] motion — no requestPermission API, auto-resolved');
    }

    let orientPermP: Promise<string>;
    if (doe && typeof doe.requestPermission === 'function') {
      let p: Promise<string>;
      try { p = doe.requestPermission(); } catch { p = Promise.resolve('denied'); }
      orientPermP = p;
      console.log('[DevicePreflight] orientation — requestPermission kicked');
    } else {
      orientPermP = Promise.resolve(typeof DeviceOrientationEvent !== 'undefined' ? 'granted' : 'unsupported');
      console.log('[DevicePreflight] orientation — no requestPermission API, auto-resolved');
    }

    let micPermP: Promise<string>;
    if (navigator.mediaDevices?.getUserMedia) {
      micPermP = navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(stream => { stream.getTracks().forEach(t => t.stop()); return 'granted'; })
        .catch(() => 'denied');
      console.log('[DevicePreflight] microphone — getUserMedia kicked');
    } else {
      micPermP = Promise.resolve('unsupported');
      console.log('[DevicePreflight] microphone — getUserMedia unavailable');
    }

    // ── 2. SpeechRecognition detection (sync, no permission needed) ─────────
    const speechRecognitionSupported = !!(
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );
    console.log('[DevicePreflight] speechRecognition', { speechRecognitionSupported });

    // ── 3. Join + preflight run in parallel — join is never blocked ─────────
    void joinSession();

    const preflightCap = new Promise<void>(res => setTimeout(res, 2000));
    await Promise.race([
      Promise.allSettled([motionPermP, orientPermP, micPermP]),
      preflightCap,
    ]);

    // ── 4. Collect results (take whatever resolved within the cap) ──────────
    const settled = await Promise.allSettled([motionPermP, orientPermP, micPermP]);
    const motionPerm = settled[0].status === 'fulfilled' ? settled[0].value : 'unknown';
    const orientPerm = settled[1].status === 'fulfilled' ? settled[1].value : 'unknown';
    const micPerm    = settled[2].status === 'fulfilled' ? settled[2].value : 'unknown';

    console.log('[DevicePreflight] motion', motionPerm);
    console.log('[DevicePreflight] orientation', orientPerm);
    console.log('[DevicePreflight] microphone', micPerm);

    const caps = {
      audioUnlocked,
      motionPermission: motionPerm,
      orientationPermission: orientPerm,
      microphonePermission: micPerm,
      speechRecognitionSupported,
      timestamp: Date.now(),
    };
    console.log('[DevicePreflight] result', caps);
    try { sessionStorage.setItem('ideagame:device-capabilities', JSON.stringify(caps)); } catch { /* ignore */ }

    // Mirror mic grant to the wordback-specific key so PressToTalkAnswer skips
    // its own getUserMedia bridge when player later books as INDOVINO.
    if (micPerm === 'granted') {
      try { sessionStorage.setItem('ideagame:wordback-mic-ready', 'true'); } catch { /* ignore */ }
    }

    // Mirror motion grant to localStorage so GameFlowPhone sensorPerm picks it up.
    if (motionPerm === 'granted') {
      try { localStorage.setItem('ideagame:motion-permission', 'granted'); } catch { /* ignore */ }
    }

    const allOk = micPerm === 'granted' && motionPerm !== 'denied' && orientPerm !== 'denied';
    setPreflightMsg(allOk ? 'Pronto' : 'Alcune funzioni useranno modalità alternativa');
    setTimeout(() => setPreflightMsg(null), 1500);
  };

  const addScore = async (points: number) => {
    if (!session || !player) return;
    const newScore = player.score + points;
    const r = await fetch(`/api/home/sessions/${session.id}/score`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ playerId: player.id, points: newScore }),
    }).catch(() => null);
    if (!r || r.status === 409) {
      setError('Tempo scaduto!');
      return;
    }
    setPlayer(prev => prev ? {...prev, score: newScore} : prev);
  };

  const flipCard = async (cardId: string) => {
    if (!session || !player) return;
    await fetch(`/api/home/sessions/${session.id}/flip`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cardId, playerId: player.id }),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="hj-phone-lock relative flex min-h-screen w-full flex-col overflow-hidden"
      style={{background:'#07061a'}}>

      {/* ── AUDIT BADGE ── */}
      <div style={{position:'fixed',top:4,left:'50%',transform:'translateX(-50%)',zIndex:99999,background:'rgba(0,0,0,0.85)',color:'#60A5FA',fontFamily:'monospace',fontSize:10,padding:'2px 10px',borderRadius:5,border:'1px solid #60A5FA80',pointerEvents:'none',whiteSpace:'nowrap'}}>
        ACTIVE ROUTE: /home/join · COMPONENT: HomeJoin · FILE: src/pages/HomeJoin.tsx
      </div>

      <style>{`
        @keyframes hjAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hjPulse { 0%,100%{box-shadow:0 0 20px var(--ac,#F5B642)} 50%{box-shadow:0 0 40px var(--ac,#F5B642)} }
        @keyframes hjFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .hj-ring{animation:hjPulse 2.5s ease infinite}
        .hj-float{animation:hjFloat 3s ease-in-out infinite}
      `}</style>

      {/* Build badge — always visible for verification */}
      <div className="pointer-events-none fixed bottom-1 left-2 z-[9999] text-[10px] font-mono px-1.5 py-0.5 rounded" style={{background:'rgba(0,0,0,0.75)',color:'#F5B642',border:'1px solid #F5B64260'}}>
        build: {BUILD_STAMP_JOIN}
      </div>

      {/* ── ROOT-LEVEL PREFLIGHT OVERLAYS ─────────────────────────────────────
           Fixed position — survive AnimatePresence phase transitions.
           preflightMsg: status text shown after join tapped.
           preflightActive: red debug badge for 3 s (proof of execution).    ── */}
      {preflightActive && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
          <div className="rounded-xl px-4 py-2 text-sm font-black tracking-wide"
            style={{background:'#dc2626',color:'#fff',boxShadow:'0 0 20px rgba(220,38,38,0.7)'}}>
            PREFLIGHT ACTIVE
          </div>
        </div>
      )}
      {preflightMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] pointer-events-none">
          <div className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"
            style={{
              background: preflightMsg === 'Pronto'
                ? 'rgba(34,197,94,0.92)'
                : 'rgba(251,146,60,0.92)',
              color: '#0a0015',
              boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
            }}>
            {preflightMsg === 'Pronto'
              ? <Check className="h-4 w-4 flex-shrink-0" />
              : <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />}
            {preflightMsg}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ── CODE ── */}
        {phase === 'code' && (
          <motion.div key="code" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,y:-20}}
            className="relative flex min-h-screen w-full flex-col">

            {/* Hero image — top 55% */}
            <div className="relative w-full overflow-hidden" style={{height:'55vh',minHeight:260}}>
              <img src="/jonny-world-promo.jpg" alt="Jonny's World"
                className="absolute inset-0 h-full w-full object-cover object-top"
                style={{objectPosition:'center 15%'}}/>
              {/* Bottom fade into form panel */}
              <div className="absolute inset-x-0 bottom-0 h-28"
                style={{background:'linear-gradient(to bottom,transparent,#07061a)'}}/>
              {/* Top fade */}
              <div className="absolute inset-x-0 top-0 h-12"
                style={{background:'linear-gradient(to top,transparent,rgba(7,6,26,0.5))'}}/>
            </div>

            {/* Form panel — bottom 45% */}
            <div className="flex flex-1 flex-col items-center gap-5 px-5 pb-8 pt-2">
              <div className="text-center">
                <div className="text-display text-3xl font-black text-white">Entra nel Gioco</div>
                <div className="mt-1 text-sm" style={{color:'rgba(245,182,66,0.7)'}}>Inserisci il codice che vedi sullo schermo</div>
              </div>

              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase().trim())}
                onKeyDown={e => e.key==='Enter' && code.length>=4 && lookupSession(code)}
                placeholder="CODICE" maxLength={6}
                className="w-full max-w-sm rounded-2xl px-6 py-5 text-center text-3xl font-black uppercase tracking-[0.5em] focus:outline-none"
                style={{background:'rgba(255,255,255,0.07)',border:'2px solid rgba(245,182,66,0.55)',color:'#F5B642',caretColor:'#F5B642'}}/>

              {error && (
                <div className="w-full max-w-sm rounded-2xl px-4 py-3 text-sm font-bold"
                  style={{background:'rgba(239,68,68,0.18)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
                  {error}
                </div>
              )}

              <button onClick={() => lookupSession(code)} disabled={loading||code.length<4}
                className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 50px rgba(245,182,66,0.45)'}}>
                {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <ChevronRight className="h-6 w-6"/>} Avanti
              </button>

            </div>
          </motion.div>
        )}

        {/* ── NICKNAME ── */}
        {phase === 'nickname' && session && (
          <motion.div key="nickname" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,y:-20}}
            className="relative flex min-h-screen w-full flex-col">

            {/* Hero image — compact top */}
            <div className="relative w-full overflow-hidden" style={{height:'45vh',minHeight:220}}>
              <img src="/jonny-world-promo.jpg" alt="Jonny's World"
                className="absolute inset-0 h-full w-full object-cover"
                style={{objectPosition:'center 10%'}}/>
              <div className="absolute inset-x-0 bottom-0 h-24"
                style={{background:'linear-gradient(to bottom,transparent,#07061a)'}}/>
              <div className="absolute inset-x-0 top-0 h-10"
                style={{background:'linear-gradient(to top,transparent,rgba(7,6,26,0.4))'}}/>
              {/* Code badge overlay */}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-2 rounded-full px-5 py-2"
                  style={{background:'rgba(7,6,26,0.75)',border:'1px solid rgba(245,182,66,0.5)',backdropFilter:'blur(8px)'}}>
                  <span className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(245,182,66,0.7)'}}>Codice</span>
                  <span className="text-base font-black tracking-widest" style={{color:'#F5B642'}}>{session.joinCode}</span>
                  <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>· {players.length} dentro</span>
                </div>
              </div>
            </div>

            {/* Form panel */}
            <div className="flex flex-1 flex-col items-center gap-5 px-5 pb-8 pt-3">
              <div className="text-center">
                <div className="text-display text-3xl font-black text-white">Come ti chiami?</div>
                <div className="mt-1 text-sm" style={{color:'rgba(168,85,247,0.8)'}}>Scegli il tuo nome da guerriero 🔥</div>
              </div>

              <input type="text" value={nickname} onChange={e => setNickname(e.target.value.slice(0,20))}
                onKeyDown={e => e.key==='Enter' && nickname.trim() && void handleEnterRoom()}
                placeholder="Il tuo nome..." autoFocus
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                className="w-full max-w-sm rounded-2xl px-6 py-5 text-center text-xl font-black focus:outline-none"
                style={{background:'rgba(255,255,255,0.07)',border:'2px solid rgba(168,85,247,0.55)',color:'#fff',caretColor:'#A855F7'}}/>

              {error && (
                <div className="w-full max-w-sm rounded-2xl px-4 py-3 text-sm font-bold"
                  style={{background:'rgba(239,68,68,0.18)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
                  {error}
                </div>
              )}

              <button onClick={() => void handleEnterRoom()} disabled={loading||!nickname.trim()}
                className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#A855F7,#7c3aed)',boxShadow:'0 0 50px rgba(168,85,247,0.5)'}}>
                {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <Check className="h-6 w-6"/>} Entra!
              </button>

              {/* preflightMsg is now shown at root level — survives phase transition */}
            </div>
          </motion.div>
        )}

        {/* ── LOBBY (attesa gioco) ── */}
        {phase === 'lobby' && player && session && (
          <motion.div key="lobby" initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">

            {/* Avatar */}
            <div className="hj-ring flex h-24 w-24 items-center justify-center rounded-3xl text-2xl font-black text-black"
              style={{background:`linear-gradient(135deg,${player.avatarColor},${player.avatarColor}aa)`}}>
              {player.nickname.slice(0,2).toUpperCase()}
            </div>

            <div>
              <div className="text-display text-3xl font-black text-white">{player.nickname}</div>
              <div className="mt-1 text-lg font-black" style={{color:'#F5B642'}}>Sei dentro! 🎉</div>
            </div>

            {/* Score */}
            <div className="rounded-2xl px-6 py-3"
              style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.4)'}}>
              <div className="text-xs font-black uppercase tracking-widest text-white/50">Punteggio</div>
              <div className="text-3xl font-black" style={{color:'#F5B642'}}>{player.score} pt</div>
            </div>

            {/* Scoreboard mini */}
            {players.length > 1 && (
              <div className="w-full rounded-3xl p-4"
                style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(168,85,247,0.3)'}}>
                <div className="mb-2 text-xs font-black uppercase tracking-widest text-white/40">Classifica</div>
                <div className="flex flex-col gap-1.5">
                  {[...players].sort((a,b)=>b.score-a.score).slice(0,5).map((p,i)=>(
                    <div key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm"
                      style={p.id===player.id
                        ? {background:`${player.avatarColor}22`,border:`1px solid ${player.avatarColor}55`}
                        : {background:'rgba(255,255,255,0.04)'}}>
                      <span className="w-5 text-xs">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
                      <span className={`flex-1 truncate text-left font-bold ${p.id===player.id?'text-white':'text-white/60'}`}>{p.nickname}</span>
                      <span className="text-xs font-black" style={{color:'#F5B642'}}>{p.score}pt</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex w-full flex-col items-center gap-3 rounded-3xl p-5"
              style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(168,85,247,0.3)'}}>
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin" style={{color:'#A855F7'}}/>
                <div className="font-bold text-white/75">La TV sta scegliendo il gioco…</div>
              </div>
              <div className="text-sm text-white/35">{players.length} giocator{players.length!==1?'i':'e'} connessi</div>
            </div>

            <img src="/jonny-master-nobg.png" alt="" className="h-20 w-auto object-contain opacity-80"
              style={{filter:'drop-shadow(0 0 30px rgba(245,182,66,0.35))'}}/>
          </motion.div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && player && session && (
          <motion.div key="playing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex w-full max-w-sm flex-col gap-4">

            {/* Header */}
            <div className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(14px)',border:'1px solid rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-2">
                {session.gameSlug && GAME_INFO[session.gameSlug] && (
                  <span style={{color:GAME_INFO[session.gameSlug].color}}>
                    {GAME_INFO[session.gameSlug].icon}
                  </span>
                )}
                <div>
                  <div className="text-xs text-white/35">
                    {GAME_INFO[session.gameSlug??'']?.name ?? session.gameSlug} — Round {session.currentRound+1}/{session.totalRounds}
                  </div>
                  <div className="text-sm font-black text-white">{player.nickname}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl px-4 py-2 text-center transition-all"
                  style={timeLeft!==null&&timeLeft<=5
                    ? {background:'rgba(239,68,68,0.22)',border:'2px solid rgba(239,68,68,0.65)'}
                    : {background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)'}}>
                  <div className="text-2xl font-black tabular-nums"
                    style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'#fff'}}>
                    {timeLeft ?? '—'}
                  </div>
                </div>
                {/* 🔄 Riaggancia — emergency resync button */}
                <button
                  onClick={() => { void handleResync(); }}
                  disabled={resyncLoading}
                  title="Riaggancia — risincronizza con il server"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    padding: '6px 8px',
                    fontSize: 16,
                    color: resyncLoading ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)',
                    cursor: resyncLoading ? 'not-allowed' : 'pointer',
                    lineHeight: 1,
                  }}>
                  {resyncLoading ? '⏳' : '🔄'}
                </button>
              </div>
            </div>

            {/* Score */}
            <div className="flex justify-center">
              <div className="rounded-full px-5 py-1.5 text-base font-black"
                style={{background:'rgba(245,182,66,0.18)',border:'1px solid rgba(245,182,66,0.45)',color:'#F5B642'}}>
                {player.score} punti
              </div>
            </div>

            {/* ── Emergency debug panel (?debug=1 only) ─────────────────── */}
            {new URLSearchParams(window.location.search).has('debug') && (() => {
              const p = session.roundPayload;
              const mode = String(p.mode ?? '—');
              const gfp  = String((p as Record<string,unknown>).gameFlowPhase ?? '—');
              const motPerm = (() => {
                try { return localStorage.getItem('ideagame:motion-permission') ?? 'null'; }
                catch { return 'err'; }
              })();
              const browserBlocked = (() => {
                const ua2 = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
                const isIOS2 = /iPad|iPhone|iPod/.test(ua2) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                const blocked2 = ['CriOS','FxiOS','Instagram','FBAN','FBAV'].some(t => ua2.includes(t));
                const safari2 = ua2.includes('Safari') && !ua2.includes('CriOS') && !ua2.includes('FxiOS');
                return isIOS2 && blocked2 && !safari2;
              })();
              const rows: [string, string, boolean|undefined][] = [
                ['phase',           phase,           phase === 'playing'],
                ['mode',            mode,            undefined],
                ['gameFlowPhase',   gfp,             undefined],
                ['motionPerm(ls)',  motPerm,         motPerm === 'granted'],
                ['browserBlocked', String(browserBlocked), !browserBlocked],
                ['socket',         socketConnected ? '✅ connected' : '❌ disconnected', socketConnected],
                ['gameSlug',       session.gameSlug ?? '—', undefined],
                ['round',          String(session.currentRound), undefined],
              ];
              return (
                <div style={{
                  background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(250,204,21,0.5)',
                  borderRadius: 12, padding: '8px 12px', fontSize: 10, fontFamily: 'monospace',
                  color: '#facc15', display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <div style={{ fontWeight: 900, fontSize: 11, marginBottom: 2 }}>🔬 DEBUG PANEL</div>
                  {rows.map(([label, val, ok]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ opacity: 0.55 }}>{label}</span>
                      <span style={{ color: ok === false ? '#f87171' : ok === true ? '#4ade80' : '#facc15' }}>{val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Game controller */}
            <PhoneController
              session={session}
              player={player}
              players={players}
              revealed={revealed}
              answered={answered}
              timeLeft={timeLeft}
              onAnswer={(idx) => {
                setAnswered(idx);
                if (timerRef.current) clearInterval(timerRef.current);
                setRevealed(true);
                const p = session.roundPayload;
                if (String(p.mode)==='home-quiz' && idx===Number(p.correctIndex)) {
                  void addScore(Number(p.points ?? 200));
                }
                // Report answer to server so it can detect when all players answered
                if (String(p.mode) === 'home-quiz' && player) {
                  console.log('[QuizTrace:phone] answer submitted', { playerId: player.id, round: session.currentRound, answer: idx });
                  void fetch(`/api/home/sessions/${session.id}/answer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId: player.id, answerIndex: idx, round: session.currentRound }),
                  }).then(r => r.json()).then(d => console.log('[QuizTrace:phone] answer POST response', d)).catch(err => console.log('[QuizTrace:phone] answer POST failed', err));
                }
              }}
              onFlip={flipCard}
              onScore={addScore}
              emit={emit}
              adminSensitivity={adminSensitivity}
              coppiePreviewUntil={coppiePreviewUntil}
              wordbackSolved={wordbackSolved}
              wordbackTimedOut={wordbackTimedOut}
            />
          </motion.div>
        )}

        {/* ── ENDED (champion) ── */}
        {phase === 'ended' && player && (
          <motion.div key="ended" initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
            <img src="/jonny-world-hero.png" alt="" className="h-32 w-auto object-contain"
              style={{filter:'drop-shadow(0 0 50px rgba(245,182,66,0.5))'}}/>
            <div>
              <div className="text-display text-5xl font-black text-white">🏆 Fine!</div>
              <div className="mt-2 text-2xl font-black" style={{color:'#F5B642'}}>{player.score} punti totali!</div>
            </div>
            <div className="flex w-full flex-col gap-2">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>{
                const MEDALS=['🥇','🥈','🥉'];
                const isSelf = p.id===player.id;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={isSelf
                      ? {background:'linear-gradient(135deg,rgba(245,182,66,0.25),rgba(245,182,66,0.1))',border:'2px solid rgba(245,182,66,0.5)'}
                      : {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    <div className="text-2xl w-8 text-center">{MEDALS[i]??`#${i+1}`}</div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black"
                      style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length],color:'#000'}}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-black ${isSelf?'text-yellow-400':'text-white'}`}>{p.nickname}</div>
                    </div>
                    <div className={`text-lg font-black ${isSelf?'text-yellow-400':'text-white/60'}`}>{p.score}pt</div>
                  </div>
                );
              })}
            </div>
            {/* Safe exit — tucked away, not a primary CTA */}
            <button onClick={() => { clearJoin(); navigate('/'); }}
              className="text-[10px] opacity-20 hover:opacity-40 transition-opacity"
              style={{color:'rgba(255,255,255,0.5)'}}>
              esci dalla sessione
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── PhoneController ────────────────────────────────────────────────────────────

function PhoneController({
  session, player, players, revealed, answered, timeLeft,
  onAnswer, onFlip, onScore, emit, adminSensitivity, coppiePreviewUntil, wordbackSolved, wordbackTimedOut,
}: {
  session: HomeSession;
  player: HomePlayer;
  players: HomePlayer[];
  revealed: boolean;
  answered: number | null;
  timeLeft: number | null;
  onAnswer: (idx: number) => void;
  onFlip: (cardId: string) => void;
  onScore: (pts: number) => Promise<void>;
  emit: (event: string, data: unknown) => void;
  adminSensitivity?: number;
  coppiePreviewUntil?: number | null;
  wordbackSolved?: boolean;
  wordbackTimedOut?: boolean;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-flow')       return <GameFlowPhone session={session} player={player} emit={emit}/>;
  if (mode === 'home-quiz')       return <QuizController payload={p} revealed={revealed} answered={answered} onAnswer={onAnswer}/>;
  if (mode === 'home-coppie')     return <CoppieController payload={p} onFlip={onFlip} player={player} previewUntil={coppiePreviewUntil ?? null}/>;
  if (mode === 'home-percorso')   return <PercorsoHomeController sessionId={session.id} player={player} payload={p} timeLeft={timeLeft}/>;
  if (mode === 'home-saramusica') return <SaraMusicaController payload={p} player={player} session={session}/>;
  if (mode === 'home-adult')      return <AdultController payload={p} timeLeft={timeLeft} onScore={onScore}/>;
  if (mode === 'home-ballo')      return <BalloController payload={p} timeLeft={timeLeft} sessionId={session.id} emit={emit} playerId={player.id} round={session.currentRound} adminSensitivity={adminSensitivity ?? 1.0}/>;
  if (mode === 'home-wordback' || mode === 'home-wordback-booking')   return <WordBackController payload={p} timeLeft={timeLeft} player={player} sessionId={session.id} emit={emit} wordbackSolved={wordbackSolved ?? false} wordbackTimedOut={wordbackTimedOut ?? false}/>;
  if (mode === 'home-karaoke')    return <KaraokeController payload={p} sessionId={session.id}/>;
  if (mode === 'home-freestyle')  return <FreestyleController payload={p} timeLeft={timeLeft}/>;
  // New Karaoke Live / Freestyle Battle v3 — detected from gameConfig
  const ks = session.gameConfig?.karaokeHomeState as KaraokeHomeState | undefined;
  if (session.gameSlug === 'karaoke-battle' && ks?.version === 3) {
    return <KaraokeLiveController sessionId={session.id} playerId={player.id} nickname={player.nickname} avatarColor={player.avatarColor} initialState={ks} />;
  }
  return <div className="text-center text-white/40 py-8">In attesa del gioco…</div>;
}

// ── QuizController ─────────────────────────────────────────────────────────────

function QuizController({ payload, revealed, answered, onAnswer }: {
  payload: Record<string,unknown>;
  revealed: boolean;
  answered: number | null;
  onAnswer: (idx: number) => void;
}) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const LETTERS = ['A','B','C','D'];
  const COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 text-center"
        style={{background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.35)'}}>
        <div className="text-sm font-black leading-snug text-white">{String(payload.question??'')}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {answers.map((ans,i)=>{
          const isCorrect = i===correct;
          const isAnswered = answered===i;
          let bg: string;
          if (revealed) {
            bg = isCorrect ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'rgba(255,255,255,0.04)';
          } else if (isAnswered) {
            bg = `linear-gradient(135deg,${COLORS[i]},${COLORS[i]}cc)`;
          } else {
            bg = `${COLORS[i]}22`;
          }
          return (
            <button key={i} onClick={() => !revealed && answered===null && onAnswer(i)}
              disabled={revealed || answered!==null}
              className="flex items-center gap-2 rounded-xl p-3 text-left text-sm font-black transition-all disabled:opacity-70"
              style={{background:bg,border:`1px solid ${COLORS[i]}55`,color:'#fff'}}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                style={{background:'rgba(0,0,0,0.3)'}}>
                {LETTERS[i]}
              </span>
              <span className="text-xs leading-tight">{ans}</span>
              {revealed && isCorrect && <Check className="ml-auto h-4 w-4 shrink-0"/>}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="rounded-xl p-3 text-center text-xs font-bold"
          style={answered===correct
            ? {background:'rgba(34,197,94,0.18)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.35)'}
            : {background:'rgba(239,68,68,0.18)',color:'#f87171',border:'1px solid rgba(239,68,68,0.35)'}}>
          {answered===correct ? '✅ Risposta corretta!' : `❌ La risposta era: ${answers[correct]}`}
        </div>
      )}
    </div>
  );
}

// ── CoppieController ──────────────────────────────────────────────────────────

interface CoppieCard { id: string; text: string; imageUrl?: string; pairId: number; flipped: boolean; matched: boolean; }

function CoppieController({ payload, onFlip, player, previewUntil }: {
  payload: Record<string,unknown>;
  onFlip: (cardId: string) => void;
  player: HomePlayer;
  previewUntil: number | null;
}) {
  const cards = (payload.cards as CoppieCard[]) ?? [];
  const matched = Number(payload.matchedPairs ?? 0);
  const total = Number(payload.totalPairs ?? 0);
  const lastFlippedBy = payload.lastFlippedBy as string | null;
  const isMyTurn = !lastFlippedBy || lastFlippedBy === player.id || (payload.currentFlipped as string[])?.length === 0;
  const cols = Math.min(Math.ceil(Math.sqrt(cards.length)), 4);

  // Countdown ticker during preview window
  const [now, setNow] = useState(() => Date.now());
  const previewActive = previewUntil !== null && now < previewUntil;
  const previewSecsLeft = previewUntil !== null ? Math.max(0, Math.ceil((previewUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!previewActive) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [previewActive]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl px-4 py-2"
        style={{background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.35)'}}>
        <span className="text-sm font-black" style={{color:'#F472B6'}}>💞 Coppie: {matched}/{total}</span>
        {previewActive
          ? <span className="text-xs font-black" style={{color:'#F472B6'}}>👁 Carte visibili: {previewSecsLeft}s</span>
          : <span className="text-xs text-white/50">{isMyTurn ? '🟢 Il tuo turno!' : '⏳ Aspetta...'}</span>
        }
      </div>
      <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`}}>
        {cards.map(card => {
          // P4: Phones must NOT reveal flipped-but-unmatched cards — those are visible
          // only on the TV projection. All phones share the same server card state, so
          // showing card.flipped here means every phone reveals the same card on tap.
          const showFace = card.matched || previewActive;
          return (
            <button key={card.id}
              onClick={() => !previewActive && isMyTurn && !card.matched && !card.flipped && onFlip(card.id)}
              disabled={previewActive || !isMyTurn || card.matched || card.flipped}
              className="flex min-h-14 items-center justify-center rounded-xl text-xs font-black transition-all disabled:opacity-60"
              style={card.matched
                ? {background:'rgba(34,197,94,0.25)',border:'1px solid rgba(34,197,94,0.55)',color:'#4ade80'}
                : showFace
                ? {background:'linear-gradient(135deg,rgba(244,114,182,0.4),rgba(244,114,182,0.2))',border:'2px solid #F472B6',color:'#fff'}
                : {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(244,114,182,0.3)',color:'rgba(255,255,255,0.5)'}}>
              {showFace ? (
                card.imageUrl
                  ? <img src={card.imageUrl} alt={card.text} className="h-10 w-10 rounded-lg object-cover"/>
                  : <span className="px-1 text-center leading-tight">{card.text}</span>
              ) : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PercorsoHomeController — Risate Missioni Improvvise 2.0 (player phone) ────

function PercorsoHomeController({ sessionId, player, payload, timeLeft }: {
  sessionId: string;
  player: HomePlayer;
  payload: Record<string, unknown>;
  timeLeft: number | null;
}) {
  const BASE = (import.meta.env.BASE_URL as string) ?? '/';
  const { on } = useEventSocket(null);
  const [rs, setRs] = useState<RisateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${BASE}api/home/sessions/${sessionId}/risate/state`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setRs(d as RisateState); })
      .catch(() => {});
  }, [sessionId, BASE]);

  useEffect(() => {
    return on<{ state: RisateState }>('home:percorso_update', ({ state }) => setRs(state));
  }, [on]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${BASE}api/home/sessions/${sessionId}/risate/${path}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json() as { state?: RisateState; error?: string };
      if (d.state) setRs(d.state); else if (d.error) setMsg(d.error);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  // Not initialized yet
  if (!rs) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          className="text-4xl">⏳</motion.div>
        <div className="text-sm text-white/50">In attesa dell'animatore…</div>
      </div>
    );
  }

  const myBooking = rs.bookings.find(b => b.playerId === player.id);
  const mission = RISATE_MISSIONS[rs.missionIndex ?? 0];
  const isBooked = !!myBooking;

  if (rs.status === 'ended') {
    const me = rs.teams.find(t => t.id === player.id);
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="text-5xl">🏆</div>
        <div className="text-xl font-black text-white">Missioni completate!</div>
        <div className="text-display text-4xl font-black" style={{ color: '#F5B642' }}>
          {me?.score ?? 0}pt
        </div>
      </div>
    );
  }

  // ── mission_intro ────────────────────────────────────────────────────────
  if (rs.phase === 'mission_intro') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-6xl">{mission?.emoji ?? '🎭'}</div>
        <div className="text-xl font-black text-white">{mission?.title ?? 'Prossima Missione'}</div>
        <div className="text-sm text-white/55 leading-relaxed px-3">{mission?.subtitle}</div>
        <div className="rounded-xl px-4 py-2 text-xs font-bold"
          style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399' }}>
          {mission?.playerCount ?? '?'} giocator{(mission?.playerCount ?? 0) === 1 ? 'e' : 'i'} •  {mission?.roles.join(' & ')}
        </div>
        <div className="text-xs text-white/30">Missione {rs.missionIndex + 1}/10 — l'animatore presenta…</div>
      </div>
    );
  }

  // ── booking ────────────────────────────────────────────────────────────────
  if (rs.phase === 'booking') {
    const slotsUsed = rs.bookings.length;
    const slotsTotal = mission?.playerCount ?? 0;
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-5xl">{mission?.emoji ?? '🎭'}</div>
        <div className="text-lg font-black text-white">{mission?.title}</div>
        <div className="text-sm text-white/50">{slotsUsed}/{slotsTotal} prenotati</div>
        <div className="flex flex-wrap justify-center gap-2">
          {rs.bookings.map(b => (
            <div key={b.playerId} className="rounded-xl px-4 py-1.5 text-xs font-bold"
              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34D399' }}>
              {b.role}: {b.nickname}
            </div>
          ))}
        </div>
        {!isBooked && slotsUsed < slotsTotal ? (
          <motion.button onClick={() => void post('book', { playerId: player.id, nickname: player.nickname, teamId: player.id })}
            disabled={busy} whileTap={{ scale: 0.93 }}
            className="rounded-2xl px-8 py-4 text-xl font-black text-black w-full"
            style={{ background: 'linear-gradient(135deg,#34D399,#059669)', boxShadow: '0 0 40px rgba(52,211,153,0.5)' }}>
            {busy ? '⏳…' : '🙋 PRENOTA!'}
          </motion.button>
        ) : isBooked ? (
          <div className="rounded-xl px-5 py-3 text-base font-black w-full text-center"
            style={{ background: 'rgba(52,211,153,0.18)', border: '2px solid rgba(52,211,153,0.55)', color: '#34D399' }}>
            ✅ Sei: {myBooking.role}
          </div>
        ) : (
          <div className="text-sm text-white/40 py-2">Posti esauriti — osserva!</div>
        )}
        {msg && <div className="text-xs text-red-400">{msg}</div>}
      </div>
    );
  }

  // ── public_choice ─────────────────────────────────────────────────────────
  if (rs.phase === 'public_choice') {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="text-4xl">{mission?.emoji ?? '🗳️'}</div>
        <div className="text-base font-black text-white">{mission?.choiceLabel ?? 'Scegli!'}</div>
        <div className="flex flex-col gap-2.5 w-full">
          {rs.publicChoiceOptions.map(opt => (
            <motion.button key={opt} whileTap={{ scale: 0.95 }}
              onClick={() => void post('choice', { choice: opt })} disabled={busy}
              className="w-full rounded-2xl px-5 py-3.5 text-base font-black"
              style={rs.publicChoice === opt
                ? { background: 'linear-gradient(135deg,#34D399,#059669)', color: '#000', boxShadow: '0 0 20px rgba(52,211,153,0.5)' }
                : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}>
              {opt}
            </motion.button>
          ))}
        </div>
        {rs.publicChoice && <div className="text-xs text-white/45">Tuo voto: {rs.publicChoice}</div>}
        {msg && <div className="text-xs text-red-400">{msg}</div>}
      </div>
    );
  }

  // ── active ─────────────────────────────────────────────────────────────────
  if (rs.phase === 'active') {
    const ap = mission?.activePublicAction ?? 'none';
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-5xl">{mission?.emoji}</div>
        {rs.publicChoice && (
          <div className="rounded-xl px-5 py-2 text-sm font-bold text-white"
            style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)' }}>
            {rs.publicChoice}
          </div>
        )}
        {mission?.questions && (
          <div className="rounded-xl px-5 py-3 text-sm font-black text-white max-w-xs"
            style={{ background: 'rgba(245,182,66,0.12)', border: '2px solid rgba(245,182,66,0.35)' }}>
            ❓ {mission.questions[rs.questionIndex] ?? '—'}
          </div>
        )}
        {isBooked && (
          <div className="rounded-xl px-4 py-2 text-xs font-bold"
            style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34D399' }}>
            Il tuo ruolo: {myBooking.role}
          </div>
        )}

        {ap === 'validate' && !isBooked && (
          <motion.button onClick={() => void post('action', { action: 'validate', playerId: player.id, nickname: player.nickname })}
            disabled={busy} whileTap={{ scale: 0.92 }}
            className="rounded-2xl px-8 py-5 text-2xl font-black text-white w-full"
            style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', boxShadow: '0 0 50px rgba(239,68,68,0.45)' }}>
            🚨 {mission?.activePublicLabel ?? 'HA DETTO SÌ!'}
          </motion.button>
        )}

        {ap === 'react' && (
          <div className="grid grid-cols-3 gap-2 w-full">
            {REACTION_EMOJIS.map(em => (
              <motion.button key={em} whileTap={{ scale: 0.88 }}
                onClick={() => void post('action', { action: 'react', playerId: player.id, nickname: player.nickname, emoji: em })}
                disabled={busy}
                className="flex items-center justify-center rounded-2xl py-5 text-3xl"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                {em}
              </motion.button>
            ))}
          </div>
        )}

        {ap === 'ripetilo' && !isBooked && (
          <motion.button onClick={() => void post('action', { action: 'ripetilo', playerId: player.id, nickname: player.nickname })}
            disabled={busy} whileTap={{ scale: 0.92 }}
            className="rounded-2xl px-8 py-5 text-2xl font-black text-white w-full"
            style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', boxShadow: '0 0 40px rgba(167,139,250,0.4)' }}>
            🔁 RIPETILO!
          </motion.button>
        )}

        {ap === 'cambio_stile' && !isBooked && (
          <motion.button onClick={() => void post('action', { action: 'cambio_stile', playerId: player.id, nickname: player.nickname })}
            disabled={busy} whileTap={{ scale: 0.92 }}
            className="rounded-2xl px-8 py-5 text-2xl font-black text-white w-full"
            style={{ background: 'linear-gradient(135deg,#f472b6,#be185d)', boxShadow: '0 0 40px rgba(244,114,182,0.4)' }}>
            🔀 CAMBIO STILE!
          </motion.button>
        )}

        {ap === 'found' && (
          <div className="flex flex-col gap-2 w-full">
            <div className="text-xs text-white/50 mb-1">Chi ha trovato per primo?</div>
            {rs.bookings.map(b => (
              <motion.button key={b.playerId} whileTap={{ scale: 0.95 }}
                onClick={() => void post('action', { action: 'found', playerId: player.id, nickname: player.nickname, targetPlayerId: b.playerId })}
                disabled={busy}
                className="w-full rounded-2xl px-5 py-3.5 text-base font-black text-white"
                style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)' }}>
                {b.nickname} ✅
              </motion.button>
            ))}
          </div>
        )}

        {mission?.id === 'giornalista' && myBooking?.role === 'Giornalista' && (
          <motion.button onClick={() => void post('action', { action: 'next_question', playerId: player.id, nickname: player.nickname })}
            disabled={busy} whileTap={{ scale: 0.95 }}
            className="rounded-2xl px-8 py-3 text-base font-black w-full"
            style={{ background: 'rgba(245,182,66,0.18)', border: '2px solid rgba(245,182,66,0.55)', color: '#F5B642' }}>
            ❓ Prossima Domanda
          </motion.button>
        )}

        {msg && <div className="text-xs text-red-400">{msg}</div>}
        <div className="text-xs text-white/25">Missione {rs.missionIndex + 1}/10</div>
      </div>
    );
  }

  // ── voting ─────────────────────────────────────────────────────────────────
  if (rs.phase === 'voting') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-5xl">⭐</div>
        <div className="text-xl font-black text-white">Dai il tuo voto!</div>
        {isBooked ? (
          <div className="text-sm text-white/45 px-4">Sei in gara — il pubblico ti valuta!</div>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            {rs.bookings.map(b => {
              const myVote = (rs.votes[b.playerId] ?? []).find(v => v.voterId === player.id);
              return (
                <div key={b.playerId} className="rounded-2xl p-3.5 space-y-2.5"
                  style={{ background: 'rgba(245,182,66,0.08)', border: '1px solid rgba(245,182,66,0.25)' }}>
                  <div className="text-base font-black text-white">{b.nickname}</div>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <motion.button key={s} whileTap={{ scale: 0.88 }}
                        onClick={() => void post('vote', { playerId: b.playerId, score: s, voterId: player.id })}
                        disabled={busy}
                        className="h-12 w-12 rounded-xl text-2xl font-black"
                        style={(myVote?.score ?? 0) >= s
                          ? { background: 'rgba(245,182,66,0.3)', border: '2px solid rgba(245,182,66,0.7)', color: '#F5B642' }
                          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.35)' }}>
                        ⭐
                      </motion.button>
                    ))}
                  </div>
                  {myVote && <div className="text-xs text-white/40">{myVote.score}/5 stelle</div>}
                </div>
              );
            })}
          </div>
        )}
        {msg && <div className="text-xs text-red-400">{msg}</div>}
      </div>
    );
  }

  // ── result ─────────────────────────────────────────────────────────────────
  if (rs.phase === 'result') {
    const me = rs.teams.find(t => t.id === player.id);
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-5xl">{mission?.emoji}</div>
        {rs.missionResult && (
          <div className="rounded-2xl px-5 py-3 text-sm font-bold text-white max-w-xs leading-relaxed"
            style={{ background: 'rgba(52,211,153,0.12)', border: '2px solid rgba(52,211,153,0.35)' }}>
            {rs.missionResult.text}
          </div>
        )}
        <div className="text-xs text-white/45">Il tuo punteggio</div>
        <div className="text-display text-4xl font-black" style={{ color: '#F5B642' }}>{me?.score ?? 0}pt</div>
        <div className="text-xs text-white/30">Aspetta la prossima missione…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="text-4xl">🎭</div>
      <div className="text-sm text-white/45">Fase: {rs.phase}</div>
    </div>
  );
}

// ── SimpleController (Ballo, Adult, WordBack) ──────────────────────────────────

function SimpleController({ payload, color, emoji, label, timeLeft }: {
  payload: Record<string,unknown>;
  color: string;
  emoji: string;
  label: string;
  timeLeft: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">{emoji}</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? payload.name ?? label)}</div>
      {!!payload.description && (
        <div className="text-sm text-white/55 leading-relaxed px-2">{String(payload.description)}</div>
      )}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:`${color}18`,border:`1px solid ${color}45`,color}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
    </div>
  );
}

// ── BalloController ────────────────────────────────────────────────────────────

const MOTION_PERM_KEY = 'ideagame:motion-permission';

function BalloController({ payload, timeLeft, sessionId, emit, playerId, round, adminSensitivity = 1.0 }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  sessionId: string;
  emit: (event: string, data: unknown) => void;
  playerId: string;
  round?: number;
  adminSensitivity?: number;
}) {
  // ── Tournament phase/stage from payload ───────────────────────────────────────
  const balloPhase = String(payload.balloPhase ?? 'dancing');
  const balloStage = Number(payload.balloStage ?? 1);
  type TeamDef = { teamId: string; players: { id: string; nickname: string; avatarColor: string }[]; pendingRequests: { id: string; nickname: string; avatarColor: string }[] };
  const teams = (payload.teams ?? []) as TeamDef[];

  // ── Spectator check ───────────────────────────────────────────────────────────
  const rawBooked = (payload.bookedPlayers ?? []) as Array<{ id: string; nickname: string; avatarColor: string }>;
  const isSpectator = rawBooked.length > 0 && !rawBooked.some(b => b.id === playerId);
  // In booking phase (stages 2/3), determine player's relationship to teams
  const myTeam = teams.find(t => t.players.some(p => p.id === playerId));
  const myPendingTeam = !myTeam ? teams.find(t => t.pendingRequests.some(p => p.id === playerId)) : null;
  const isInAnyTeam = !!myTeam;
  const hasSentRequest = !!myPendingTeam;
  const [joiningTeam, setJoiningTeam] = useState<string | null>(null);
  const [acceptingPlayer, setAcceptingPlayer] = useState<string | null>(null);

  // Spectator voting state — Map<dancerId, stars>
  const [votedFor, setVotedFor] = useState<Record<string, number>>({});

  const [energy, setEnergy] = useState(0);
  // Eagerly init from localStorage — if permission was granted during booking, sensors
  // SensorBridge owns all sensor listeners — BalloController only reads from it.
  const smoothedEnergyRef = useRef<number>(0);

  // adminSensitivity is broadcast by the TV host and applies session-wide.
  const adminSensitivityRef = useRef(adminSensitivity);
  useEffect(() => { adminSensitivityRef.current = adminSensitivity; }, [adminSensitivity]);

  const [sensorError, setSensorError] = useState(false);

  // Read booking-phase diagnostic (console only — no UI)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ideagame:ballo-diag');
      if (raw) console.log('[SensorFinal] BalloController mount — bookingDiag:', JSON.parse(raw));
      else      console.log('[SensorFinal] BalloController mount — no bookingDiag in sessionStorage');
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);



  // Aggressively prevent iOS "Shake to Undo" popup for the entire ballo session.
  // iOS "Annulla inserimento" (Shake to Undo) mitigation.
  // NOTE: Shake to Undo cannot be fully disabled from Safari/PWA.
  // Strategy: on mount add .ballo-mode to <body> (hides all inputs via CSS),
  // blur any focused element, lock user-select, intercept focusin+selectionchange.
  // The .ballo-mode CSS class is defined in index.css.
  useEffect(() => {
    document.body.classList.add('ballo-mode');

    const blurActive = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
      window.getSelection()?.removeAllRanges();
    };
    blurActive();

    const guardFocus = (e: FocusEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)
      ) { t.blur(); }
    };
    const guardSelection = () => { window.getSelection()?.removeAllRanges(); };

    window.addEventListener('focusin', guardFocus, true);
    document.addEventListener('selectionchange', guardSelection);
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
    document.body.style.touchAction = 'manipulation';

    return () => {
      document.body.classList.remove('ballo-mode');
      window.removeEventListener('focusin', guardFocus, true);
      document.removeEventListener('selectionchange', guardSelection);
      document.body.style.userSelect = '';
      document.body.style.removeProperty('-webkit-user-select');
      document.body.style.touchAction = '';
    };
  }, []);

  // Permission state is initialised eagerly from localStorage (see useState above).
  // If the player granted permission during the booking phase (GameFlowPhone),
  // SensorBridge.start() was called in GameFlowPhone.book() — listeners are already
  // attached. BalloController just reads samples via drainSamples() every 400ms.

  // ── SensorBridge polling — drain samples every 400ms, compute energy, emit ─
  useEffect(() => {
    const bridge = SensorBridge.getStatus();
    console.log('[SensorBridge] BalloController mount — started:', bridge.started,
      '| motion:', bridge.motionEvents, '| orient:', bridge.orientEvents);

    setSensorError(false);
    let stalledErrorActive = false;

    // 5s watchdog: show non-blocking warning if no sensor events arrive
    const sensorWatchdog = setTimeout(() => {
      const s = SensorBridge.getStatus();
      if (s.motionEvents === 0 && s.orientEvents === 0) {
        console.log('[SensorBridge] 5s watchdog — zero events');
        stalledErrorActive = true;
        setSensorError(true);
      }
    }, 5000);

    // 400ms drain: read samples from SensorBridge, compute smoothed energy, emit
    const interval = setInterval(() => {
      const { orient, accel } = SensorBridge.drainSamples();
      const s = SensorBridge.getStatus();

      // Auto-clear stall warning once events arrive
      if (stalledErrorActive && (s.motionEvents > 0 || s.orientEvents > 0)) {
        stalledErrorActive = false;
        setSensorError(false);
      }

      let rawEnergy = 0;
      if (orient.length > 0) {
        const avg = orient.reduce((a, b) => a + b, 0) / orient.length;
        // 0–25° avg → 0–100. Normal arm swing ~10–15° → 40–60%
        rawEnergy = Math.min(100, Math.round((avg / 25) * 100));
      } else if (accel.length > 0) {
        const avg = accel.reduce((a, b) => a + b, 0) / accel.length;
        // 0–8 m/s² → 0–100
        rawEnergy = Math.min(100, Math.round((avg / 8) * 100));
      } else {
        return; // no samples — keep displayed energy
      }

      const as = adminSensitivityRef.current;
      const adjusted = Math.min(100, Math.max(0, rawEnergy * as));
      const smoothed = Math.round(smoothedEnergyRef.current * 0.5 + adjusted * 0.5);
      smoothedEnergyRef.current = smoothed;
      setEnergy(smoothed);

      const tl = timeLeftRef.current;
      if (tl === null || tl > 0) {
        emit('home:ballo_energy', { sessionId, playerId, energy: smoothed, round: round ?? 0 });
        SensorBridge.setLastEmit(smoothed);
        console.log('[SensorBridge] energy emit —', { smoothed, motion: s.motionEvents, orient: s.orientEvents });
      }
    }, 400);

    // Visibility / focus regain — iOS popup briefly hides the page
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (timeLeftRef.current ?? 0) > 0) {
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
        window.getSelection()?.removeAllRanges();
      }
    };
    const handleWindowFocus = () => {
      if ((timeLeftRef.current ?? 0) > 0) {
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearTimeout(sensorWatchdog);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      SensorBridge.stop(); // remove bridge listeners when BalloController unmounts
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, sessionId, playerId]);

  const energyColor = energy > 70 ? '#22c55e' : energy > 35 ? '#eab308' : '#A78BFA';

  // ── Booking phase: stages 2/3 team join/accept UI ────────────────────────────
  if (balloStage >= 2 && balloPhase === 'booking') {
    const prizePoints = Number(payload.prizePoints ?? 500);
    const stageLabel = balloStage === 2 ? 'Sfida 2: Coppie' : 'Sfida Finale: Terzetti';
    const stageIcon = balloStage === 2 ? '👫' : '🏃';

    // Existing team member → show pending requests to accept
    if (isInAnyTeam && myTeam) {
      const pendingForMyTeam = myTeam.pendingRequests;
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-4xl">{stageIcon}</div>
          <div className="text-xl font-black text-white">{stageLabel}</div>
          <div className="rounded-2xl px-5 py-3 text-sm font-bold"
            style={{background:'rgba(167,139,250,0.12)',border:'1px solid rgba(167,139,250,0.3)',color:'#A78BFA'}}>
            Sei nella Squadra {myTeam.teamId} {myTeam.teamId==='A'?'🔵':'🔴'}
          </div>
          {pendingForMyTeam.length === 0 ? (
            <div className="text-white/40 text-sm animate-pulse">In attesa di richieste di accesso…</div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              <div className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(255,255,255,0.35)'}}>
                Richieste di unirsi alla tua squadra
              </div>
              {pendingForMyTeam.map(req => (
                <div key={req.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{background:`${req.avatarColor}12`,border:`1.5px solid ${req.avatarColor}44`}}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black flex-shrink-0"
                    style={{background:req.avatarColor,color:'#0a0015'}}>{req.nickname[0]?.toUpperCase()}</div>
                  <div className="font-black text-white flex-1 text-left">{req.nickname}</div>
                  <button
                    disabled={acceptingPlayer === req.id}
                    onClick={async () => {
                      setAcceptingPlayer(req.id);
                      try {
                        await fetch(`/api/home/sessions/${sessionId}/ballo-accept-player`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ acceptingPlayerId: playerId, newPlayerId: req.id, teamId: myTeam.teamId }),
                        });
                      } finally { setAcceptingPlayer(null); }
                    }}
                    className="rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                    style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)',boxShadow:'0 0 20px rgba(167,139,250,0.4)'}}>
                    {acceptingPlayer === req.id ? '…' : '✓ ACCETTA'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-white/25">🏆 {prizePoints.toLocaleString()} punti in palio</div>
        </div>
      );
    }

    // Player sent a request — waiting
    if (hasSentRequest && myPendingTeam) {
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-4xl">{stageIcon}</div>
          <div className="text-xl font-black text-white">{stageLabel}</div>
          <div className="rounded-2xl px-6 py-4 flex flex-col gap-2"
            style={{background:'rgba(234,179,8,0.1)',border:'1px solid rgba(234,179,8,0.3)'}}>
            <div className="text-2xl">⏳</div>
            <div className="font-black text-yellow-400">Richiesta inviata!</div>
            <div className="text-sm text-white/60">
              Squadra {myPendingTeam.teamId} {myPendingTeam.teamId==='A'?'🔵':'🔴'} deve accettarti.
            </div>
          </div>
          <div className="text-xs text-white/25">🏆 {prizePoints.toLocaleString()} punti in palio</div>
          {/* Allow changing team */}
          <div className="flex gap-3">
            {teams.filter(t => t.teamId !== myPendingTeam.teamId).map(t => (
              <button key={t.teamId}
                disabled={joiningTeam === t.teamId}
                onClick={async () => {
                  setJoiningTeam(t.teamId);
                  try {
                    await fetch(`/api/home/sessions/${sessionId}/ballo-join-team`, {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ playerId, nickname: 'giocatore', avatarColor: '#A78BFA', teamId: t.teamId }),
                    });
                  } finally { setJoiningTeam(null); }
                }}
                className="text-xs rounded-xl px-4 py-2 font-bold disabled:opacity-40"
                style={{background:'rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.12)'}}>
                Cambia → Squadra {t.teamId} {t.teamId==='A'?'🔵':'🔴'}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // New player — show team selection
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-4xl">{stageIcon}</div>
        <div className="text-xl font-black text-white">{stageLabel}</div>
        <div className="text-sm text-white/60 max-w-xs">
          {balloStage === 2 ? 'Scegli la squadra in cui vuoi ballare!' : 'Scegli il terzetto in cui vuoi ballare!'}
        </div>
        <div className="text-sm font-black" style={{color:'#F5B642'}}>
          🏆 {prizePoints.toLocaleString()} punti in palio
        </div>
        <div className="flex flex-col gap-3 w-full">
          {teams.map(team => {
            const isTeamFull = team.players.length >= balloStage;
            const color = team.teamId === 'A' ? '#60A5FA' : '#F87171';
            return (
              <button key={team.teamId}
                disabled={isTeamFull || joiningTeam === team.teamId}
                onClick={async () => {
                  if (isTeamFull) return;
                  setJoiningTeam(team.teamId);
                  try {
                    await fetch(`/api/home/sessions/${sessionId}/ballo-join-team`, {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ playerId, nickname: 'giocatore', avatarColor: '#A78BFA', teamId: team.teamId }),
                    });
                  } finally { setJoiningTeam(null); }
                }}
                className="flex items-center gap-4 rounded-2xl px-5 py-4 text-left disabled:opacity-40"
                style={{background:`${color}12`,border:`2px solid ${isTeamFull ? 'rgba(255,255,255,0.12)' : color+'66'}`,
                  boxShadow: joiningTeam===team.teamId ? `0 0 30px ${color}50` : 'none'}}>
                <div className="text-2xl">{team.teamId==='A'?'🔵':'🔴'}</div>
                <div className="flex-1">
                  <div className="font-black text-white">Squadra {team.teamId}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
                    {team.players.map(p=>p.nickname).join(' + ') || 'Nessuno ancora'}
                    {team.pendingRequests.length>0 ? ` · ${team.pendingRequests.length} in attesa` : ''}
                  </div>
                </div>
                <div className="text-sm font-black" style={{color: isTeamFull ? 'rgba(255,255,255,0.3)' : color}}>
                  {isTeamFull ? 'COMPLETA' : joiningTeam===team.teamId ? '…' : '→'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Result phase: show waiting message ────────────────────────────────────────
  if (balloPhase === 'result') {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-5xl">🏆</div>
        <div className="text-xl font-black text-white">Risultato!</div>
        <div className="text-sm text-white/50">In attesa della prossima sfida…</div>
      </div>
    );
  }

  // ── Spectator voting UI ───────────────────────────────────────────────────────
  if (isSpectator) {
    const castVote = (dancerId: string, stars: number) => {
      setVotedFor(prev => ({ ...prev, [dancerId]: stars }));
      emit('home:ballo_vote', { sessionId, voterId: playerId, dancerId, stars, round: round ?? 0 });
    };
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-5xl">👏</div>
        <div className="text-xl font-black text-white">{String(payload.name ?? 'Sfida di Ballo')}</div>
        <div className="rounded-2xl px-5 py-3 text-sm font-bold text-center"
          style={{background:'rgba(167,139,250,0.12)',border:'1px solid rgba(167,139,250,0.3)',color:'rgba(167,139,250,0.85)'}}>
          Sei spettatore — vota i ballerini!
        </div>

        {timeLeft !== null && timeLeft > 0 && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-2"
            style={{background:'rgba(167,139,250,0.18)',border:'1px solid rgba(167,139,250,0.45)',color:'#A78BFA'}}>
            <Timer className="h-4 w-4"/>
            <span className="text-xl font-black tabular-nums">{timeLeft}s</span>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full">
          {rawBooked.map(dancer => {
            const myVote = votedFor[dancer.id];
            return (
              <div key={dancer.id} className="flex flex-col gap-2 rounded-2xl px-4 py-4"
                style={{background:`${dancer.avatarColor}12`,border:`1.5px solid ${dancer.avatarColor}44`}}>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black"
                    style={{background:dancer.avatarColor,color:'#0a0015'}}>
                    {dancer.nickname[0]?.toUpperCase()}
                  </div>
                  <div className="font-black text-white">{dancer.nickname}</div>
                  {myVote && (
                    <div className="ml-auto text-xs font-black" style={{color:'rgba(255,255,255,0.4)'}}>
                      ✓ {myVote}⭐
                    </div>
                  )}
                </div>
                <div className="flex justify-center gap-2">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => castVote(dancer.id, s)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform active:scale-90"
                      style={{
                        background: myVote && myVote >= s ? `${dancer.avatarColor}33` : 'rgba(255,255,255,0.06)',
                        border: myVote && myVote >= s ? `1.5px solid ${dancer.avatarColor}88` : '1.5px solid rgba(255,255,255,0.12)',
                        transform: myVote === s ? 'scale(1.15)' : 'scale(1)',
                      }}>
                      {myVote && myVote >= s ? '⭐' : '☆'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center" style={{userSelect:'none',WebkitUserSelect:'none'}}>

      {/* Minimal sensor-unavailable warning — shown only when truly stalled */}
      {sensorError && (
        <div style={{
          width: '100%', maxWidth: 340,
          background: 'rgba(234,179,8,0.1)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 12, padding: '9px 14px',
          color: '#facc15', fontSize: 12, fontWeight: 600,
          textAlign: 'center', lineHeight: 1.5,
        }}>
          📱 Muovi il telefono per attivare i sensori
        </div>
      )}

      <div className="text-6xl">💃</div>
      <div className="text-xl font-black text-white">{String(payload.name ?? 'Sfida di Ballo')}</div>
      <div className="text-sm text-white/55 leading-relaxed px-2">{String(payload.description ?? '')}</div>
      {!!payload.musicHint && (
        <div className="rounded-xl px-4 py-2 text-sm font-black" style={{background:'rgba(167,139,250,0.18)',color:'#c084fc',border:'1px solid rgba(167,139,250,0.4)'}}>
          🎵 {String(payload.musicHint)}
        </div>
      )}


      {/* ── Energy bar — always visible (SensorBridge manages permission) ── */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-xs font-bold" style={{color:'#A78BFA'}}>
          <span>⚡ Energia</span><span className="tabular-nums">{energy}%</span>
        </div>
        <div className="relative h-8 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div className="absolute inset-y-0 left-0 rounded-full"
            animate={{ width: `${energy}%` }} transition={{ duration: 0.2 }}
            style={{ background: energyColor, boxShadow: `0 0 12px ${energyColor}80` }} />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
            {energy > 60 ? '🔥 FUOCO!' : energy > 30 ? '💃 Bene!' : '📱 Muoviti!'}
          </div>
        </div>
      </div>

      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(167,139,250,0.18)',border:'1px solid rgba(167,139,250,0.45)',color:'#A78BFA'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-2xl font-black" style={{color:'#A78BFA'}}>BALLA! 🕺</div>

    </div>
  );
}

// ── SaraMusicaController ──────────────────────────────────────────────────────

function SaraMusicaController({ payload, player, session }: {
  payload: Record<string,unknown>;
  player: HomePlayer;
  session: HomeSession;
}) {
  const [answered, setAnswered] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'wrong' | 'late' | null>(null);
  const choices = (payload.choices as string[]) ?? [];
  const pts = Number(payload.points ?? 100);

  const submitAnswer = async (idx: number) => {
    if (answered !== null) return;
    setAnswered(idx);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/saramusica-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, choiceIndex: idx, round: Number(payload.roundIndex ?? 0) }),
      });
      const data = await r.json() as { ok: boolean; correct?: boolean; alreadyWon?: boolean };
      console.log('[SaraTrace:phone] answer response', data);
      if (data.alreadyWon) setResult('late');
      else setResult(data.correct ? 'correct' : 'wrong');
    } catch {
      setResult('wrong');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="text-5xl">🎵</div>
      <div className="text-lg font-black text-white">Indovina la canzone!</div>
      <div className="rounded-2xl p-3 w-full"
        style={{background:'rgba(96,165,250,0.12)',border:'1px solid rgba(96,165,250,0.35)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-1" style={{color:'rgba(96,165,250,0.8)'}}>SUGGERIMENTO</div>
        <div className="text-sm text-white/75 italic leading-relaxed">"{String(payload.snippetHint??'...')}"</div>
      </div>

      {result === null && (
        <div className="grid grid-cols-2 gap-3 w-full">
          {choices.map((choice, idx) => (
            <button key={idx} onClick={() => void submitAnswer(idx)}
              disabled={answered !== null}
              className="rounded-2xl px-3 py-4 text-sm font-black text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,rgba(96,165,250,0.25),rgba(37,99,235,0.15))',border:'2px solid rgba(96,165,250,0.45)',boxShadow:'0 0 20px rgba(96,165,250,0.2)'}}>
              {choice}
            </button>
          ))}
        </div>
      )}

      {result === 'correct' && (
        <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring'}}
          className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(34,197,94,0.18)',border:'2px solid rgba(34,197,94,0.5)',color:'#4ade80'}}>
          <div className="text-3xl mb-1">✅</div>
          <div className="text-xl font-black">Esatto! +{pts}pt</div>
          <div className="text-sm opacity-70 mt-1">Risposta corretta!</div>
        </motion.div>
      )}

      {result === 'wrong' && (
        <div className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(239,68,68,0.18)',border:'2px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
          <div className="text-3xl mb-1">❌</div>
          <div className="text-xl font-black">Risposta sbagliata!</div>
        </div>
      )}

      {result === 'late' && (
        <div className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(245,182,66,0.18)',border:'2px solid rgba(245,182,66,0.4)',color:'#F5B642'}}>
          <div className="text-3xl mb-1">⏱</div>
          <div className="text-xl font-black">Qualcuno ha già risposto!</div>
        </div>
      )}
    </div>
  );
}

// ── AdultController ────────────────────────────────────────────────────────────

function AdultController({ payload, timeLeft, onScore }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  onScore?: (pts: number) => Promise<void>;
}) {
  const [choice, setChoice] = useState<'true'|'false'|null>(null);
  const pts = Number(payload.points ?? 150);
  const isYesNo = String(payload.body ?? '').length > 0;
  const hasChoice = choice !== null;

  const pick = async (v: 'true'|'false') => {
    if (hasChoice) return;
    setChoice(v);
    if (v === 'true' && onScore) await onScore(pts);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center" style={{userSelect:'none',WebkitUserSelect:'none'}}>
      <div className="text-6xl">🔞</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Sfida Adult Only')}</div>
      {isYesNo && (
        <div className="rounded-2xl p-4 w-full"
          style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.35)'}}>
          <div className="text-sm text-white/75 leading-relaxed">{String(payload.body ?? '')}</div>
        </div>
      )}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(248,113,113,0.18)',border:'1px solid rgba(248,113,113,0.45)',color:'#F87171'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}

      {/* Answer buttons */}
      {!hasChoice ? (
        <div className="flex w-full gap-4">
          <button onClick={() => void pick('true')}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl py-7 text-lg font-black text-white"
            style={{background:'linear-gradient(135deg,rgba(34,197,94,0.28),rgba(34,197,94,0.10))',border:'2px solid rgba(34,197,94,0.6)',boxShadow:'0 0 30px rgba(34,197,94,0.25)'}}>
            <span className="text-4xl">✅</span>
            L'ho fatto!
          </button>
          <button onClick={() => void pick('false')}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl py-7 text-lg font-black text-white"
            style={{background:'linear-gradient(135deg,rgba(248,113,113,0.28),rgba(248,113,113,0.10))',border:'2px solid rgba(248,113,113,0.6)',boxShadow:'0 0 30px rgba(248,113,113,0.25)'}}>
            <span className="text-4xl">❌</span>
            Non ci sto!
          </button>
        </div>
      ) : (
        <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
          className="flex flex-col items-center gap-2 rounded-3xl px-8 py-6"
          style={choice === 'true'
            ? {background:'rgba(34,197,94,0.15)',border:'2px solid rgba(34,197,94,0.6)'}
            : {background:'rgba(248,113,113,0.15)',border:'2px solid rgba(248,113,113,0.6)'}}>
          <div className="text-4xl">{choice === 'true' ? '🔥' : '😅'}</div>
          <div className="text-lg font-black text-white">
            {choice === 'true' ? 'Sfida accettata!' : 'Passato!'}
          </div>
          {choice === 'true' && (
            <div className="text-sm" style={{color:'rgba(34,197,94,0.9)'}}>+{pts} punti assegnati!</div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── WordBackBookingPhone (phone view during pair-rotation window) ───────────────

function WordBackBookingPhone({ payload, player, sessionId }: {
  payload: Record<string, unknown>;
  player: HomePlayer;
  sessionId: string;
}) {
  const bookedRoles = (payload.bookedRoles as {
    guesser:   { id: string; nickname: string } | null;
    suggester: { id: string; nickname: string } | null;
  } | null) ?? { guesser: null, suggester: null };
  const bookingUntil = Number(payload.bookingOpenUntil ?? 0);

  const [myRole,  setMyRole]  = useState<'guesser' | 'suggester' | null>(null);
  const [booking, setBooking] = useState(false);
  const [micReady, setMicReady] = useState<boolean | null>(null);
  const [now,     setNow]     = useState(() => Date.now());

  useEffect(() => {
    const iid = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iid);
  }, []);

  const secsLeft       = Math.max(0, Math.ceil((bookingUntil - now) / 1000));
  const guesserTaken   = !!bookedRoles.guesser;
  const suggesterTaken = !!bookedRoles.suggester;

  const bookRole = useCallback(async (role: 'guesser' | 'suggester') => {
    if (booking || myRole) return;
    setBooking(true);
    // Mic preflight for INDOVINO — request permission inside the user gesture before the round starts
    if (role === 'guesser' && navigator.mediaDevices?.getUserMedia) {
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
      const r = await fetch(`/api/home/sessions/${sessionId}/wordback-book-role`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, nickname: player.nickname, role }),
      });
      if (r.ok) setMyRole(role);
    } catch { /* ignore — network error, player can retry */ }
    finally { setBooking(false); }
  }, [booking, myRole, sessionId, player.id, player.nickname]);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-5xl">🔄</div>
      <div className="text-xl font-black text-white">Cambio giocatori!</div>
      {secsLeft > 0 && (
        <div className="text-sm font-black" style={{color:'#A78BFA'}}>{secsLeft}s per prenotarsi</div>
      )}

      {myRole ? (
        <div className="rounded-2xl px-6 py-5 w-full text-center"
          style={{background:'rgba(34,197,94,0.15)',border:'1.5px solid rgba(34,197,94,0.5)'}}>
          <div className="text-3xl mb-2">{myRole === 'guesser' ? '🙈' : '💬'}</div>
          <div className="text-base font-black text-white">
            Sei il {myRole === 'guesser' ? 'INDOVINO' : 'SUGGERITORE'}!
          </div>
          <div className="text-xs text-white/40 mt-1">In attesa dell'inizio…</div>
          {myRole === 'guesser' && micReady !== null && (
            <div className="mt-2 rounded-lg px-3 py-1 text-xs font-semibold"
              style={micReady
                ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }
                : { background: 'rgba(251,146,60,0.1)', color: 'rgba(251,146,60,0.9)' }}>
              {micReady ? '🎤 Microfono pronto' : '✏️ Microfono non autorizzato. Potrai usare la risposta scritta.'}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          <button onClick={() => void bookRole('guesser')} disabled={booking || guesserTaken}
            className="w-full rounded-2xl py-5 text-base font-black text-white transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: guesserTaken ? 'rgba(167,139,250,0.12)' : 'linear-gradient(135deg,#A78BFA,#7C3AED)',
              border: '2px solid rgba(167,139,250,0.6)',
              boxShadow: guesserTaken ? 'none' : '0 0 30px rgba(167,139,250,0.4)',
            }}>
            {guesserTaken
              ? `🙈 ${bookedRoles.guesser!.nickname} è l'INDOVINO`
              : '🙈 MI PRENOTO COME INDOVINO'}
          </button>
          <button onClick={() => void bookRole('suggester')} disabled={booking || suggesterTaken}
            className="w-full rounded-2xl py-5 text-base font-black text-white transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: suggesterTaken ? 'rgba(34,211,238,0.12)' : 'linear-gradient(135deg,#22D3EE,#0891b2)',
              border: '2px solid rgba(34,211,238,0.6)',
              boxShadow: suggesterTaken ? 'none' : '0 0 30px rgba(34,211,238,0.4)',
            }}>
            {suggesterTaken
              ? `💬 ${bookedRoles.suggester!.nickname} è il SUGGERITORE`
              : '💬 MI PRENOTO COME SUGGERITORE'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── WordBackController ─────────────────────────────────────────────────────────

function WordBackController({ payload, timeLeft, player, sessionId, emit, wordbackSolved, wordbackTimedOut }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  player: HomePlayer;
  sessionId: string;
  emit: (event: string, data: unknown) => void;
  wordbackSolved?: boolean;
  wordbackTimedOut?: boolean;
}) {
  const guesserId = String(payload.guesserId ?? '');
  const suggesterId = String(payload.suggesterId ?? '');
  const tabooWords = (payload.tabooWords as string[]) ?? [];
  const secretWord = String(payload.word ?? '');
  const pts = Number(payload.points ?? 150);
  const round = typeof payload.roundIndex === 'number' ? payload.roundIndex : 0;
  const isGuesser = !!guesserId && player.id === guesserId;
  const isSuggester = !!suggesterId && player.id === suggesterId;
  const [alarmPressed, setAlarmPressed] = useState(false);
  const [answered, setAnswered] = useState(false);
  // `scored` = server confirmed the answer for this round. Persists until round
  // index changes so the guesser can't re-open the mic after the overlay clears.
  const [scored, setScored] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wrong-answer inline feedback: {attempts: number, remaining: number} | null
  const [wrongInfo, setWrongInfo] = useState<{ attempts: number; remaining: number; penalty: number } | null>(null);

  // Reset all per-round state when the word changes (new round from host).
  useEffect(() => {
    setAnswered(false);
    setScored(false);
    setWrongInfo(null);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, [round]);

  // Cleanup on unmount
  useEffect(() => () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); }, []);

  // isPostingRef prevents a duplicate wrong-answer POST while one is already in flight
  const isPostingRef = useRef(false);

  const handleCorrect = useCallback(async (answerText: string): Promise<AnswerResult | void> => {
    if (answered || scored) {
      console.log('[WordBackAnswer] guard — already answered/scored', { answered, scored });
      return { ok: false, code: '409', message: 'Risposta già registrata per questo round' };
    }
    setAnswered(true);
    setWrongInfo(null);
    console.log('[WordBackAnswer] POST correct', { answerText, sessionId, playerId: player.id, round });
    try {
      const res = await fetch(`/api/home/sessions/${sessionId}/wordback-correct`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, answerText, round }),
      });
      console.log('[WordBackAnswer] POST status', res.status);
      if (res.ok) {
        console.log('[WordBackAnswer] success — overlay shown, locking round');
        setScored(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
          console.log('[WordBackAnswer] overlay cleared — waiting for host next-round');
          setAnswered(false);
        }, 2000);
        return { ok: true };
      } else {
        const body = await res.json().catch(() => ({})) as {
          error?: string;
          correct?: boolean;
          wrongAttempts?: number;
          remainingAttempts?: number;
          penalty?: number;
          roundClosed?: boolean;
          reason?: string;
        };
        console.log('[WordBackAnswer] POST failure', { status: res.status, body });
        setAnswered(false);

        if (res.status === 409) {
          return { ok: false, code: '409', message: 'Risposta già registrata per questo round' };
        }
        if (res.status === 422) {
          const wAttempts = body.wrongAttempts ?? 1;
          const remaining = body.remainingAttempts ?? 2;
          const penalty   = body.penalty ?? 50;
          if (!body.roundClosed) {
            setWrongInfo({ attempts: wAttempts, remaining, penalty });
          }
          return { ok: false, code: '422', message: remaining > 0 ? `Sbagliato! Tentativi rimasti: ${remaining}` : 'Parola persa' };
        }
        return { ok: false, code: 'error', message: body.error ?? `Errore ${res.status}` };
      }
    } catch (err) {
      console.log('[WordBackAnswer] POST exception', { err: String(err) });
      setAnswered(false);
      return { ok: false, code: 'error', message: 'Errore di connessione, riprova' };
    }
  }, [answered, scored, sessionId, player.id, round]);

  // handleWrong — called by PressToTalkAnswer when local match fails.
  // POSTs to /wordback-correct so the server can enforce the penalty rule.
  // Does NOT set answered=true (avoids false "CORRETTO!" flash).
  const handleWrong = useCallback(async (answerText: string): Promise<void> => {
    if (scored || isPostingRef.current) {
      console.log('[WordBackWrong] guard — scored or posting in flight', { scored });
      return;
    }
    if (!answerText.trim()) return;
    isPostingRef.current = true;
    console.log('[WordBackWrong] POST wrong answer to server', { answerText, round });
    try {
      const res = await fetch(`/api/home/sessions/${sessionId}/wordback-correct`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, answerText, round }),
      });
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        wrongAttempts?: number;
        remainingAttempts?: number;
        penalty?: number;
        roundClosed?: boolean;
      };
      console.log('[WordBackWrong] POST result', { status: res.status, body });
      if (res.status === 422) {
        const wAttempts = body.wrongAttempts ?? 1;
        const remaining = body.remainingAttempts ?? 2;
        const penalty   = body.penalty ?? 50;
        if (!body.roundClosed) {
          setWrongInfo({ attempts: wAttempts, remaining, penalty });
        }
        // If roundClosed=true the home:wordback_timeout socket arrives and
        // wordbackTimedOut becomes true in parent — no extra UI needed here.
      } else if (res.ok) {
        // Server normalization accepted it as correct even though local match failed.
        // Treat as correct: lock the round.
        console.log('[WordBackWrong] server accepted as correct despite local mismatch');
        setScored(true);
        setAnswered(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setAnswered(false), 2000);
      }
      // 409 = already closed, nothing to do
    } catch (err) {
      console.log('[WordBackWrong] POST exception', { err: String(err) });
    } finally {
      isPostingRef.current = false;
    }
  }, [scored, sessionId, player.id, round]);

  const handleAlarm = useCallback(() => {
    if (alarmPressed) return;
    setAlarmPressed(true);
    emit('home:wordback_taboo_alarm', { sessionId, playerId: player.id, nickname: player.nickname, round });
    setTimeout(() => setAlarmPressed(false), 2000);
  }, [alarmPressed, emit, sessionId, player.id, player.nickname, round]);

  // When wordbackSolved=true the interval has been cleared in the parent — show frozen value with ✓ tint
  const timerBadge = timeLeft !== null ? (
    <div className="flex items-center gap-2 rounded-xl px-5 py-2"
      style={wordbackSolved
        ? {background:'rgba(34,197,94,0.18)',border:'1px solid rgba(34,197,94,0.45)',color:'#4ade80'}
        : {background:'rgba(34,211,238,0.18)',border:'1px solid rgba(34,211,238,0.45)',color:'#22D3EE'}}>
      <Timer className="h-4 w-4"/>
      <span className="text-2xl font-black tabular-nums">{wordbackSolved ? '✓' : `${timeLeft}s`}</span>
    </div>
  ) : null;

  // Pair-rotation booking window — all hooks already called above
  if (String(payload.mode ?? '') === 'home-wordback-booking') {
    return <WordBackBookingPhone payload={payload} player={player} sessionId={sessionId}/>;
  }

  if (isGuesser) {
    // Round timed-out or 3 wrong answers: lock screen
    if (wordbackTimedOut) {
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-7xl">⏰</div>
          <div className="text-2xl font-black text-white">Parola persa!</div>
          <div className="rounded-2xl px-4 py-3 w-full text-sm font-semibold"
            style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.4)',color:'rgba(239,68,68,0.9)'}}>
            Tempo scaduto — in attesa del prossimo round…
          </div>
          {timerBadge}
        </div>
      );
    }

    // Phase 1 (2 s): big green success overlay — auto-dismisses via timer
    if (answered) {
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-7xl">✅</div>
          <div className="text-2xl font-black text-white">CORRETTO!</div>
          <div className="text-sm font-semibold" style={{color:'rgba(34,197,94,0.8)'}}>+{pts} punti assegnati a entrambi</div>
          {timerBadge}
        </div>
      );
    }

    // Phase 2 (after overlay clears, same round): quiet waiting state
    if (scored) {
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-5xl">✅</div>
          <div className="text-xl font-black text-white">Risposta corretta!</div>
          <div className="rounded-2xl px-4 py-3 w-full text-sm font-semibold"
            style={{background:'rgba(34,197,94,0.10)',border:'1px solid rgba(34,197,94,0.35)',color:'rgba(34,197,94,0.8)'}}>
            In attesa del prossimo round…
          </div>
          {timerBadge}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-6xl">🙈</div>
        <div className="text-xl font-black text-white">Indovina la parola!</div>
        <div className="rounded-2xl px-4 py-3 w-full text-sm font-semibold"
          style={{background:'rgba(167,139,250,0.12)',border:'1px solid rgba(167,139,250,0.35)',color:'rgba(167,139,250,0.85)'}}>
          Ascolta i suggerimenti del Suggeritore e rispondi qui sotto!
        </div>

        {/* Wrong-answer inline feedback — shown after each failed attempt */}
        {wrongInfo && (
          <div className="rounded-2xl px-4 py-3 w-full text-sm font-black"
            style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.5)',color:'rgba(239,68,68,1)'}}>
            <div>❌ Risposta sbagliata: -{wrongInfo.penalty} punti</div>
            <div className="mt-1" style={{color: wrongInfo.remaining <= 1 ? 'rgba(251,146,60,1)' : 'rgba(239,68,68,0.8)'}}>
              Tentativi rimasti: {wrongInfo.remaining}
              {wrongInfo.remaining === 1 && ' — ultimo tentativo!'}
            </div>
          </div>
        )}

        {timerBadge}

        <PressToTalkAnswer
          expectedAnswer={secretWord}
          language="it-IT"
          disabled={answered || scored}
          onCorrect={handleCorrect}
          onWrong={handleWrong}
          sessionId={sessionId}
          playerId={player.id}
        />

        <div className="text-xs text-white/30">Solo tu vedi questo pulsante — sei l'Indovinatore!</div>
      </div>
    );
  }

  if (isSuggester) {
    if (wordbackSolved) {
      return (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="text-5xl">✅</div>
          <div className="text-xl font-black text-white">Risposta corretta!</div>
          <div className="rounded-2xl px-4 py-3 w-full text-sm font-semibold"
            style={{background:'rgba(34,197,94,0.10)',border:'1px solid rgba(34,197,94,0.35)',color:'rgba(34,197,94,0.8)'}}>
            In attesa del prossimo round…
          </div>
          {timerBadge}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-6xl">💬</div>
        <div className="text-xl font-black text-white">Fai indovinare!</div>
        <div className="rounded-2xl p-5 w-full"
          style={{background:'rgba(34,211,238,0.12)',border:'1px solid rgba(34,211,238,0.4)'}}>
          <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(34,211,238,0.9)'}}>LA PAROLA SEGRETA</div>
          <div className="text-display text-4xl font-black" style={{color:'#22D3EE',textShadow:'0 0 30px rgba(34,211,238,0.6)'}}>
            {String(payload.word ?? '?')}
          </div>
        </div>
        {tabooWords.length > 0 && (
          <div className="rounded-2xl p-4 w-full"
            style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.4)'}}>
            <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(239,68,68,0.9)'}}>⛔ PAROLE VIETATE</div>
            <div className="flex flex-col gap-1.5">
              {tabooWords.map((w, i) => (
                <div key={i} className="text-sm font-bold text-white/80">{i+1}. {w}</div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/40 italic">Non puoi dire queste parole!</div>
          </div>
        )}
        {timerBadge}
      </div>
    );
  }

  // All other players → Controllo Taboo
  if (wordbackSolved) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-5xl">✅</div>
        <div className="text-xl font-black text-white">Risposta corretta!</div>
        <div className="rounded-2xl px-4 py-3 w-full text-sm font-semibold"
          style={{background:'rgba(34,197,94,0.10)',border:'1px solid rgba(34,197,94,0.35)',color:'rgba(34,197,94,0.8)'}}>
          In attesa del prossimo round…
        </div>
        {timerBadge}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🚨</div>
      <div className="text-xl font-black text-white">Controllo Taboo</div>
      {tabooWords.length > 0 && (
        <div className="rounded-2xl p-4 w-full"
          style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)'}}>
          <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(239,68,68,0.9)'}}>⛔ PAROLE VIETATE</div>
          <div className="flex flex-col gap-1.5">
            {tabooWords.map((w, i) => (
              <div key={i} className="text-sm font-bold text-white/80">{i+1}. {w}</div>
            ))}
          </div>
        </div>
      )}
      <button onClick={handleAlarm} disabled={alarmPressed}
        className="w-full rounded-2xl py-5 text-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
        style={{
          background: alarmPressed ? 'rgba(239,68,68,0.35)' : 'linear-gradient(135deg,#ef4444,#b91c1c)',
          border: '2px solid rgba(239,68,68,0.8)',
          boxShadow: alarmPressed ? 'none' : '0 0 40px rgba(239,68,68,0.5)',
        }}>
        {alarmPressed ? '🚨 Inviato!' : '🚨 ALLARME TABOO'}
      </button>
      {timerBadge}
      <div className="text-xs text-white/35">Premi il bottone se senti una parola vietata!</div>
    </div>
  );
}

// ── KaraokeController ─────────────────────────────────────────────────────────

function KaraokeController({ payload, sessionId: _sessionId }: {
  payload: Record<string,unknown>;
  sessionId: string;
}) {
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState('');
  const micRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const startMic = useCallback(async () => {
    if (micActive) return;
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      src.connect(analyzer);
      micRef.current = stream;
      analyzerRef.current = analyzer;
      setMicActive(true);
      const buf = new Uint8Array(analyzer.frequencyBinCount);
      const tick = () => {
        analyzer.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.round((avg / 255) * 100));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { setMicError('Microfono non disponibile — controlla i permessi'); }
  }, [micActive]);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null; analyzerRef.current = null;
    setMicActive(false); setMicLevel(0);
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const micColor = micLevel > 70 ? '#22c55e' : micLevel > 35 ? '#eab308' : '#FB923C';

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🎤</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Karaoke')}</div>
      <div className="text-base font-bold" style={{color:'#FB923C'}}>— {String(payload.artist ?? '')}</div>
      {!!payload.lyricSnippet && (
        <div className="rounded-2xl p-4 w-full"
          style={{background:'rgba(251,146,60,0.12)',border:'1px solid rgba(251,146,60,0.35)'}}>
          <div className="text-sm text-white/70 italic leading-relaxed whitespace-pre-line">
            "{String(payload.lyricSnippet)}"
          </div>
        </div>
      )}

      {/* ── Microfono ── */}
      {!micActive ? (
        <button onClick={() => void startMic()}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black"
          style={{background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.45)'}}>
          <Mic className="h-4 w-4"/> Attiva microfono
        </button>
      ) : (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs font-bold" style={{color:'#FB923C'}}>
            <span className="flex items-center gap-1"><Mic className="h-3 w-3"/> Microfono attivo</span>
            <span className="tabular-nums">{micLevel}%</span>
          </div>
          <div className="relative h-8 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${micLevel}%` }} transition={{ duration: 0.08 }}
              style={{ background: micColor, boxShadow: `0 0 12px ${micColor}80` }} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
              {micLevel > 60 ? '🔥 Dai tutto!' : micLevel > 25 ? '🎤 Bene!' : '🔇 Canta più forte!'}
            </div>
          </div>
          <button onClick={stopMic} className="text-xs text-white/30 hover:text-white/60 transition-colors mt-1">
            Disattiva mic
          </button>
        </div>
      )}
      {micError && <div className="text-xs text-red-400">{micError}</div>}

      <div className="text-2xl font-black" style={{color:'#FB923C'}}>CANTA! 🎤</div>
      <div className="text-xs text-white/35">Guarda i testi sulla TV</div>
    </div>
  );
}

// ── FreestyleController ───────────────────────────────────────────────────────

function FreestyleController({ payload, timeLeft }: { payload: Record<string,unknown>; timeLeft: number | null }) {
  const targetWord = String(payload.word ?? '').toLowerCase().trim();
  const [recognized, setRecognized] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setMicError('Il tuo browser non supporta il riconoscimento vocale'); return; }
    const r = new SR();
    r.lang = 'it-IT';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev: { resultIndex: number; results: { transcript: string; isFinal: boolean }[][] }) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const transcript = (ev.results[i]![0]?.transcript ?? '').toLowerCase();
        if (targetWord && transcript.includes(targetWord)) setRecognized(true);
      }
    };
    r.onend = () => { try { r.start(); } catch { setListening(false); } };
    r.onerror = (ev: { error: string }) => {
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setMicError(`Errore: ${ev.error}`); setListening(false);
      }
    };
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }, [targetWord]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // Reset when word changes
  useEffect(() => { setRecognized(false); }, [targetWord]);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🎙️</div>
      <div className="text-xl font-black text-white">FREESTYLE RAP</div>

      {/* Word chip — illuminates when recognized */}
      <motion.div
        animate={recognized ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0px #FB923C', '0 0 40px #FB923C', '0 0 20px #FB923C'] } : {}}
        transition={{ duration: 0.5 }}
        className="rounded-2xl px-6 py-4 w-full"
        style={{
          background: recognized ? 'rgba(251,146,60,0.28)' : 'rgba(251,146,60,0.12)',
          border: `2px solid ${recognized ? '#FB923C' : 'rgba(251,146,60,0.45)'}`,
          boxShadow: recognized ? '0 0 50px rgba(251,146,60,0.5)' : '0 0 30px rgba(251,146,60,0.2)',
        }}>
        <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(251,146,60,0.8)'}}>LA PAROLA</div>
        <div className="text-4xl font-black" style={{color:'#FB923C'}}>
          {String(payload.word ?? '?')}
          {recognized && <span className="ml-2 text-green-400">✓</span>}
        </div>
        {recognized && (
          <div className="mt-1 text-xs font-bold text-green-400 animate-pulse">🎉 Parola riconosciuta!</div>
        )}
      </motion.div>

      {/* Timer */}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(251,146,60,0.18)',border:'1px solid rgba(251,146,60,0.45)',color:'#FB923C'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}

      {/* Mic button */}
      {!listening ? (
        <button onClick={startListening}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black"
          style={{background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 24px rgba(251,146,60,0.45)'}}>
          <Mic className="h-4 w-4"/> Attiva il microfono
        </button>
      ) : (
        <motion.button onClick={stopListening}
          animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black bg-red-500 text-white shadow-lg shadow-red-500/40">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          🎙️ In ascolto… (tocca per stop)
        </motion.button>
      )}
      {micError && <div className="text-xs text-red-400">{micError}</div>}

      <div className="text-sm text-white/60">Improvvisa un rap e di' la parola ad alta voce!</div>
    </div>
  );
}

// ── KaraokeLiveController (v3 — telefono) ─────────────────────────────────

const BASE_URL_JOIN = (import.meta.env.BASE_URL as string) ?? '/';
const homeFetch = (path: string, body?: unknown) =>
  fetch(`${BASE_URL_JOIN}api${path}`.replace(/\/\//g, '/'), {
    method: body !== undefined ? 'POST' : 'GET',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const KK_J = '#FB923C';

function KaraokeLiveController({ sessionId, playerId, nickname, avatarColor, initialState }: {
  sessionId: string; playerId: string; nickname: string; avatarColor: string;
  initialState: KaraokeHomeState;
}) {
  const { on } = useEventSocket(null);
  const [state, setState] = useState<KaraokeHomeState>(initialState);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YTSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noKaraokeFound, setNoKaraokeFound] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [myBallot, setMyBallot] = useState<VotingBallot>({ intonazione: 0, presenza: 0, emozione: 0, originalita: 0 });
  const [voted, setVoted] = useState(false);
  const [reactionSent, setReactionSent] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  // Dedication flow
  const [selectedVideo, setSelectedVideo] = useState<YTSearchResult | null>(null);
  const [dedicateeId, setDedicateeId] = useState<string | null>(null);
  const [dedicateeNick, setDedicateeNick] = useState<string | null>(null);
  const [dedicationStep, setDedicationStep] = useState<'confirm' | 'pick_player' | null>(null);

  useEffect(() => { setState(initialState); }, [initialState]);
  useEffect(() => {
    const u = on<{ state: KaraokeHomeState }>('home:karaoke_state', ({ state: s }) => {
      setState(s);
      // Reset vote state when phase changes away from voting
      if (s.karaokePhase !== 'voting') { setVoted(false); }
    });
    return u;
  }, [on]);

  useEffect(() => {
    const tick = () => setRemaining(remainingSessionSeconds(state));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [state.sessionEndAt]);

  const post = useCallback(async (path: string, body?: unknown) => {
    const r = await homeFetch(`/home/sessions/${sessionId}${path}`, body ?? {});
    if (!r.ok) {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? 'Errore imprevisto');
      setTimeout(() => setError(''), 3000);
    }
  }, [sessionId]);

  const doSearch = useCallback(async () => {
    const rawInput = searchQuery.trim();
    if (!rawInput) return;
    setSearching(true);
    setNoKaraokeFound(false);
    setSearchWarning(null);
    try {
      const r = await homeFetch(`/home/sessions/${sessionId}/karaoke/search`, { query: rawInput });
      const d = await r.json() as
        | { ok: true;  results: YTSearchResult[]; noKaraokeFound: boolean; warning?: string | null; mock?: boolean; youtubeQuery: string }
        | { ok: false; error: string; youtubeQuery: string; status?: number; code?: number; message?: string };

      if (!d.ok) {
        // Surface the real YouTube error to the user (temporarily, for diagnosis)
        const msg =
          d.error === "youtube_api_error"    ? `Errore YouTube ${d.status ?? ''}: ${d.message ?? 'API error'}` :
          d.error === "youtube_zero_results" ? `YouTube ha restituito 0 risultati per: ${d.youtubeQuery}` :
                                               `Errore ricerca: ${d.message ?? d.error}`;
        setSearchWarning(msg);
        setNoKaraokeFound(true);
        console.warn(`[KARAOKE_SEARCH] error=${d.error} | youtubeQuery="${d.youtubeQuery}" | status=${(d as {status?:number}).status ?? '-'} | message=${(d as {message?:string}).message ?? '-'}`);
        return;
      }

      const results = d.results ?? [];
      setSearchResults(results);
      setNoKaraokeFound(d.noKaraokeFound ?? results.length === 0);
      setSearchWarning(results.length > 0 ? (d.warning ?? null) : null);
      console.log(`[KARAOKE_SEARCH] ok | youtubeQuery="${d.youtubeQuery}" | mock=${d.mock ?? false} | results=${results.length} | noKaraokeFound=${d.noKaraokeFound} | warning=${d.warning ?? null} | first="${results[0]?.title ?? 'none'}" (${results[0]?.videoId ?? 'none'})`);
    } finally { setSearching(false); }
  }, [searchQuery, sessionId]);

  const doBook = useCallback(async (
    video: YTSearchResult,
    dedId: string | null,
    dedNick: string | null,
  ) => {
    setBooking(true);
    try {
      await post('/karaoke/book-song', {
        playerId, nickname, avatarColor,
        videoId: video.videoId, title: video.title, channel: video.channel,
        thumbnailUrl: video.thumbnailUrl, durationSeconds: video.durationSeconds,
        dedicationTargetPlayerId: dedId ?? null,
        dedicationTargetNickname: dedNick ?? null,
      });
      setSearchResults([]);
      setSearchQuery('');
      setNoKaraokeFound(false);
      setSearchWarning(null);
      setSelectedVideo(null);
      setDedicationStep(null);
      setDedicateeId(null);
      setDedicateeNick(null);
    } finally { setBooking(false); }
  }, [post, playerId, nickname, avatarColor]);

  const doChangeBook = useCallback(async (video: YTSearchResult) => {
    setBooking(true);
    try {
      await post('/karaoke/change-song', {
        playerId, nickname, avatarColor,
        videoId: video.videoId, title: video.title, channel: video.channel,
        thumbnailUrl: video.thumbnailUrl, durationSeconds: video.durationSeconds,
      });
      setSearchResults([]);
      setSearchQuery('');
      setNoKaraokeFound(false);
      setSearchWarning(null);
    } finally { setBooking(false); }
  }, [post, playerId, nickname, avatarColor]);

  const sendReaction = useCallback(async (emoji: string) => {
    setReactionSent(emoji);
    setTimeout(() => setReactionSent(''), 1500);
    await post('/karaoke/react', { emoji });
  }, [post]);

  const submitVote = useCallback(async () => {
    await post('/karaoke/vote', { voterId: playerId, ballot: myBallot });
    setVoted(true);
  }, [post, playerId, myBallot]);

  const s = state;
  const myQueueItem = getPlayerQueueItem(s, playerId);
  const isCurrentSinger = s.currentQueueItemId !== null &&
    s.queue.find(q => q.id === s.currentQueueItemId)?.playerId === playerId;
  // Hoisted — used across playing / voting / queue_open phases
  const waitingQueue = s.queue.filter(q => q.status === 'queued');
  const myPos = myQueueItem ? waitingQueue.findIndex(q => q.id === myQueueItem.id) + 1 : -1;
  const canBook = canQueueAnyMore(s);
  const waitLabel = waitEstimateLabel(s);

  // ── Waiting for mode selection ──────────────────────────────────────────
  if (s.subMode === 'mode_select') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <div className="text-4xl">🎤</div>
        <div className="text-xl font-black text-white">Karaoke Live</div>
        <div className="text-sm text-white/50">Aspetta che l'host scelga la modalità…</div>
      </div>
    );
  }

  // ── Freestyle controller ────────────────────────────────────────────────
  if (s.subMode === 'freestyle' || s.freestylePhase === 'battling' || s.freestylePhase === 'booking') {
    const myBooking = s.freestyleBookings.find(b => b.playerId === playerId);
    const battle = s.currentBattle;
    const isRapper = battle?.playerId === playerId;
    const currentWord = battle?.words[battle.currentWordIndex];
    const hasValidated = currentWord ? currentWord.validatedBy.includes(playerId) : false;

    if (s.freestylePhase === 'battling' && battle) {
      if (isRapper) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
            <div className="text-xs font-black uppercase tracking-widest text-amber-400">🎙️ Sei sul palco!</div>
            {currentWord && (
              <div className="rounded-3xl px-8 py-6 w-full"
                style={{ background: '#f59e0b20', border: '3px solid #f59e0b' }}>
                <div className="text-display font-black text-4xl text-amber-400">{currentWord.word}</div>
                {currentWord.validated && <div className="text-green-400 mt-1 font-bold">✅ Validata!</div>}
              </div>
            )}
            <div className="text-4xl font-black text-amber-400">{battle.score} pt</div>
            {battle.combo > 1 && (
              <div className="text-sm font-black text-amber-400">🔥 Combo x{battle.combo}!</div>
            )}
          </div>
        );
      }
      // Public: validate word
      return (
        <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
          <div className="text-sm text-white/50">{battle.nickname} sta rappando…</div>
          {currentWord && (
            <div className="rounded-3xl px-8 py-6 w-full"
              style={{ background: '#f59e0b10', border: '2px solid #f59e0b55' }}>
              <div className="text-display font-black text-3xl text-amber-300">{currentWord.word}</div>
            </div>
          )}
          {!hasValidated && !currentWord?.validated ? (
            <motion.button whileTap={{ scale: 0.93 }}
              onClick={() => void post('/freestyle/validate-word', { playerId })}
              className="w-full rounded-3xl py-6 text-xl font-black"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 0 30px #f59e0b55' }}>
              ✅ Ha detto la parola!
            </motion.button>
          ) : (
            <div className="text-green-400 font-black text-lg">✅ Validato!</div>
          )}
        </div>
      );
    }

    // Booking phase
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
        <div className="text-4xl">🎙️</div>
        <div className="text-xl font-black text-white">Freestyle Battle</div>
        {myBooking ? (
          <div className="rounded-2xl p-4 w-full" style={{ background: '#f59e0b15', border: '2px solid #f59e0b44' }}>
            <div className="text-sm text-white/50 mb-1">Sei in coda!</div>
            <div className="text-lg font-black text-amber-400">
              Posizione: {s.freestyleBookings.filter(b => b.status === 'waiting').findIndex(b => b.playerId === playerId) + 1}
            </div>
          </div>
        ) : (
          <button onClick={() => void post('/freestyle/book', { playerId, nickname, avatarColor })}
            className="w-full rounded-3xl py-5 text-xl font-black"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 0 30px #f59e0b55' }}>
            🎙️ Voglio rappare!
          </button>
        )}
      </div>
    );
  }

  // ── Duration select ─────────────────────────────────────────────────────
  if (s.karaokePhase === 'duration_select') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <div className="text-4xl">🎤</div>
        <div className="text-xl font-black text-white">Karaoke Live</div>
        <div className="text-sm text-white/50">L'host sta scegliendo la durata della serata…</div>
      </div>
    );
  }

  // ── Is current singer ───────────────────────────────────────────────────
  if (isCurrentSinger && (s.karaokePhase === 'playing' || s.karaokePhase === 'voting')) {
    const item = s.queue.find(q => q.id === s.currentQueueItemId);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          <div className="text-7xl">🎤</div>
        </motion.div>
        <div className="text-display text-3xl font-black" style={{ color: KK_J }}>Sei sul palco!</div>
        {item && <div className="text-white/60 font-bold">{item.title}</div>}
        {s.karaokePhase === 'voting' && <div className="text-sm text-white/40">Gli altri stanno votando la tua esibizione…</div>}
      </div>
    );
  }

  // ── Dedication/booking confirmation — intercepts any non-singer phase ────
  if (selectedVideo && dedicationStep) {
    const connectedPlayers = s.players.filter(p => p.id !== playerId);
    if (dedicationStep === 'pick_player') {
      return (
        <div className="flex flex-col gap-4 px-4 py-6 h-full">
          <button onClick={() => setDedicationStep('confirm')}
            className="self-start text-xs text-white/40 flex items-center gap-1">
            ← Indietro
          </button>
          <div className="text-display text-lg font-black text-white text-center">A chi dedichi il brano?</div>
          <div className="text-sm text-white/40 text-center truncate">🎵 {selectedVideo.title}</div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {connectedPlayers.map(p => (
              <button key={p.id} onClick={() => { setDedicateeId(p.id); setDedicateeNick(p.nickname); setDedicationStep('confirm'); }}
                className="w-full rounded-2xl p-4 flex items-center gap-3 text-left transition-all"
                style={{
                  background: dedicateeId === p.id ? `${KK_J}25` : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${dedicateeId === p.id ? KK_J : 'rgba(255,255,255,0.1)'}`,
                }}>
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-base font-black text-black shrink-0"
                  style={{ background: p.avatarColor }}>{p.nickname[0]?.toUpperCase()}</div>
                <span className="font-bold text-white">{p.nickname}</span>
                {dedicateeId === p.id && <span className="ml-auto text-xl">❤️</span>}
              </button>
            ))}
            {connectedPlayers.length === 0 && (
              <div className="text-center text-white/30 text-sm py-8">Nessun altro giocatore collegato</div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5 px-4 py-6 h-full">
        <button onClick={() => { setSelectedVideo(null); setDedicationStep(null); setDedicateeId(null); setDedicateeNick(null); }}
          className="self-start text-xs text-white/40 flex items-center gap-1">
          ← Torna alla ricerca
        </button>
        <div className="rounded-3xl p-4 flex items-center gap-3"
          style={{ background: `${KK_J}18`, border: `2px solid ${KK_J}55` }}>
          <img src={selectedVideo.thumbnailUrl} alt={selectedVideo.title} className="h-14 w-20 rounded-xl object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-white leading-tight line-clamp-2">{selectedVideo.title}</div>
            <div className="text-xs text-white/40 mt-0.5">{selectedVideo.channel} • {selectedVideo.durationFormatted}</div>
          </div>
        </div>
        {dedicateeNick ? (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.35)' }}>
            <div className="text-sm text-white/60 mb-1">Dedica selezionata</div>
            <div className="text-lg font-black text-white">❤️ {dedicateeNick}</div>
            <button onClick={() => { setDedicateeId(null); setDedicateeNick(null); }}
              className="mt-2 text-xs text-red-400/60 underline">Rimuovi dedica</button>
          </div>
        ) : (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
            <div className="text-sm text-white/40 mb-3">Vuoi dedicare questo brano a qualcuno?</div>
            <button onClick={() => setDedicationStep('pick_player')}
              className="w-full rounded-2xl py-3 font-black mb-2"
              style={{ background: `${KK_J}20`, border: `1.5px solid ${KK_J}50`, color: KK_J }}>
              ❤️ Dedica il brano
            </button>
          </div>
        )}
        {error && <div className="text-sm text-red-400 text-center rounded-xl p-2 bg-red-500/10">{error}</div>}
        <button onClick={() => void doBook(selectedVideo, dedicateeId, dedicateeNick)}
          disabled={booking}
          className="mt-auto rounded-3xl py-5 text-xl font-black disabled:opacity-40"
          style={{ background: `linear-gradient(135deg,${KK_J},#ea580c)`, boxShadow: `0 0 30px ${KK_J}55` }}>
          {booking ? <Loader2 className="h-5 w-5 animate-spin inline" /> : '🎤 Conferma prenotazione'}
        </button>
      </div>
    );
  }

  // ── Voting phase ────────────────────────────────────────────────────────
  if (s.karaokePhase === 'voting') {
    const cats = ['intonazione', 'presenza', 'emozione', 'originalita'] as const;
    const labels: Record<string, string> = { intonazione: 'Intonazione', presenza: 'Presenza', emozione: 'Emozione', originalita: 'Originalità' };
    if (voted) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
          <div className="text-5xl">⭐</div>
          <div className="text-xl font-black text-green-400">Voto inviato!</div>
          <div className="text-sm text-white/40">Aspetta i risultati…</div>
          {/* Booking strip — still visible after voting */}
          {myQueueItem ? (
            <div className="w-full rounded-xl px-3 py-2 flex items-center gap-2 mt-2"
              style={{ background: `${KK_J}12`, border: `1px solid ${KK_J}28` }}>
              <span className="text-sm">🎤</span>
              <span className="flex-1 text-xs font-bold text-white truncate text-left">{myQueueItem.title}</span>
              {myPos > 0 && <span className="text-xs font-black shrink-0" style={{ color: KK_J }}>#{myPos}</span>}
            </div>
          ) : canBook ? (
            <div className="w-full flex gap-2 mt-2">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void doSearch()}
                placeholder="Prenota prossimo brano…"
                className="flex-1 rounded-xl px-3 py-2.5 text-white bg-white/08 border border-white/15 text-xs outline-none focus:border-orange-400/60"
              />
              <button onClick={() => void doSearch()} disabled={searching}
                className="rounded-xl px-3 py-2.5 font-black text-sm"
                style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : '🔍'}
              </button>
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 px-4 py-6 h-full overflow-y-auto">
        <div className="text-display text-xl font-black text-white text-center">Vota l'esibizione!</div>
        {cats.map(cat => (
          <div key={cat}>
            <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: `${KK_J}aa` }}>{labels[cat]}</div>
            <div className="flex gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setMyBallot(b => ({ ...b, [cat]: n }))}
                  className="flex-1 rounded-xl py-3 font-black transition-all"
                  style={{
                    background: (myBallot[cat] as number) >= n ? `${KK_J}30` : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${(myBallot[cat] as number) >= n ? KK_J : 'rgba(255,255,255,0.12)'}`,
                    color: (myBallot[cat] as number) >= n ? KK_J : 'rgba(255,255,255,0.4)',
                    fontSize: '1.25rem',
                  }}>
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => void submitVote()}
          disabled={cats.some(c => myBallot[c] === 0)}
          className="rounded-3xl py-5 text-xl font-black disabled:opacity-40"
          style={{ background: `linear-gradient(135deg,${KK_J},#ea580c)`, boxShadow: `0 0 30px ${KK_J}55` }}>
          ⭐ Invia voto
        </button>
        {/* Booking strip below vote button */}
        {myQueueItem ? (
          <div className="shrink-0 rounded-xl px-3 py-2 flex items-center gap-2"
            style={{ background: `${KK_J}12`, border: `1px solid ${KK_J}28` }}>
            <span className="text-sm">🎤</span>
            <span className="flex-1 text-xs font-bold text-white truncate">{myQueueItem.title}</span>
            {myPos > 0 && <span className="text-xs font-black shrink-0" style={{ color: KK_J }}>#{myPos}</span>}
          </div>
        ) : canBook ? (
          <div className="shrink-0 flex gap-2">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void doSearch()}
              placeholder="Prenota prossimo brano…"
              className="flex-1 rounded-xl px-3 py-2.5 text-white bg-white/08 border border-white/15 text-xs outline-none focus:border-orange-400/60"
            />
            <button onClick={() => void doSearch()} disabled={searching}
              className="rounded-xl px-3 py-2.5 font-black text-sm"
              style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
              {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : '🔍'}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Playing phase (public) — reactions + persistent booking strip ────────
  if (s.karaokePhase === 'playing') {
    const currentItem = s.queue.find(q => q.id === s.currentQueueItemId);
    return (
      <div className="flex flex-col h-full gap-3 px-4 py-4">
        {/* TOP: current singer info */}
        {currentItem && (
          <div className="shrink-0 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: `${KK_J}18`, border: `1.5px solid ${KK_J}35` }}>
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black text-black shrink-0"
              style={{ background: currentItem.avatarColor }}>{currentItem.nickname[0]?.toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40">Sta cantando</div>
              <div className="text-sm font-bold text-white truncate">{currentItem.title}</div>
              <div className="text-xs font-bold truncate" style={{ color: `${KK_J}cc` }}>{currentItem.nickname}</div>
            </div>
            {reactionSent && <div className="text-2xl shrink-0">{reactionSent}</div>}
          </div>
        )}
        {/* MIDDLE: emoji reactions */}
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="grid grid-cols-4 gap-3 w-full">
            {ALL_REACTIONS.map(emoji => (
              <motion.button key={emoji} whileTap={{ scale: 0.85 }}
                onClick={() => void sendReaction(emoji)}
                className="rounded-2xl py-4 text-3xl text-center transition-all"
                style={{
                  background: reactionSent === emoji ? `${KK_J}30` : 'rgba(255,255,255,0.07)',
                  border: `2px solid ${reactionSent === emoji ? KK_J : 'rgba(255,255,255,0.12)'}`,
                }}>
                {emoji}
              </motion.button>
            ))}
          </div>
          <div className="text-xs text-white/30 text-center">Reagisci all'esibizione in tempo reale!</div>
        </div>
        {/* BOTTOM: booking strip — always visible */}
        {myQueueItem ? (
          <div className="shrink-0 rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: `${KK_J}12`, border: `1px solid ${KK_J}30` }}>
            <div className="text-base shrink-0">🎤</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-white/40">Sei in coda</div>
              <div className="text-sm font-bold text-white truncate">{myQueueItem.title}</div>
            </div>
            {myPos > 0 && <div className="shrink-0 text-sm font-black" style={{ color: KK_J }}>#{myPos}</div>}
          </div>
        ) : canBook ? (
          <div className="shrink-0 space-y-2">
            <div className="flex gap-2">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void doSearch()}
                placeholder="Prenota il prossimo brano…"
                className="flex-1 rounded-2xl px-4 py-3 text-white bg-white/08 border border-white/15 text-sm outline-none focus:border-orange-400/60"
              />
              <button onClick={() => void doSearch()} disabled={searching}
                className="rounded-2xl px-4 py-3 font-black"
                style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '🔍'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {searchResults.map(r => (
                  <div key={r.videoId} className="rounded-xl p-2 flex items-center gap-2"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={r.thumbnailUrl} alt={r.title} className="h-9 w-14 rounded object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white leading-tight line-clamp-2">{r.title}</div>
                      <div className="text-[10px] text-white/40">{r.durationFormatted}</div>
                    </div>
                    <button onClick={() => { setSelectedVideo(r); setDedicateeId(null); setDedicateeNick(null); setDedicationStep('confirm'); }}
                      className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-black"
                      style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
                      ➕
                    </button>
                  </div>
                ))}
                {noKaraokeFound && !searching && (
                  <div className="text-[11px] text-amber-400/70 text-center">🎤 Nessun risultato — riprova</div>
                )}
                {searchWarning && !searching && (
                  <div className="text-[11px] text-amber-300/60 text-center">⚠️ {searchWarning}</div>
                )}
              </div>
            )}
            {searchResults.length === 0 && !searching && (noKaraokeFound || searchWarning) && (
              <div className="text-xs text-amber-400/70 text-center">
                {noKaraokeFound ? '🎤 Nessun risultato — riprova' : `⚠️ ${searchWarning ?? ''}`}
              </div>
            )}
          </div>
        ) : (
          <div className="shrink-0 text-center text-xs text-white/25 py-2">Coda al completo per questa sessione</div>
        )}
      </div>
    );
  }

  // ── Queue open — search & book ───────────────────────────────────────────
  if (s.karaokePhase === 'queue_open') {
    if (myQueueItem) {
      return (
        <div className="flex flex-col gap-5 px-4 py-6 h-full">
          <div className="rounded-3xl p-5 text-center" style={{ background: `${KK_J}15`, border: `2px solid ${KK_J}55` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: `${KK_J}aa` }}>La tua prenotazione</div>
            <div className="text-lg font-black text-white mb-1">{myQueueItem.title}</div>
            <div className="text-sm text-white/40">{myQueueItem.channel}</div>
            {myPos > 0 && <div className="mt-2 text-xl font-black" style={{ color: KK_J }}>#{myPos} in coda</div>}
            {myQueueItem.estimatedStartAt && (
              <div className="text-xs text-white/30 mt-1">
                ~{new Date(myQueueItem.estimatedStartAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>

          <div className="text-xs font-black uppercase tracking-widest text-white/30 text-center">Vuoi cambiare brano?</div>

          <div className="flex gap-2">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void doSearch()}
              placeholder="Cerca su YouTube…"
              className="flex-1 rounded-2xl px-4 py-3 text-white bg-white/08 border border-white/15 text-sm outline-none focus:border-orange-400/60"
            />
            <button onClick={() => void doSearch()} disabled={searching}
              className="rounded-2xl px-4 py-3 font-black"
              style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '🔍'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {searchResults.map(r => (
              <div key={r.videoId} className="rounded-2xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={r.thumbnailUrl} alt={r.title} className="h-12 w-20 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white leading-tight line-clamp-2">{r.title}</div>
                  <div className="text-xs text-white/40">{r.channel} • {r.durationFormatted}</div>
                </div>
                <button onClick={() => void doChangeBook(r)} disabled={booking}
                  className="shrink-0 rounded-xl px-3 py-2 text-xs font-black"
                  style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
                  {booking ? <Loader2 className="h-3 w-3 animate-spin" /> : '↩️'}
                </button>
              </div>
            ))}
            {noKaraokeFound && !searching && (
              <div className="rounded-2xl p-4 text-center text-sm text-amber-400/80" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                🎤 Nessuna base karaoke trovata — prova a scrivere titolo + artista
              </div>
            )}
            {searchWarning && !searching && searchResults.length > 0 && (
              <div className="rounded-xl px-3 py-2 text-center text-xs text-amber-300/70" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                ⚠️ {searchWarning}
              </div>
            )}
          </div>
          {error && <div className="text-sm text-red-400 text-center rounded-xl p-2 bg-red-500/10">{error}</div>}
        </div>
      );
    }

    // Not booked yet: dynamic CTA + search

    if (!canBook) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
          <div className="text-5xl">⚠️</div>
          <div className="rounded-3xl p-6 w-full" style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.35)' }}>
            <div className="text-lg font-black text-red-400">Coda al completo</div>
            <div className="text-sm text-white/50 mt-2 leading-relaxed">
              Non c'è più tempo sufficiente per aggiungere un altro brano in questa sessione.
            </div>
          </div>
          <div className="text-xs text-white/25">Tempo rimasto: {formatCountdown(remaining)}</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 px-4 py-6 h-full">
        {/* Dynamic CTA */}
        <div className="rounded-3xl p-5 text-center shrink-0"
          style={{ background: `${KK_J}18`, border: `2px solid ${KK_J}55` }}>
          <div className="text-2xl font-black text-white">🎤 Prenotati adesso</div>
          <div className="mt-1 font-bold text-base" style={{ color: KK_J }}>{waitLabel}</div>
          <div className="mt-2 text-xs text-white/30">Tempo rimasto: {formatCountdown(remaining)}</div>
        </div>

        <div className="flex gap-2 shrink-0">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void doSearch()}
            placeholder="Cerca un brano karaoke…"
            className="flex-1 rounded-2xl px-4 py-3 text-white bg-white/08 border border-white/15 text-sm outline-none focus:border-orange-400/60"
          />
          <button onClick={() => void doSearch()} disabled={searching}
            className="rounded-2xl px-4 py-3 font-black"
            style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '🔍'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {searchResults.map(r => (
            <div key={r.videoId} className="rounded-2xl p-3 flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={r.thumbnailUrl} alt={r.title} className="h-12 w-20 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white leading-tight line-clamp-2">{r.title}</div>
                <div className="text-xs text-white/40">{r.channel} • {r.durationFormatted}</div>
              </div>
              <button onClick={() => { setSelectedVideo(r); setDedicateeId(null); setDedicateeNick(null); setDedicationStep('confirm'); }}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-black"
                style={{ background: `${KK_J}25`, border: `1px solid ${KK_J}55`, color: KK_J }}>
                ➕
              </button>
            </div>
          ))}
          {searchWarning && !searching && searchResults.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-center text-xs text-amber-300/70" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
              ⚠️ {searchWarning}
            </div>
          )}
          {noKaraokeFound && !searching && searchResults.length === 0 && (
            <div className="rounded-2xl p-4 text-center text-sm text-amber-400/80" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              🎤 Nessuna base karaoke trovata — prova a scrivere titolo + artista
            </div>
          )}
          {!noKaraokeFound && !searchWarning && searchResults.length === 0 && searchQuery && !searching && (
            <div className="text-center text-white/30 text-sm py-8">Nessun risultato — prova con un altro brano</div>
          )}
          {searchResults.length === 0 && !searchQuery && (
            <div className="text-center text-white/20 text-sm py-4">Cerca il tuo brano preferito sopra</div>
          )}
        </div>
        {error && <div className="text-sm text-red-400 text-center rounded-xl p-2 bg-red-500/10">{error}</div>}
      </div>
    );
  }

  // ── Transition / Finale ─────────────────────────────────────────────────
  if (s.karaokePhase === 'transition' || s.karaokePhase === 'finale') {
    const sorted = [...s.results].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(r => r.playerId === playerId) + 1;
    const myResult = sorted.find(r => r.playerId === playerId);
    const myAwards = s.karaokePhase === 'finale'
      ? computeAwards(s.results).filter(a => a.playerId === playerId)
      : [];
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
        <div className="text-4xl">{s.karaokePhase === 'finale' ? '🏆' : '⏸️'}</div>
        {myResult ? (
          <div className="rounded-2xl p-4 w-full" style={{ background: `${KK_J}15`, border: `2px solid ${KK_J}44` }}>
            <div className="text-sm text-white/40">Il tuo punteggio</div>
            <div className="text-display text-4xl font-black" style={{ color: KK_J }}>{myResult.score}</div>
            {myRank > 0 && <div className="text-sm text-white/50">#{myRank} in classifica</div>}
          </div>
        ) : (
          <div className="text-white/40">Non hai ancora cantato questa serata</div>
        )}
        {myAwards.length > 0 && (
          <div className="w-full space-y-2">
            <div className="text-xs font-black uppercase tracking-widest text-white/30">I tuoi premi</div>
            {myAwards.map(a => (
              <div key={a.id} className="rounded-2xl p-3 flex items-center gap-3"
                style={{ background: `${KK_J}15`, border: `1.5px solid ${KK_J}44` }}>
                <div className="text-2xl shrink-0">{a.emoji}</div>
                <div className="text-left">
                  <div className="text-xs font-black text-white/80">{a.title}</div>
                  <div className="text-xs text-white/40">{a.valueLabel}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

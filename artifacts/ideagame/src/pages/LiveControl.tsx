import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Pause, Play, SkipForward, Plus, Minus,
  Power, MonitorOff, X, Loader2, Wifi, WifiOff, ExternalLink,
  Sparkles, Eye, EyeOff, CheckCircle2, Clock, BarChart3, Users,
  ChevronRight, Zap, AlertTriangle, PlusCircle, Trophy, Siren,
  Volume2, VolumeX, Music, Mic2,
} from 'lucide-react';
import { AudioManager } from '@/audio/AudioManager';
import { useAudioSettings } from '@/contexts/AudioContext';
import { PanicPanel } from '@/components/PanicPanel';
import { ScorePanel } from '@/components/ScorePanel';
import { useLocalMode } from '@/hooks/useLocalMode';
import { useEventSocket } from '@/hooks/useEventSocket';
import {
  useListEvents,
  useListGameSessions, getListGameSessionsQueryKey,
  useCreateGameSession,
  useUpdateGameSession,
  useListTeams, getListTeamsQueryKey,
  useListCardSets,
  useRecordScore,
  useGetScoreboard, getGetScoreboardQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface QuizRound {
  orderIndex: number;
  type: string;
  questionText: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  points: number;
  timeLimit: number;
  optionalMediaIds: string[];
}

interface QuizPack {
  id: string;
  title: string;
  themePrompt: string;
  language: string;
  difficulty: string;
  totalRounds: number;
  status: string;
  generatedJson: QuizRound[] | null;
}

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Scelta multipla',
  true_false: 'Vero/Falso',
  image_compare: 'Confronta',
  guess_who: 'Indovina chi',
  fast_answer: 'Risposta rapida',
  bonus_final: '🏆 Bonus Finale',
};
const TYPE_COLORS: Record<string, string> = {
  multiple_choice: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  true_false: 'text-green-400 border-green-400/30 bg-green-400/10',
  image_compare: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  guess_who: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  fast_answer: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  bonus_final: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
};

const PERCORSO_CHALLENGE_EMOJIS: Record<string, string> = {
  sfida: '⚡', domanda: '❓', mimo: '🎭', ballo: '💃',
  veloce: '🏃', coppia: '👫', reazione: '😱', fantasia: '🌟',
};

interface PercorsoPathSet { id: string; name: string; description: string; }
interface PercorsoStepState {
  id: string; title: string; description: string; challengeType: string;
  points: number; timeLimit: number; optionalMediaUrl: string | null;
}
interface PercorsoStateLC {
  setId: string; setName: string; steps: PercorsoStepState[];
  currentStepIdx: number; teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'running' | 'ended';
  lastFlash: { text: string; type: string } | null; timerStartedAt: string | null;
}

interface AdultOnlyDeckLC { id: string; name: string; description: string; }
interface AdultOnlyCardLC {
  id: string; title: string; body: string; category: string;
  points: number; timeLimit: number; level: string; orderIndex: number;
}
interface AdultOnlyStateLC {
  deckId: string; deckName: string; cards: AdultOnlyCardLC[];
  currentCardIdx: number; teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'running' | 'ended';
  timerStartedAt: string | null; skipped: number[];
}

interface DanceChallengeLC { id: string; name: string; description: string; duration: number; difficulty: string; musicHint: string; }
interface DanceTeamLC { id: string; name: string; color: string; score: number; energy: number; }
interface DanceStateLC {
  challengeId: string; challengeName: string; duration: number; musicHint: string; difficulty: string;
  teams: DanceTeamLC[];
  status: 'idle' | 'running' | 'ended';
  startedAt: string | null;
}

interface WordBackSetLC { id: string; title: string; }
interface WordBackBookingLC {
  id: string; playerId: string; nickname: string; teamId: string;
  teamName: string; teamColor: string;
  status: 'waiting' | 'active' | 'completed' | 'skipped'; orderIndex: number;
}
interface WordBackCardLC {
  id: string; word: string; hint: string | null; category: string;
  difficulty: string; points: number; timeLimit: number;
}
interface WordBackStateLC {
  setId: string; setName: string; currentCard: WordBackCardLC | null;
  bookings: WordBackBookingLC[];
  teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'running' | 'revealed' | 'ended';
  timerStartedAt: string | null; usedCardIds: string[];
}

interface KaraokeSetLC { id: string; title: string; }
interface KaraokeBookingLC {
  id: string; playerId: string; nickname: string; teamId: string;
  teamName: string; teamColor: string;
  status: 'waiting' | 'active' | 'completed' | 'skipped'; orderIndex: number;
}
interface KaraokeStateLC {
  setId: string; setName: string;
  currentTrack: { id: string; title: string; artist: string; lyricSnippet: string; durationSeconds: number; points: number; category: string; difficulty: string } | null;
  bookings: KaraokeBookingLC[];
  teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'singing' | 'ended';
  trackStartedAt: string | null; usedTrackIds: string[];
}

interface FreestyleWordLC { id: string; word: string; orderIndex: number; recognized: boolean; }
interface FreestyleBookingLC {
  id: string; playerId: string; nickname: string; teamId: string;
  teamName: string; teamColor: string;
  status: 'waiting' | 'active' | 'performing' | 'done' | 'skipped';
  orderIndex: number; wordsRecognized: string[];
}
interface FreestyleStateLC {
  setId: string; setName: string; beatUrl: string | null;
  words: FreestyleWordLC[];
  revealedCount: number;
  revealStartedAt: string | null;
  thinkingStartedAt: string | null;
  thinkingSeconds: number;
  bookings: FreestyleBookingLC[];
  teams: { id: string; name: string; color: string; score: number }[];
  phase: 'idle' | 'revealing' | 'thinking' | 'booking' | 'performing' | 'ended';
  roundIndex: number;
}

interface SaraMusicaTrackLC {
  id: string; title: string; artist: string;
  challengeType: 'indovina' | 'canta' | 'rumore';
  snippetHint: string; audioUrl: string | null;
  durationSeconds: number; points: number;
}
interface SaraMusicaStateLC {
  setId: string; setName: string;
  currentTrack: SaraMusicaTrackLC | null;
  activeTeamId: string | null;
  teams: { id: string; name: string; color: string; score: number }[];
  status: 'idle' | 'playing' | 'ended';
  trackStartedAt: string | null;
  noiseLevel: number;
  usedTrackIds: string[];
}

interface EveningGame {
  slug: string; label: string; emoji: string;
  sessionId: string | null; status: 'pending' | 'running' | 'done';
}
interface EveningMode {
  id: string; eventId: string; playlist: EveningGame[]; status: string;
}

export default function LiveControl() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { settings: audioSettings, setMasterVolume, toggleSfx } = useAudioSettings();

  const [selectedEventId, setSelectedEventId] = useState(() => new URLSearchParams(window.location.search).get('e') ?? '');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);
  const [gameSlug, setGameSlug] = useState('quizzone');
  const [totalRounds, setTotalRounds] = useState(5);
  const [black, setBlack] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [winnerOverlay, setWinnerOverlay] = useState<{
    winners: { teamId: string; teamName: string; color: string; total: number }[];
    allZero: boolean;
    allTied: boolean;
    sessionId: string;
  } | null>(null);

  // Coppie init state
  const [coppieCardSetId, setCoppieCardSetId] = useState('');
  const [coppieDifficulty, setCoppieDifficulty] = useState('medium');
  const [coppieMode, setCoppieMode] = useState('teams');
  const [coppieBusy, setCoppieBusy] = useState(false);
  const [coppieMsg, setCoppieMsg] = useState('');

  // Percorso a Risate state
  const [percorsoSets, setPercorsoSets] = useState<PercorsoPathSet[]>([]);
  const [selectedPercorsoSetId, setSelectedPercorsoSetId] = useState('');
  const [percorsoState, setPercorsoState] = useState<PercorsoStateLC | null>(null);
  const [percorsoBusy, setPercorsoBusy] = useState(false);
  const [percorsoMsg, setPercorsoMsg] = useState('');

  // Adult Only state
  const [adultOnlyDecks, setAdultOnlyDecks] = useState<AdultOnlyDeckLC[]>([]);
  const [selectedAdultOnlyDeckId, setSelectedAdultOnlyDeckId] = useState('');
  const [adultOnlyState, setAdultOnlyState] = useState<AdultOnlyStateLC | null>(null);
  const [adultOnlyBusy, setAdultOnlyBusy] = useState(false);
  const [adultOnlyMsg, setAdultOnlyMsg] = useState('');

  // Dance / Sfida di Ballo state
  const [danceChallengeCatalog, setDanceChallengeCatalog] = useState<DanceChallengeLC[]>([]);
  const [selectedDanceChallengeId, setSelectedDanceChallengeId] = useState('');
  const [danceState, setDanceState] = useState<DanceStateLC | null>(null);
  const [danceBusy, setDanceBusy] = useState(false);
  const [danceMsg, setDanceMsg] = useState('');

  // Parola alle Spalle state
  const [wordBackSets, setWordBackSets] = useState<WordBackSetLC[]>([]);
  const [selectedWordBackSetId, setSelectedWordBackSetId] = useState('');
  const [wordBackState, setWordBackState] = useState<WordBackStateLC | null>(null);
  const [wordBackBusy, setWordBackBusy] = useState(false);
  const [wordBackMsg, setWordBackMsg] = useState('');

  // Karaoke Battle state
  const [karaokeSets, setKaraokeSets] = useState<KaraokeSetLC[]>([]);
  const [selectedKaraokeSetId, setSelectedKaraokeSetId] = useState('');
  const [karaokeState, setKaraokeState] = useState<KaraokeStateLC | null>(null);
  const [karaokeBusy, setKaraokeBusy] = useState(false);
  const [karaokeMsg, setKaraokeMsg] = useState('');
  const [karaokeMode, setKaraokeMode] = useState<'karaoke' | 'freestyle'>('karaoke');

  // Freestyle Battle state
  const [freestyleSets, setFreestyleSets] = useState<{ id: string; title: string; beatUrl: string | null }[]>([]);
  const [selectedFreestyleSetId, setSelectedFreestyleSetId] = useState('');
  const [freestyleState, setFreestyleState] = useState<FreestyleStateLC | null>(null);
  const [freestyleBusy, setFreestyleBusy] = useState(false);
  const [freestyleMsg, setFreestyleMsg] = useState('');

  // SaraMusica state
  const [saraMusicaSets, setSaraMusicaSets] = useState<{ id: string; title: string }[]>([]);
  const [selectedSaraMusicaSetId, setSelectedSaraMusicaSetId] = useState('');
  const [saraMusicaState, setSaraMusicaState] = useState<SaraMusicaStateLC | null>(null);
  const [saraMusicaBusy, setSaraMusicaBusy] = useState(false);
  const [saraMusicaMsg, setSaraMusicaMsg] = useState('');

  // Panic panel
  const [panicOpen, setPanicOpen] = useState(false);

  // Evening mode state
  const [eveningMode, setEveningMode] = useState<EveningMode | null>(null);
  const [eveningBusy, setEveningBusy] = useState(false);
  const [eveningIncludeAdult, setEveningIncludeAdult] = useState(false);

  // Quizzone control state
  const [quizPacks, setQuizPacks] = useState<QuizPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [packDetail, setPackDetail] = useState<QuizPack | null>(null);
  const [quizzoneRoundIdx, setQuizzoneRoundIdx] = useState(0);
  const [quizzoneRevealed, setQuizzoneRevealed] = useState(false);
  const [quizzoneActive, setQuizzoneActive] = useState(false);
  const [quizzoneResponseCount, setQuizzoneResponseCount] = useState(0);
  const [quizzoneBusy, setQuizzoneBusy] = useState(false);
  const [quizzoneMsg, setQuizzoneMsg] = useState('');
  const [revealAnswer, setRevealAnswer] = useState(false);
  const pollResponseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: cardSets = [] } = useListCardSets();
  const { connected: socketConnected, on } = useEventSocket(selectedEventId || null);
  const { data: events = [] } = useListEvents();
  const { data: sessions = [] } = useListGameSessions(selectedEventId, {
    query: { queryKey: getListGameSessionsQueryKey(selectedEventId), enabled: !!selectedEventId, refetchInterval: 5000 },
  });
  const { data: teams = [] } = useListTeams(selectedEventId, {
    query: { queryKey: getListTeamsQueryKey(selectedEventId), enabled: !!selectedEventId },
  });
  const { data: scoreboardRows = [] } = useGetScoreboard(selectedEventId, {
    query: { queryKey: getGetScoreboardQueryKey(selectedEventId), enabled: !!selectedEventId, refetchInterval: socketConnected ? false : 8000 },
  });

  const createSession = useCreateGameSession();
  const updateSession = useUpdateGameSession();
  const recordScore = useRecordScore();

  const session = sessions.find(s => s.id === selectedSessionId);
  const selectedEvent = events.find(e => e.id === selectedEventId);
  const joinCode = selectedEvent?.joinCode ?? '';
  const lan = useLocalMode();
  const BASE_URL = (import.meta.env.BASE_URL as string) ?? '/';
  const joinUrl = `${lan.effectiveOrigin}${BASE_URL}play?e=${joinCode}`.replace(/([^:])\/\//g, '$1/');

  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0]!.id);
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) setSelectedSessionId(sessions[0]!.id);
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (timerPaused || session?.status !== 'running') return undefined;
    const i = setInterval(() => setTime(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [timerPaused, session?.status]);

  useEffect(() => {
    if (!selectedEventId) return;
    const unsubs = [
      on('score:updated', () => {
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on('team:updated', () => qc.invalidateQueries({ queryKey: getListTeamsQueryKey(selectedEventId) })),
      on('game:started', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:ended', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on('game:paused', () => qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) })),
      on<{ count: number }>('quiz:answer_received', ({ count }) => {
        setQuizzoneResponseCount(count);
      }),
      on('quiz:reveal', () => {
        setQuizzoneRevealed(true);
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on<{ state: PercorsoStateLC }>('path:started', ({ state }) => setPercorsoState(state)),
      on<{ state: PercorsoStateLC }>('path:step_changed', ({ state }) => setPercorsoState(state)),
      on<{ state: PercorsoStateLC }>('path:score_updated', ({ state }) => {
        setPercorsoState(state);
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on<{ state: PercorsoStateLC }>('path:ended', ({ state }) => setPercorsoState(state)),
      on<{ evening: EveningMode; session: { id: string } | null }>('evening:updated', ({ evening: ev }) => setEveningMode(ev)),
      on<{ state: AdultOnlyStateLC }>('adult:started', ({ state: s }) => setAdultOnlyState(s)),
      on<{ state: AdultOnlyStateLC }>('adult:card_changed', ({ state: s }) => setAdultOnlyState(s)),
      on<{ state: AdultOnlyStateLC }>('adult:score_updated', ({ state: s }) => {
        setAdultOnlyState(s);
        qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
      }),
      on<{ state: AdultOnlyStateLC }>('adult:ended', ({ state: s }) => setAdultOnlyState(s)),
      on<{ state: DanceStateLC }>('dance:started',       ({ state: s }) => { setDanceState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: DanceStateLC }>('dance:motion',        ({ state: s }) => setDanceState(s)),
      on<{ state: DanceStateLC }>('dance:score_updated', ({ state: s }) => { setDanceState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: DanceStateLC }>('dance:ended',         ({ state: s }) => { setDanceState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: WordBackStateLC }>('wordback:started',              ({ state: s }) => { setWordBackState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: WordBackStateLC }>('wordback:card_changed',         ({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:booking_added',        ({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:booking_removed',      ({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:active_player_changed',({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:timer_started',        ({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:timer_stopped',        ({ state: s }) => setWordBackState(s)),
      on<{ state: WordBackStateLC }>('wordback:score_updated',        ({ state: s }) => { setWordBackState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: WordBackStateLC }>('wordback:ended',                ({ state: s }) => { setWordBackState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: KaraokeStateLC }>('karaoke:started',               ({ state: s }) => { setKaraokeState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: KaraokeStateLC }>('karaoke:track_changed',          ({ state: s }) => setKaraokeState(s)),
      on<{ state: KaraokeStateLC }>('karaoke:booking_added',          ({ state: s }) => setKaraokeState(s)),
      on<{ state: KaraokeStateLC }>('karaoke:booking_removed',        ({ state: s }) => setKaraokeState(s)),
      on<{ state: KaraokeStateLC }>('karaoke:active_singer_changed',  ({ state: s }) => setKaraokeState(s)),
      on<{ state: KaraokeStateLC }>('karaoke:score_updated',          ({ state: s }) => { setKaraokeState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: KaraokeStateLC }>('karaoke:ended',                  ({ state: s }) => { setKaraokeState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: FreestyleStateLC }>('freestyle:started',       ({ state: s }) => { setFreestyleState(s); }),
      on<{ state: FreestyleStateLC }>('freestyle:reveal_started',({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:word_revealed', ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:thinking',      ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:bookings_open', ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:booking_added', ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:booking_removed',({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:performer_set', ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:word_recognized',({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:score_updated', ({ state: s }) => { setFreestyleState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: FreestyleStateLC }>('freestyle:next_round',    ({ state: s }) => setFreestyleState(s)),
      on<{ state: FreestyleStateLC }>('freestyle:ended',         ({ state: s }) => { setFreestyleState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: SaraMusicaStateLC }>('saramusica:started',       ({ state: s }) => setSaraMusicaState(s)),
      on<{ state: SaraMusicaStateLC }>('saramusica:track_changed', ({ state: s }) => setSaraMusicaState(s)),
      on<{ state: SaraMusicaStateLC }>('saramusica:noise',         ({ state: s }) => setSaraMusicaState(s)),
      on<{ state: SaraMusicaStateLC }>('saramusica:score_updated', ({ state: s }) => { setSaraMusicaState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
      on<{ state: SaraMusicaStateLC }>('saramusica:ended',         ({ state: s }) => { setSaraMusicaState(s); qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) }); }),
    ];
    return () => unsubs.forEach(u => u());
  }, [selectedEventId, on, qc]);

  // Load quiz packs when quizzone session is active
  useEffect(() => {
    if (session?.gameSlug !== 'quizzone') return;
    setLoadingPacks(true);
    apiFetch('/quiz-packs')
      .then((data) => {
        const packs = (data as QuizPack[]).filter(p => p.status === 'approved' || p.status === 'generated');
        setQuizPacks(packs);
      })
      .catch(() => setQuizPacks([]))
      .finally(() => setLoadingPacks(false));
  }, [session?.gameSlug, session?.id]);

  // Load full pack detail when selectedPackId changes
  useEffect(() => {
    if (!selectedPackId) { setPackDetail(null); return; }
    apiFetch(`/quiz-packs/${selectedPackId}`)
      .then(d => setPackDetail(d as QuizPack))
      .catch(() => setPackDetail(null));
  }, [selectedPackId]);

  // Load percorso sets when percorso session is active
  useEffect(() => {
    if (session?.gameSlug !== 'percorso-a-risate') return;
    apiFetch('/percorso/sets')
      .then(d => setPercorsoSets(d as PercorsoPathSet[]))
      .catch(() => setPercorsoSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync percorso state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'percorso-a-risate' || !session?.id) return;
    apiFetch(`/percorso/sessions/${session.id}/state`)
      .then(d => setPercorsoState(d as PercorsoStateLC))
      .catch(() => setPercorsoState(null));
  }, [session?.gameSlug, session?.id]);

  // Load adult-only decks when adult-only session is active
  useEffect(() => {
    if (session?.gameSlug !== 'adult-only') return;
    apiFetch('/adult-only/decks')
      .then(d => setAdultOnlyDecks(d as AdultOnlyDeckLC[]))
      .catch(() => setAdultOnlyDecks([]));
  }, [session?.gameSlug, session?.id]);

  // Sync adult-only state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'adult-only' || !session?.id) return;
    apiFetch(`/adult-only/sessions/${session.id}/state`)
      .then(d => setAdultOnlyState(d as AdultOnlyStateLC))
      .catch(() => setAdultOnlyState(null));
  }, [session?.gameSlug, session?.id]);

  // Load dance challenges when sfida-ballo session is active
  useEffect(() => {
    if (session?.gameSlug !== 'sfida-ballo') return;
    apiFetch('/dance-challenges')
      .then(d => setDanceChallengeCatalog(d as DanceChallengeLC[]))
      .catch(() => setDanceChallengeCatalog([]));
  }, [session?.gameSlug, session?.id]);

  // Sync dance state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'sfida-ballo' || !session?.id) return;
    apiFetch(`/dance/sessions/${session.id}/state`)
      .then(d => setDanceState(d as DanceStateLC))
      .catch(() => setDanceState(null));
  }, [session?.gameSlug, session?.id]);

  // Load word-back sets when parola-alle-spalle session is active
  useEffect(() => {
    if (session?.gameSlug !== 'parola-alle-spalle') return;
    apiFetch('/word-back/sets')
      .then(d => setWordBackSets(d as WordBackSetLC[]))
      .catch(() => setWordBackSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync word-back state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'parola-alle-spalle' || !session?.id) return;
    apiFetch(`/word-back/sessions/${session.id}/state`)
      .then(d => setWordBackState(d as WordBackStateLC))
      .catch(() => setWordBackState(null));
  }, [session?.gameSlug, session?.id]);

  // Load karaoke sets when karaoke-battle session is active
  useEffect(() => {
    if (session?.gameSlug !== 'karaoke-battle') return;
    apiFetch('/karaoke/sets')
      .then(d => setKaraokeSets(d as KaraokeSetLC[]))
      .catch(() => setKaraokeSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync karaoke state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'karaoke-battle' || !session?.id) return;
    apiFetch(`/karaoke/sessions/${session.id}/state`)
      .then(d => setKaraokeState(d as KaraokeStateLC))
      .catch(() => setKaraokeState(null));
  }, [session?.gameSlug, session?.id]);

  // Load freestyle sets when freestyle-battle or karaoke-battle session is active
  useEffect(() => {
    if (session?.gameSlug !== 'freestyle-battle' && session?.gameSlug !== 'karaoke-battle') return;
    apiFetch('/freestyle/sets')
      .then(d => setFreestyleSets(d as { id: string; title: string; beatUrl: string | null }[]))
      .catch(() => setFreestyleSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync freestyle state from API when session is active
  useEffect(() => {
    if ((session?.gameSlug !== 'freestyle-battle' && session?.gameSlug !== 'karaoke-battle') || !session?.id) return;
    apiFetch(`/freestyle/sessions/${session.id}/state`)
      .then(d => setFreestyleState(d as FreestyleStateLC))
      .catch(() => setFreestyleState(null));
  }, [session?.gameSlug, session?.id]);

  // Load SaraMusica sets when saramusica session is active
  useEffect(() => {
    if (session?.gameSlug !== 'saramusica') return;
    apiFetch('/saramusica/sets')
      .then(d => setSaraMusicaSets(d as { id: string; title: string }[]))
      .catch(() => setSaraMusicaSets([]));
  }, [session?.gameSlug, session?.id]);

  // Sync SaraMusica state from API when session is active
  useEffect(() => {
    if (session?.gameSlug !== 'saramusica' || !session?.id) return;
    apiFetch(`/saramusica/sessions/${session.id}/state`)
      .then(d => setSaraMusicaState(d as SaraMusicaStateLC))
      .catch(() => setSaraMusicaState(null));
  }, [session?.gameSlug, session?.id]);

  // Load evening mode when event changes
  useEffect(() => {
    if (!selectedEventId) { setEveningMode(null); return; }
    apiFetch(`/events/${selectedEventId}/evening`)
      .then(d => setEveningMode(d as EveningMode | null))
      .catch(() => setEveningMode(null));
  }, [selectedEventId]);

  // Poll response count when question is active and not revealed
  useEffect(() => {
    if (!session?.id || !quizzoneActive || quizzoneRevealed) {
      if (pollResponseRef.current) clearInterval(pollResponseRef.current);
      return;
    }
    const poll = async () => {
      try {
        const s = await apiFetch(`/quizzone/sessions/${session.id}/state`) as { responseCount?: number };
        if (s.responseCount !== undefined) setQuizzoneResponseCount(s.responseCount);
      } catch { /* silent */ }
    };
    void poll();
    pollResponseRef.current = setInterval(poll, 2500);
    return () => { if (pollResponseRef.current) clearInterval(pollResponseRef.current); };
  }, [session?.id, quizzoneActive, quizzoneRevealed]);

  // Reset quizzone state when session changes
  useEffect(() => {
    setQuizzoneRoundIdx(0);
    setQuizzoneRevealed(false);
    setQuizzoneActive(false);
    setQuizzoneResponseCount(0);
    setRevealAnswer(false);
    setQuizzoneMsg('');
  }, [session?.id]);

  // Reset percorso state when session changes
  useEffect(() => {
    setSelectedPercorsoSetId('');
    setPercorsoState(null);
    setPercorsoMsg('');
  }, [session?.id]);

  // Reset adult-only state when session changes
  useEffect(() => {
    setSelectedAdultOnlyDeckId('');
    setAdultOnlyState(null);
    setAdultOnlyMsg('');
  }, [session?.id]);

  // Reset dance state when session changes
  useEffect(() => {
    setSelectedDanceChallengeId('');
    setDanceState(null);
    setDanceMsg('');
  }, [session?.id]);

  // Reset word-back state when session changes
  useEffect(() => {
    setSelectedWordBackSetId('');
    setWordBackState(null);
    setWordBackMsg('');
  }, [session?.id]);

  // Reset karaoke state when session changes
  useEffect(() => {
    setSelectedKaraokeSetId('');
    setKaraokeState(null);
    setKaraokeMsg('');
  }, [session?.id]);

  // Reset freestyle state when session changes
  useEffect(() => {
    setSelectedFreestyleSetId('');
    setFreestyleState(null);
    setFreestyleMsg('');
  }, [session?.id]);

  // Reset evening state when event changes (load handles the fetch, just clear busy)
  useEffect(() => {
    setEveningBusy(false);
  }, [selectedEventId]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  const confirm = (dialog: ConfirmDialog) => setConfirmDialog(dialog);

  const handleCreateSession = () => withBusy(async () => {
    const s = await createSession.mutateAsync({ id: selectedEventId, data: { gameSlug, totalRounds } }) as { id: string };
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setSelectedSessionId(s.id);
    setShowNewSession(false);
  });

  const handleStart = () => withBusy(async () => {
    if (!session) return;
    await updateSession.mutateAsync({ id: session.id, data: { status: 'running' } });
    await apiFetch(`/sessions/${session.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    const tl = packDetail?.generatedJson?.[0]?.timeLimit ?? 30;
    setTime(tl);
    setTimerPaused(false);
  });

  const handlePause = () => withBusy(async () => {
    if (!session) return;
    const newStatus = session.status === 'paused' ? 'running' : 'paused';
    await updateSession.mutateAsync({ id: session.id, data: { status: newStatus } });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    setTimerPaused(newStatus === 'paused');
  });

  const handleNextRound = () => withBusy(async () => {
    if (!session) return;
    const roundsRes = await apiFetch(`/sessions/${session.id}/rounds`) as Array<{ id: string; status: string }>;
    const running = roundsRes.find(r => r.status === 'running');
    if (running) {
      await apiFetch(`/rounds/${running.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
    }
    await apiFetch(`/sessions/${session.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    const nextIdx = session.currentRound;
    const nextRound = packDetail?.generatedJson?.[nextIdx];
    setTime(nextRound?.timeLimit ?? 30);
    setTimerPaused(false);
    setRevealAnswer(false);
  });

  // Single unified "end game" flow: end session immediately, then show winner overlay.
  // The winner overlay then navigates to scoreboard on confirm.
  const handleEnd = () => withBusy(async () => {
    if (!session) return;
    await updateSession.mutateAsync({ id: session.id, data: { status: 'ended' } });
    qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
    // Tell the projector (Hub) to navigate to the scoreboard automatically
    if (selectedEventId) {
      apiFetch(`/panic/events/${selectedEventId}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'projector:go-scoreboard', payload: { eventId: selectedEventId } }),
      }).catch(() => null);
    }
    const rows = [...scoreboardRows].sort((a, b) => b.total - a.total);
    const maxScore = rows.length > 0 ? (rows[0]?.total ?? 0) : 0;
    const allZero = maxScore === 0;
    const allTied = !allZero && rows.length > 1 && rows.every(r => r.total === maxScore);
    const winners = allZero ? [] : rows.filter(r => r.total === maxScore);
    setWinnerOverlay({ winners, allZero, allTied, sessionId: session.id });
  });

  // Kept for backward compat — delegates to handleEnd
  const handleEarlyEnd = handleEnd;

  const handleWinnerClose = (goToScoreboard: boolean) => {
    setWinnerOverlay(null);
    if (goToScoreboard) navigate(`/scoreboard?e=${selectedEventId}`);
  };

  // Used by ScorePanel — must throw on error so ScorePanel can show inline feedback
  const handleScore = async (teamId: string, delta: number): Promise<void> => {
    if (!session) throw new Error('Nessuna sessione attiva');
    await recordScore.mutateAsync({ id: selectedEventId, data: { teamId, gameSlug: session.gameSlug, round: session.currentRound, points: delta } });
    qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
  };

  // ─── Percorso handlers ─────────────────────────────────────────────────────

  const handlePercorsoInit = async () => {
    if (!session || !selectedPercorsoSetId || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedPercorsoSetId }),
      }) as PercorsoStateLC;
      setPercorsoState(s);
      setPercorsoMsg('✓ Percorso inizializzato!');
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoNext = async () => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/next`, { method: 'POST' }) as PercorsoStateLC;
      setPercorsoState(s);
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoSkip = async () => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true); setPercorsoMsg('');
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/skip`, { method: 'POST' }) as PercorsoStateLC;
      setPercorsoState(s);
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoScore = async (teamId: string, points: number) => {
    if (!session || percorsoBusy) return;
    setPercorsoBusy(true);
    try {
      const s = await apiFetch(`/percorso/sessions/${session.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as PercorsoStateLC;
      setPercorsoState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setPercorsoMsg((e as Error).message); }
    finally { setPercorsoBusy(false); }
  };

  const handlePercorsoEnd = () => {
    confirm({
      title: 'Fine Percorso',
      message: 'Vuoi terminare il percorso e andare al podio?',
      confirmLabel: 'Fine → Podio',
      danger: false,
      onConfirm: async () => {
        if (!session || percorsoBusy) return;
        setPercorsoBusy(true); setPercorsoMsg('');
        try {
          await apiFetch(`/percorso/sessions/${session.id}/end`, { method: 'POST' });
          setPercorsoState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setPercorsoMsg((e as Error).message); }
        finally { setPercorsoBusy(false); }
      },
    });
  };

  // ─── Adult Only handlers ────────────────────────────────────────────────────

  const handleAdultOnlyInit = async () => {
    if (!session || !selectedAdultOnlyDeckId || adultOnlyBusy) return;
    setAdultOnlyBusy(true); setAdultOnlyMsg('');
    try {
      const s = await apiFetch(`/adult-only/sessions/${session.id}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: selectedAdultOnlyDeckId }),
      }) as AdultOnlyStateLC;
      setAdultOnlyState(s);
      setAdultOnlyMsg('✓ Sessione inizializzata!');
    } catch (e) { setAdultOnlyMsg((e as Error).message); }
    finally { setAdultOnlyBusy(false); }
  };

  const handleAdultOnlyNext = async () => {
    if (!session || adultOnlyBusy) return;
    setAdultOnlyBusy(true); setAdultOnlyMsg('');
    try {
      const s = await apiFetch(`/adult-only/sessions/${session.id}/next`, { method: 'POST' }) as AdultOnlyStateLC;
      setAdultOnlyState(s);
    } catch (e) { setAdultOnlyMsg((e as Error).message); }
    finally { setAdultOnlyBusy(false); }
  };

  const handleAdultOnlySkip = async () => {
    if (!session || adultOnlyBusy) return;
    setAdultOnlyBusy(true); setAdultOnlyMsg('');
    try {
      const s = await apiFetch(`/adult-only/sessions/${session.id}/skip`, { method: 'POST' }) as AdultOnlyStateLC;
      setAdultOnlyState(s);
    } catch (e) { setAdultOnlyMsg((e as Error).message); }
    finally { setAdultOnlyBusy(false); }
  };

  const handleAdultOnlyScore = async (teamId: string, delta: number) => {
    if (!session || adultOnlyBusy) return;
    setAdultOnlyBusy(true);
    try {
      const s = await apiFetch(`/adult-only/sessions/${session.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, delta }),
      }) as AdultOnlyStateLC;
      setAdultOnlyState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setAdultOnlyMsg((e as Error).message); }
    finally { setAdultOnlyBusy(false); }
  };

  const handleAdultOnlyEnd = () => {
    confirm({
      title: 'Fine Adult Only',
      message: 'Terminare il gioco Adult Only?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || adultOnlyBusy) return;
        setAdultOnlyBusy(true); setAdultOnlyMsg('');
        try {
          await apiFetch(`/adult-only/sessions/${session.id}/end`, { method: 'POST' });
          setAdultOnlyState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setAdultOnlyMsg((e as Error).message); }
        finally { setAdultOnlyBusy(false); }
      },
    });
  };

  // ─── Dance / Sfida di Ballo handlers ────────────────────────────────────────

  const handleDanceInit = async () => {
    if (!session || !selectedDanceChallengeId || danceBusy) return;
    setDanceBusy(true); setDanceMsg('');
    try {
      const s = await apiFetch(`/dance/sessions/${session.id}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: selectedDanceChallengeId }),
      }) as DanceStateLC;
      setDanceState(s);
      setDanceMsg('✓ Sfida inizializzata!');
    } catch (e) { setDanceMsg((e as Error).message); }
    finally { setDanceBusy(false); }
  };

  const handleDanceStart = async () => {
    if (!session || danceBusy) return;
    setDanceBusy(true); setDanceMsg('');
    try {
      const s = await apiFetch(`/dance/sessions/${session.id}/start`, { method: 'POST' }) as DanceStateLC;
      setDanceState(s);
    } catch (e) { setDanceMsg((e as Error).message); }
    finally { setDanceBusy(false); }
  };

  const handleDanceBonus = async (teamId: string, points: number) => {
    if (!session || danceBusy) return;
    setDanceBusy(true);
    try {
      const s = await apiFetch(`/dance/sessions/${session.id}/bonus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as DanceStateLC;
      setDanceState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setDanceMsg((e as Error).message); }
    finally { setDanceBusy(false); }
  };

  const handleDanceEnd = () => {
    confirm({
      title: 'Fine Sfida di Ballo',
      message: 'Terminare la sfida e salvare i punteggi?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || danceBusy) return;
        setDanceBusy(true); setDanceMsg('');
        try {
          await apiFetch(`/dance/sessions/${session.id}/end`, { method: 'POST' });
          setDanceState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setDanceMsg((e as Error).message); }
        finally { setDanceBusy(false); }
      },
    });
  };

  // ─── Parola alle Spalle handlers ───────────────────────────────────────────

  const handleWordBackInit = async () => {
    if (!session || !selectedWordBackSetId || wordBackBusy) return;
    setWordBackBusy(true); setWordBackMsg('');
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedWordBackSetId }),
      }) as WordBackStateLC;
      setWordBackState(s); setWordBackMsg('✓ Gioco inizializzato!');
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackNextCard = async () => {
    if (!session || wordBackBusy) return;
    setWordBackBusy(true); setWordBackMsg('');
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/next-card`, { method: 'POST' }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackReveal = async () => {
    if (!session || wordBackBusy) return;
    setWordBackBusy(true);
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/reveal`, { method: 'POST' }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackTimerStart = async () => {
    if (!session) return;
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/timer-start`, { method: 'POST' }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
  };

  const handleWordBackTimerStop = async () => {
    if (!session) return;
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/timer-stop`, { method: 'POST' }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
  };

  const handleWordBackScore = async (teamId: string, points: number) => {
    if (!session || wordBackBusy) return;
    setWordBackBusy(true);
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as WordBackStateLC;
      setWordBackState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackSkip = async () => {
    if (!session || wordBackBusy) return;
    setWordBackBusy(true); setWordBackMsg('');
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/skip`, { method: 'POST' }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackSetActivePlayer = async (bookingId: string) => {
    if (!session || wordBackBusy) return;
    setWordBackBusy(true);
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/set-active-player`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
    finally { setWordBackBusy(false); }
  };

  const handleWordBackCancelBooking = async (bookingId: string) => {
    if (!session) return;
    try {
      const s = await apiFetch(`/word-back/sessions/${session.id}/cancel-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as WordBackStateLC;
      setWordBackState(s);
    } catch (e) { setWordBackMsg((e as Error).message); }
  };

  const handleWordBackEnd = () => {
    confirm({
      title: 'Fine Parola alle Spalle',
      message: 'Terminare il gioco e salvare i punteggi?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || wordBackBusy) return;
        setWordBackBusy(true); setWordBackMsg('');
        try {
          await apiFetch(`/word-back/sessions/${session.id}/end`, { method: 'POST' });
          setWordBackState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setWordBackMsg((e as Error).message); }
        finally { setWordBackBusy(false); }
      },
    });
  };

  // ─── Karaoke Battle handlers ────────────────────────────────────────────────

  const handleKaraokeInit = async () => {
    if (!session || !selectedKaraokeSetId || karaokeBusy) return;
    setKaraokeBusy(true); setKaraokeMsg('');
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedKaraokeSetId }),
      }) as KaraokeStateLC;
      setKaraokeState(s); setKaraokeMsg('✓ Karaoke inizializzato!');
    } catch (e) { setKaraokeMsg((e as Error).message); }
    finally { setKaraokeBusy(false); }
  };

  const handleKaraokeNextTrack = async () => {
    if (!session || karaokeBusy) return;
    setKaraokeBusy(true); setKaraokeMsg('');
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/next-track`, { method: 'POST' }) as KaraokeStateLC;
      setKaraokeState(s);
    } catch (e) { setKaraokeMsg((e as Error).message); }
    finally { setKaraokeBusy(false); }
  };

  const handleKaraokeStartTrack = async () => {
    if (!session || karaokeBusy) return;
    setKaraokeBusy(true);
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/start-track`, { method: 'POST' }) as KaraokeStateLC;
      setKaraokeState(s);
    } catch (e) { setKaraokeMsg((e as Error).message); }
    finally { setKaraokeBusy(false); }
  };

  const handleKaraokeSetSinger = async (bookingId: string) => {
    if (!session || karaokeBusy) return;
    setKaraokeBusy(true);
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/set-singer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as KaraokeStateLC;
      setKaraokeState(s);
    } catch (e) { setKaraokeMsg((e as Error).message); }
    finally { setKaraokeBusy(false); }
  };

  const handleKaraokeCancelBooking = async (bookingId: string) => {
    if (!session) return;
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/cancel-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as KaraokeStateLC;
      setKaraokeState(s);
    } catch (e) { setKaraokeMsg((e as Error).message); }
  };

  const handleKaraokeScore = async (teamId: string, points: number) => {
    if (!session || karaokeBusy) return;
    setKaraokeBusy(true);
    try {
      const s = await apiFetch(`/karaoke/sessions/${session.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as KaraokeStateLC;
      setKaraokeState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setKaraokeMsg((e as Error).message); }
    finally { setKaraokeBusy(false); }
  };

  const handleKaraokeEnd = () => {
    confirm({
      title: 'Fine Karaoke Battle',
      message: 'Terminare il gioco e salvare i punteggi?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || karaokeBusy) return;
        setKaraokeBusy(true); setKaraokeMsg('');
        try {
          await apiFetch(`/karaoke/sessions/${session.id}/end`, { method: 'POST' });
          setKaraokeState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setKaraokeMsg((e as Error).message); }
        finally { setKaraokeBusy(false); }
      },
    });
  };

  // ─── Freestyle Battle handlers ─────────────────────────────────────────────

  const handleFreestyleInit = async () => {
    if (!session || !selectedFreestyleSetId || freestyleBusy) return;
    setFreestyleBusy(true); setFreestyleMsg('');
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedFreestyleSetId }),
      }) as FreestyleStateLC;
      setFreestyleState(s); setFreestyleMsg('✓ Freestyle inizializzato!');
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleStartReveal = async () => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true);
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/start-reveal`, { method: 'POST' }) as FreestyleStateLC;
      setFreestyleState(s);
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleRevealWord = async () => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true);
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/reveal-word`, { method: 'POST' }) as FreestyleStateLC;
      setFreestyleState(s);
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleOpenBookings = async () => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true);
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/open-bookings`, { method: 'POST' }) as FreestyleStateLC;
      setFreestyleState(s);
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleSetPerformer = async (bookingId: string) => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true);
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/set-performer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as FreestyleStateLC;
      setFreestyleState(s);
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleCancelBooking = async (bookingId: string) => {
    if (!session) return;
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/cancel-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      }) as FreestyleStateLC;
      setFreestyleState(s);
    } catch (e) { setFreestyleMsg((e as Error).message); }
  };

  const handleFreestyleScore = async (teamId: string, points: number) => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true);
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as FreestyleStateLC;
      setFreestyleState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleNextRound = async () => {
    if (!session || freestyleBusy) return;
    setFreestyleBusy(true); setFreestyleMsg('');
    try {
      const s = await apiFetch(`/freestyle/sessions/${session.id}/next-round`, { method: 'POST' }) as FreestyleStateLC;
      setFreestyleState(s); setFreestyleMsg('✓ Nuovo round pronto');
    } catch (e) { setFreestyleMsg((e as Error).message); }
    finally { setFreestyleBusy(false); }
  };

  const handleFreestyleEnd = () => {
    confirm({
      title: 'Fine Freestyle Battle',
      message: 'Terminare il gioco e salvare i punteggi?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || freestyleBusy) return;
        setFreestyleBusy(true); setFreestyleMsg('');
        try {
          await apiFetch(`/freestyle/sessions/${session.id}/end`, { method: 'POST' });
          setFreestyleState(s => s ? { ...s, phase: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setFreestyleMsg((e as Error).message); }
        finally { setFreestyleBusy(false); }
      },
    });
  };

  // ─── SaraMusica handlers ────────────────────────────────────────────────────
  const handleSaraMusicaInit = async () => {
    if (!session || !selectedSaraMusicaSetId || saraMusicaBusy) return;
    setSaraMusicaBusy(true); setSaraMusicaMsg('');
    try {
      const s = await apiFetch(`/saramusica/sessions/${session.id}/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: selectedSaraMusicaSetId }),
      }) as SaraMusicaStateLC;
      setSaraMusicaState(s); setSaraMusicaMsg('✓ SaraMusica inizializzato!');
    } catch (e) { setSaraMusicaMsg((e as Error).message); }
    finally { setSaraMusicaBusy(false); }
  };

  const handleSaraMusicaStartTrack = async () => {
    if (!session || saraMusicaBusy) return;
    setSaraMusicaBusy(true);
    try {
      const s = await apiFetch(`/saramusica/sessions/${session.id}/start-track`, { method: 'POST' }) as SaraMusicaStateLC;
      setSaraMusicaState(s);
    } catch (e) { setSaraMusicaMsg((e as Error).message); }
    finally { setSaraMusicaBusy(false); }
  };

  const handleSaraMusicaNextTrack = async () => {
    if (!session || saraMusicaBusy) return;
    setSaraMusicaBusy(true);
    try {
      const s = await apiFetch(`/saramusica/sessions/${session.id}/next-track`, { method: 'POST' }) as SaraMusicaStateLC;
      setSaraMusicaState(s); setSaraMusicaMsg('');
    } catch (e) { setSaraMusicaMsg((e as Error).message); }
    finally { setSaraMusicaBusy(false); }
  };

  const handleSaraMusicaSetTeam = async (teamId: string) => {
    if (!session || saraMusicaBusy) return;
    try {
      const s = await apiFetch(`/saramusica/sessions/${session.id}/set-team`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      }) as SaraMusicaStateLC;
      setSaraMusicaState(s);
    } catch (e) { setSaraMusicaMsg((e as Error).message); }
  };

  const handleSaraMusicaScore = async (teamId: string, points: number) => {
    if (!session || saraMusicaBusy) return;
    setSaraMusicaBusy(true);
    try {
      const s = await apiFetch(`/saramusica/sessions/${session.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, points }),
      }) as SaraMusicaStateLC;
      setSaraMusicaState(s);
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) { setSaraMusicaMsg((e as Error).message); }
    finally { setSaraMusicaBusy(false); }
  };

  const handleSaraMusicaEnd = () => {
    confirm({
      title: 'Fine SaraMusica',
      message: 'Terminare il gioco e salvare i punteggi?',
      confirmLabel: 'Termina → Podio',
      danger: true,
      onConfirm: async () => {
        if (!session || saraMusicaBusy) return;
        setSaraMusicaBusy(true); setSaraMusicaMsg('');
        try {
          await apiFetch(`/saramusica/sessions/${session.id}/end`, { method: 'POST' });
          setSaraMusicaState(s => s ? { ...s, status: 'ended' } : null);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) { setSaraMusicaMsg((e as Error).message); }
        finally { setSaraMusicaBusy(false); }
      },
    });
  };

  // ─── Evening mode handlers ─────────────────────────────────────────────────

  const handleEveningInit = async () => {
    if (!selectedEventId || eveningBusy) return;
    setEveningBusy(true); setError('');
    try {
      await apiFetch(`/events/${selectedEventId}/evening/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeAdultOnly: eveningIncludeAdult }),
      });
      const res = await apiFetch(`/events/${selectedEventId}/evening/advance`, {
        method: 'POST',
      }) as { evening: EveningMode; session: { id: string } | null };
      setEveningMode(res.evening);
      if (res.session) { setSelectedSessionId(res.session.id); setShowNewSession(false); }
    } catch (e) { setError((e as Error).message); }
    finally { setEveningBusy(false); }
  };

  const handleEveningAdvance = () => {
    if (!selectedEventId || eveningBusy || !eveningMode) return;
    // Find the next pending game
    const nextPending = eveningMode.playlist.find(g => g.status === 'pending');
    // If next game is Adult Only, require 18+ confirmation from the animator
    if (nextPending?.slug === 'adult-only') {
      confirm({
        title: '🔞 Conferma Adult Only',
        message: 'Stai per avviare il gioco Adult Only. Confermando dichiari che tutti i partecipanti hanno 18+ anni e che il contesto della serata è adatto.',
        confirmLabel: 'Confermo — tutti 18+',
        danger: false,
        onConfirm: () => void doEveningAdvance(),
      });
    } else {
      void doEveningAdvance();
    }
  };

  const doEveningAdvance = async () => {
    if (!selectedEventId || eveningBusy) return;
    setEveningBusy(true); setError('');
    try {
      const res = await apiFetch(`/events/${selectedEventId}/evening/advance`, {
        method: 'POST',
      }) as { evening: EveningMode; session: { id: string } | null };
      setEveningMode(res.evening);
      if (res.session) { setSelectedSessionId(res.session.id); setShowNewSession(false); }
      else if (res.evening.status === 'ended') navigate(`/serata-completa?e=${selectedEventId}`);
    } catch (e) { setError((e as Error).message); }
    finally { setEveningBusy(false); }
  };

  const handleEveningReset = async () => {
    if (!selectedEventId || eveningBusy) return;
    setEveningBusy(true); setError('');
    try {
      await apiFetch(`/events/${selectedEventId}/evening`, { method: 'DELETE' });
      setEveningMode(null);
    } catch (e) { setError((e as Error).message); }
    finally { setEveningBusy(false); }
  };

  // ─── Quizzone control handlers ─────────────────────────────────────────────

  const handleQuizzoneStartQuestion = async (roundIdx: number) => {
    if (!session || !selectedPackId || quizzoneBusy) return;
    setQuizzoneBusy(true); setQuizzoneMsg(''); setError('');
    try {
      await apiFetch(`/quizzone/sessions/${session.id}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: selectedPackId, roundIndex: roundIdx }),
      });
      const round = packDetail?.generatedJson?.[roundIdx];
      setTime(round?.timeLimit ?? 30);
      setTimerPaused(false);
      setQuizzoneRoundIdx(roundIdx);
      setQuizzoneRevealed(false);
      setQuizzoneActive(true);
      setQuizzoneResponseCount(0);
      setRevealAnswer(false);
      setQuizzoneMsg(`✓ Domanda ${roundIdx + 1} inviata!`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setQuizzoneBusy(false); }
  };

  const handleQuizzoneReveal = async () => {
    if (!session || quizzoneBusy || !quizzoneActive) return;
    setQuizzoneBusy(true); setQuizzoneMsg(''); setError('');
    try {
      await apiFetch(`/quizzone/sessions/${session.id}/reveal`, { method: 'POST' });
      setQuizzoneRevealed(true);
      setRevealAnswer(true);
      setQuizzoneMsg('✓ Risposta rivelata!');
      qc.invalidateQueries({ queryKey: getGetScoreboardQueryKey(selectedEventId) });
    } catch (e) {
      setError((e as Error).message);
    } finally { setQuizzoneBusy(false); }
  };

  const handleQuizzoneEnd = () => {
    confirm({
      title: 'Fine Quizzone',
      message: 'Vuoi terminare il quiz e andare al podio? I punteggi sono già salvati.',
      confirmLabel: 'Fine quiz → Podio',
      danger: false,
      onConfirm: async () => {
        if (!session || quizzoneBusy) return;
        setQuizzoneBusy(true); setError('');
        try {
          await apiFetch(`/quizzone/sessions/${session.id}/end`, { method: 'POST' });
          qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey(selectedEventId) });
          setQuizzoneActive(false);
          navigate(`/scoreboard?e=${selectedEventId}`);
        } catch (e) {
          setError((e as Error).message);
        } finally { setQuizzoneBusy(false); }
      },
    });
  };

  // Current pack round data
  const rounds = packDetail?.generatedJson ?? [];
  const currentRound = rounds[quizzoneRoundIdx] ?? null;
  const totalPackRounds = rounds.length;
  const accentColor = '#8B5CF6';

  return (
    <div className="h-screen overflow-y-auto bg-background px-4 py-6 pb-10">
      {/* Blackout overlay */}
      {black && <div className="fixed inset-0 z-50 bg-black" onClick={() => setBlack(false)} />}

      {/* ── EMERGENZA floating button ─────────────────────────────────────── */}
      <button
        onClick={() => setPanicOpen(true)}
        className="fixed top-4 right-4 z-[90] flex items-center gap-2 rounded-xl border border-red-700/70 bg-red-900/80 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-red-200 backdrop-blur-md shadow-lg shadow-red-950/60 hover:bg-red-800/90 hover:border-red-600/80 transition-all active:scale-95"
        title="Pannello Emergenza"
      >
        <Siren className="h-4 w-4 text-red-400" />
        EMERGENZA
      </button>

      {/* ── Panic Panel overlay ───────────────────────────────────────────── */}
      <PanicPanel
        open={panicOpen}
        onClose={() => setPanicOpen(false)}
        eventId={selectedEventId}
        joinCode={joinCode}
        joinUrl={joinUrl}
        session={session ? { id: session.id, gameSlug: session.gameSlug, status: session.status } : undefined}
      />

      {/* ── Winner overlay ───────────────────────────────────────────────── */}
      {winnerOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 space-y-5 text-center shadow-2xl">
            {winnerOverlay.allZero ? (
              <>
                <div className="text-5xl">😶</div>
                <div className="text-display text-2xl font-black">Nessun vincitore</div>
                <div className="text-muted-foreground text-sm">Tutti i team hanno zero punti.</div>
              </>
            ) : winnerOverlay.allTied ? (
              <>
                <div className="text-5xl">🎊</div>
                <div className="text-display text-2xl font-black">Pareggio!</div>
                <div className="text-muted-foreground text-sm mb-1">Vincono tutti!</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {winnerOverlay.winners.map(w => (
                    <div key={w.teamId} className="flex items-center gap-2 rounded-full px-4 py-2 font-bold text-sm"
                         style={{ background: `${w.color}30`, border: `2px solid ${w.color}`, color: w.color }}>
                      🏅 {w.teamName} — {w.total} pt
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="text-5xl">🏆</div>
                {winnerOverlay.winners.length === 1 ? (
                  <>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Vince</div>
                    <div className="rounded-2xl px-6 py-5 text-display text-3xl font-black"
                         style={{ background: `${winnerOverlay.winners[0]!.color}25`, border: `3px solid ${winnerOverlay.winners[0]!.color}`, color: winnerOverlay.winners[0]!.color }}>
                      {winnerOverlay.winners[0]!.teamName}
                      <div className="mt-1 text-lg opacity-80">{winnerOverlay.winners[0]!.total} punti</div>
                    </div>
                    {winnerOverlay.winners.length < scoreboardRows.length && (
                      <div className="space-y-1 text-left text-sm text-muted-foreground">
                        {[...scoreboardRows].sort((a,b) => b.total - a.total).filter(r => r.teamId !== winnerOverlay.winners[0]!.teamId).map((r, i) => (
                          <div key={r.teamId} className="flex items-center justify-between rounded-lg px-3 py-1.5 bg-secondary/30">
                            <span>{i + 2}° {r.teamName}</span>
                            <span className="font-mono font-bold">{r.total} pt</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-display text-xl font-black">Più vincitori a pari merito!</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {winnerOverlay.winners.map(w => (
                        <div key={w.teamId} className="rounded-full px-4 py-2 font-bold text-sm"
                             style={{ background: `${w.color}30`, border: `2px solid ${w.color}`, color: w.color }}>
                          🥇 {w.teamName} — {w.total} pt
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Primary CTA — always "Vai al Podio" */}
            <button
              onClick={() => handleWinnerClose(true)}
              className="w-full rounded-2xl bg-primary py-4 text-base font-black text-primary-foreground hover-elevate shadow-lg"
            >
              🏆 Vai al Podio
            </button>

            {/* Secondary — small text link, harder to hit by mistake */}
            <button
              onClick={() => setWinnerOverlay(null)}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              ← Torna al controllo (la sessione è già terminata)
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ───────────────────────────────────────────────── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${confirmDialog.danger ? 'text-destructive' : 'text-amber-400'}`} />
              <div className="text-display font-black">{confirmDialog.title}</div>
            </div>
            <div className="text-sm text-muted-foreground">{confirmDialog.message}</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-secondary/30">
                Annulla
              </button>
              <button
                onClick={() => { setConfirmDialog(null); confirmDialog.onConfirm(); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black ${confirmDialog.danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="rounded-full border border-border p-2 hover-elevate"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Cockpit animatore</div>
            {socketConnected ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400 animate-pulse" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/scoreboard?e=${selectedEventId}`)}
              disabled={!selectedEventId}
              title="Vai al podio"
              className="rounded-full border border-border p-2 hover-elevate disabled:opacity-40">
              <Trophy className="h-4 w-4" />
            </button>
            <button onClick={() => setBlack(b => !b)}
              className={`rounded-full border p-2 ${black ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border hover-elevate'}`}>
              <MonitorOff className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {/* Event & session selector */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Evento</div>
            <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedSessionId(''); setShowNewSession(false); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">— seleziona evento —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} ({ev.joinCode})</option>)}
            </select>
            {events.length === 0 && (
              <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
                Nessun evento trovato. <button onClick={() => navigate('/admin/events')} className="underline font-bold">Crea un evento</button> dal pannello admin o <button onClick={() => navigate('/login')} className="underline font-bold">effettua il login</button>.
              </div>
            )}
          </div>

          {selectedEventId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Sessione di gioco</div>
                {sessions.length > 0 && (
                  <button onClick={() => setShowNewSession(s => !s)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <PlusCircle className="h-3 w-3" /> Nuova sessione
                  </button>
                )}
              </div>

              {/* New session form */}
              {(sessions.length === 0 || showNewSession) && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={gameSlug} onChange={e => setGameSlug(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      <option value="quizzone">Quizzone</option>
                      <option value="gioco-coppie">Gioco delle Coppie</option>
                      <option value="percorso-a-risate">Percorso a Risate</option>
                      <option value="adult-only">Adult Only</option>
                      <option value="sfida-ballo">Sfida di Ballo</option>
                      <option value="parola-alle-spalle">Parola alle Spalle</option>
                      <option value="karaoke-battle">Karaoke Battle (+ Freestyle)</option>
                      <option value="saramusica">SaraMusica</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setTotalRounds(r => Math.max(1, r - 1))} className="rounded-lg border border-border p-2 hover-elevate"><Minus className="h-3 w-3" /></button>
                      <span className="flex-1 text-center text-sm font-bold">{totalRounds} rnd</span>
                      <button onClick={() => setTotalRounds(r => r + 1)} className="rounded-lg border border-border p-2 hover-elevate"><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateSession} disabled={busy}
                      className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crea sessione
                    </button>
                    {showNewSession && (
                      <button onClick={() => setShowNewSession(false)} className="rounded-xl border border-border px-4 py-3 text-sm hover:bg-secondary/30">
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Session selector */}
              {sessions.length > 0 && !showNewSession && (
                <select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.gameSlug} — {s.status} ({s.currentRound}/{s.totalRounds})</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {/* ─── Audio Live panel ─── */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <div className="text-xs uppercase tracking-widest text-muted-foreground flex-1">Audio Live</div>
            <button
              onClick={() => toggleSfx()}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition-all ${audioSettings.sfxEnabled ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-border text-muted-foreground'}`}>
              {audioSettings.sfxEnabled ? '🔊 ON' : '🔇 OFF'}
            </button>
          </div>

          {/* Master volume */}
          <div className="flex items-center gap-3">
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input type="range" min={0} max={1} step={0.05} value={audioSettings.masterVolume}
              onChange={e => setMasterVolume(parseFloat(e.target.value))}
              className="flex-1 accent-primary" />
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{Math.round(audioSettings.masterVolume * 100)}%</span>
          </div>

          {/* Quick stinger buttons */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: '👏 Applausi',   stinger: 'applause' },
              { label: '🥁 Suspense',   stinger: 'tension_loop' },
              { label: '🏆 Vincitore',  stinger: 'winner_stinger' },
              { label: '💫 Transizione',stinger: 'transition_whoosh' },
            ].map(({ label, stinger }) => (
              <button key={stinger}
                onClick={() => AudioManager.playGlobalStinger(stinger)}
                disabled={!audioSettings.sfxEnabled}
                className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40 transition-all">
                {label}
              </button>
            ))}
            <button
              onClick={() => AudioManager.stopAll()}
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20 transition-all">
              <Mic2 className="h-3 w-3 inline mr-1" />Stop tutto
            </button>
          </div>
        </div>

        {/* ─── Serata Completa panel ─── */}
        {selectedEventId && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground flex-1">Serata Completa</div>
              {eveningMode && (
                <a href={`${BASE}serata-completa?e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Scoreboard
                </a>
              )}
            </div>

            {eveningMode && (
              <>
                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    eveningMode.status === 'running' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                    eveningMode.status === 'ended'   ? 'border-primary/40 bg-primary/10 text-primary' :
                    'border-border text-muted-foreground'
                  }`}>
                    {eveningMode.status === 'idle'    ? '⏳ In attesa' :
                     eveningMode.status === 'running' ? '⚡ In corso' : '🏁 Terminata'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {eveningMode.playlist.filter(g => g.status === 'done').length}/{eveningMode.playlist.length} completati
                  </span>
                  <button onClick={() => void handleEveningReset()} disabled={eveningBusy}
                    className="ml-auto text-xs text-muted-foreground hover:text-destructive disabled:opacity-40">↺</button>
                </div>

                {/* Playlist mini */}
                <div className="flex gap-2">
                  {eveningMode.playlist.map((g) => (
                    <div key={g.slug} className={`flex-1 flex flex-col items-center gap-1 rounded-xl border py-2 text-center ${
                      g.status === 'running' ? 'border-green-500/40 bg-green-500/10' :
                      g.status === 'done'    ? 'border-border/30 opacity-50'         :
                      'border-border/20 opacity-30'
                    }`}>
                      <span className="text-lg">{g.emoji}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${
                        g.status === 'running' ? 'text-green-400' :
                        g.status === 'done'    ? 'text-muted-foreground' : 'text-muted-foreground/40'
                      }`}>
                        {g.status === 'running' ? '⚡' : g.status === 'done' ? '✓' : '·'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Action */}
                {eveningMode.status !== 'ended' && (
                  <button onClick={() => void handleEveningAdvance()} disabled={eveningBusy}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40">
                    {eveningBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    {eveningMode.playlist.findIndex(g => g.status === 'pending') >= 0
                      ? `Prossimo: ${eveningMode.playlist.find(g => g.status === 'pending')?.label ?? ''}`
                      : 'Fine serata →'}
                  </button>
                )}
                {eveningMode.status === 'ended' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => navigate(`/serata-completa?e=${selectedEventId}`)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-bold text-primary">
                      <Trophy className="h-4 w-4" /> Podio globale
                    </button>
                    <button onClick={() => void handleEveningReset()} disabled={eveningBusy}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-40">
                      {eveningBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : '↺'} Ricomincia
                    </button>
                  </div>
                )}
              </>
            )}

            {!eveningMode && (
              <div className="space-y-3">
                {/* Adult Only toggle */}
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
                  <button
                    onClick={() => setEveningIncludeAdult(v => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full border-2 transition-colors ${eveningIncludeAdult ? 'border-pink-500 bg-pink-500' : 'border-border bg-muted/30'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${eveningIncludeAdult ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">Includi Adult Only 🔞</div>
                    <div className="text-[10px] text-muted-foreground">Sequenza: Percorso → Coppie → Quizzone → Adult Only</div>
                  </div>
                </div>
                <button onClick={() => void handleEveningInit()} disabled={eveningBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40">
                  {eveningBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Inizia serata completa
                </button>
              </div>
            )}
          </div>
        )}

        {/* Game controls */}
        {session && (
          <div className="rounded-3xl border-2 p-6 space-y-4" style={{ borderColor: accentColor, background: `${accentColor}10` }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Gioco</div>
                <div className="text-display text-xl font-black capitalize" style={{ color: accentColor }}>{session.gameSlug.replace(/-/g, ' ')}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Stato</div>
                <div className={`text-sm font-bold ${session.status === 'running' ? 'text-green-400' : session.status === 'paused' ? 'text-amber-400' : session.status === 'ended' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {session.status}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Round</div>
                <div className="text-display text-5xl font-black">{session.currentRound}/{session.totalRounds}</div>
              </div>
              <div className="relative grid h-36 w-36 place-items-center rounded-full border-8 border-primary/30">
                <div className="absolute inset-2 rounded-full border-8 transition-all" style={{ borderColor: accentColor, opacity: time > 0 ? 1 : 0.3 }} />
                <div className="text-display text-5xl font-black tabular-nums">{time}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setTime(t => t + 10)} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">+10s</button>
              {session.status === 'idle' ? (
                <button onClick={handleStart} disabled={busy}
                  className="rounded-xl bg-green-500 py-3 text-sm font-black text-background hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Avvia
                </button>
              ) : (
                <button onClick={handlePause} disabled={busy || session.status === 'ended'}
                  className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : session.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {session.status === 'paused' ? 'Riprendi' : 'Pausa'}
                </button>
              )}
              <button onClick={() => setTime(t => Math.max(0, t - 10))} className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate">−10s</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleNextRound} disabled={busy || session.status !== 'running'}
                className="rounded-xl border border-border py-3 text-sm font-bold hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />} Prossimo round
              </button>
              <button onClick={handleEnd} disabled={busy || session.status === 'ended'}
                className="rounded-xl bg-amber-500 py-3 text-sm font-black text-black hover-elevate inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Termina Partita
              </button>
            </div>
          </div>
        )}

        {/* ─── Quizzone AI panel ─────────────────────────────────────── */}
        {session?.gameSlug === 'quizzone' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Quizzone AI — Controllo Live</div>
              <a href={`${BASE}quizzone?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Proiettore
              </a>
            </div>

            {/* Pack selector */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Quiz pack</div>
              {loadingPacks ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
                </div>
              ) : quizPacks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                  Nessun quiz pack approvato. Generane uno in <span className="font-bold text-primary">Admin → Quiz AI</span>.
                </div>
              ) : (
                <select value={selectedPackId}
                  onChange={e => { setSelectedPackId(e.target.value); setQuizzoneRoundIdx(0); setQuizzoneActive(false); setQuizzoneRevealed(false); }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="">— seleziona pack —</option>
                  {quizPacks.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.totalRounds} round, {p.language.toUpperCase()})</option>
                  ))}
                </select>
              )}
            </div>

            {packDetail && (
              <>
                {/* Status badge */}
                <div className="flex items-center gap-2 text-xs">
                  {quizzoneActive ? (
                    quizzoneRevealed ? (
                      <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 font-bold text-green-400">
                        ✓ Risposta rivelata
                      </span>
                    ) : (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                        ⚡ Domanda attiva
                      </span>
                    )
                  ) : (
                    <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                      In attesa…
                    </span>
                  )}
                  {quizzoneActive && !quizzoneRevealed && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {quizzoneResponseCount} risposte
                    </span>
                  )}
                  {quizzoneMsg && (
                    <span className={`ml-auto font-bold ${quizzoneMsg.startsWith('✓') ? 'text-green-400' : 'text-destructive'}`}>
                      {quizzoneMsg}
                    </span>
                  )}
                </div>

                {/* Current round card */}
                {currentRound && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${TYPE_COLORS[currentRound.type] ?? 'text-muted-foreground border-border bg-card'}`}>
                        {TYPE_LABELS[currentRound.type] ?? currentRound.type}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{currentRound.timeLimit}s</span>
                        <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{currentRound.points}pt</span>
                        <span className={currentRound.difficulty === 'easy' ? 'text-green-400' : currentRound.difficulty === 'hard' ? 'text-red-400' : 'text-yellow-400'}>
                          {currentRound.difficulty}
                        </span>
                        <span className="text-muted-foreground/60">D{quizzoneRoundIdx + 1}/{totalPackRounds}</span>
                      </div>
                    </div>

                    <div className="text-sm font-bold leading-snug">{currentRound.questionText}</div>

                    <div className="space-y-1.5">
                      {currentRound.answers.map((a, i) => {
                        const isCorrect = i === currentRound.correctAnswer;
                        const showCorrect = revealAnswer && isCorrect;
                        return (
                          <div key={i}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
                              showCorrect
                                ? 'border-green-500/50 bg-green-500/15 font-bold text-green-300'
                                : revealAnswer && !isCorrect
                                ? 'border-border/40 opacity-50'
                                : 'border-border bg-background/50'
                            }`}>
                            <span className="font-black w-4 text-center opacity-60">{String.fromCharCode(65 + i)}</span>
                            <span className="flex-1">{a}</span>
                            {showCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setRevealAnswer(v => !v)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
                        revealAnswer
                          ? 'border border-green-500/40 bg-green-500/10 text-green-400'
                          : 'border border-border text-muted-foreground hover:bg-card'
                      }`}>
                      {revealAnswer ? <><EyeOff className="h-3.5 w-3.5" /> Nascondi anteprima</> : <><Eye className="h-3.5 w-3.5" /> Anteprima risposta</>}
                    </button>

                    {revealAnswer && currentRound.explanation && (
                      <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground italic">
                        {currentRound.explanation}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Main action buttons ───────────────────────────── */}
                <div className="space-y-2">
                  {(!quizzoneActive || quizzoneRevealed) && (
                    <button
                      disabled={!selectedPackId || quizzoneBusy || session.status === 'ended' || quizzoneRoundIdx >= totalPackRounds}
                      onClick={() => {
                        const nextIdx = quizzoneRevealed ? quizzoneRoundIdx + 1 : quizzoneRoundIdx;
                        void handleQuizzoneStartQuestion(nextIdx);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      {quizzoneRevealed
                        ? quizzoneRoundIdx + 1 >= totalPackRounds
                          ? 'Fine pack'
                          : `Domanda ${quizzoneRoundIdx + 2}/${totalPackRounds}`
                        : `Avvia domanda ${quizzoneRoundIdx + 1}/${totalPackRounds}`}
                    </button>
                  )}

                  {quizzoneActive && !quizzoneRevealed && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => void handleQuizzoneReveal()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-black text-background disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      Rivela risposta ({quizzoneResponseCount} ricevute)
                    </button>
                  )}

                  {quizzoneRevealed && quizzoneRoundIdx + 1 < totalPackRounds && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => void handleQuizzoneStartQuestion(quizzoneRoundIdx + 1)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary py-3 text-sm font-black text-primary disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                      Prossima domanda ({quizzoneRoundIdx + 2}/{totalPackRounds})
                    </button>
                  )}

                  {(quizzoneRevealed || quizzoneActive) && (
                    <button
                      disabled={quizzoneBusy}
                      onClick={() => handleQuizzoneEnd()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                      {quizzoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      Fine quiz → Podio
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {rounds.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Avanzamento</span>
                      <span>{quizzoneRoundIdx + (quizzoneActive ? 1 : 0)}/{rounds.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-0.5 pt-0.5">
                      {rounds.map((_, i) => (
                        <div key={i}
                          className={`h-1.5 flex-1 min-w-[4px] rounded-full transition-all ${
                            i < quizzoneRoundIdx ? 'bg-primary/50' :
                            i === quizzoneRoundIdx && quizzoneActive ? 'bg-primary' :
                            'bg-border'
                          }`} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Scores */}
        {session && teams.length > 0 && (
          <ScorePanel
            teams={teams}
            scoreboardRows={scoreboardRows}
            busy={busy}
            sessionRunning={session.status === 'running'}
            onScore={handleScore}
          />
        )}

        {/* Coppie init panel */}
        {session?.gameSlug === 'gioco-coppie' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Inizializza Board Coppie</div>
            {coppieMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${coppieMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {coppieMsg}
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Deck di carte</div>
              <select value={coppieCardSetId} onChange={e => setCoppieCardSetId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <option value="">— seleziona deck —</option>
                {cardSets.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Difficoltà</div>
                <select value={coppieDifficulty} onChange={e => setCoppieDifficulty(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="easy">Facile (6 coppie)</option>
                  <option value="medium">Medio (10 coppie)</option>
                  <option value="hard">Difficile (15 coppie)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Modalità</div>
                <select value={coppieMode} onChange={e => setCoppieMode(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="teams">Squadre</option>
                  <option value="individual">Individuale</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={!coppieCardSetId || coppieBusy}
                onClick={async () => {
                  setCoppieBusy(true); setCoppieMsg('');
                  try {
                    await apiFetch(`/coppie/sessions/${session.id}/init`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cardSetId: coppieCardSetId, difficulty: coppieDifficulty, mode: coppieMode, teamIds: [] }),
                    });
                    setCoppieMsg('✓ Board inizializzata!');
                  } catch (e) { setCoppieMsg((e as Error).message); }
                  finally { setCoppieBusy(false); }
                }}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {coppieBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {coppieMsg.startsWith('✓') ? 'Ricomincia' : 'Inizializza'}
              </button>
              <a
                href={`${BASE}coppie?s=${session.id}&e=${selectedEventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:bg-secondary/30"
              >
                <ExternalLink className="h-4 w-4" /> Board
              </a>
            </div>
          </div>
        )}

        {/* ─── Percorso a Risate panel ───────────────────────────────── */}
        {session?.gameSlug === 'percorso-a-risate' && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎭</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Percorso a Risate</div>
              <a href={`${BASE}percorso-risate?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Proiettore
              </a>
            </div>

            {percorsoMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${percorsoMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {percorsoMsg}
              </div>
            )}

            {/* Status */}
            {percorsoState && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  percorsoState.status === 'running' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                  percorsoState.status === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {percorsoState.status === 'idle' ? 'In attesa' : percorsoState.status === 'running' ? '⚡ In corso' : '🏁 Terminato'}
                </span>
                {percorsoState.status !== 'idle' && (
                  <span className="text-muted-foreground">
                    Sfida {Math.max(0, percorsoState.currentStepIdx + 1)}/{percorsoState.steps.length}
                  </span>
                )}
              </div>
            )}

            {/* Current step preview */}
            {percorsoState?.status === 'running' && percorsoState.currentStepIdx >= 0 && (() => {
              const step = percorsoState.steps[percorsoState.currentStepIdx];
              if (!step) return null;
              return (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{PERCORSO_CHALLENGE_EMOJIS[step.challengeType] ?? '🎯'}</span>
                    <span className="text-xs font-bold text-primary capitalize">{step.challengeType}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{step.points} pt</span>
                  </div>
                  <div className="text-sm font-bold leading-snug">{step.title}</div>
                  {step.description && <div className="text-xs text-muted-foreground">{step.description}</div>}
                </div>
              );
            })()}

            {/* Init: no state yet */}
            {!percorsoState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Set sfide</div>
                  <select value={selectedPercorsoSetId} onChange={e => setSelectedPercorsoSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona set —</option>
                    {percorsoSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button disabled={!selectedPercorsoSetId || percorsoBusy}
                  onClick={() => void handlePercorsoInit()}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza
                </button>
              </>
            )}

            {/* Idle: ready to start */}
            {percorsoState?.status === 'idle' && (
              <>
                <div className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  Set: <span className="font-bold text-foreground">{percorsoState.setName}</span> — {percorsoState.steps.length} sfide
                </div>
                <button onClick={() => void handlePercorsoNext()} disabled={percorsoBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-black text-background disabled:opacity-40">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Inizia il percorso!
                </button>
              </>
            )}

            {/* Running controls */}
            {percorsoState?.status === 'running' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void handlePercorsoNext()}
                    disabled={percorsoBusy || percorsoState.currentStepIdx >= percorsoState.steps.length - 1}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
                    {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                    Avanti
                  </button>
                  <button onClick={() => void handlePercorsoSkip()}
                    disabled={percorsoBusy || percorsoState.currentStepIdx >= percorsoState.steps.length - 1}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-40">
                    ⏭ Salta
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti</div>
                  {percorsoState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handlePercorsoScore(tm.id, pts)} disabled={percorsoBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <button onClick={handlePercorsoEnd} disabled={percorsoBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {percorsoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine percorso → Podio
                </button>
              </>
            )}

            {/* Ended */}
            {percorsoState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Percorso terminato
              </div>
            )}
          </div>
        )}

        {/* ─── Adult Only panel ──────────────────────────────────── */}
        {session?.gameSlug === 'adult-only' && (
          <div className="rounded-2xl border border-pink-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔞</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Adult Only</div>
              <a href={`${BASE}adult-only?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-pink-400 hover:underline">
                <ExternalLink className="h-3 w-3" /> Proiettore
              </a>
            </div>

            {adultOnlyMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${adultOnlyMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {adultOnlyMsg}
              </div>
            )}

            {/* Status badge */}
            {adultOnlyState && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  adultOnlyState.status === 'running' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                  adultOnlyState.status === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {adultOnlyState.status === 'idle' ? 'In attesa' : adultOnlyState.status === 'running' ? '🔞 In corso' : '🏁 Terminato'}
                </span>
                {adultOnlyState.status !== 'idle' && adultOnlyState.currentCardIdx >= 0 && (
                  <span className="text-muted-foreground">
                    Carta {adultOnlyState.currentCardIdx + 1}/{adultOnlyState.cards.length}
                  </span>
                )}
              </div>
            )}

            {/* Current card preview */}
            {adultOnlyState?.status === 'running' && adultOnlyState.currentCardIdx >= 0 && (() => {
              const card = adultOnlyState.cards[adultOnlyState.currentCardIdx];
              if (!card) return null;
              return (
                <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-pink-400 capitalize">{card.category.replace(/-/g, ' ')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{card.points} pt · {card.timeLimit}s</span>
                  </div>
                  <div className="text-sm font-bold leading-snug">{card.title}</div>
                  <div className="text-xs text-muted-foreground">{card.body}</div>
                </div>
              );
            })()}

            {/* Init: no state yet */}
            {!adultOnlyState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Mazzo</div>
                  <select value={selectedAdultOnlyDeckId} onChange={e => setSelectedAdultOnlyDeckId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona mazzo —</option>
                    {adultOnlyDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <button disabled={!selectedAdultOnlyDeckId || adultOnlyBusy}
                  onClick={() => void handleAdultOnlyInit()}
                  className="w-full rounded-xl bg-pink-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {adultOnlyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza
                </button>
              </>
            )}

            {/* Idle: ready */}
            {adultOnlyState?.status === 'idle' && (
              <>
                <div className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  Mazzo: <span className="font-bold text-foreground">{adultOnlyState.deckName}</span> — {adultOnlyState.cards.length} carte
                </div>
                <button onClick={() => void handleAdultOnlyNext()} disabled={adultOnlyBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-pink-600 py-3 text-sm font-black text-white disabled:opacity-40">
                  {adultOnlyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Prima carta!
                </button>
              </>
            )}

            {/* Running controls */}
            {adultOnlyState?.status === 'running' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void handleAdultOnlyNext()} disabled={adultOnlyBusy}
                    className="flex items-center justify-center gap-2 rounded-xl bg-pink-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                    {adultOnlyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                    Prossima
                  </button>
                  <button onClick={() => void handleAdultOnlySkip()} disabled={adultOnlyBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-40">
                    ⏭ Salta
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti</div>
                  {adultOnlyState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handleAdultOnlyScore(tm.id, pts)} disabled={adultOnlyBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <button onClick={handleAdultOnlyEnd} disabled={adultOnlyBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {adultOnlyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine Adult Only → Podio
                </button>
              </>
            )}

            {/* Ended */}
            {adultOnlyState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Gioco terminato
              </div>
            )}
          </div>
        )}

        {/* ─── Sfida di Ballo panel ──────────────────────────────── */}
        {session?.gameSlug === 'sfida-ballo' && (
          <div className="rounded-2xl border border-purple-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💃</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Sfida di Ballo</div>
              {danceState && (
                <a href={`${BASE}sfida-ballo?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-purple-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore
                </a>
              )}
            </div>

            {danceMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${danceMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {danceMsg}
              </div>
            )}

            {/* Status badge */}
            {danceState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  danceState.status === 'running' ? 'border-purple-500/40 bg-purple-500/10 text-purple-400' :
                  danceState.status === 'ended'   ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {danceState.status === 'idle' ? '⏳ In attesa' : danceState.status === 'running' ? '💃 In corso' : '🏁 Terminato'}
                </span>
                <span className="text-muted-foreground font-bold">{danceState.challengeName}</span>
                <span className="text-muted-foreground">{danceState.duration}s</span>
              </div>
            )}

            {/* Init: no state yet — challenge selector */}
            {!danceState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Sfida dal catalogo</div>
                  <select value={selectedDanceChallengeId} onChange={e => setSelectedDanceChallengeId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona sfida —</option>
                    {danceChallengeCatalog.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.duration}s — {c.difficulty})</option>
                    ))}
                  </select>
                  {danceChallengeCatalog.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessuna sfida ancora — creane una in <a href={`${BASE}admin/sfida-ballo`} className="underline text-purple-400">Admin → Sfida di Ballo</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedDanceChallengeId || danceBusy} onClick={() => void handleDanceInit()}
                  className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {danceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza
                </button>
              </>
            )}

            {/* Idle: ready to start */}
            {danceState?.status === 'idle' && (
              <button onClick={() => void handleDanceStart()} disabled={danceBusy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-black text-background disabled:opacity-40">
                {danceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Avvia la sfida! 💃
              </button>
            )}

            {/* Running: team energy + bonus + end */}
            {danceState?.status === 'running' && (
              <>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Squadre — energia live + bonus</div>
                  {danceState.teams.map(tm => (
                    <div key={tm.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                        <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                        <span className="text-xs text-muted-foreground">⚡{tm.energy}%</span>
                        <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                        {[50, 100, 200].map(pts => (
                          <button key={pts} onClick={() => void handleDanceBonus(tm.id, pts)} disabled={danceBusy}
                            className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                            +{pts}
                          </button>
                        ))}
                      </div>
                      {/* Energy bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden ml-5">
                        <div className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${tm.energy}%`, background: tm.color }} />
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={handleDanceEnd} disabled={danceBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {danceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine sfida → Podio
                </button>
              </>
            )}

            {/* Ended */}
            {danceState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Sfida terminata
              </div>
            )}
          </div>
        )}

        {/* ─── Parola alle Spalle panel ───────────────────────────── */}
        {session?.gameSlug === 'parola-alle-spalle' && (
          <div className="rounded-2xl border border-cyan-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎭</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Parola alle Spalle</div>
              {wordBackState && (
                <a href={`${BASE}parola-alle-spalle?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore
                </a>
              )}
            </div>

            {wordBackMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${wordBackMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {wordBackMsg}
              </div>
            )}

            {/* Status + set name */}
            {wordBackState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  wordBackState.status === 'running'  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' :
                  wordBackState.status === 'revealed' ? 'border-primary/40 bg-primary/10 text-primary' :
                  wordBackState.status === 'ended'    ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {wordBackState.status === 'running' ? '🎭 In corso' : wordBackState.status === 'revealed' ? '👁 Rivelata' : wordBackState.status === 'ended' ? '🏁 Terminato' : '⏳ Attesa'}
                </span>
                <span className="text-muted-foreground font-bold">{wordBackState.setName}</span>
                {wordBackState.currentCard && (
                  <span className="text-muted-foreground">{wordBackState.currentCard.category} · {wordBackState.currentCard.points}pt</span>
                )}
              </div>
            )}

            {/* Init: no state yet — set selector */}
            {!wordBackState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Mazzo parole</div>
                  <select value={selectedWordBackSetId} onChange={e => setSelectedWordBackSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona mazzo —</option>
                    {wordBackSets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {wordBackSets.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessun mazzo — creane uno in <a href={`${BASE}admin/parola-alle-spalle`} className="underline text-cyan-400">Admin → Parola alle Spalle</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedWordBackSetId || wordBackBusy} onClick={() => void handleWordBackInit()}
                  className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {wordBackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza gioco
                </button>
              </>
            )}

            {/* Running / Revealed */}
            {wordBackState && wordBackState.status !== 'ended' && (
              <>
                {/* Current card */}
                {wordBackState.currentCard && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-1">
                    <div className="text-display text-2xl font-black text-cyan-300">{wordBackState.currentCard.word}</div>
                    {wordBackState.currentCard.hint && (
                      <div className="text-xs text-muted-foreground italic">💡 {wordBackState.currentCard.hint}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {wordBackState.currentCard.category} · {wordBackState.currentCard.difficulty} · {wordBackState.currentCard.points}pt · {wordBackState.currentCard.timeLimit}s
                    </div>
                  </div>
                )}

                {/* Timer controls */}
                <div className="flex gap-2">
                  <button onClick={() => void handleWordBackTimerStart()} disabled={!!wordBackState.timerStartedAt || wordBackBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-green-600/80 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Play className="h-3.5 w-3.5" /> Avvia timer
                  </button>
                  <button onClick={() => void handleWordBackTimerStop()} disabled={!wordBackState.timerStartedAt || wordBackBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-bold disabled:opacity-40">
                    <Pause className="h-3.5 w-3.5" /> Stop timer
                  </button>
                </div>

                {/* Action row */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => void handleWordBackNextCard()} disabled={wordBackBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Prossima parola
                  </button>
                  <button onClick={() => void handleWordBackReveal()} disabled={wordBackBusy || wordBackState.status === 'revealed'}
                    className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-40">
                    <Eye className="h-3.5 w-3.5" /> Rivela parola
                  </button>
                  <button onClick={() => void handleWordBackSkip()} disabled={wordBackBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Salta
                  </button>
                </div>

                {/* Active player */}
                {wordBackState.bookings.find(b => b.status === 'active') && (() => {
                  const active = wordBackState.bookings.find(b => b.status === 'active')!;
                  return (
                    <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
                      <div className="h-5 w-5 rounded-full shrink-0" style={{ background: active.teamColor }} />
                      <div className="flex-1 text-sm font-bold text-cyan-300">{active.nickname}</div>
                      <div className="text-xs text-muted-foreground">{active.teamName}</div>
                      <button onClick={() => void handleWordBackCancelBooking(active.id)}
                        className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })()}

                {/* Score buttons */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Parola indovinata — assegna punti</div>
                  {wordBackState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[100, 150, 200, 300].map(pts => (
                        <button key={pts} onClick={() => void handleWordBackScore(tm.id, pts)} disabled={wordBackBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Booking queue */}
                {wordBackState.bookings.filter(b => b.status === 'waiting').length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Coda prenotazioni</div>
                    {wordBackState.bookings
                      .filter(b => b.status === 'waiting')
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((booking, idx) => (
                        <div key={booking.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: booking.teamColor }} />
                          <span className="flex-1 text-sm font-bold">{booking.nickname}</span>
                          <span className="text-xs text-muted-foreground">{booking.teamName}</span>
                          <button onClick={() => void handleWordBackSetActivePlayer(booking.id)} disabled={wordBackBusy}
                            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-400 disabled:opacity-40">
                            ▶ Attiva
                          </button>
                          <button onClick={() => void handleWordBackCancelBooking(booking.id)}
                            className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                )}

                <button onClick={handleWordBackEnd} disabled={wordBackBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {wordBackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine gioco → Podio
                </button>
              </>
            )}

            {wordBackState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Gioco terminato
              </div>
            )}
          </div>
        )}

        {/* ─── Karaoke Battle panel ────────────────────────────────── */}
        {session?.gameSlug === 'karaoke-battle' && (
          <div className="rounded-2xl border border-pink-500/30 bg-card p-5 space-y-3">
            {/* Header + mode tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">{karaokeMode === 'freestyle' ? '🎵' : '🎤'}</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Karaoke Battle</div>
              <div className="flex rounded-xl overflow-hidden border border-border">
                <button onClick={() => setKaraokeMode('karaoke')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${karaokeMode === 'karaoke' ? 'bg-pink-500/20 text-pink-400' : 'text-muted-foreground hover:bg-secondary/30'}`}>
                  🎤 Karaoke
                </button>
                <button onClick={() => setKaraokeMode('freestyle')}
                  className={`px-2.5 py-1 text-[11px] font-bold transition-colors border-l border-border ${karaokeMode === 'freestyle' ? 'bg-orange-500/20 text-orange-400' : 'text-muted-foreground hover:bg-secondary/30'}`}>
                  🎵 Freestyle
                </button>
              </div>
              {karaokeMode === 'karaoke' && karaokeState && (
                <a href={`${BASE}karaoke-battle?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-pink-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore
                </a>
              )}
              {karaokeMode === 'freestyle' && freestyleState && (
                <a href={`${BASE}freestyle-battle?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-orange-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore Freestyle
                </a>
              )}
            </div>

            {karaokeMode === 'karaoke' && karaokeMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${karaokeMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {karaokeMsg}
              </div>
            )}

            {/* Status bar */}
            {karaokeMode === 'karaoke' && karaokeState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  karaokeState.status === 'singing' ? 'border-pink-500/40 bg-pink-500/10 text-pink-400' :
                  karaokeState.status === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {karaokeState.status === 'singing' ? '🎤 In canto' : karaokeState.status === 'ended' ? '🏁 Terminato' : '⏳ Attesa'}
                </span>
                <span className="text-muted-foreground font-bold">{karaokeState.setName}</span>
                {karaokeState.currentTrack && (
                  <span className="text-muted-foreground truncate max-w-[120px]">{karaokeState.currentTrack.title}</span>
                )}
              </div>
            )}

            {/* Init: set selector */}
            {karaokeMode === 'karaoke' && !karaokeState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Playlist</div>
                  <select value={selectedKaraokeSetId} onChange={e => setSelectedKaraokeSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona playlist —</option>
                    {karaokeSets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {karaokeSets.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessuna playlist — creane una in <a href={`${BASE}admin/karaoke-battle`} className="underline text-pink-400">Admin → Karaoke</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedKaraokeSetId || karaokeBusy} onClick={() => void handleKaraokeInit()}
                  className="w-full rounded-xl bg-pink-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {karaokeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza Karaoke
                </button>
              </>
            )}

            {/* Running panel */}
            {karaokeMode === 'karaoke' && karaokeState && karaokeState.status !== 'ended' && (
              <>
                {/* Current track */}
                {karaokeState.currentTrack && (
                  <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3 space-y-1">
                    <div className="text-display text-lg font-black text-pink-300">{karaokeState.currentTrack.title}</div>
                    <div className="text-sm text-muted-foreground">{karaokeState.currentTrack.artist}</div>
                    <div className="text-xs text-muted-foreground">
                      {karaokeState.currentTrack.category} · {karaokeState.currentTrack.difficulty} · +{karaokeState.currentTrack.points}pt · {karaokeState.currentTrack.durationSeconds}s
                    </div>
                  </div>
                )}

                {/* Track controls */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => void handleKaraokeStartTrack()} disabled={karaokeBusy || karaokeState.status === 'singing'}
                    className="flex items-center gap-1.5 rounded-xl bg-green-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Play className="h-3.5 w-3.5" /> Avvia brano
                  </button>
                  <button onClick={() => void handleKaraokeNextTrack()} disabled={karaokeBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Prossimo brano
                  </button>
                </div>

                {/* Active singer */}
                {karaokeState.bookings.find(b => b.status === 'active') && (() => {
                  const active = karaokeState.bookings.find(b => b.status === 'active')!;
                  return (
                    <div className="flex items-center gap-2 rounded-xl border border-pink-500/30 bg-pink-500/10 px-3 py-2">
                      <div className="h-5 w-5 rounded-full shrink-0" style={{ background: active.teamColor }} />
                      <div className="flex-1 text-sm font-bold text-pink-300">{active.nickname}</div>
                      <div className="text-xs text-muted-foreground">{active.teamName}</div>
                      <button onClick={() => void handleKaraokeCancelBooking(active.id)}
                        className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })()}

                {/* Score buttons */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti esibizione</div>
                  {karaokeState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[100, 150, 200, 300].map(pts => (
                        <button key={pts} onClick={() => void handleKaraokeScore(tm.id, pts)} disabled={karaokeBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Booking queue */}
                {karaokeState.bookings.filter(b => b.status === 'waiting').length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Coda cantanti</div>
                    {karaokeState.bookings
                      .filter(b => b.status === 'waiting')
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((booking, idx) => (
                        <div key={booking.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: booking.teamColor }} />
                          <span className="flex-1 text-sm font-bold">{booking.nickname}</span>
                          <span className="text-xs text-muted-foreground">{booking.teamName}</span>
                          <button onClick={() => void handleKaraokeSetSinger(booking.id)} disabled={karaokeBusy}
                            className="rounded-lg border border-pink-500/40 bg-pink-500/10 px-2 py-1 text-xs font-bold text-pink-400 disabled:opacity-40">
                            🎤 Canta
                          </button>
                          <button onClick={() => void handleKaraokeCancelBooking(booking.id)}
                            className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                )}

                <button onClick={handleKaraokeEnd} disabled={karaokeBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {karaokeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine gioco → Podio
                </button>
              </>
            )}

            {karaokeMode === 'karaoke' && karaokeState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Karaoke terminato
              </div>
            )}

            {/* ── Freestyle mode content ── */}
            {karaokeMode === 'freestyle' && freestyleMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${freestyleMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {freestyleMsg}
              </div>
            )}

            {karaokeMode === 'freestyle' && freestyleState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  freestyleState.phase === 'performing' ? 'border-orange-500/40 bg-orange-500/10 text-orange-400' :
                  freestyleState.phase === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  freestyleState.phase === 'revealing' ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' :
                  freestyleState.phase === 'thinking' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' :
                  'border-border text-muted-foreground'
                }`}>
                  {freestyleState.phase === 'idle' ? '⏳ Pronto' :
                   freestyleState.phase === 'revealing' ? '🎲 Rivelazione' :
                   freestyleState.phase === 'thinking' ? '🧠 Pensando…' :
                   freestyleState.phase === 'booking' ? '✋ Prenotazioni' :
                   freestyleState.phase === 'performing' ? '🎤 Esibizione' : '🏁 Terminato'}
                </span>
                <span className="text-muted-foreground font-bold">{freestyleState.setName}</span>
                <span className="text-muted-foreground">Round {(freestyleState.roundIndex ?? 0) + 1}</span>
              </div>
            )}

            {karaokeMode === 'freestyle' && !freestyleState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Set di parole</div>
                  <select value={selectedFreestyleSetId} onChange={e => setSelectedFreestyleSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona set —</option>
                    {freestyleSets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {freestyleSets.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessun set — creane uno in <a href={`${BASE}admin/karaoke-battle`} className="underline text-orange-400">Admin → Karaoke → Freestyle</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedFreestyleSetId || freestyleBusy} onClick={() => void handleFreestyleInit()}
                  className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {freestyleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza Freestyle
                </button>
              </>
            )}

            {karaokeMode === 'freestyle' && freestyleState && freestyleState.phase !== 'ended' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {freestyleState.words.map((w, i) => (
                    <span key={w.id} className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                      i >= freestyleState.revealedCount ? 'opacity-20 bg-white/5 text-white/30' :
                      w.recognized ? 'bg-green-500/30 text-green-300 border border-green-500/50' :
                      'bg-orange-500/20 text-orange-300'
                    }`}>{w.word}</span>
                  ))}
                </div>
                {(freestyleState.phase === 'idle' || freestyleState.phase === 'revealing') && (
                  <div className="flex gap-2 flex-wrap">
                    {freestyleState.phase === 'idle' && (
                      <button onClick={() => void handleFreestyleStartReveal()} disabled={freestyleBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-blue-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                        <Play className="h-3.5 w-3.5" /> Avvia rivelazione
                      </button>
                    )}
                    {freestyleState.phase === 'revealing' && (
                      <button onClick={() => void handleFreestyleRevealWord()} disabled={freestyleBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                        <ChevronRight className="h-3.5 w-3.5" /> Prossima parola ({freestyleState.revealedCount}/{freestyleState.words.length})
                      </button>
                    )}
                  </div>
                )}
                {freestyleState.phase === 'thinking' && (
                  <button onClick={() => void handleFreestyleOpenBookings()} disabled={freestyleBusy}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Users className="h-3.5 w-3.5" /> Apri prenotazioni
                  </button>
                )}
                {freestyleState.bookings.find(b => b.status === 'active' || b.status === 'performing') && (() => {
                  const active = freestyleState.bookings.find(b => b.status === 'active' || b.status === 'performing')!;
                  return (
                    <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                      <div className="h-5 w-5 rounded-full shrink-0" style={{ background: active.teamColor }} />
                      <div className="flex-1 text-sm font-bold text-orange-300">🎤 {active.nickname}</div>
                      <div className="text-xs text-muted-foreground">{active.teamName}</div>
                      <button onClick={() => void handleFreestyleCancelBooking(active.id)}
                        className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti freestyle</div>
                  {freestyleState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[50, 100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handleFreestyleScore(tm.id, pts)} disabled={freestyleBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {freestyleState.bookings.filter(b => b.status === 'waiting').length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Coda performer</div>
                    {freestyleState.bookings
                      .filter(b => b.status === 'waiting')
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((booking, idx) => (
                        <div key={booking.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: booking.teamColor }} />
                          <span className="flex-1 text-sm font-bold">{booking.nickname}</span>
                          <span className="text-xs text-muted-foreground">{booking.teamName}</span>
                          <button onClick={() => void handleFreestyleSetPerformer(booking.id)} disabled={freestyleBusy}
                            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-400 disabled:opacity-40">
                            🎤 Vai
                          </button>
                          <button onClick={() => void handleFreestyleCancelBooking(booking.id)}
                            className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => void handleFreestyleNextRound()} disabled={freestyleBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Nuovo round
                  </button>
                  <button onClick={handleFreestyleEnd} disabled={freestyleBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-40">
                    {freestyleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    Fine
                  </button>
                </div>
              </>
            )}

            {karaokeMode === 'freestyle' && freestyleState?.phase === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Freestyle terminato
              </div>
            )}
          </div>
        )}

        {/* ─── Freestyle Battle panel ──────────────────────────────── */}
        {session?.gameSlug === 'freestyle-battle' && (
          <div className="rounded-2xl border border-orange-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎤</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Freestyle Battle</div>
              {freestyleState && (
                <a href={`${BASE}freestyle-battle?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-orange-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore
                </a>
              )}
            </div>

            {freestyleMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${freestyleMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {freestyleMsg}
              </div>
            )}

            {/* Status badge */}
            {freestyleState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  freestyleState.phase === 'performing' ? 'border-orange-500/40 bg-orange-500/10 text-orange-400' :
                  freestyleState.phase === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  freestyleState.phase === 'revealing' ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' :
                  freestyleState.phase === 'thinking' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' :
                  'border-border text-muted-foreground'
                }`}>
                  {freestyleState.phase === 'idle' ? '⏳ Pronto' :
                   freestyleState.phase === 'revealing' ? '🎲 Rivelazione' :
                   freestyleState.phase === 'thinking' ? '🧠 Pensando…' :
                   freestyleState.phase === 'booking' ? '✋ Prenotazioni' :
                   freestyleState.phase === 'performing' ? '🎤 Esibizione' : '🏁 Terminato'}
                </span>
                <span className="text-muted-foreground font-bold">{freestyleState.setName}</span>
                <span className="text-muted-foreground">Round {(freestyleState.roundIndex ?? 0) + 1}</span>
              </div>
            )}

            {/* Init: set selector */}
            {!freestyleState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Set di parole</div>
                  <select value={selectedFreestyleSetId} onChange={e => setSelectedFreestyleSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona set —</option>
                    {freestyleSets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {freestyleSets.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessun set — creane uno in <a href={`${BASE}admin/karaoke-battle`} className="underline text-orange-400">Admin → Karaoke → Freestyle</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedFreestyleSetId || freestyleBusy} onClick={() => void handleFreestyleInit()}
                  className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {freestyleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza Freestyle
                </button>
              </>
            )}

            {/* Running panel */}
            {freestyleState && freestyleState.phase !== 'ended' && (
              <>
                {/* Word count status */}
                <div className="flex flex-wrap gap-1">
                  {freestyleState.words.map((w, i) => (
                    <span key={w.id} className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                      i >= freestyleState.revealedCount ? 'opacity-20 bg-white/5 text-white/30' :
                      w.recognized ? 'bg-green-500/30 text-green-300 border border-green-500/50' :
                      'bg-orange-500/20 text-orange-300'
                    }`}>{w.word}</span>
                  ))}
                </div>

                {/* Reveal controls */}
                {(freestyleState.phase === 'idle' || freestyleState.phase === 'revealing') && (
                  <div className="flex gap-2 flex-wrap">
                    {freestyleState.phase === 'idle' && (
                      <button onClick={() => void handleFreestyleStartReveal()} disabled={freestyleBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-blue-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                        <Play className="h-3.5 w-3.5" /> Avvia rivelazione
                      </button>
                    )}
                    {freestyleState.phase === 'revealing' && (
                      <button onClick={() => void handleFreestyleRevealWord()} disabled={freestyleBusy}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                        <ChevronRight className="h-3.5 w-3.5" /> Prossima parola ({freestyleState.revealedCount}/{freestyleState.words.length})
                      </button>
                    )}
                  </div>
                )}

                {/* Open bookings (after thinking) */}
                {freestyleState.phase === 'thinking' && (
                  <button onClick={() => void handleFreestyleOpenBookings()} disabled={freestyleBusy}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Users className="h-3.5 w-3.5" /> Apri prenotazioni
                  </button>
                )}

                {/* Active performer */}
                {freestyleState.bookings.find(b => b.status === 'active' || b.status === 'performing') && (() => {
                  const active = freestyleState.bookings.find(b => b.status === 'active' || b.status === 'performing')!;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                        <div className="h-5 w-5 rounded-full shrink-0" style={{ background: active.teamColor }} />
                        <div className="flex-1 text-sm font-bold text-orange-300">🎤 {active.nickname}</div>
                        <div className="text-xs text-muted-foreground">{active.teamName}</div>
                        <button onClick={() => void handleFreestyleCancelBooking(active.id)}
                          className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Words recognized count */}
                      <div className="text-xs text-muted-foreground text-center">
                        {freestyleState.words.filter(w => w.recognized).length} / {freestyleState.words.length} parole riconosciute via microfono
                      </div>
                    </div>
                  );
                })()}

                {/* Score buttons */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti freestyle</div>
                  {freestyleState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[50, 100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handleFreestyleScore(tm.id, pts)} disabled={freestyleBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Booking queue */}
                {freestyleState.bookings.filter(b => b.status === 'waiting').length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Coda performer</div>
                    {freestyleState.bookings
                      .filter(b => b.status === 'waiting')
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((booking, idx) => (
                        <div key={booking.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2">
                          <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: booking.teamColor }} />
                          <span className="flex-1 text-sm font-bold">{booking.nickname}</span>
                          <span className="text-xs text-muted-foreground">{booking.teamName}</span>
                          <button onClick={() => void handleFreestyleSetPerformer(booking.id)} disabled={freestyleBusy}
                            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-xs font-bold text-orange-400 disabled:opacity-40">
                            🎤 Vai
                          </button>
                          <button onClick={() => void handleFreestyleCancelBooking(booking.id)}
                            className="rounded-lg border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Next round / End */}
                <div className="flex gap-2">
                  <button onClick={() => void handleFreestyleNextRound()} disabled={freestyleBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Nuovo round
                  </button>
                  <button onClick={handleFreestyleEnd} disabled={freestyleBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-40">
                    {freestyleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    Fine
                  </button>
                </div>
              </>
            )}

            {freestyleState?.phase === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 Freestyle terminato
              </div>
            )}
          </div>
        )}

        {/* ─── SaraMusica panel ────────────────────────────────────── */}
        {session?.gameSlug === 'saramusica' && (
          <div className="rounded-2xl border border-purple-500/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎵</span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">SaraMusica</div>
              {saraMusicaState && (
                <a href={`${BASE}saramusica?s=${session.id}&e=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-purple-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Proiettore
                </a>
              )}
            </div>

            {saraMusicaMsg && (
              <div className={`rounded-xl px-4 py-2 text-sm ${saraMusicaMsg.startsWith('✓') ? 'border border-green-500/40 bg-green-500/10 text-green-400' : 'border border-destructive/40 bg-destructive/10 text-destructive'}`}>
                {saraMusicaMsg}
              </div>
            )}

            {/* Status bar */}
            {saraMusicaState && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={`rounded-full border px-2.5 py-1 font-bold ${
                  saraMusicaState.status === 'playing' ? 'border-purple-500/40 bg-purple-500/10 text-purple-400' :
                  saraMusicaState.status === 'ended' ? 'border-destructive/40 bg-destructive/10 text-destructive' :
                  'border-border text-muted-foreground'
                }`}>
                  {saraMusicaState.status === 'playing' ? '🎵 In gioco' : saraMusicaState.status === 'ended' ? '🏁 Terminato' : '⏳ Attesa'}
                </span>
                <span className="text-muted-foreground font-bold">{saraMusicaState.setName}</span>
                <span className="text-muted-foreground">{saraMusicaState.usedTrackIds.length} brani usati</span>
              </div>
            )}

            {/* Init: set selector */}
            {!saraMusicaState && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Set musicale</div>
                  <select value={selectedSaraMusicaSetId} onChange={e => setSelectedSaraMusicaSetId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="">— seleziona set —</option>
                    {saraMusicaSets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {saraMusicaSets.length === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Nessun set — creane uno in <a href={`${BASE}admin/saramusica`} className="underline text-purple-400">Admin → SaraMusica</a>
                    </div>
                  )}
                </div>
                <button disabled={!selectedSaraMusicaSetId || saraMusicaBusy} onClick={() => void handleSaraMusicaInit()}
                  className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {saraMusicaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Inizializza SaraMusica
                </button>
              </>
            )}

            {/* Running panel */}
            {saraMusicaState && saraMusicaState.status !== 'ended' && (
              <>
                {/* Current track */}
                {saraMusicaState.currentTrack && (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs rounded-full border border-purple-500/40 px-2 py-0.5 text-purple-400 font-bold">
                        {saraMusicaState.currentTrack.challengeType === 'indovina' ? '🎵 Indovina' :
                         saraMusicaState.currentTrack.challengeType === 'canta' ? '🎤 Canta' : '📣 Rumore'}
                      </span>
                      <span className="text-xs text-muted-foreground">+{saraMusicaState.currentTrack.points}pt · {saraMusicaState.currentTrack.durationSeconds}s</span>
                    </div>
                    <div className="text-display text-lg font-black text-purple-300">
                      {saraMusicaState.currentTrack.challengeType === 'indovina' ? '❓ ???' : saraMusicaState.currentTrack.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {saraMusicaState.currentTrack.challengeType === 'indovina' ? saraMusicaState.currentTrack.artist : saraMusicaState.currentTrack.artist}
                    </div>
                    {saraMusicaState.currentTrack.snippetHint && (
                      <div className="text-xs italic text-muted-foreground">"{saraMusicaState.currentTrack.snippetHint}"</div>
                    )}
                  </div>
                )}

                {/* Active team selector */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Squadra di turno</div>
                  <div className="flex flex-wrap gap-1.5">
                    {saraMusicaState.teams.map(tm => (
                      <button key={tm.id} onClick={() => void handleSaraMusicaSetTeam(tm.id)}
                        className="rounded-xl border px-3 py-1.5 text-xs font-bold transition-all"
                        style={{
                          borderColor: tm.id === saraMusicaState.activeTeamId ? tm.color : `${tm.color}44`,
                          background: tm.id === saraMusicaState.activeTeamId ? `${tm.color}25` : 'transparent',
                          color: tm.id === saraMusicaState.activeTeamId ? tm.color : undefined,
                        }}>
                        {tm.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Track controls */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => void handleSaraMusicaStartTrack()} disabled={saraMusicaBusy || saraMusicaState.status === 'playing'}
                    className="flex items-center gap-1.5 rounded-xl bg-green-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Play className="h-3.5 w-3.5" /> Avvia brano
                  </button>
                  <button onClick={() => void handleSaraMusicaNextTrack()} disabled={saraMusicaBusy}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary/30 disabled:opacity-40">
                    <SkipForward className="h-3.5 w-3.5" /> Prossimo brano
                  </button>
                </div>

                {/* Score buttons */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Assegna punti</div>
                  {saraMusicaState.teams.map(tm => (
                    <div key={tm.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tm.color }} />
                      <span className="flex-1 truncate text-sm font-bold">{tm.name}</span>
                      <span className="text-display text-base font-black tabular-nums w-12 text-right" style={{ color: tm.color }}>{tm.score}</span>
                      {[50, 100, 150, 200].map(pts => (
                        <button key={pts} onClick={() => void handleSaraMusicaScore(tm.id, pts)} disabled={saraMusicaBusy}
                          className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover-elevate disabled:opacity-40">
                          +{pts}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <button onClick={handleSaraMusicaEnd} disabled={saraMusicaBusy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 py-2.5 text-sm font-bold text-destructive disabled:opacity-40">
                  {saraMusicaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Fine gioco → Podio
                </button>
              </>
            )}

            {saraMusicaState?.status === 'ended' && (
              <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm text-muted-foreground">
                🏁 SaraMusica terminato
              </div>
            )}
          </div>
        )}

        {!session && sessions.length === 0 && selectedEventId && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground text-sm">
            Crea una sessione di gioco per iniziare
          </div>
        )}
      </div>
    </div>
  );
}

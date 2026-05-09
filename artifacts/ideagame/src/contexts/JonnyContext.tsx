import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';

export type JonnyMood =
  | 'idle'          // benvenuto.png — waving hello
  | 'waiting'       // attesa.png   — thoughtful waiting
  | 'excited'       // via.png      — fist pump, "let's go!"
  | 'your_turn'     // tocca_a_te   — thumbs up toward player
  | 'thinking'      // pensa        — hand on chin
  | 'attention'     // attenzione   — finger pointing up
  | 'answer_sent'   // risposta_inviata — confirmation thumbs up
  | 'correct'       // risposta_corretta — arms raised victory
  | 'wrong'         // risposta_sbagliata — gentle shrug
  | 'points'        // punti        — holding gold coin
  | 'scoreboard'    // classifica   — sunglasses + scoreboard
  | 'winner'        // vincitore    — holding trophy
  | 'paused'        // pausa        — hands pressed pause symbol
  | 'countdown'     // ultimi_secondi — urgent pointing finger
  | 'round_done'    // round_ok     — applause clapping
  | 'question'      // domanda      — curious open hands
  | 'challenge'     // sfida        — dynamic pointing + star
  | 'bye';          // saluti       — farewell wave

export type JonnyMode = 'live' | 'home';

export interface JonnyToast {
  id: number;
  text: string;
  icon?: string;
  mood?: JonnyMood;
}

interface JonnyContextValue {
  isHostedByJonny: boolean;
  setIsHostedByJonny: (v: boolean) => void;
  jonnyMode: JonnyMode;
  setJonnyMode: (m: JonnyMode) => void;
  jonnyMood: JonnyMood;
  setJonnyMood: (m: JonnyMood) => void;
  jonnyMessage: string | null;
  setJonnyMessage: (msg: string | null) => void;
  dismissed: boolean;
  dismissJonny: () => void;
  jonnyToast: JonnyToast | null;
  jonnyTell: (msg: string, mood?: JonnyMood) => void;
  jonnyFlash: (text: string, icon?: string, mood?: JonnyMood) => void;
}

const JonnyContext = createContext<JonnyContextValue | null>(null);

const LS_ENABLED = 'ideagame:jonny:enabled';
const LS_MODE    = 'ideagame:jonny:mode';

function readInitialEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('jonny') === '1') return true;
    return localStorage.getItem(LS_ENABLED) === 'true';
  } catch { return false; }
}

function readInitialMode(): JonnyMode {
  try {
    const v = localStorage.getItem(LS_MODE);
    if (v === 'home') return 'home';
  } catch { /* noop */ }
  return 'live';
}

let toastSeq = 0;

export function JonnyProvider({ children }: { children: ReactNode }) {
  const [isHostedByJonny, setIsHostedByJonnyState] = useState<boolean>(readInitialEnabled);
  const [jonnyMode, setJonnyModeState] = useState<JonnyMode>(readInitialMode);
  const [jonnyMood, setJonnyMood] = useState<JonnyMood>('idle');
  const [jonnyMessage, setJonnyMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [jonnyToast, setJonnyToast] = useState<JonnyToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setIsHostedByJonny = (v: boolean) => {
    try { localStorage.setItem(LS_ENABLED, String(v)); } catch { /* noop */ }
    setIsHostedByJonnyState(v);
  };

  const setJonnyMode = (m: JonnyMode) => {
    try { localStorage.setItem(LS_MODE, m); } catch { /* noop */ }
    setJonnyModeState(m);
  };

  const dismissJonny = () => setDismissed(true);

  useEffect(() => { setDismissed(false); }, [jonnyMessage, jonnyMood]);

  const jonnyTell = useCallback((msg: string, mood: JonnyMood = 'idle') => {
    setJonnyMood(mood);
    setJonnyMessage(msg);
  }, []);

  const jonnyFlash = useCallback((text: string, icon?: string, mood?: JonnyMood) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastSeq += 1;
    setJonnyToast({ id: toastSeq, text, icon, mood });
    toastTimerRef.current = setTimeout(() => setJonnyToast(null), 2800);
  }, []);

  return (
    <JonnyContext.Provider value={{
      isHostedByJonny, setIsHostedByJonny,
      jonnyMode, setJonnyMode,
      jonnyMood, setJonnyMood,
      jonnyMessage, setJonnyMessage,
      dismissed, dismissJonny,
      jonnyToast,
      jonnyTell, jonnyFlash,
    }}>
      {children}
    </JonnyContext.Provider>
  );
}

export function useJonny() {
  const ctx = useContext(JonnyContext);
  if (!ctx) throw new Error('useJonny must be used within JonnyProvider');
  return ctx;
}

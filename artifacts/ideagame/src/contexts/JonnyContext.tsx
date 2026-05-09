import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type JonnyMood = 'idle' | 'excited' | 'thinking' | 'cheering' | 'celebrating';

interface JonnyContextValue {
  isHostedByJonny: boolean;
  setIsHostedByJonny: (v: boolean) => void;
  jonnyMood: JonnyMood;
  setJonnyMood: (m: JonnyMood) => void;
  jonnyMessage: string | null;
  setJonnyMessage: (msg: string | null) => void;
  dismissJonny: () => void;
  dismissed: boolean;
}

const JonnyContext = createContext<JonnyContextValue | null>(null);

const STORAGE_KEY = 'ideagame:jonny:enabled';

function readInitialEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('jonny') === '1') return true;
    }
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function JonnyProvider({ children }: { children: ReactNode }) {
  const [isHostedByJonny, setIsHostedByJonnyState] = useState<boolean>(readInitialEnabled);
  const [jonnyMood, setJonnyMood] = useState<JonnyMood>('idle');
  const [jonnyMessage, setJonnyMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const setIsHostedByJonny = (v: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* noop */ }
    setIsHostedByJonnyState(v);
  };

  const dismissJonny = () => setDismissed(true);

  useEffect(() => {
    setDismissed(false);
  }, [jonnyMessage, jonnyMood]);

  return (
    <JonnyContext.Provider value={{
      isHostedByJonny,
      setIsHostedByJonny,
      jonnyMood,
      setJonnyMood,
      jonnyMessage,
      setJonnyMessage,
      dismissJonny,
      dismissed,
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

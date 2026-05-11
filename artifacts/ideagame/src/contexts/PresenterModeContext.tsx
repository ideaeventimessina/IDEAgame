import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type AdminMode = 'regia' | 'presentatore';

interface PresenterModeContextValue {
  mode: AdminMode;
  setMode: (m: AdminMode) => void;
  isPresenter: boolean;
  isRegia: boolean;
}

const KEY = 'ideagame:admin:mode';

const Ctx = createContext<PresenterModeContextValue>({
  mode: 'regia',
  setMode: () => {},
  isPresenter: false,
  isRegia: true,
});

export function PresenterModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AdminMode>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === 'presentatore' ? 'presentatore' : 'regia';
  });

  const setMode = (m: AdminMode) => {
    setModeState(m);
    localStorage.setItem(KEY, m);
  };

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as AdminMode | null;
    if (saved && saved !== mode) setModeState(saved);
  }, []);

  return (
    <Ctx.Provider value={{ mode, setMode, isPresenter: mode === 'presentatore', isRegia: mode === 'regia' }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePresenterMode() {
  return useContext(Ctx);
}

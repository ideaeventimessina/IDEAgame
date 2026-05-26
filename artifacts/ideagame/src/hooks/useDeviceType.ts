import { useState, useEffect } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'tv';

interface DeviceInfo {
  type: DeviceType;
  isPhone: boolean;
  isTablet: boolean;
  isTV: boolean;
  width: number;
  height: number;
}

function classify(w: number): DeviceType {
  if (w >= 1200) return 'tv';
  if (w >= 700)  return 'tablet';
  return 'phone';
}

export function useDeviceType(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth  : 390;
    const h = typeof window !== 'undefined' ? window.innerHeight : 844;
    const type = classify(w);
    return { type, isPhone: type === 'phone', isTablet: type === 'tablet', isTV: type === 'tv', width: w, height: h };
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const type = classify(w);
      setInfo({ type, isPhone: type === 'phone', isTablet: type === 'tablet', isTV: type === 'tv', width: w, height: h });
    };
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  return info;
}

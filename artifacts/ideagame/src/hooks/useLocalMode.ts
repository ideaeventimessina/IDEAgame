import { useState, useEffect, useCallback } from 'react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

const LS_ENABLED = 'ideagame:localMode';
const LS_IP      = 'ideagame:localIp';
const LS_PORT    = 'ideagame:localPort';

interface NetworkInfo {
  localIps: string[];
  hostname: string;
  port: string;
}

export interface LocalModeState {
  /** Is local-mode UI active (manually toggled or auto-triggered) */
  localMode: boolean;
  /** Is the browser currently online */
  isOnline: boolean;
  /** Local IPs reported by the server */
  networkInfo: NetworkInfo | null;
  /** IP currently selected by the admin */
  selectedIp: string;
  /** Port to use (defaults to current window.location.port or 80) */
  selectedPort: string;
  /** Full origin to use for QR codes */
  effectiveOrigin: string;
  /** Toggle local mode on/off */
  setLocalMode: (on: boolean) => void;
  /** Save the selected IP */
  setSelectedIp: (ip: string) => void;
  /** Save the selected port */
  setSelectedPort: (port: string) => void;
}

export function useLocalMode(): LocalModeState {
  const [localMode, _setLocalMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (localStorage.getItem(LS_ENABLED) === 'true') return true;
    return !navigator.onLine;
  });

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof window !== 'undefined' ? navigator.onLine : true,
  );

  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  const [selectedIp, _setSelectedIp] = useState<string>(
    () => localStorage.getItem(LS_IP) ?? '',
  );

  const [selectedPort, _setSelectedPort] = useState<string>(
    () =>
      localStorage.getItem(LS_PORT) ??
      (typeof window !== 'undefined' ? window.location.port || '80' : '80'),
  );

  // Persist helpers
  const setLocalMode = useCallback((on: boolean) => {
    _setLocalMode(on);
    localStorage.setItem(LS_ENABLED, on ? 'true' : 'false');
  }, []);

  const setSelectedIp = useCallback((ip: string) => {
    _setSelectedIp(ip);
    localStorage.setItem(LS_IP, ip);
  }, []);

  const setSelectedPort = useCallback((port: string) => {
    _setSelectedPort(port);
    localStorage.setItem(LS_PORT, port);
  }, []);

  // Track online/offline events — auto-enable local mode when offline
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      // Don't auto-disable — user must manually turn it off
    };
    const onOffline = () => {
      setIsOnline(false);
      setLocalMode(true); // Auto-enable when internet drops
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setLocalMode]);

  // Fetch server-side local IPs (works even offline if server reachable on LAN)
  useEffect(() => {
    const url = `${BASE}api/network/info`.replace(/\/\//g, '/');
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then((d: NetworkInfo | null) => {
        if (!d) return;
        setNetworkInfo(d);
        // Auto-fill selectedIp if not already set
        if (!localStorage.getItem(LS_IP) && d.localIps.length > 0) {
          _setSelectedIp(d.localIps[0]!);
        }
      })
      .catch(() => null);
  }, []);

  // Compute the effective origin for QR codes
  const effectiveOrigin = (() => {
    if (!localMode || !selectedIp) return window.location.origin;
    const port = selectedPort && selectedPort !== '80' ? `:${selectedPort}` : '';
    return `http://${selectedIp}${port}`;
  })();

  return {
    localMode,
    isOnline,
    networkInfo,
    selectedIp,
    selectedPort,
    effectiveOrigin,
    setLocalMode,
    setSelectedIp,
    setSelectedPort,
  };
}

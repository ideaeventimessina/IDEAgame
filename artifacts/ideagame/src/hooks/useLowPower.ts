/**
 * useLowPower — detect PS4 browser / low-memory devices and return a flag.
 * Used to gate heavy animations, blur filters, and particle effects.
 */

/** True when running on a PlayStation 4 browser */
export const IS_PS4 =
  typeof window !== 'undefined' &&
  /PlayStation\s*4|PLAYSTATION\s*4/i.test(navigator.userAgent);

function detectLowPower(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  // PlayStation 4 browser
  if (/PlayStation\s*4|PLAYSTATION\s*4/i.test(ua)) return true;
  // Old Android (< 6) or WebKit on very old Android
  if (/Android\s*[2-5]\./i.test(ua)) return true;
  // Device memory API (< 2 GB)
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem < 2) return true;
  // Hardware concurrency (1-2 cores)
  if (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 2) return true;
  return false;
}

// Compute once, never changes during session
export const IS_LOW_POWER = detectLowPower();

export function useLowPower(): boolean {
  return IS_LOW_POWER;
}

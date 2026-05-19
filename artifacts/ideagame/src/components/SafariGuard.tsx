/**
 * SafariGuard — REMOVED.
 * All browsers (including Chrome iOS) are allowed to proceed.
 * This file is kept as a transparent passthrough so no stale imports break.
 */
import type { ReactNode } from 'react';

export function isBrowserBlocked(): boolean {
  return false;
}

export function SafariGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

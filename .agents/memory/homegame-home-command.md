---
name: HomeGame home:command effect
description: Gotchas for the home:command useEffect in HomeGame.tsx
---

## Rules

1. Use `session?.id` (not `sessionId`) — `sessionId` is not a variable in HomeGame component scope.
2. `on()` from `useHomeSocket` returns `() => void` — safe as useEffect cleanup.
3. `setAudioEnabled` accepts only `boolean` (not callback updater) — pass `!(e.payload?.muted ?? true)` directly.
4. Sara'Musica select-game bypass already exists at line ~2463 in home.ts — no need to add it.

**Why:** These were TypeScript errors caught during implementation that require exact variable names from HomeGame scope.

---
name: LivePresenter command routing
description: Two separate command channels in LivePresenter — live session vs home session
---

## Rule
LivePresenter has two command channels:

1. `sendCommand(cmd, payload)` — calls `POST /live-sessions/:id/command?s=CODE` → emits `live:command` to `live:${sessionId}` socket room. Use for overlay/blackout/pause commands that target the live presentation layer.

2. `sendHomeCommand(cmd, payload)` — calls `POST /live-sessions/:id/home-command?s=CODE` → server bridges to home session: game-flow commands (`select_game`, `next_phase`, `end_game`, `force_reveal`, `force_ranking`) emit `home:command` to `home:${homeSessionId}`; `set_audio_muted` emits to both rooms.

**Why:** Home session (TV/lobby) and live session are separate state machines. Presenter must route commands to the right layer.

**How to apply:** Game launcher buttons → `sendHomeCommand('select_game', { gameSlug })`. Flow controls (next, reveal, ranking, end) → `sendHomeCommand`. Show controls (pause, blackout) → `sendCommand`. Audio toggle → `sendHomeCommand('set_audio_muted', { muted })`.

## HomeGame.tsx listeners
- `live:command` listener: handles `stop_audio`, `toggle_audio`, `set_audio_muted`
- `home:command` listener: handles `select_game` → POST /home/sessions/:id/select-game; `next_phase` → POST /next; `end_game` → POST /end-game; `set_audio_muted` → setAudioEnabled
- The home:command useEffect must use `session?.id` (not `sessionId` — that variable doesn't exist in HomeGame scope)

# IDEAgame — 20-Scene Navigation & Screen Architecture

Design rules carried through every scene:

- **Projector first.** Stage screens use giant type, no small controls, no scrollbars, no settings.
- **Phone is the remote.** All taps, inputs, votes, and reactions happen on player phones.
- **Entertainer controls only.** A single hidden control surface (top-right tap on the projector or the entertainer's phone) drives the live show.
- **Settings live in /admin only.** Anything configurable is hidden behind a role-gated admin section.
- **No emojis. No clutter.** Hex-based luxury arcade aesthetic across all scenes.

Roles referenced below: `super_admin`, `tenant_owner`, `game_manager`, `entertainer`, `player`.

---

## 01 — Splash / Loading
- **Purpose:** Brand impact while bootstrapping config (tenant, locale, cached assets, offline state).
- **UI blocks:** Full-bleed midnight backdrop, centered `IDEAgame` logo hexagon, single-line tagline, thin gold progress bar, footer build/version + "offline ready" status pill.
- **Primary actions:** None — auto-advances when ready (max 1.5s, dev skip with tap).
- **Access:** Everyone, every device.
- **Mobile:** Same layout, scaled type, safe-area aware. **Projector:** Full 16:9, oversized logo, ambient particle motion.

## 02 — Language Selection
- **Purpose:** Pick interface locale (it / en / es / fr; IT default). Shown only on first run or when admin forces it.
- **UI blocks:** Four large language hex tiles in a row, each with flag-free typographic label and native name; small "remember choice" toggle; "Continue" CTA.
- **Primary actions:** Tap a language → persist → continue.
- **Access:** Everyone.
- **Mobile:** Vertical stack of full-width tiles. **Projector:** Horizontal row, 4 huge hexes, audience-readable.

## 03 — Tenant Selection / Auto-Detect
- **Purpose:** Identify which venue/tenant this device belongs to. Auto-detects via subdomain or last-used tenant; falls back to manual pick for super_admin or shared devices.
- **UI blocks:** "Detected venue" card with tenant logo + name + confirm button; below, a searchable list of other tenants (super_admin only); "Use this device offline" link.
- **Primary actions:** Confirm tenant, search, switch tenant (super_admin), continue offline.
- **Access:** super_admin sees all tenants; everyone else sees only their assigned tenant (auto-confirms in 2s).
- **Mobile:** Single tenant card + search sheet. **Projector:** Larger card, no search (projector is always pre-bound to a tenant).

## 04 — Login (Admin & Entertainer)
- **Purpose:** Authenticate operators. Players never see this screen — they enter via QR.
- **UI blocks:** Centered card, email + password fields, "Sign in" CTA, secondary "Magic link", small "Forgot password", footer language switcher.
- **Primary actions:** Submit credentials → role-aware redirect (admin roles → /admin, entertainer → GameStation home).
- **Access:** super_admin, tenant_owner, game_manager, entertainer.
- **Mobile:** Full-screen form, large tap targets, autofill friendly. **Projector:** Same layout but rarely shown — projector usually auto-logs in via paired entertainer device.

## 05 — GameStation Home (Central Hexagon Hub) ⭐
- **Purpose:** The visual centerpiece. The entertainer launches games from here during the live show.
- **UI blocks:**
  - Large central `IDEA / GAME` brand hex.
  - **6 surrounding game hexes** (Percorso a Risate, Gioco delle Coppie, Quizzone, SaraMusica, Adult Only, Sfida di Ballo) — each huge, color-coded, with icon + name + one-line tagline.
  - Top-left: live event banner ("LIVE — Compleanno Sorrento 40 — Hotel Mediterraneo").
  - Top-right: locale switcher + WiFi/network pill.
  - Bottom-left: QR join card ("Inquadra per giocare") with real scannable code + short URL.
  - Bottom-right: live player wall (avatars filling in as players join).
- **Primary actions:** Tap a game hex → game launch screen. Tap QR → enlarge fullscreen for the room.
- **Access:** entertainer, game_manager, tenant_owner, super_admin (read-only for player demo via switcher).
- **Mobile:** Reflowed as vertical stack — header, QR card, scrollable game grid (2 columns of hexes), player wall collapsible. **Projector:** Full hex constellation, no scrollbars, designed for 1080p+ at 3m viewing distance.

## 06 — Event Setup
- **Purpose:** Create / configure the live event before guests arrive.
- **UI blocks:** Form card — event name, venue, date/time, expected players slider, plan/games selector (toggleable hex chips for the 6 games), brand color picker, cover media picker, "Save & open lobby" CTA.
- **Primary actions:** Save draft, save & open lobby, duplicate from previous event, delete.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile:** Single-column form, sticky save bar. **Projector:** Not shown live — this is a pre-event admin screen.

## 07 — Team & Player Setup
- **Purpose:** Build teams (or play solo), assign colors, balance squads before the show.
- **UI blocks:** Left rail: roster of joined players (drag handles, avatar, name); Center: team boards (color hex header, member chips, team score 0); Right: controls — "Add team", "Auto-balance", "Lock teams", "Solo mode" toggle.
- **Primary actions:** Drag player → team, rename team, change team color, auto-balance, lock and continue to lobby.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile:** Stacked — players list above, teams below, drag via long-press. **Projector:** Read-only mirror so the room can see team formation in real time; entertainer drives from phone.

## 08 — QR Join Lobby
- **Purpose:** The "everyone scan now" moment. Maximum legibility for a crowded room.
- **UI blocks:** Massive centered QR (real scannable), short fallback URL + 4-character room code in mono type, live counter ("12 / 20 joined"), avatar wall of joined players animating in, footer help line ("Open the camera, point at the code"), entertainer "Start" button (only on entertainer device).
- **Primary actions:** Players scan → join. Entertainer presses Start when ready.
- **Access:** Anyone in the room can scan. Start button: entertainer / game_manager / tenant_owner.
- **Mobile (player):** After scanning lands on a "Choose your name + avatar color" screen, then a waiting room. **Projector:** The hero QR view above.

## 09 — Live Session Control
- **Purpose:** The entertainer's cockpit during a game — pause, skip, score-adjust, eject, next round.
- **UI blocks:** Compact dark sheet — current game name + round indicator, big circular timer with pause / +10s / −10s, "Reveal answer", "Next round", "Skip player", manual score adjuster (+/− per team), "End game → Scoreboard", emergency "Black screen" toggle.
- **Primary actions:** Pause/resume, advance round, reveal, end game.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile (entertainer phone):** Full-screen control sheet, thumb-reachable big buttons, no tiny toggles. **Projector:** Never shown — this is the operator's secret panel.

## 10 — Media Library (Admin)
- **Purpose:** Manage images, audio, video used by games (intros, music beds, prompts).
- **UI blocks:** Sidebar nav (admin), top toolbar (search, filter by type, upload), main grid of media cards with preview + name + size + tags, right drawer for selected item (rename, retag, replace, delete, usage list).
- **Primary actions:** Upload, drag-drop, tag, delete, preview.
- **Access:** game_manager, tenant_owner, super_admin.
- **Mobile:** Single-column card list, FAB upload. **Projector:** Not exposed.

## 11 — Quiz Database (Admin)
- **Purpose:** Author and manage the trivia question bank with full 4-language i18n.
- **UI blocks:** Sidebar nav, filter row (category, difficulty, language coverage), table with prompt (IT) / category / difficulty / languages / actions, side editor drawer with tabs for IT/EN/ES/FR, answer options, correct flag, time limit, media attachment.
- **Primary actions:** Add question, edit, translate, bulk import CSV, archive.
- **Access:** game_manager, tenant_owner, super_admin.
- **Mobile:** Card list with full-screen editor sheet. **Projector:** Not exposed.

## 12 — Subscription & Billing
- **Purpose:** See plan, usage, invoices, payment method; upgrade/downgrade.
- **UI blocks:** Current plan card with usage bars (events used / events included), plan grid (Starter / Pro / Enterprise), invoices table, payment method card with "Update card", VAT info.
- **Primary actions:** Change plan, update card, download invoice, contact sales.
- **Access:** tenant_owner, super_admin.
- **Mobile:** Stacked cards. **Projector:** Not exposed.

## 13 — Tenant Settings
- **Purpose:** Brand and configure a venue's IDEAgame instance.
- **UI blocks:** Brand panel (logo upload, primary color, accent color), default locale, default games enabled, projection defaults (1080p / 4K, ambient mode), offline mode toggle, custom domain, danger zone (delete tenant).
- **Primary actions:** Save brand, set defaults, toggle features, delete.
- **Access:** tenant_owner, super_admin.
- **Mobile:** Sectioned form. **Projector:** Not exposed.

## 14 — Translation Manager
- **Purpose:** Visual coverage of UI strings across IT/EN/ES/FR — find missing keys, edit inline.
- **UI blocks:** Search by key, "Show missing only" toggle, table with columns key / IT / EN / ES / FR (cells red if missing, gold if edited), inline edit, export/import JSON.
- **Primary actions:** Edit cell, mark missing, export, import.
- **Access:** game_manager, tenant_owner, super_admin.
- **Mobile:** Stacked rows per key with collapsible language list. **Projector:** Not exposed.

## 15 — Game 1 Launch (e.g. Quizzone)
- **Purpose:** Cinematic intro before play begins. One per game, themed by game color.
- **UI blocks:** Game logo hex animating in, game name in display type, one-line rules, "Best of 5 rounds — 30s per question" meta strip, scoreboard ribbon (teams + zeros), "Tap to start" entertainer cue.
- **Primary actions:** Start (entertainer), back to hub.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile (player):** Receives a "Get ready — Quizzone" splash with team color. **Projector:** Full cinematic intro.

## 16 — Game 2 Launch (e.g. Sfida di Ballo)
- **Purpose:** Same cinematic frame as #15 but themed for the dance challenge — motion-led intro, beat-synced timer preview.
- **UI blocks:** Game hex (magenta), prompt area showing dance move, music bed indicator, motion-permission reminder for player phones, scoreboard ribbon.
- **Primary actions:** Start round, request motion permission on player devices.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile (player):** Phone becomes a motion sensor — large "hold and dance" prompt. **Projector:** Big move card + countdown.

## 17 — Game 3 Launch (e.g. SaraMusica)
- **Purpose:** Music-quiz launch. Entertainer-controlled audio playback with masking visuals.
- **UI blocks:** Album-art mask hex, equalizer animation, audio progress, multiple-choice answer hexes (revealed for room, hidden until lock-in on phones), scoreboard ribbon.
- **Primary actions:** Play snippet, lock answers, reveal.
- **Access:** entertainer, game_manager, tenant_owner.
- **Mobile (player):** Four big tappable answer hexes, vibration on lock. **Projector:** Audio-driven visuals + answer grid revealed at the right moment.

## 18 — Scoreboard & Podium
- **Purpose:** End-of-game celebration and round-by-round standings.
- **UI blocks:** Top: animated podium (1st/2nd/3rd) with team colors and confetti motion; below: full standings bar chart with team avatars, points, deltas; footer: "Next game" CTA + "Back to GameStation".
- **Primary actions:** Continue to next game, return to hub, share recap (post-event).
- **Access:** Everyone in the room sees it; entertainer drives navigation.
- **Mobile (player):** Personal result card — your rank, your points, your team's rank. **Projector:** Full podium spectacle.

## 19 — Device Permissions Helper
- **Purpose:** Friendly explainer when a player phone needs microphone (SaraMusica voice mode), motion (Sfida di Ballo), or camera (QR re-scan) access.
- **UI blocks:** Single illustrated card per permission, plain-language reason ("We need motion to score your dance"), big "Allow" button that triggers the native prompt, secondary "Skip — I'll watch" link, status row showing what's already granted.
- **Primary actions:** Allow, skip, retry after browser-denied.
- **Access:** Players (mobile only). Entertainer never sees this — projector has no permissions to request.
- **Mobile:** Full-screen sheet, one permission at a time. **Projector:** N/A.

## 20 — System Settings / Local & Offline Mode
- **Purpose:** Operator controls for running the show without internet — cache management, local network mode, projector pairing, diagnostics.
- **UI blocks:** Sections — Network status (online/offline pill, switch to local mode), Cache (size, "Pre-cache event" button, clear), Pairing (list of paired devices, "Pair new projector" with code), Diagnostics (logs, version, "Send report"), Danger zone (factory reset this device).
- **Primary actions:** Toggle offline mode, pre-cache, pair device, send diagnostics.
- **Access:** tenant_owner, super_admin (game_manager read-only).
- **Mobile:** Stacked sections. **Projector:** Not exposed during a show — accessed via admin only.

---

## Flow summary (entertainer's happy path)

`Splash → Login → GameStation Home → Event Setup → Team Setup → QR Lobby → [Game Launch → Live Control → Scoreboard] × N → GameStation Home`

Players' happy path: `QR scan → Name/Avatar → Lobby waiting → Permissions (only when needed) → In-game phone UI → Personal scoreboard`.

Admin happy path (separate session, not during live show): `Login → Admin Dashboard → Media / Quizzes / Translations / Tenants / Billing / Settings`.

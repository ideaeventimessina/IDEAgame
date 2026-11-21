# IDEAgame

A luxury, hex-themed live party game platform with a real persistent backend
(tenants, users, events, teams, players, scores, media, quizzes, translations),
real session-based authentication, and a typed React/Vite admin console + projector hub.

## 🎤 Jonny — Co-Host Architecture (completato)

| Componente | File | Note |
|---|---|---|
| SVG mascot | `artifacts/ideagame/public/jonny.svg` | Testa cartoon: pompadour black & gold, occhiali neri, occhi sparkle. Favicon dell'app. |
| React component | `src/components/JonnyAvatar.tsx` | Props: `mood` (idle/excited/thinking/cheering/celebrating), `size`. Variazioni occhi/sopracciglia/bocca per mood. |
| Feature flag | `src/contexts/JonnyContext.tsx` | `isHostedByJonny` persistito in `localStorage:ideagame:jonny:enabled`. Rilevabile via `?jonny=1` nell'URL per test rapidi. |
| Player layer | `src/components/JonnyLayer.tsx` | Bolla gold floating con Jonny avatar. Appare a: onboarding (`excited`), attesa (`thinking`), gioco (`cheering`), fine (`celebrating`). Dismissibile con X. |
| Integrazione Player | `src/pages/Player.tsx` | `<JonnyLayer>` renderizzato condizionalmente su `isHostedByJonny`. |
| Toggle admin | `src/admin/Settings.tsx` | Pannello JONNY CO-HOST con toggle ON/OFF in `/admin/settings`. |

**Architettura pronta per AI automation futura** — `jonnyMood` + `jonnyMessage` sono settabili da qualsiasi componente via `useJonny()`. Nessun backend AI ancora collegato.

## Stato finale del lavoro (in italiano)

### ✅ Persistente (DB + API + UI)

| Area | DB | API | UI |
| --- | --- | --- | --- |
| Tenants / Users / Auth (sessione cookie) | ✅ | `/api/auth/*`, `/api/tenants`, `/api/users` | `/login`, `/admin/tenants`, `/admin/users` |
| Eventi (create + current + list) | ✅ | `/api/events*` | `/event-setup` (wizard reale), Hub, Lobby |
| Teams CRUD per evento | ✅ | `/api/events/:id/teams`, `/api/teams/:id` | `/admin/teams` (selettore evento, create, delete) |
| Players (lista + join) | ✅ | `/api/events/:id/players` | Hub roster, Lobby (polling 4s) |
| Scoreboard aggregata | ✅ | `/api/events/:id/scoreboard` | `/scoreboard` (podio + barre, polling 5s) |
| Devices pairing (proiettore/controller/tablet/telefono) | ✅ tabella `device_connections` | `/api/devices` CRUD | `/admin/system` |
| System settings (brand color, lingua, projection mode, offline-first) | ✅ tabella `system_settings` (upsert per `tenant_id+key`) | `GET/PUT /api/system-settings` | `/admin/settings` |
| Game sessions + rounds | ✅ tabelle `game_sessions`, `rounds` | `POST /events/:id/sessions`, `PATCH /sessions/:id`, `POST /sessions/:id/rounds`, `PATCH /rounds/:id` | `/control` (LiveControl reale) |
| Card sets / Cards | ✅ tabelle `card_sets`, `cards` | `/api/card-sets` CRUD | API only |
| Sfida di Ballo (accelerometro) | ✅ tabelle `dance_challenges`, `dance_sessions` | `/api/dance-challenges` CRUD, `/api/dance/sessions/:id/{init,start,motion,bonus,end}` | `/admin/sfida-ballo`, `/sfida-ballo`, LiveControl panel, Player controller |
| Quiz categories + responses | ✅ tabelle `quiz_categories`, `quiz_responses` | `/api/quiz-categories` CRUD | API only |
| Audit log (chi ha fatto cosa) | ✅ tabella `audit_log` + helper `lib/audit.ts` | `GET /api/audit-log`, scritto da `device.create`, `system_settings.upsert` | API only (UI da costruire) |
| Quizzes / Media / Translations / KPIs | ✅ già esistente | già esistente | `/admin/{quizzes,media,translations}`, Dashboard |

### 🟡 Mock (segnalato in UI con banner ambra `MockBanner`)

Pagine intenzionalmente lasciate mock perché fuori dallo scope del wiring backend, ma marcate visibilmente:

- `/play` (Player) — flusso giocatore (nickname, team, controller). Banner: *"flusso giocatore non ancora collegato a /events/{id}/players"*.
- `/game/:slug` (GameStage) — animazioni di stage e punteggi locali. Banner: *"punteggi non persistiti su /scores"*.
- `/control` (LiveControl) — control room. Banner: *"non ancora collegata a /sessions/{id}"*.
- `/permissions`, `/splash`, `/language`, `/tenant` — onboarding visivo.
- `/admin/billing` — listino prezzi statico.
- `DemoSwitcher` — solo navigazione.

### 🟢 Realtime (Socket.IO — completato)

- Socket.IO v4 integrato sull'API server (porta 8080, path `/socket.io`)
- Architettura: `createServer()` senza handler → `initSocket(server)` → listener Express solo per non-socket.io. Questo evita la race condition tra la risposta asincrona di socket.io e il 404 sincrono di Express.
- Stanze per evento: `event:{id}` — emit `player:joined`, `player:left`, `score:updated`, `session:updated`, `team:updated`
- Hook client: `useEventSocket(eventId)` in `artifacts/ideagame/src/hooks/useEventSocket.ts`
- Lobby, Scoreboard: socket + polling di fallback
- LiveControl: sessioni/round reali via API + socket emit per sync proiettore
- Player (`/play`): flusso reale — fetchEvent per joinCode → POST players → socket state

### 🔴 Bloccanti / rischi

1. **Realtime completato** — Socket.IO attivo. Rimane da integrare flusso Player completo (MockBanner rimosso) e LiveControl completo.
2. **Upload file mancante.** Media è ancora "incolla URL". Per upload reali serve App Storage (presigned URL). *Mitigazione:* campo URL libero.
3. **Update non esposti in UI.** `PATCH /tenants/:id`, `/users/:id`, `/events/:id`, `/devices/:id`, `/sessions/:id` esistono ma le tabelle admin offrono solo create + delete. Per ora l'editing è solo via API.
4. **Error handling debole sulle mutations.** Pagine admin invalidano la cache su success ma molti `mutateAsync` non hanno `try/catch` con toast. EventSetup ora cattura l'errore; le altre pagine no.
5. ~~**`user_sessions` creata fuori migration.**~~ ✅ 21/11/2026: dichiarata nello schema Drizzle (`lib/db/src/schema/auth-sessions.ts`, identica al DDL storico) e creata all'avvio da `ensureAuthTables` (`artifacts/api-server/src/lib/auth-tables.ts`, solo `CREATE … IF NOT EXISTS`).
6. ~~**No CSRF / no rate limit / no password reset.**~~ ✅ 21/11/2026: controllo Origin/Referer sulle richieste che cambiano stato col cookie di sessione (`middlewares/csrf.ts`), rate limit su login e reset, reset password via email (`/reset-password`, token monouso 30 min, serve `RESEND_API_KEY`); senza email il super_admin reimposta la password con `PATCH /api/users/:id { password }`.
7. **Game settings = `jsonb` libero.** Editor tipato non esiste.
8. **Hub/Scoreboard richiedono auth.** Tutti i `/api/*` vogliono sessione. Per un proiettore "anonimo" servono endpoint pubblici filtrati per `joinCode`.
9. **Player join code non consumato.** L'URL `/play?e=XXX` arriva, ma `/play` è ancora mock e non chiama `POST /events/:id/players`.
10. **Audit log scrive best-effort.** Errori di scrittura sono swallow-ati e loggati con `req.log.error` per non rompere la mutation principale.

### 🚀 Prossimi step suggeriti (in ordine)

1. **~~Realtime con Socket.IO~~** ✅ Completato.
2. **~~Gioco delle Coppie (memory game)~~** ✅ Completato — vedi sezione sotto.
3. **LiveControl reale completo**: bottoni next round / pause / +punti che chiamano `PATCH /sessions/:id` e `POST /scores`. (L'init coppie è già cablato in LiveControl.)
4. **Editor di update in admin**: dialog "Modifica" su Tenants/Users/Events/Devices con `PATCH`.
5. **Pagina `/admin/audit`** che legge `GET /api/audit-log` (tabella già pronta, helper attivo).
6. **Object storage per Media** (skill `object-storage`): presigned URL + sostituzione del campo URL con uploader.
7. **Migration Drizzle ufficiale** per `user_sessions` e per le 9+ nuove tabelle (oggi create via SQL out-of-band).
8. **Hardening sicurezza**: CSRF token, rate-limit su `/auth/login`, password reset/magic link.

### 🌟 Serata Completa — architettura (completato)

| Componente | Dove | Note |
|---|---|---|
| DB `evening_modes` | `lib/db/src/schema/evening.ts` | event_id UNIQUE, playlist JSONB (`EveningGame[]`), status idle/running/ended |
| API routes `/events/:id/evening/*` | `artifacts/api-server/src/routes/evening.ts` | GET, POST /init, POST /advance (crea sessione + auto-select), DELETE, GET /scoreboard |
| LiveControl pannello | `artifacts/ideagame/src/pages/LiveControl.tsx` | Card "✨ Serata Completa" sopra il session selector: playlist mini 3 giochi, stato badge, pulsante "Prossimo →" che crea sessione e auto-seleziona, Podio globale, ↺ Ricomincia |
| Scoreboard globale `/serata-completa` | `artifacts/ideagame/src/pages/SerataCompleta.tsx` | Scaletta giochi con status, tabella per-team/per-gioco, podio finale, socket-driven |
| Hub | `artifacts/ideagame/src/pages/Hub.tsx` | READY_SLUGS + percorso-a-risate, pulsante "✨ Serata Completa → /control" |

**Flusso di gioco**:
1. In LiveControl: seleziona evento → vedi pannello "✨ Serata Completa" → "Inizia serata completa"
2. Sistema crea sessione percorso-a-risate e la auto-seleziona → il pannello percorso appare sotto
3. Animatore completa percorso → torna al pannello serata → "Prossimo: Gioco delle Coppie →"
4. Sistema crea sessione gioco-coppie → il pannello coppie appare sotto
5. Stesso per Quizzone → alla fine → "Fine serata →" naviga a `/serata-completa?e=...`
6. `/serata-completa?e=EVENT_ID` mostra scaletta, classifica per gioco, podio finale — aggiornamento socket in realtime

**Socket event**: `evening:updated` emette `{ evening, session }` — LiveControl e SerataCompleta si aggiornano live

**Dati**: `evening_modes` creata via SQL; nessun seed necessario (init dal LiveControl)

### 🎮 Percorso a Risate — architettura (completato)

| Componente | Dove | Note |
|---|---|---|
| DB `laughing_path_sets` / `laughing_path_steps` / `laughing_path_sessions` | `lib/db/src/schema/percorso.ts` | sets + steps con challenge_type, points, time_limit; sessions con state JSONB |
| API route `/percorso/*` | `artifacts/api-server/src/routes/percorso.ts` | CRUD sets/steps + init/next/skip/score/end di sessione |
| Admin deck `/admin/percorso-risate` | `artifacts/ideagame/src/admin/PercorsoRisate.tsx` | crea set, aggiungi/ordina/attiva/rimuovi sfide per tipo |
| Projection board `/percorso-risate?s=SID&e=EID` | `artifacts/ideagame/src/pages/GamePercorso.tsx` | sfida gigante, badge tipo+punti, timer, punteggi squadra in basso, podio a fine |
| Player phone controller | `artifacts/ideagame/src/pages/Player.tsx` (PercorsoPhoneController) | sfida attiva su schermo, timer countdown, classifica live |
| LiveControl panel | `artifacts/ideagame/src/pages/LiveControl.tsx` | selettore set, init, avanti/salta, assegna punti per squadra, fine→podio |

**Tipi di sfida supportati**: sfida⚡, domanda❓, mimo🎭, ballo💃, veloce🏃, coppia👫, reazione😱, fantasia🌟

**Flusso di gioco**:
1. Animatore crea set in `/admin/percorso-risate` (aggiunge sfide per tipo)
2. In LiveControl: crea sessione `percorso-a-risate` → avvia → pannello percorso appare → seleziona set → "Inizializza"
3. Board disponibile a `/percorso-risate?s=SESSION_ID&e=EVENT_ID` (proiettore)
4. Giocatori su `/play?e=JOINCODE` vedono la sfida attiva sul telefono con timer
5. Match/avanzamento aggiornati via Socket.IO in real-time su tutti i device

**Dati demo**: 1 set "Serata Classica" con 10 sfide (tenant Mango)

### 🎮 Gioco delle Coppie — architettura (completato)

| Componente | Dove | Note |
|---|---|---|
| DB `coppie_boards` | `lib/db/src/schema/coppie-boards.ts` | sessionId, cardSetId, difficulty, mode, board JSONB |
| DB `cards.image_url/pair_id` | `lib/db/src/schema/card-sets.ts` | aggiunte colonne + default prompts `{}` |
| API route `/coppie/sessions/:id/*` | `artifacts/api-server/src/routes/coppie.ts` | GET board (pubblica), POST init (auth), POST flip (pubblica), POST unflip (pubblica) |
| Admin deck `/admin/card-sets` | `artifacts/ideagame/src/admin/CardSets.tsx` | crea deck, aggiungi coppie (label + 2 URL immagine), elimina carte/deck |
| Projection board `/coppie?s=SID&e=EID` | `artifacts/ideagame/src/pages/GameCoppie.tsx` | card flip 3D, socket-driven, team scores, win overlay |
| Player phone controller | `artifacts/ideagame/src/pages/Player.tsx` (CoppiePhoneController) | mini-grid tappabile, turn indicator, mismatch timer |
| LiveControl init panel | `artifacts/ideagame/src/pages/LiveControl.tsx` | selettore deck/difficoltà/modalità, pulsante "Inizializza", link diretto al board |

**Flusso di gioco**:
1. Animatore crea deck in `/admin/card-sets` (aggiunge coppie immagine)
2. In LiveControl: crea sessione `gioco-coppie` → avvia → pannello coppie appare → seleziona deck → "Inizializza"
3. Board disponibile a `/coppie?s=SESSION_ID&e=EVENT_ID` (proiettore)
4. Giocatori su `/play?e=JOINCODE` vedono controller coppie con mini-grid tappabile
5. Match/mismatch aggiornati via Socket.IO in real-time su tutti i device



## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (mounted at `/api`, port 8080)
- `pnpm --filter @workspace/ideagame run dev` — run the IDEAgame web client
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 with `express-session` + `connect-pg-simple` (Postgres-backed sessions, cookie `ideagame.sid`)
- DB: PostgreSQL + Drizzle ORM (`@workspace/db`)
- Auth: bcryptjs password hashes + server sessions; `loadUser` middleware loads `req.user` from session, `requireAuth`/`requireRole` gate routes
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API contract: OpenAPI → Orval → typed React Query hooks + Zod schemas (`@workspace/api-client-react`)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema.ts` (tenants, users, events, teams, players, scores, media, questions, translations, user_sessions)
- API spec: `lib/api-spec/openapi.yaml`
- Generated client: `lib/api-client-react/src/generated/api.ts`
- API server: `artifacts/api-server/src/{app.ts, routes/*.ts, middlewares/auth.ts}`
- Web client: `artifacts/ideagame/src/{auth/roles.tsx, admin/*, pages/*}`
- i18n bundled defaults: `artifacts/ideagame/src/i18n/strings.ts` (with DB overrides via `/api/translations`)

## Test accounts (password: `ideagame`)

- `ideaeventime@gmail.com` — tenant_owner (IDEAeventime) ← account principale
- `admin@ideagame.app` — super_admin (no tenant) ← accesso globale
- `owner@mango.events` — tenant_owner (Mango Events)
- `manager@mango.events` — game_manager (Mango Events)
- `host@mango.events` — entertainer (Mango Events)
- `host@aurora.events` — entertainer (Aurora Wedding Studio)

Tenant demo:
- **IDEAeventime** (slug: `ideaeventime`) — tenant di `ideaeventime@gmail.com`, evento demo "Demo IDEAeventime" join code `IDEA01`
- **Mango Events** (slug: `mango`) — tenant demo con evento live "Compleanno Sorrento 40" join code `SORR40`
- **Aurora Wedding Studio** (slug: `aurora`) — tenant demo con evento draft

## Architecture decisions

- **Cookie-session auth** chosen over JWT: `customFetch` defaults to `credentials: "include"`; the API uses an `ideagame.sid` cookie backed by Postgres.
- **`user_sessions` table is created out-of-band** via SQL — `connect-pg-simple`'s `createTableIfMissing` failed in this monorepo because it resolves `table.sql` against `dist/`. Recorded in Gotchas; if you wipe the DB, recreate the table (see `replit.md` Gotchas section).
- **Translations are layered**: bundled `STRINGS` provides defaults for all 4 locales; `translations` table stores per-tenant overrides editable from `/admin/translations`. Highlighted rows = DB override.
- **Codegen-first contract**: every route has Zod request/response schemas in `lib/api-spec`; the React client uses generated hooks + query keys. POST 201 responses bypass schema parsing in Orval, so server returns raw rows on create.

## Product

- **GameStation/Hub (`/`)**: projector view showing live event banner, hex grid of enabled games, QR join code, live player roster — all driven by real `/api/games` + `/api/events/current` + `/api/events/:id/players`.
- **Player phone (`/play`)**: nickname + team picker (mock; see "What is still mock" below).
- **Admin Console (`/admin/*`)** behind real session guard:
  - **Dashboard** — KPIs from `/api/kpis` (super_admin only) + recent events
  - **Tenants** (super_admin) — list, create, delete
  - **Users** — list, invite, delete (cannot delete self)
  - **Games** — list with per-game settings
  - **Quizzes** — list, search, create (multi-locale prompts + options + correct index), delete
  - **Media** — gallery, add (URL + tags + kind), delete
  - **Translations** — search, "show missing" filter, save-on-blur upsert; DB overrides over bundled strings
- **Login (`/login`)** — real bcrypt+session login

## What is real / persistent (verified)

| Domain | Read | Create | Update | Delete | Wired in UI |
| --- | --- | --- | --- | --- | --- |
| Auth (`/api/auth/{login,logout,me}`) | ✅ | ✅ | — | — | Login, AdminLayout (logout), Guard |
| Tenants | ✅ | ✅ | ✅ | ✅ | `/admin/tenants` (list/create/delete) |
| Users | ✅ | ✅ | ✅ | ✅ | `/admin/users` (list/invite/delete) |
| Games | ✅ | — | — | — | Hub, `/admin/games` |
| Events | ✅ | ✅ | — | — | Hub (current event), Dashboard (recent) |
| Teams | ✅ | ✅ | — | ✅ | seeded only — listed via API, not UI-managed |
| Players | ✅ | ✅ (`POST /events/:id/players`) | — | — | Hub roster |
| Scores | ✅ | ✅ | — | — | API only |
| Media | ✅ | ✅ | — | ✅ | `/admin/media` |
| Questions | ✅ | ✅ | — | ✅ | `/admin/quizzes` |
| Translations | ✅ | ✅ (upsert) | ✅ | — | `/admin/translations` |
| KPIs | ✅ | — | — | — | Dashboard |
| Sessions | ✅ (Postgres `user_sessions`) | rolling | rolling | logout | implicit |

Seeded data (DB):
- 3 tenants (mango/aurora/nightowl) with brand colors and MRR
- 5 users (super_admin + per-tenant roles)
- 6 games (percorso-a-risate, gioco-coppie, quizzone, indovina-titolo, hot-or-not, festa-segreti)
- 1 live event "Compleanno Sorrento 40" (join code `SORR40`) with 4 teams
- 1 draft event for Aurora
- 2 questions, 3 media

## What is still mock / stubbed (not wired to API)

These pages still read from `artifacts/ideagame/src/data/mock.ts` and are intentionally left in place because they are not part of the "backend wiring" scope. They render correctly but do not reflect DB state:

- `/play` — Player phone flow (Permissions, nickname, team join, controllers)
- `/lobby` — Pre-game lobby (uses mock players)
- `/scoreboard` — Inline mock scores
- `/game/:slug` — Per-game stage screens (show animations + mock state)
- `/control` — Live show control panel (no real socket wiring)
- `/event-setup` — Event creation wizard (not wired to `POST /api/events`)
- `/splash`, `/language`, `/tenant` — Onboarding screens (purely visual)
- `/admin/teams`, `/admin/billing`, `/admin/system`, `/admin/settings` — visual mock pages
- DemoSwitcher (bottom navigator) — pure navigation, never authenticated

## Tenant scoping (current state)

After the security pass, the API enforces tenant boundaries on the routes below for non-super_admin roles. `super_admin` always has cross-tenant visibility.

| Route | Behavior |
| --- | --- |
| `GET /api/users` | tenant_owner sees own-tenant + self only |
| `POST /api/users` | tenant_owner can only assign `tenant_owner`, `game_manager`, `entertainer` (no super_admin escalation); created users are forced into the caller's tenant |
| `PATCH /api/users/:id` | self-edit OR same-tenant tenant_owner editing a non-super_admin in same tenant; only super_admin may change `role` |
| `DELETE /api/users/:id` | cannot delete self; tenant_owner may only delete a non-super_admin same-tenant user (and only if both have a tenant) |
| `GET /api/events`, `GET /api/events/current` | filtered to caller's tenant |
| `GET/PATCH/DELETE /api/events/:id` | 403 if event belongs to another tenant |
| `GET/POST /api/events/:id/teams`, `PATCH/DELETE /api/teams/:id` | 403 if parent event is not in caller's tenant |
| `GET/DELETE /api/media/:id` | tenant-filtered list + 403 on cross-tenant delete |
| `GET/PATCH/DELETE /api/questions/:id` | tenant_owner/game_manager can read own-tenant + global (`tenantId=null`) questions, but can only mutate their own-tenant questions |
| `GET/POST/PATCH/DELETE /api/tenants` | super_admin only |
| `GET /api/kpis` | super_admin only |

Verified by curl: `tenant_owner` attempting to delete a `super_admin` returns `403`; attempting to create a `super_admin` returns `403`.

## What is missing / tech risks

1. **No realtime layer.** All projector ↔ player ↔ control coordination is request/response. A live show needs WebSockets (Socket.IO or native `ws`) for: player joins, score updates, round transitions, host controls. Right now the Hub re-fetches via React Query.
2. **No file upload pipeline.** Media is stored as a URL string only; "Upload" really means "paste a URL". For real uploads, integrate object storage (App Storage skill) and replace the URL field with a presigned-URL flow.
3. **No PATCH/UPDATE in UI.** Update endpoints exist (`PATCH /tenants/:id`, `/users/:id`, `/events/:id`, etc.) but the admin tables only expose create + delete. Editing requires a direct API call.
4. **Mutations have weak frontend error handling.** Admin CRUD pages invalidate caches on success, but most `mutateAsync` calls have no `try/catch`/toast — failures surface as unhandled rejections and dialogs may stay open in ambiguous states.
5. **`user_sessions` table created out-of-band.** `connect-pg-simple` failed to auto-create (it resolves `table.sql` against `dist/` under tsx dev). If you wipe the DB, re-run the SQL in Gotchas. Long term, ship a Drizzle migration so prod deploys don't regress.
6. **Seeded tenant users currently have `tenant_id = NULL`.** A direct DB inspection showed the seed populated emails/roles/passwords but not `tenant_id`. Tenant-scoped routes therefore return empty for tenant_owner/game_manager/entertainer until each user is assigned a tenant. Re-run the seed (or `UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug='mango') WHERE email LIKE '%@mango.events'`, etc.).
7. ~~**No CSRF protection.**~~ Fixed 21/11/2026 (Origin/Referer check, see above).
8. ~~**No password reset.**~~ Fixed 21/11/2026 (email reset; no magic links / email verification yet).
9. ~~**No rate limiting on `/auth/login`.**~~ `loginLimiter` + `passwordResetLimiter`.
10. **Bundled `STRINGS` are duplicated** between client and DB. The DB overrides work, but cold-start UI shows bundled defaults until the override loads. Consider hydrating overrides at boot.
11. **Player join code (`/play?e=SORR40`) is not actually consumed yet** — the URL is generated by Hub but the Player flow is still mock.
12. **Hub at `/` requires auth.** All `/api/*` endpoints require a session, including `/api/games`, `/api/events/current`, and `/api/events/:id/players`. The projector view returns 401 to anonymous browsers. Either log in before showing the projector, or add a small set of public read endpoints scoped by join code.
13. **Game settings are stored as `jsonb`** with no schema. Editing per-game settings from the UI will require a typed editor.
14. **Test seed is fragile.** During this session, an authorization bug (since fixed) deleted the `admin@ideagame.app` row; it had to be re-inserted manually. The seed script should be idempotent and re-runnable.

## User preferences

- Italian-speaking user — keep UX copy in Italian where possible (the bundled `STRINGS.it` is canonical).
- Luxury hex aesthetic — preserve dark theme, hex motifs, gradients, `text-display` font.

## Secret (variabili d'ambiente del server)

Si mettono nei **Secrets** del progetto su Replit (pannello Secrets, poi ripubblicare). Nessun valore va scritto nel codice o nei documenti.

| Secret | A cosa serve | Senza |
|---|---|---|
| `PONTE_IDEAEVENTI_KEY` | Chiave condivisa del ponte col gestionale IDEAeventi (header `x-ponte-key`) su `/api/ponte/ideaeventi/*` (partita, partita-home, partita/chiudi, skill). Stessa chiave lato gestionale. | Le rotte del ponte rispondono 503 |
| `PONTE_IDEAEVENTI_TENANT` | Storico: slug del tenant del vecchio motore Live. Dal motore unico (29/9/2026) **non è più letto** dal codice; si può lasciare o togliere. | Nessun effetto |
| `JARVIS_PONTE_KEY` | Chiave del ponte Jarvis (header `X-Ponte-Key`) su `/api/ponte/jarvis/*` (`skill`, `stato`, `roulette/giro`, `roulette/:partita`). Su Jarvis la stessa chiave sta in `IDEAGAME_JARVIS_KEY`. | 503 con `secretMancante: "JARVIS_PONTE_KEY"` |
| `CASINO_PONTE_KEY` | Chiave con cui IDEAgame (client) chiama IDEAphoto Suite per il casinò (feste, collega, riscatta). Va insieme a `SUITE_BASE_URL`. | Il ponte casinò risponde "non configurato" |
| `IDEAX_KEY` | Chiave del ponte con ideax (il PC di casa): ideax la usa per prendere i lavori in coda su `/api/ponte/ideax/*`. `IDEAX_ABILITATO=1` per mandargli davvero i lavori. | 503 `ponte_non_configurato` |
| `MISSION_CONTROL_TOKEN` | Token per la telemetria e gli errori verso la plancia (LaStanza) e per le chiamate in arrivo da Mission Control (`X-Mission-Token`). | Nessuna telemetria; la rotta in arrivo rifiuta |
| `RESEND_API_KEY` (+ `RESEND_FROM`) | Invio email (codici serata Live, **reset password**). | Il reset via email non parte: password reimpostata dal super_admin |
| `IDEAGAME_PUBLIC_URL` | Indirizzo pubblico usato nei link delle email e dei ponti (default `https://ideagame.it`). | Si usa l'host della richiesta |
| `CORS_ORIGINI` | Origini in più ammesse da CORS **e dal controllo CSRF** (separate da virgola, es. `https://www.ideagame.it`). | Ammessi solo stesso host e domini Replit |
| `SESSION_SECRET`, `DATABASE_URL`, `IDEAGAME_OWNER_PASSWORD` | Firma dei cookie, database, password del proprietario (≥ 12 caratteri). | Il server non parte / proprietario non creato |

## Sicurezza degli accessi (21/11/2026)

- **Download karaoke** (`POST /api/karaoke/download-video`): solo super_admin, tenant_owner, game_manager; solo URL https di YouTube ricostruiti dal server; `--` prima dell'URL e `--no-exec` per yt-dlp; tempi numerici (`lib/youtube-url.ts`).
- **Casinò**: le letture pubbliche (`GET /api/gestione/casino/sessions/:id…` e lo stato via socket) non contengono più codici regia, dealer e giocatore, mazzi e config. Le operazioni di regia sulla serata vogliono il codice regia nell'header `x-master-code` (il frontend lo aggiunge da solo dopo l'ingresso con il codice regia, `src/lib/gettoni.ts`). Gli accrediti manuali dei dealer hanno un tetto per movimento (4× le fiche iniziali, minimo 1000). Il biliardo: solo il monitor 80″ (link con `&k=<chiave>` dalla regia) può riportare i tiri. Limite: le pagine di regia aperte su un ALTRO dispositivo (es. regia blackjack dall'80″) devono essere aperte dalla regia stessa, altrimenti non hanno il codice.
- **Serata Home**: chi crea la serata riceve un gettone d'organizzatore (`x-host-token`), ogni giocatore il suo (`x-player-token`); gettoni HMAC firmati con `SESSION_SECRET`, niente colonne nuove. Solo l'organizzatore chiude/cancella (`/end`, `/champion`, `DELETE`); `/score` lo imposta la TV, un telefono può solo aggiungersi fino a 1000 punti. Limiti di frequenza su punteggi e chiusura. Le serate create prima di questa versione e quelle aperte dal ponte IDEAeventi non hanno gettoni e restano col comportamento di prima.
- **Regia Live**: codice TV = solo lettura (non svela più il codice presentatore); codice presentatore = comandi; modifiche e cancellazioni solo dallo staff dello stesso tenant. `PATCH /api/games/:id` (catalogo globale) solo super_admin.
- **Archivio**: `request-url` solo staff, max 50 MB, solo immagini/audio/video; `/storage/objects/*` serve solo `uploads/<uuid>[.ext]` e rispetta le regole d'accesso private; audio globali caricabili/cancellabili solo dal super_admin.

## Test

`pnpm test` dalla radice lancia tutti i test (`node --test`, Node ≥ 23, senza database né rete) di `artifacts/api-server` e `artifacts/ideagame`. Un pacchetto da solo: `pnpm --filter @workspace/api-server test`.

## Gotchas

- **`user_sessions` si crea da sola all'avvio** (dal 21/11/2026, `ensureAuthTables`). Il DDL di riferimento resta questo:
  ```sql
  CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" varchar NOT NULL PRIMARY KEY,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
  ```
- **Always go through `localhost:80`** (the shared proxy) — not `:8080` (api-server) or `:5173` (vite). `customFetch` uses relative URLs which the browser routes via the same proxy.
- **Orval `query` options require `queryKey`** even when you only want to set `enabled`. Pass `{ queryKey: getXxxQueryKey(), enabled: ... }`.
- **POST endpoints return raw DB rows** — Orval skips Zod parsing on 201 responses. Don't add ResponseSchema-only fields you expect on create.
- **`bcryptjs` is bundled** in `artifacts/api-server/node_modules`; the seed script in `executeSql` imports it directly.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` before typechecking.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `replit-auth` and `clerk-auth` skills if you want to migrate session auth to a managed provider

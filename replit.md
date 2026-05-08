# IDEAgame

A luxury, hex-themed live party game platform with a real persistent backend
(tenants, users, events, teams, players, scores, media, quizzes, translations),
real session-based authentication, and a typed React/Vite admin console + projector hub.

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
5. **`user_sessions` creata fuori migration.** Vedi sezione *Gotchas*. Servirebbe una migration Drizzle reale per produzione.
6. **No CSRF / no rate limit / no password reset.** Non aprire a reti non fidate prima di averli aggiunti.
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

- `admin@ideagame.app` — super_admin (no tenant)
- `owner@mango.events` — tenant_owner (Mango Events)
- `manager@mango.events` — game_manager
- `host@mango.events` — entertainer
- `host@aurora.events` — entertainer (Aurora Cruise Lines)

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
7. **No CSRF protection.** Cookie sessions + `SameSite=Lax` mitigates basic CSRF but write endpoints accept any same-origin POST. Add CSRF tokens before opening to untrusted networks.
8. **No password reset / magic links / email verification.** The "magic link" button in the original Login was removed; password reset flow does not exist.
9. **No rate limiting on `/auth/login`.** Brute-force exposure.
10. **Bundled `STRINGS` are duplicated** between client and DB. The DB overrides work, but cold-start UI shows bundled defaults until the override loads. Consider hydrating overrides at boot.
11. **Player join code (`/play?e=SORR40`) is not actually consumed yet** — the URL is generated by Hub but the Player flow is still mock.
12. **Hub at `/` requires auth.** All `/api/*` endpoints require a session, including `/api/games`, `/api/events/current`, and `/api/events/:id/players`. The projector view returns 401 to anonymous browsers. Either log in before showing the projector, or add a small set of public read endpoints scoped by join code.
13. **Game settings are stored as `jsonb`** with no schema. Editing per-game settings from the UI will require a typed editor.
14. **Test seed is fragile.** During this session, an authorization bug (since fixed) deleted the `admin@ideagame.app` row; it had to be re-inserted manually. The seed script should be idempotent and re-runnable.

## User preferences

- Italian-speaking user — keep UX copy in Italian where possible (the bundled `STRINGS.it` is canonical).
- Luxury hex aesthetic — preserve dark theme, hex motifs, gradients, `text-display` font.

## Gotchas

- **Recreate `user_sessions` if you reset the DB:**
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

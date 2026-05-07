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
| Game sessions + rounds | ✅ tabelle `game_sessions`, `rounds` | `POST /events/:id/sessions`, `PATCH /sessions/:id` | API only (control room ancora mock) |
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

### 🔴 Bloccanti / rischi

1. **No realtime layer.** Lobby/Scoreboard usano polling React Query (4-5s). Per uno show vero serve WebSocket (Socket.IO o `ws`) per joins, score updates, transizioni round, control. *Mitigazione attuale:* polling.
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

1. **Realtime con Socket.IO** sull'API server: stanze per `eventId`, eventi `player:join`, `score:update`, `session:state`. Hook React `useEventSocket(eventId)` consumato da Hub/Lobby/Scoreboard/LiveControl.
2. **Wiring del flusso Player reale**: `/play?e=SORR40` → fetch evento per joinCode (endpoint pubblico nuovo) → `POST /events/:id/players` con nickname + team. Eliminare il `MockBanner` da `Player.tsx`.
3. **LiveControl reale**: bottoni next round / pause / +punti che chiamano `PATCH /sessions/:id` e `POST /scores`. Eliminare il `MockBanner` da `LiveControl.tsx`.
4. **Editor di update in admin**: dialog "Modifica" su Tenants/Users/Events/Devices con `PATCH`.
5. **Pagina `/admin/audit`** che legge `GET /api/audit-log` (tabella già pronta, helper attivo).
6. **Object storage per Media** (skill `object-storage`): presigned URL + sostituzione del campo URL con uploader.
7. **Migration Drizzle ufficiale** per `user_sessions` e per le 9 nuove tabelle (oggi create via SQL out-of-band).
8. **Hardening sicurezza**: CSRF token, rate-limit su `/auth/login`, password reset/magic link.



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

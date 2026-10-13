# IDEA EVENTI — Coverage Inventory (Fase 1)

> Deliverable Fase 1 del contratto `PIANO-E-CONTRATTO-DI-CONSEGNA`. Incrocio fra **route attive**,
> **mockup del pacchetto v1** e **funzioni esistenti nel repo**. Analisi **statica** (lettura codice +
> navigazione pubblica circoscritta): quasi nulla è collaudato end-to-end, quindi lo stato riflette
> *cosa esiste nel codice*, non *cosa è verificato in staging*.

- **Repo / HEAD base:** `ideaeventimessina/IDEAgame`, pacchetto riferito a `9003d68`; lavoro successivo già su `main` (`0a32123`, `c257cbd`, e questo doc).
- **Build id verificabile:** ⚠️ da introdurre (il pacchetto chiede un identificatore build non sensibile esposto da UI/health). **Non ancora fatto.**
- **Metodo stato:** `✅ presente` = implementato nel codice (da collaudare e2e) · `🟡 parziale/mock` · `❌ mancante` · `🔁 redirect legacy` (route storica che rimanda al runtime Home).

## 0. Architettura runtime (fatto chiave)

Il **motore Live autonomo è ritirato**: `ToLive()` in `App.tsx` reindirizza tutte le vecchie
porte Live/party a `/home-setup?mode=live`. I vecchi board `Game*.tsx` esistono ma sono
**irraggiungibili** (codice morto). Il runtime unico è:

- **Home mode** — TV = `HomeGame.tsx`, telefono = `HomeJoin.tsx`, host = `HomeSetupPage` + `HomeLobbyPage`.
- **Gestione** (isolata) — `/gestione/{burraco,casino,lockdown}`.

Conseguenza per la fedeltà: i party game **non** hanno file display/phone/host separati; sono
rami interni di `HomeGame`/`HomeJoin`. I mockup `01-ideagame` vanno mappati su *stati* di quei
due componenti, non su nuove pagine.

## 1. Public / shell

| Route | Componente | Ruolo | Reference | Stato | Note |
|---|---|---|---|---|---|
| `/` | `RootRoute` | logica | — | ✅ | `?e=`→Hub, altrimenti →`/home-v4` |
| `/home-v4` | `HomeV4` | landing pubblica | 01/05 | 🟡 | landing "Inizia lo show"; verificare fedeltà palco |
| `/mode-select` | `ModeSelect` | scelta modalità | 06 | 🟡 | Home/Live/Gestione/Lockdown |
| `/splash` `/language` `/tenant` `/login` | Splash/Lang/Tenant/Login | onboarding | — | 🟡 | stati vuoti/errore da verificare |
| `/projector` | `ProjectorStandby` | display standby | — | ✅ | |
| `/demo` `/passa-a-live` `/dev-test` | Demo/UpgradeLive/DevTest | vari | — | 🟡/dev | |

## 2. Home party-games (runtime attivo)

| Route | Componente | Ruolo | Reference | Stato |
|---|---|---|---|---|
| `/home-setup` | `HomeSetupPage` | host/regia (crea stanza, `?mode=live`) | 05 | 🟡 |
| `/home-lobby/:code` | `HomeLobbyPage` | display (QR gigante) | 06 | 🟡 |
| `/join/:code` · `/home/join` | `JoinPage` · `HomeJoin` | player/telefono | 07,10 | 🟡 |
| `/home` | `HomeGame` | **display/TV** (board + 8 giochi) | 06,08,09 | 🟡 |
| `/play/permissions` | `Permissions` | gesto sensori | — | 🟡 |

**8 giochi party** (rami in HomeGame/HomeJoin): percorso-risate, coppie, quizzone, saramusica,
ballo, parola-alle-spalle (wordback), karaoke, freestyle, + adult-only. Flusso pre-gioco condiviso:
`GameFlowEngine` (TV) + `GameFlowPhone` (telefono) solo per ballo/parola. **Da fare:** confronto a
viewport fissa di ogni stato-gioco (display+telefono) contro mockup 08/09/10; stati vuoti/errore.

🔁 **Legacy redirect** (storiche, → Home): `/coppie /quizzone /percorso-risate /serata-completa
/adult-only /sfida-ballo /parola-alle-spalle /karaoke-battle /freestyle-battle /saramusica
/game/:slug /lobby /scoreboard /cockpit /event-setup /control /play`. Restano redirect (non riattivare).

🔁 **Live** (→ Home): `/live-join /live-control /live-tv /presenter-live /presenter`;
`/live-presenter`→`LivePresenter` (unica pagina Live viva); `/live-dashboard /admin/live /admin/show`→`/home-setup?mode=live`.

## 3. Gestione — Casinò (`GestioneCasino.tsx`, dispatch per URL param)

| Gioco | Display 80" | Telefono | Regia/Host | Reference | Stato |
|---|---|---|---|---|---|
| **Roulette** | `RouletteTableView` | `SeatController` (`?seat=`) | `MasterView`+`TvView`+`DealerView`+banco "Tavoli" | `tavolo-roulette-10-giocatori`, `regia-master` | 🟡 logo+ROULETTE fatto; **RNG da rafforzare** |
| **Blackjack** | `BlackjackMonitor` | `BlackjackPhone` (6 stati ✅) | `BlackjackRegia`+`BlackjackTablesView` | `blackjack-01..04` | 🟡 telefono fedele; regia/tables da rifinire |
| **Ippodromo** | `HorseMonitor` | `HorsePhone` | `HorseRegia`+`HorseTablesView` | `ippodromo-01..03` | 🟡 corsa rifatta (3 giri, duelli, sprite pulito, no "7", pista pulita); telefono/regia da rendere fedeli |

**Priorità casinò:** (a) RNG roulette `gestione-casino.ts:464` usa `Math.random` → migrare a
`randomInt` crypto (BJ/horse già crypto); (b) tutte le operazioni saldo/fiche in **transazione** e
persistenti su restart (dati tavolo in `config` jsonb); (c) nessuna grafica congela saldo/esito.

## 4. Gestione — Burraco (`GestioneBurraco.tsx`) · Lockdown (`GestioneLockdown.tsx`)

| Modulo | Display | Telefono | Regia | Stato |
|---|---|---|---|---|
| **Burraco** | classifica pubblica (`?code=`) | inserimento punteggi (`?table=`) | MASTER dashboard | 🟡 presente, 3 ruoli ok; **idempotenza/transazione invii punteggi da verificare**; mai mano segreta su monitor |
| **Lockdown (/gestione)** | `GestioneLockdown` monitor | ❌ | ❌ | 🟡 **solo monitor MOCK** (no backend) |
| **Lockdown (Home)** | `HomeGame` | `HomeJoin` | `/home-setup` | ✅ motore reale `home-lockdown.ts` (19 endpoint), tier Full |

⚠️ **Nota lockdown:** il Lockdown *giocabile* vive nel runtime Home, non in `/gestione/lockdown`
(che è un mock). Decisione da prendere: unificare `/gestione/lockdown` sul motore Home o portare
telefono/regia dentro Gestione. Priorità statiche: **DTO completo + identità spia privata** (oggi
reda solo `spyPlayerId`, lookup `youAreSpy` da query), **concorrenza/replay** su lettura/scrittura JSON.

## 5. Admin (tutte sotto `<Guard route=…>`, ruoli in `auth/roles.tsx`)

Ruoli: `super_admin | tenant_owner | game_manager | entertainer | player`. ~30 pagine admin:
dashboard, games, quizzes, media, teams, tenants, billing, users, translations, settings, system,
card-sets, quiz-packs, percorso-risate, **jonny-creator**, adult-only, sfida-ballo, parola-alle-spalle,
events, karaoke-battle, freestyle-battle, saramusica, audio, audit, **jonny-poses**, content-packs,
giochi, giochi/:slug.

**Stato:** ✅ presenti e guardate; 🟡 **fedeltà + stati vuoti/errore + tabelle dense non collaudati**.
Il pacchetto dice: le admin specialistiche **ereditano un template** (reference `12-admin.png`), non
sono screenshot singoli approvati. **Da fare:** definire 1 template admin e applicarlo; verificare
che le impostazioni sensibili rispettino i ruoli e che nessun segreto sia risolto lato client.

## 6. Johhy — motore personaggio (priorità scelta dall'utente)

Logica **frammentata** (nucleo voce già centralizzato, resto duplicato → unificare in UN motore):

| Ambito | File:simbolo | Stato |
|---|---|---|
| Voce/TTS + ducking + analyzer bocca | `audio/JonnyVoice.ts` → singleton `JonnyVoice` (fetch `/api/home/voice/:key`, `AnalyserNode`, rAF) | ✅ **nucleo** |
| Hook React | `hooks/useJonnyVoice.ts` → `useJonnySpeaking()`, `jonnySpeak(key)` | ✅ |
| Context | `contexts/JonnyContext.tsx` → `JonnyProvider`/`useJonny` | ✅ |
| Avatar/animazione | `components/JonnyAvatar.tsx`; **duplicati** `JonnyWorldTheme.tsx`→`JonnyWaitingScreen`/`WinPodium` | 🟡 3 renderer, tutti `/jonny-master.jpg` statico |
| Fumetto | `components/JonnyLayer.tsx`; **duplicati** `JonnyMessage.tsx`, `JonnyWaiting.tsx` | 🟡 3 varianti bolla |
| Admin authoring | `admin/JonnyCreator.tsx`, `admin/JonnyPoses.tsx` | ✅ |
| Backend | `routes/voice.ts` (`/home/voice/:key`+manifest), `routes/jonny.ts`, `routes/jonny-poses.ts` | ✅ |

**Obiettivo (contratto Johhy):** contratto **SpeechCue** (exactText→voce+fumetto, segmenti sul clock
audio, audience public/player/host, interruptPolicy, un solo playback per device), stati personaggio
+ speech state separati, rig 2D (testa/busto/braccia/occhi/bocca) con lip motion da ampiezza (non
lip-sync fonetico), fumetto ancorato mai su risposte/numeri/QR/timer, muto di default su telefono.
**Rename Jonny→Johhy:** `displayName='Johhy'` centralizzato; mantenere ID/route/asset legacy
(`/jonny/*`, `/admin/jonny-*`, `/jonny-master.jpg`), migrare solo testo visibile/traduzioni (~50 file citano "Jonny").

## 7. Fix prioritari (dal pacchetto + analisi)

1. **Roulette RNG** → `gestione-casino.ts:464` `Math.random` → `randomInt(37)` crypto. *(piccolo, isolato)*
2. **Johhy unificato** *(priorità utente)* — collassare 3 avatar + 3 bolle in 1 motore con SpeechCue.
3. **Lockdown** — DTO/identità spia privata + concorrenza/replay; decidere Gestione vs Home.
4. **Saldi/crediti** (casinò, Lock-Euro, punti IDEAgame = domini distinti) in transazione atomica + ledger, persistenti su restart.
5. **Burraco** — idempotenza/transazione invii punteggi; classifica = `totalScore` (non presumere VP/MP federali).
6. **Build id** non sensibile esposto (UI/health) per correlare build↔HEAD.
7. **Collaudo** — fixture deterministiche, screenshot a viewport fissa (display 1920×1080/3840×2160, phone 390×844/360×800, tablet 1024×768, admin 1440×900), confronto overlay (geom ≤4px@1080, ΔE<5), sessione pilota multi-device.

## 8. Prossimo passo

Avvio **Fase 5 — Johhy unificato** (scelta utente): lettura puntuale di `JonnyVoice.ts` +
componenti duplicati, poi progetto del motore unico (SpeechCue + un solo avatar + un solo fumetto +
rename displayName), con verifica a viewport fissa contro lo storyboard `05-johhy`.

<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# DEVIATIONS — IDEAgame grafica finale (reskin flusso principale)

Confronto mockup pacchetto `01-ideagame` (tavole 05–12, 36 viste) ↔ codice su `main`
(HEAD `10c0261`). Regola di lavoro: **reskin/presentazione**, handler/endpoint/eventi/regole
di gioco **invariati**. Runtime unico = Home.

- Monitor/TV = `artifacts/ideagame/src/pages/HomeGame.tsx`
- Lobby display = `artifacts/ideagame/src/pages/HomeLobbyPage.tsx`
- Telefono = `artifacts/ideagame/src/pages/HomeJoin.tsx`
- Admin = `artifacts/ideagame/src/admin/AdminLayout.tsx` + `artifacts/ideagame/src/admin/*`

## Stato di partenza (verificato)

Il redesign è **già sostanzialmente implementato**: ogni famiglia di schermate del pacchetto
ha il suo componente vivo. Questo documento NON propone riscritture dei tabelloni (sono LIVE e
contengono i fix funzionali dei 6 giochi già su `main`): elenca le **deviazioni di fedeltà**
residue rispetto ai mockup, perché la scelta visiva finale resti QA di Andrea
(regola "mai merge visivo senza ok di Andrea").

- **tsc** `artifacts/ideagame` → **exit 0** (baseline e dopo le modifiche).
- **vite build** `artifacts/ideagame` → **exit 0** (~9 s, nessun chunk rotto).
- **LIMITE DI COLLAUDO (dichiarato, come già in `deliverables/ACCETTAZIONE-ideagame.md`):**
  in questo ambiente **non esiste un backend avviabile** (manca `DATABASE_URL`, niente Postgres
  locale, niente socket di sessione). I tabelloni e i controller telefono si renderizzano solo
  con una **sessione Home viva** con payload reali: qui **non sono catturabili a video**. Per
  ogni schermata sotto segnata `COLLAUDO LIVE PENDENTE` serve un confronto a schermo su
  Replit/locale (DB+secrets) prima di dichiararla "fedele".

## Correzioni di spec (04-DECISIONI) — stato

| Correzione richiesta dalla spec | Stato nel codice |
|---|---|
| Coppie = **Memory**, non "quanto vi conoscete"/compatibilità | **OK** — `ALL_GAMES` descr. "Memory card: trova le coppie prima degli altri!" (HomeGame.tsx:88); nessuna stringa romantica residua |
| Ballo = **Movimento del telefono**, non "Qualità del ballo" | **OK** — nessuna stringa "qualità del ballo" nel codice; sensore etichettato come movimento (BalloController) |
| Brand testo = **IDEAeventi**, logo reale mai alterato | **OK** — uso `logo.png`/asset reali; wordmark "IDEAeventi" nelle stringhe |
| Nome personaggio = **Johhy** (senza spazio) | **OK** — "Johhy's World" nello shell admin/lobby; id tecnici `jonny` restano per compatibilità |
| Adult fuori dalla ruota Family; 8 settori se 8 giochi | da verificare live sul catalogo server (vedi Ruota) |

---

## Tavola 06 — Lobby display (vista "MONITOR LOBBY")

**Componente:** `HomeLobbyPage.tsx` (route `/home-lobby/:code`).

| Elemento mockup | Codice attuale | Deviazione / nota |
|---|---|---|
| QR grande scannabile | QR gigante "stadium" (H-level, cornice bianca+oro, dim. in vh/vw) | **Fedele / supera** il mockup: scelta deliberata per leggibilità 20–30 m. QR vero da `joinUrl`. |
| Codice partita | codice enorme + `ideagame.it/join` | Fedele. |
| Roster con nome | pill avatar con iniziale + nickname, riga animata | **Deviazione**: mockup mostra griglia di avatar "fotografici" con nome sotto; qui è una riga di pill compatte. Foto giocatore opzionale non resa in lobby (sì sul telefono). |
| Titolo festa ("Compleanno di Giulia") | solo `hostName` in pill 🎤 | **Deviazione**: manca il **titolo evento** prominente. `HomeSession` non espone un campo `title`/`partyName` → aggiunta richiede campo server (fuori scope reskin). |
| Jonny grande che saluta | assente in lobby (presente su monitor gioco) | **Deviazione**: Jonny non è nella lobby display. |
| Pill "giochi in scaletta" nel footer | **MIGLIORATO ORA**: etichette leggibili (`gameLabel`) invece di slug grezzi; durata `Normale/Corta/Lunga` invece di `normal` | Fix presentazione di questo intervento (vedi sotto). |

**Modifica applicata (sicura, build-verificata):** footer lobby → nomi gioco leggibili e durata
tradotta. Nessun handler toccato. COLLAUDO LIVE PENDENTE per il rendering con sessione viva.

---

## Tavola 06/07 — Dispositivi + Ruota + Regia

- **05 Dispositivi / 06 Regia:** flusso d'ingresso e regia già reskinnati su `main` (HomeSetup,
  pannello regia Live). Nav regia Panoramica/Giocatori/Scaletta/Contenuti/Audio/Registro =
  da confrontare live con la vista "REGIA LIVE" del mockup. `COLLAUDO LIVE PENDENTE`.
- **07 Ruota dei giochi:** `HomeGameWheel` (HomeGame.tsx:240) con `WHEEL_ICONS`/`WHEEL_EXTRAS`
  per gli 8 giochi. **Da verificare live:** settori = catalogo server (8 se 8 attivi), Adult
  escluso dalla ruota Family, e che la selezione resti autorità server (display non sceglie).
  La grafica (settori colorati + Jonny al centro) è presente. `COLLAUDO LIVE PENDENTE`.

---

## Tavole 08/09 — Monitor degli 8 giochi

Tutti i tabelloni esistono e hanno le fasi (preparazione→…→risultato). Deviazioni di fedeltà:

| Mockup | Componente | Stato / deviazione |
|---|---|---|
| 15 Quizzone | `QuizzoneBoard` (2682) | **Vicino.** Domanda in box bordato + 4 risposte colorate con lettera + timer + conteggio risposte + CTA reveal. Palette risposte attuale blu/rosa/giallo/verde vs mockup blu/rosso/verde/arancio (scelta palette, non bug). `COLLAUDO LIVE PENDENTE`. |
| 16 Memory (Coppie) | `CoppieBoard` (7095) | Esiste griglia stati coperta/selezionata/abbinata. Dorsi "stella" neutra lato server (regola 04-DECISIONI: il dorso non rivela la coppia) — **verificare live** che il valore non arrivi al client. `COLLAUDO LIVE PENDENTE`. |
| 17 SaraMusica | `SaraMusicaBoard` (5139) / `SaraDuelBoard` | Vinile + waveform + indizio + "ascolta e rispondi dal telefono" presenti. `COLLAUDO LIVE PENDENTE`. |
| 18 Percorso | `PercorsoBoard` (3370) | Tracciato numerato + pedine + missione + "guarda la prova e vota". `COLLAUDO LIVE PENDENTE`. |
| 19 Ballo | `BalloBoard` (3177) + `BalloVideoBg` | VS + timer + stelle + "pubblico pronto a votare". Nessuna misura di energia spacciata per "qualità". `COLLAUDO LIVE PENDENTE`. |
| 20 Parola | `WordBackBoard` (6687) + setup/booking | Parola NASCOSTA sul monitor finché non rivelata (regola spec); variante "parola alle spalle" preservata. `COLLAUDO LIVE PENDENTE`. |
| 21 Karaoke/Freestyle | `KaraokeLiveBoard`/`KaraokeBoard`/`FreestyleBoard`/`FreestyleBattleBoard` | Performance + beat + timer + voto. Testi mockup inventati → in prod solo testi autorizzati. `COLLAUDO LIVE PENDENTE`. |
| 22 Adult | `AdultOnlyBoard` (5637) | Gate 18+, prova facoltativa; niente contenuti espliciti nei materiali demo. `COLLAUDO LIVE PENDENTE`. |

**Chrome condiviso:** `RoundBoard` (2534) dispaccia i board; `AutoFitBoard` (2493) scala a
`BOARD_DESIGN_WIDTH=1180` senza scroll (fix "tasti TV tagliati" già su `main`). Striscia
classifica giocatori + Jonny = resi dentro i singoli board / wrapper monitor.

---

## Tavole 07/10 — Telefono

| Mockup | Componente | Stato / deviazione |
|---|---|---|
| 09 Accesso | `HomeJoinInner` (119) | Codice + Entra + QR. `COLLAUDO LIVE PENDENTE`. |
| 10 Profilo | `HomeJoinInner` (selezione nome+colore, foto opzionale) | Presente. `COLLAUDO LIVE PENDENTE`. |
| 11 Lobby telefono | `HomeJoinInner` | Nome + connesso + conteggio + attesa. `COLLAUDO LIVE PENDENTE`. |
| 12 Quiz | `QuizController`/`QuizzoneController` | 4 opzioni A/B/C/D colorate + conferma. `COLLAUDO LIVE PENDENTE`. |
| 13 Risposta inviata | stato invio in `QuizController` | Stato "inviata/in attesa soluzione" presente. `COLLAUDO LIVE PENDENTE`. |
| 14 Esito | reveal controller | Delta + totale + posizione. `COLLAUDO LIVE PENDENTE`. |
| 23 Memory tel | `CoppieController` (2298) | Griglia + turno; valore privato lato server. `COLLAUDO LIVE PENDENTE`. |
| 24 Musica tel | `SaraMusicaController` (4295) | Ascolta + opzioni + conferma; niente autoplay in concorrenza con la sala. `COLLAUDO LIVE PENDENTE`. |
| 25 Suggeritore (Parola) | `WordBackController`/`WordBackBookingPhone` | **Tieni-premuto-per-vedere** la parola privata (regola: nascosta fino al gesto). `COLLAUDO LIVE PENDENTE`. |
| 26 Voto | `PercorsoVotePanel` (2517) | Voti segreti fino a chiusura (regola spec). `COLLAUDO LIVE PENDENTE`. |
| 27 Permessi (Ballo) | `BalloController` permessi sensore | "Usa movimento del telefono" + "Voto del pubblico" alternativo; micro/camera non obbligatori. `COLLAUDO LIVE PENDENTE`. |
| 28 Riconnessione | gestione disconnessione HomeJoin | "Risposte conservate" + "timer continua" + Riprova. `COLLAUDO LIVE PENDENTE`. |

**Nota mockup (04-DECISIONI):** i telefoni nelle tavole sono a volte tagliati; qui va usata
viewport piena con safe area (già `≥360px`, tap target `≥48px` da spec). Da verificare live.

---

## Tavola 12 — Admin (1 template, non 36 schermi)

**Componente:** `AdminLayout.tsx` — **shell unica** applicata da tutte le pagine `admin/*`
(Dashboard, Games, Quizzes, Media, Teams, Tenants, Billing, Users, Settings, System, …).

| Elemento mockup | Codice | Deviazione |
|---|---|---|
| Sidebar sx con nav (Dashboard/Giocatori/Contenuti/Audio e Jonny/Accessi) | `ADMIN_NAV` filtrato per ruolo + icone lucide | Fedele come struttura; etichette da `ADMIN_NAV`. |
| Logo + wordmark in alto | `logo.png` reale + "Johhy's World / Admin Console" | Fedele (logo reale, non alterato). Mockup disegna un wordmark "IDEAGAME": **non** replicato col testo per rispettare la regola "logo reale, mai alterarlo". |
| Header pagina: numero + titolo + chip "Evento attivo" + azione | `AdminLayout` header con titolo + `LocaleSwitcher`; chip evento/azioni sono per-pagina | **Deviazione**: la chip "Evento attivo" e l'azione destra non sono nello shell comune (ogni pagina le mette se serve). |
| Tema dark + accenti oro | token semantici (`bg-sidebar`, `hover-elevate`, `primary`) | Fedele via design tokens. |

**Esito admin:** il "1 template fedele" richiesto **esiste già** (`AdminLayout`). Nessuna
riscrittura: le deviazioni sopra sono per QA di Andrea. `COLLAUDO LIVE PENDENTE` per le singole
pagine che richiedono dati reali.

---

## Riepilogo deviazioni aperte (per QA Andrea)

1. Lobby: titolo evento prominente assente (serve campo server) + roster a pill vs griglia-foto + Jonny assente in lobby.
2. Quizzone monitor: palette risposte diversa dal mockup (scelta, non bug).
3. Admin: chip "Evento attivo"/azione non nello shell comune; wordmark testo non replicato (logo reale per regola).
4. Tutte le schermate backend-driven: **collaudo a schermo pendente** (ambiente senza DB/secrets).

Nessuna di queste è stata "corretta silenziosamente": restano decisioni visive per Andrea.

# ACCETTAZIONE — IDEAgame "giochi rotti" (6 bug di Andrea)

Runtime unico = **Home**. Display/TV = `artifacts/ideagame/src/pages/HomeGame.tsx`;
telefono = `artifacts/ideagame/src/pages/HomeJoin.tsx`; backend = `artifacts/api-server/src/routes/home.ts`
(+ `lib/saramusica-generator.ts`, `lib/saramusica-shuffle.ts`).

## Stato cancello "FUNZIONANTE-DAVVERO"

- **tsc exit 0** su entrambi i pacchetti:
  - `cd artifacts/ideagame && node <wt>/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0
  - `cd artifacts/api-server && node <wt>/.../tsc --noEmit -p tsconfig.json` → 0
- **Test d'integrazione (logica reale, non mock a vuoto)** — `node --test`:
  - `artifacts/api-server/src/lib/saramusica-shuffle.test.ts` → 6/6 pass (riproduce "risposta sempre A")
  - `artifacts/ideagame/src/lib/fitScale.test.ts` → 6/6 pass (riproduce "tasti TV tagliati")
- **LIMITE DI COLLAUDO DICHIARATO (importante):** in questo ambiente **NON esiste un backend
  avviabile**: manca `DATABASE_URL` e non c'è un Postgres locale (né `psql`/`postgres`), e non
  ci sono `OPENAI_API_KEY`/`SUNO_API_KEY` in `~/.config/ideaphoto/secrets.env` (solo MESHY).
  Quindi `HomeGame` a `/home` reindirizza alla landing senza sessione e **i tabelloni veri non
  sono renderizzabili a video qui**. Il collaudo "guidare UI vera + backend vero su TV/telefono"
  va fatto da Andrea in Replit (o in locale con DB+secrets). Sotto, per ogni bug, i **passi live
  esatti**. Ciò che è collaudabile senza backend (tsc, test di logica, render del guscio frontend,
  assenza di errori di compilazione nel browser) è stato verificato.

---

## Bug 1 — TV smart: spariscono i tasti IN BASSO (ingiocabile)

- **Sintomo (Andrea):** dal browser della TV i pulsanti in basso del tabellone spariscono → gioco inservibile.
- **Causa (radice):** `artifacts/ideagame/src/pages/HomeGame.tsx` — il contenitore del tabellone applicava
  `zoom: tvZoom` con `tvZoom = Math.min(1.5, Math.max(1, vw/1180))`, cioè uno zoom calcolato **solo sulla
  larghezza** (1.5x su una TV 1920px) tramite la proprietà **non-standard `zoom`** (resa incoerente sui
  browser TV Tizen/WebOS), dentro un box `items-center ... overflow-auto`. A 1.5x il tabellone diventa più
  **alto** dello schermo; essendo centrato e senza scroll col telecomando, il fondo (dove stanno i pulsanti
  del gioco) finisce fuori area.
- **Fix:** nuovo componente **`AutoFitBoard`** (HomeGame.tsx) che scala il tabellone con **`transform: scale`**
  (supportato ovunque) calcolando il fattore sul **MIN fra rapporto di larghezza E di altezza** → il contenuto
  rientra SEMPRE in entrambe le dimensioni; i tabelloni piccoli vengono comunque ingranditi (fino a 1.5x) per
  riempire la TV. Logica pura estratta in `artifacts/ideagame/src/lib/fitScale.ts` (`computeFitScale`) e testata.
  Rimosso `tvZoom`/`zoom`.
- **Verifica senza backend (fatta):** `node --test artifacts/ideagame/src/lib/fitScale.test.ts` — il test
  riproduce il vecchio comportamento (950px * 1.5 = 1425 > 1080 → tasti tagliati) e prova che `computeFitScale`
  tiene `natH*scale <= boxH` su 1920×1080 e 1280×720.
- **Verifica LIVE (Andrea):** apri la TV al tabellone di ogni gioco a viewport 1920×1080 e 1280×720; conferma
  che SPIN / Avanti / Fine gioco / i pulsanti di risposta e i CTA in basso siano **sempre interamente visibili**,
  nessun overflow che tagli i controlli.

## Bug 2 — Freestyle: non valida davvero accendendo il microfono

- **Sintomo:** il microfono del giocatore non si attiva / non valida; nulla si riflette sul server.
- **Causa (radice):**
  1. Gioco freestyle (mode `home-freestyle`): `FreestyleController` (`HomeJoin.tsx`) riceveva solo
     `payload`+`timeLeft`, al più apriva lo **SpeechRecognition** (assente su iPhone/WebKit) e accendeva un
     pallino **LOCALE** (`setRecognized`) senza **mai** fare POST al server. Nessun `getUserMedia`/Web Audio,
     nessun endpoint lato server. La TV assegnava i punti a mano.
  2. Freestyle Battle v3 (`karaoke-battle`): il rapper usava SOLO SpeechRecognition; su iPhone l'effetto usciva
     subito (`if (!SR) return`) e **il microfono non si accendeva mai**.
- **Fix:**
  - `FreestyleController` ora riceve `sessionId`/`playerId`, accende il **microfono VERO**
    (`navigator.mediaDevices.getUserMedia` + `AudioContext`/`AnalyserNode`), misura la **voce sostenuta
    (volume × durata, soglia 20/100 per ≥3s)** e chiama il nuovo **`POST /home/sessions/:id/freestyle/validate`**.
    SpeechRecognition resta solo come scorciatoia opzionale dove esiste.
  - Server (`home.ts`): nuovo endpoint `freestyle/validate` (anti-cheat sul timer, idempotente) che registra il
    giocatore in `roundPayload.validatedPlayers` e **ribombarda lo stato** + evento `home:freestyle_validated`.
  - TV (`FreestyleBoard`): mostra 🎤/✓ accanto a chi ha **validato col microfono**.
  - Battle v3: microfono reale col **misuratore di livello su OGNI telefono** (iPhone compresi) + testo onesto
    (dove manca SR, le parole le conferma il pubblico); la validazione parola-per-parola via SR resta dov'è.
- **Verifica LIVE (Andrea):** telefono → gioco Freestyle, premi "Attiva microfono", rappa: la barra livello sale,
  a voce sostenuta la parola diventa ✓ e sulla TV compare 🎤 accanto al tuo nome (POST `/freestyle/validate`
  visibile nei log). Ripeti da **iPhone**: il microfono si accende (prima no).
- **Nota onesta:** la validazione di **quale** parola specifica (battle v3) richiede STT; su iPhone non esiste
  → lì il mic si accende col misuratore ma la parola la confermano gli spettatori (comportamento progettato).

## Bug 3 — Ballo: i giocatori non scelgono MAI

- **Sintomo:** la manche di ballo si chiude subito, nessuno balla, risultato a 0.
- **Causa (radice):** `HomeGame.tsx` — il "backup client" di fine-manche si basava sul timer **globale**
  `timeLeft`, che parte in fase `preparing` e non viene mai riallineato alla manche. Quando l'host premeva
  **VIA!**, `timeLeft` era già 0 → l'effetto chiamava `ballo/finish-manche` **nell'istante** in cui iniziava la
  fase `dancing` → mappa energie vuota, nessuno balla, tutti a 0.
- **Fix:** il backup ora si aggancia al **`danceEndsAt` REALE** della manche (lo stesso usato dal server) e
  scatta DOPO il timer autorevole del server (`ms + 500`), restando solo una rete di sicurezza — mai una
  chiusura anticipata. Durante `preparing`/`get_ready` `danceEndsAt` è null → non parte nulla.
- **Verifica LIVE (Andrea):** avvia Sfida di Ballo, in `get_ready` attendi >30s prima di VIA!; premi VIA! →
  la fase `dancing` dura i 30s pieni, le barre Guitar-Hero salgono mentre i telefoni si muovono, la manche si
  chiude a `danceEndsAt` con vincitore e punti reali (prima: finiva subito a 0).

## Bug 4 — Parole (tabù): resta sempre bloccato

- **Sintomo:** il gioco resta bloccato su "in attesa del prossimo round" per sempre.
- **Causa (radice):** `home.ts` — la rotazione alla manche successiva era schedulata **solo** dopo una risposta
  **corretta** (`enterWordBackBookingPhase` nel path corretto). Le chiusure per **timeout**, **timer scaduto** e
  **3 errori** chiudevano il round (`closeWordBackRoundFailed` → `closed=true`) ma **non** schedulavano mai la
  rotazione. Nel tabù i round non risolti sono la norma → sessione congelata.
- **Fix:** nuovo helper `scheduleWordBackRotation` chiamato nei **3 siti di fallimento** (endpoint
  `wordback-timeout`, ramo 3-errori e ramo timer-scaduto dentro `wordback-correct`). Scatta solo dal path che
  ha **effettivamente** chiuso il round (gli altri vedono `closed` e tornano prima) → nessuna doppia rotazione.
  Companion TV (`HomeGame.tsx`): l'overlay "TEMPO SCADUTO" ora si pulisce anche al cambio di `mode`/`roundIndex`
  (non solo `currentRound`), altrimenti resterebbe appiccicato sulla nuova fase di booking.
- **Verifica LIVE (Andrea):** avvia Parole, prenota i 2 ruoli, lascia scadere il timer senza indovinare (o 3
  errori) → dopo ~3s la sessione passa a `home-wordback-booking` (rotazione coppia) e poi alla parola nuova;
  l'overlay si pulisce. Conferma che la risposta corretta e il tasto "Avanti" dell'host continuino a funzionare.

## Bug 5 — SaraMusica: praticamente ingiocabile

- **Sintomo:** quiz banale (risposta sempre "A"), barabile, spesso senza musica, a volte bloccato.
- **Cause (radice):**
  - **RC1** `lib/saramusica-generator.ts` — nel banco ogni round è scritto con `c: 0` e **nessun percorso
    mescolava** → la risposta giusta era SEMPRE il primo pulsante.
  - **RC2** `home.ts` `redactHomeSession` — `correctAnswerIndex` di ogni domanda veniva **trasmesso a tutti i
    telefoni** dentro `rounds[]` → quiz barabile.
  - **RC3** in demo non si passava il resolver clip → "music quiz" senza musica.
  - **RC4** stati bloccati: se l'anti-ripetizione svuotava il banco (0 round) o se la generazione falliva, la
    sessione restava su "in caricamento"/"generating" per sempre.
- **Fix:**
  - RC1: `shuffleRoundAnswers` (pura, in `lib/saramusica-shuffle.ts`) applicata a banco, round AI e **sagome**.
  - RC2: `redactHomeSession` ora **rimuove `correctAnswerIndex`** dai round di `home-saramusica` nel broadcast
    (la risposta giusta arriva solo al reveal via `revealData.correctAnswerIndex`; i punteggi restano server-side).
  - RC3: in demo si risolvono comunque le clip YouTube reali.
  - RC4b: se l'anti-ripetizione svuota il banco si ricade sul banco pieno (mai 0 round).
  - RC4a: se la generazione fallisce si **recupera dal banco** e si entra in gioco (niente freeze in "generating").
- **Verifica senza backend (fatta):** `node --test artifacts/api-server/src/lib/saramusica-shuffle.test.ts` —
  riproduce "risposta sempre A" sul banco e prova che dopo il fix la giusta si distribuisce ma resta corretta.
- **Verifica LIVE (Andrea, serve DB; RC3 serve anche searchYouTube):** gioca una partita demo → la risposta
  giusta cambia pulsante ogni domanda; ispeziona lo stato socket del telefono → `rounds[].correctAnswerIndex`
  **non è più presente**; con backend+YouTube le clip partono anche in demo.

## Bug 6 — Musica non garantita per ogni gioco

- **Sintomo:** la musica di sottofondo non parte per OGNI gioco.
- **Causa (radice):** `HomeGame.tsx` — nel handler `home:round` l'audio veniva cambiato SOLO per il ballo; i
  giochi che passano dal flow universale (**quizzone**, **saramusica**) non facevano mai ripartire il proprio
  loop e restavano sulla **musica della lobby** per tutta la partita.
- **Fix:** aggiunto un ramo generico in `home:round` che avvia il `round_loop` del gioco corrente via mappa
  `ROUND_MODE_AUDIO_SLUG` (mode→slug). Lo slug corrisponde alla cartella **Suno già committata**
  (`artifacts/ideagame/public/audio/jonny-world/<slug>/round_loop.mp3`); se il file manca l'`AudioManager`
  garantisce comunque il bed procedurale. Riusa la cascata audio esistente (override tenant → file Suno → bed),
  **nessuna nuova pipeline**, nessuna chiamata Suno a vuoto. Ballo (video YouTube) e adult (gestito dal board)
  restano come prima.
- **Verifica LIVE (Andrea):** avvia quizzone e saramusica → parte il loop del gioco (prima restava la lobby).
  Per rigenerare tracce nuove (es. lockdown) serve `scripts/genera-musica-suno.mjs` con `SUNO_API_KEY` (lo lancia
  Andrea: l'harness blocca le chiamate HTTP con la chiave).

---

## File toccati

- `artifacts/ideagame/src/pages/HomeGame.tsx` — AutoFitBoard + computeFitScale (Bug 1); backup ballo su danceEndsAt (Bug 3); audio per-gioco in home:round (Bug 6); overlay-clear Parole (Bug 4 companion); 🎤/✓ Freestyle (Bug 2).
- `artifacts/ideagame/src/pages/HomeJoin.tsx` — FreestyleController mic reale + POST; misuratore mic battle v3 (Bug 2).
- `artifacts/ideagame/src/lib/fitScale.ts` (+ `.test.ts`) — fit-to-screen puro (Bug 1).
- `artifacts/api-server/src/routes/home.ts` — endpoint freestyle/validate (Bug 2); scheduleWordBackRotation ×3 (Bug 4); redact correctAnswerIndex + demo clip + guardie RC4 (Bug 5).
- `artifacts/api-server/src/lib/saramusica-generator.ts` — shuffle su banco/AI/sagome (Bug 5).
- `artifacts/api-server/src/lib/saramusica-shuffle.ts` (+ `.test.ts`) — shuffle puro riusabile (Bug 5).

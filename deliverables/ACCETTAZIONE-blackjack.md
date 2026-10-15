<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# Blackjack — ACCETTAZIONE

Viste: `BlackjackMonitor`, `BlackjackPhone`, `BlackjackRegia`, `BlackjackTablesView`
(`artifacts/ideagame/src/pages/GestioneBlackjack.tsx`). Motore soldi invariato
(`artifacts/api-server/src/routes/gestione-casino.ts`). **QA finale = Andrea. NON mergiato.**

## A. Verificato in isolamento (render reale, backend stubbato)

Harness `bj-harness.html` + `src/bjHarness.tsx` (stub di `window.fetch` con stato
deterministico per fase) — **file di solo collaudo, rimossi prima del commit**. Render
guardato a video, viste affiancate ai mockup.

### Fedeltà (compare.mjs --regions --blur 4, mockup dipinti)

| Vista | Altezza pagina | Spostamento zone costruite in codice | Note |
|---|---|---|---|
| Monitor ATTESA | 407 vs 407 (+0px) | logo/title/tavolo/players/status = **—** (0) | qr/codeblk/seats: diff dato da QR a dati diversi + avatar placeholder + € omesso |
| Monitor PARTITA | 407 vs 407 (+0px) | logo/banco/phone/turn = **—** (0); seats x8 y4 | scostamento seats sub-10px = cornice oro dipinta + volti/carte diversi |
| Monitor RISULTATI | 407 vs 407 (+0px) | banner/logo/banco/next = **—** (0); seats x-6 y0 | come sopra |

Percentuale percettiva 42–82%: **pavimento fisiologico** del dipinto reso in CSS pulito
(panno/oro/marmo) + QR/volti differenti. Nessuno scostamento di layout.

### Salute (health.mjs — desktop/tablet/mobile)

- `phone-04-turno` → **exit 0**, nessun errore.
- `monitor-attesa` → **exit 0** (1 avviso falso positivo: legge il testo del `<style>` inline).
- `phone-06-risultato` → **exit 0**.

### Viewport / niente tasti persi

- **TV 1920×1080 e 1280×720**: i 3 monitor riempiono lo schermo (palco fisso scalato,
  letterbox), nessun pannello tagliato.
- **Telefono 390×844 e 360×640**: su `phone-04-turno` i tre tasti **CARTA / STAI /
  RADDOPPIA** restano interamente visibili in basso anche a 360×640; `Entra`,
  `Conferma posto`, `Conferma puntata`, `Prossima mano` sempre visibili.

### Corrispondenza stato→vista (telefono)

accesso (no player) · scegli-posto (player senza seat) · fai-la-puntata (betting) ·
puntata-confermata (status bet) · è-il-tuo-turno (playing, activeSeat=me) · turno-di-X +
«Hai scelto STAI» (playing, altro seat) · esito HAI VINTO/PERSO (result). Tutte rese
correttamente dallo stato del server.

### tsc (exit code)

- Frontend `artifacts/ideagame/tsconfig.json` → **exit=0**
- Backend `artifacts/api-server/tsconfig.json` → **exit=0**

## B. Da collaudare LIVE con backend (serve il motore acceso) — QA Andrea

Flusso completo su un tavolo reale (`＋ Blackjack` dalla Gestione Casino → regia/monitor/telefono):

1. **Creazione tavolo** (`POST …/sessions/:id/bj-tables`) → appare in `BlackjackTablesView`.
2. **Apri puntate** (regia `…/bj/open`) → monitor passa a «Puntate aperte», telefono mostra
   il chooser puntata col countdown `betEndsAt`.
3. **Puntata** (`…/bj/bet`): addebito differenziale atomico; `Modifica puntata`
   (`…/bj/unbet`) rimborsa. Verificare saldo e che `amount` fuori range sia rifiutato.
4. **Distribuisci** (regia `…/bj/deal` o auto-deal del monitor alla scadenza se c'è almeno
   una puntata): 2 carte a testa, 1 scoperta banco + coperta nascosta; peek dealer-BJ.
5. **Turni** (`…/bj/hit` / `…/bj/stand` / `…/bj/double`): solo il seat attivo agisce; il
   timeout turno forza STAI lato server; il raddoppio addebita e dà **una sola** carta.
6. **Chiusura mano** (`finishBjHand`): banco pesca ≤16 / soft17 opzionale, esiti e
   accrediti **atomici** (saldo+ledger nella stessa tx), storicizzazione.
7. **Idempotenza soldi** (`settledHand === round`): doppio deal/doppia chiusura NON ripagano
   (vedi `gestione-casino-atomic-lib.test.ts`). Confermare che il saldo non cresca a doppie
   richieste concorrenti.
8. **Esito monitor/telefono**: VINTO +X / PERSO −X / BLACKJACK 3:2 / PARI coerenti col saldo.
9. **Nuova mano** (`…/bj/open` con `round+1`, reshuffle sotto il 25%).
10. **Sospendi/riattiva** tavolo (`…/bj/suspend`): il telefono mostra «Tavolo sospeso».

## C. Vincoli rispettati

- Logica soldi e idempotenza **non riscritte**.
- Non toccati roulette/sicilia/sprint/ippodromo.
- `pnpm-lock.yaml` / `pnpm-workspace.yaml` **non toccati**.
- Nessun deploy. Intestazione di paternità sui file nuovi.

<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# Ippodromo Sprint — NOTE di progresso

Agente dedicato, worktree isolato. NO deploy/publish. NON toccati pnpm-lock /
pnpm-workspace. NON mergiato (QA di Andrea).

## FATTO

### Backend (motore autorevole, modalità distinta)
- `artifacts/api-server/src/routes/gestione-sprint-engine.ts` — porting FEDELE di
  `demo/engine.mjs`: HORSES (catalogo unico), RULES (600 m, ostacoli 120/240/360/480,
  sprint energia/costo/cooldown, 4 salti, countdown 3s, punti 100…10), `fresh/action/
  step/jumpHeight/publicState` identici alla demo + `projectRace()` che RICOSTRUISCE la
  corsa a passo fisso (20 Hz) da piloti + log input. Arrivo per tempo interpolato dei
  600 m. Nessun ordine predeciso, nessun controllo privilegiato del vincitore.
- `artifacts/api-server/src/routes/gestione-sprint-engine.test.ts` — 12 test `node:test`
  VERDI (vedi output nel report): partenza/countdown, pronti, sprint/energia/cooldown,
  salto, collisione unica, salto riuscito, pausa, finale CPU, snapshot senza token,
  determinismo/stabilità di projectRace, "più sprint = più veloce", snapToGrid.
- Rotte in `gestione-casino.ts` (sezione IPPODROMO SPRINT): stato in `config.sprintTables`
  (jsonb, niente migrazioni). Stato ricostruito a ogni lettura (no tick 20 Hz sul DB).
  Rotte: `sprint-tables` (POST crea / GET elenco), `sprint/:code`, `sprint/start`,
  `/pause`, `/resume`, `/reset` (nuova gara, conserva piloti), `/settings`, `/suspend`,
  `/join` (atomico esclusivo), `/leave`, `/ready`, `/input` (SPRINT/SALTA, idempotente
  via commandId, attore dal playerCode, validato contro lo stato ricostruito). CPU
  riempie i posti liberi (etichettati CPU). NESSUNA quota 6×, NESSUN accredito economico.

### Frontend (3 viste)
- `artifacts/ideagame/src/pages/GestioneIppodromoSprint.tsx`:
  - **Monitor 80″** (`?sprint=CODE&host=1`): palco fisso su clean-plate, rig 2D animato
    in canvas (porting di horse-rig.js), camera laterale, 6 corsie, cancello, 4 ostacoli,
    traguardo; overlay lobby (6 card) / countdown / corsa (POSIZIONE + DISTANZA) /
    risultati; logo ORIGINALE. **Verificato a schermo** (vedi report).
  - **Telefono** (`?sprintplay=CODE`): scelta cavallo → pronto → controller SPRINT/SALTA
    (energia, distanza ostacolo, posizione, cue salto), pointerdown senza auto-fire,
    idempotenza commandId, schermo "connessione persa", risultati.
  - **Regia** (`?sprintregia=CODE`): tabella piloti/progresso/energia, AVVIA/PAUSA/
    RIPRENDI/NUOVA GARA, QR piloti, link monitor; mostra config EFFETTIVA (correzioni).
- Integrazione in `GestioneCasino.tsx`: dispatch `?sprint/?sprintplay/?sprintregia`,
  bottone Master "＋ Ippodromo Sprint", riga tavolo (80″/Regia), voce nel picker telefono.

### Asset copiati (solo il necessario) → `artifacts/ideagame/public/ippodromo-sprint/`
- `scenario/stadio-pulito.png` (clean-plate), `logo/idea-eventi-negativo-originale.png`
  (SHA verificato), `font/Cinzel-Variable.ttf` + `Lora-Variable.ttf`, `ui/` (titolo +
  icone sprint/salto). Rig NON copiato come SVG: è in codice.

### Gate
- `tsc` frontend exit 0 · `tsc` backend exit 0 · 12 test motore verdi · monitor verificato.
- Header di paternità su ogni file nuovo (JS/TS/CSS + HTML/MD).

## DA FARE (QA / integrazione, come da 04-COLLAUDO)
- Collaudo FISICO su 6 telefoni + monitor 80″ su WiFi reale (lag/reconnect, due pollici).
- Eventuale ledger punti serata (ora i punti sono SOLO mostrati, nessun accredito — scelta
  della modalità). Timeout/ritiro gara, parità con tolleranza, overload/tick-catchup se si
  passasse a un tick server reale.
- Rifinitura visiva del rig (resta 2D stilizzato: per resa realistica serve la filiera
  asset di `02-FILIERA`, fuori dal contenuto del kit).

## Nota tecnica worktree
Il worktree non ha `node_modules` (pnpm per-pacchetto): per typecheck/test ho creato
symlink `node_modules` → checkout principale (git-ignored, non tracciati, non toccano i
manifest). Rimuovibili senza effetti.

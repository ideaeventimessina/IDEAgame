<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# ACCETTAZIONE — IDEAgame grafica finale (reskin flusso principale)

Worktree isolato `agent-a91e55dab7446f9b8`, base `main` HEAD `10c0261`. **NO deploy, NO merge**
(QA di Andrea). Regola ferrea rispettata: **reskin/presentazione**, nessun handler/endpoint/
evento/regola di gioco toccato.

## Cancello FUNZIONANTE-DAVVERO (verificato)

- **tsc** `cd artifacts/ideagame && node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → **exit 0** (baseline e dopo le modifiche).
- **vite build** `cd artifacts/ideagame && node node_modules/vite/bin/vite.js build --config vite.config.ts` → **exit 0** (~9 s; tutti i chunk, incl. `HomeGame`, `HomeJoin`, `HomeLobbyPage`, generati).
- Nota ambiente: il worktree non ha `node_modules` (workspace pnpm). Per build/tsc qui ho
  **symlinkato** `node_modules` dal repo principale (`node_modules` e `artifacts/ideagame/node_modules`).
  I symlink NON sono tracciati e NON vanno committati. **Su Replit serve `pnpm install`** (il
  `pnpm-lock.yaml` non è stato rigenerato: nessuna dipendenza aggiunta).

## LIMITE DI COLLAUDO (dichiarato)

In questo ambiente **non c'è un backend avviabile** (manca `DATABASE_URL`, niente Postgres
locale, niente secrets di sessione) — identico a quanto già scritto in
`deliverables/ACCETTAZIONE-ideagame.md`. Conseguenza: `HomeGame`/`HomeJoin`/`HomeLobbyPage`
hanno bisogno di una **sessione Home viva** con payload reali per renderizzare i tabelloni e i
controller. Quindi la **critica visiva a schermo (loop screenshot di mockup-replica/produzione)
non è eseguibile qui**: il confronto a video resta da fare da Andrea su Replit/locale.
Ciò che È verificabile senza backend (tsc, vite build, correttezza di compilazione,
coerenza delle stringhe/etichette) è stato verificato.

## Cosa è stato fatto in questo intervento

1. **Audit di fedeltà completo** mockup 05–12 (36 viste) ↔ componenti vivi →
   `design/DEVIATIONS-ideagame-grafica.md` (mappa per pannello + deviazioni aperte per QA).
2. **Verifica correzioni di spec (04-DECISIONI):** Coppie=Memory, Ballo=Movimento (non
   "qualità"), brand=IDEAeventi, personaggio=Johhy → **già applicate** nel codice su `main`.
3. **Fix presentazione lobby (sicuro, build-verificato):** `HomeLobbyPage.tsx` — i pill dei
   giochi in scaletta mostrano nomi leggibili (`gameLabel`: "Coppie", "SaraMusica", …) invece
   degli slug grezzi ("gioco coppie"); durata tradotta ("Normale/Corta/Lunga" invece di
   "normal"). Solo stringhe di presentazione: **nessun handler/endpoint toccato**, il valore
   resta lo slug server. `COLLAUDO LIVE PENDENTE` per il rendering con sessione viva.

## Cosa NON è stato fatto (per scelta di sicurezza) e perché

- **Nessuna riscrittura dei tabelloni** (`HomeGame.tsx` ~460 KB, `HomeJoin.tsx` ~363 KB, LIVE):
  sono già implementati e contengono i fix funzionali dei 6 giochi; non sono renderizzabili qui
  per la critica visiva; la regola di progetto è "mai merge visivo senza ok di Andrea". Le
  deviazioni di fedeltà sono elencate, non applicate alla cieca.
- **Nessun campo server nuovo** (es. titolo festa in lobby): sarebbe fuori dal perimetro reskin.

## Stato per schermata (sintesi)

| Area | Componente | Esiste | Build | Collaudo video |
|---|---|---|---|---|
| Lobby display | `HomeLobbyPage` | sì | OK | **pendente (live)** |
| Ruota giochi | `HomeGameWheel` | sì | OK | **pendente (live)** |
| Monitor 8 giochi | `*Board` in `HomeGame` | sì | OK | **pendente (live)** |
| Telefono (ingresso+giochi) | `*Controller` in `HomeJoin` | sì | OK | **pendente (live)** |
| Admin (1 template) | `AdminLayout` + `admin/*` | sì | OK | **pendente (live)** |

## Passi di collaudo live per Andrea (Replit/locale con DB+secrets)

1. `pnpm install` nel repo (rigenera `node_modules`; i symlink di questo worktree non servono lì).
2. Avvia backend + frontend con DB e secrets; crea una sessione Home con ≥2 giocatori.
3. Monitor/TV a **1920×1080 e 1280×720**: verifica che **nessun tasto sparisca in basso** su
   ogni gioco (AutoFitBoard) e che Jonny/striscia classifica siano leggibili.
4. Telefono (≥360px): ingresso, quiz invio/esito, memory, musica, parola (tieni-premuto),
   voto segreto, permessi ballo (movimento + voto pubblico), riconnessione.
5. Ruota: 8 settori se 8 giochi attivi, Adult fuori dalla ruota Family, selezione = autorità server.
6. Admin: shell coerente su tutte le pagine, ruoli/permessi invariati.
7. Confronta a schermo con `01-ideagame/06–12*.png` e spunta/riapri le deviazioni in
   `design/DEVIATIONS-ideagame-grafica.md`.

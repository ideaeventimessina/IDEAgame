# REPORT — Atomicità e persistenza di saldi/fiche (Modalità Gestione)

Analisi statica di `artifacts/api-server/src/routes/gestione-casino.ts` e
`artifacts/api-server/src/routes/gestione-burraco.ts`.
**Nessuna logica dei soldi è stata modificata** (serve conferma prima di toccarla):
questo documento elenca solo dove le operazioni su saldo/fiche e sui punteggi NON
sono atomiche/persistenti e dove un restart o due richieste concorrenti possono
corrompere lo stato.

Data analisi: 2026-10-14 · ramo `main` (worktree isolato).

---

## 0. Il problema di fondo (vale per TUTTO il casinò)

Il saldo vive in Postgres (`casinoPlayersTable.fishBalance` + ledger
`casinoTransactionsTable`), **ma lo stato di gioco** (puntate sul tappeto, fase del
tavolo, shoe del blackjack, ecc.) vive nel **jsonb `casinoSessionsTable.config`**,
salvato con `saveGameTable` / `saveBjTable` / `saveHorseTable` / `saveSiciliaTable`.

Nessuna delle operazioni di denaro usa `db.transaction(...)`. In tutto il file
**ogni movimento è una coppia (o tripla) di `await` separati**:

1. `db.update(casinoPlayersTable).set({ fishBalance })` — muove il saldo
2. `db.insert(casinoTransactionsTable)` — scrive il ledger
3. `saveGameTable(...)` — persiste lo stato di gioco (store diverso: jsonb)

Un crash/kill/deploy fra due qualsiasi di questi passi lascia lo stato
**incoerente**, e nessuna di queste operazioni è protetta contro la concorrenza.

### 0a. Pattern ricorrente #1 — update saldo + insert ledger NON atomici
`fishBalance` viene aggiornato e il ledger inserito in due istruzioni separate.
Crash fra le due → il saldo si muove **senza riga di ledger** (audit trail
incompleto, impossibile ricostruire la cassa). Siti:

| Operazione | File:riga (update saldo → insert ledger) |
|---|---|
| Roulette — puntata (escrow) | `gestione-casino.ts:425` → `:426` |
| Roulette — annulla puntata | `gestione-casino.ts:449` → `:450` |
| Roulette — pagamento vincite | `gestione-casino.ts:476` → `:477` |
| Blackjack — paga mano (win/push) | `gestione-casino.ts:638` → `:639` |
| Blackjack — puntata | `gestione-casino.ts:796` → `:797` |
| Blackjack — toglie puntata | `gestione-casino.ts:810` → `:811` |
| Blackjack — double | `gestione-casino.ts:853` → `:854` |
| Ippodromo — pagamento vincite | `gestione-casino.ts:961` → `:962` |
| Ippodromo — annullo/rimborso corsa | `gestione-casino.ts:1073` → `:1074` |
| Ippodromo — puntata | `gestione-casino.ts:1107` → `:1108` |
| Ippodromo — toglie puntata | `gestione-casino.ts:1129` → `:1130` |
| Cassa (dealer add/remove fiche) | `gestione-casino.ts:268` → `:269` |

**Rischio:** saldo e ledger divergono su crash; la cassa (`cassaTotale`,
`gestione-casino.ts:65`) resta corretta perché somma `fishBalance`, ma il ledger
non quadra più → impossibile audit/rimborso corretto.

### 0b. Pattern ricorrente #2 — read-modify-write del saldo (race / lost update)
Ovunque il saldo si calcola in JS: `select fishBalance` → `nb = fishBalance ± x`
→ `update set fishBalance = nb`. Due richieste concorrenti sullo stesso giocatore
leggono lo stesso saldo di partenza e l'ultima sovrascrive la prima → **fiche
create o distrutte dal nulla**.

Esempi: `gestione-casino.ts:266`, `:424`, `:448`, `:475`, `:637`, `:795`, `:852`,
`:960`, `:1072`, `:1106`, `:1128`.

**Fix consigliato (da confermare):** aggiornamento condizionale/atomico in SQL,
es. `set({ fishBalance: sql\`${fishBalance} + ${delta}\` })` con
`WHERE fishBalance >= amount` per le uscite, e verificare il numero di righe
aggiornate invece di rileggere.

### 0c. Pattern ricorrente #3 — saldo (DB) e puntata (jsonb) in store diversi
La puntata viene scalata dal saldo (DB) **prima** di essere scritta nel tavolo
(jsonb) con `saveGameTable`. Crash in mezzo → fiche già tolte al giocatore ma la
puntata **non** è sul tavolo: alla girata non viene pagata → **fiche perse**.

- Roulette puntata: saldo scalato `:424-426`, `table.bets.push` `:427`, persistito solo a `:428`.
- Analogo per blackjack (`:796` vs `saveBjTable`) e ippodromo (`:1107` vs `saveHorseTable`).

---

## 1. Roulette — `POST /gestione/casino/table/spin` (`gestione-casino.ts:459`)

- `:465` l'esito usa ora `randomInt(37)` (RNG crittografico — **corretto in questo intervento**).
- `:470-480` ciclo di pagamento: per ogni vincitore una coppia update+insert
  separata, **in loop, senza transazione**. Crash a metà loop → alcuni vincitori
  pagati, altri no.
- `:481` `saveGameTable` imposta `phase="result"` **dopo** aver pagato tutti.
  **Non idempotente:** se il processo muore dopo i pagamenti (`:480`) ma prima di
  `:481`, il tavolo resta `phase="betting"` e una seconda chiamata a `/spin`
  **ripaga di nuovo tutte le vincite** (doppio payout). Non c'è token idempotente
  come in `sicilia/draw`.
- **Priorità: ALTA** (doppio pagamento reale su restart).

---

## 2. Blackjack — `finishBjHand` (`gestione-casino.ts:~620-647`)

- `:636-641` paga ogni sedia con update+insert separati in loop; `p.fishBalance`
  aggiornato solo in memoria (`:640`).
- `phase="result"` impostato a `:646` **in memoria**; la persistenza avviene nel
  chiamante (`advanceBj` → `saveBjTable`). Crash fra i pagamenti e il salvataggio
  del tavolo → mano pagata ma `phase` ancora `dealer/playing` persistito →
  **ri-risoluzione e doppio pagamento**.
- `double` (`:851-854`): controlla `fishBalance < bet` (`:851`) poi scala (`:852-853`)
  — TOCTOU, scala il saldo senza transazione.
- **Priorità: ALTA.**

---

## 3. Ippodromo — `settleHorse` (`:949`) e `horse/cancel` (`:1057`)

- `settleHorse` `:956-964`: pagamenti in loop, update+insert separati, nessuna
  transazione; stato salvato dal chiamante → stessa finestra di doppio pagamento
  su restart.
- `horse/cancel` `:1064` il commento dice *"rimborso atomico … una sola volta"*
  ma **non lo è**: `:1069-1078` rimborsa in loop (update+insert separati) e
  l'idempotenza si fonda solo su `t.bets=[]` salvato a `:1081-1082` **dopo** tutti
  i rimborsi. Crash prima di `:1082` → `t.bets` ancora pieno nel jsonb → seconda
  `/cancel` **rimborsa due volte**.
- **Priorità: ALTA** (la promessa "atomico/una sola volta" non è mantenuta).

---

## 4. Cassa dealer — `gestione-casino.ts:~260-278`

- `:266` read-modify-write del saldo; `:267` guard `newBalance < 0`; `:268` update;
  `:269` insert ledger. Non atomico e soggetto a race (accredito/addebito manuale
  concorrente). **Priorità: MEDIA.**

---

## 5. `saveGameTable` / `saveBjTable` / `saveHorseTable` / `saveSiciliaTable`
(`gestione-casino.ts:331-335`, e gemelli `:1172-1176`, ecc.)

- Sono **read-modify-write dell'intero `config` jsonb della serata**: `select config`
  → merge di UN tavolo → `update config`. Due operazioni concorrenti su **tavoli
  diversi della stessa serata** (es. due dealer, o il timer del blackjack +
  una puntata) leggono lo stesso `config` e l'ultima `update` **sovrascrive** le
  modifiche dell'altra → puntate/sedie/fasi di un tavolo **perse silenziosamente**,
  e con esse l'allineamento con le fiche già scalate.
- **Priorità: ALTA** (è l'unico punto di persistenza dello stato di gioco e non è
  concorrenza-safe). Fix: aggiornamento jsonb mirato lato SQL (`jsonb_set`) o
  lock ottimistico sul `config`.

---

## 6. Corsa Siciliana — nessun rischio di denaro

`sicilia/bet` (`:1281`) e `unbet` (`:1296`) **non toccano `fishBalance` né il
ledger**: è una previsione del seme, senza fiche in gioco. Nessun payout. Da
segnalare solo perché a differenza degli altri tavoli non ha economia.
**Nota positiva:** `sicilia/draw` (`:1249`) implementa **idempotenza via
`lastToken`** — è il pattern da replicare su `spin`, `finishBjHand`, `settleHorse`.

---

## 7. Burraco — idempotenza invii punteggi (`gestione-burraco.ts`)

### 7a. `POST /gestione/burraco/assignments/:assignmentId/score` (`:154`)
- Guard idempotenza: legge `a.submitted` (`:158`), rifiuta se già `true` (`:160`),
  poi imposta `submitted:true` (`:163`).
- **TOCTOU / race (`:158` → `:160` → `:163`):** due invii concorrenti della stessa
  manche leggono entrambi `submitted=false`, passano entrambi il guard e
  **applicano i punteggi due volte** (`addToPair` chiamato due volte). Il flag non
  è un `UPDATE ... WHERE submitted=false` atomico, quindi non protegge davvero.
- **Non atomico su più tabelle (`:163`, `:164`, `:165`):** aggiorna l'assignment +
  due `addToPair`, 4 scritture separate senza transazione. Crash dopo `:163`
  (submitted=true) ma prima/dentro gli `addToPair` → la manche risulta inviata ma i
  totali coppia **non** sono incrementati; il guard `:160` **blocca per sempre** il
  reinvio → **punteggi persi in modo definitivo**.
- **Priorità: ALTA.**

### 7b. `addToPair` (`:170-173`)
- Read-modify-write: `select totalScore` (`:171`) → `update totalScore = p.totalScore + delta`
  (`:172`). Non atomico: due manche che aggiornano la stessa coppia in parallelo →
  lost update. Fix: `set({ totalScore: sql\`${totalScore} + ${delta}\` })`.
- **Priorità: MEDIA.**

### 7c. `generate-round` (`:113-148`)
- `:146` insert degli assignment + `:148` update sessione: due operazioni, nessuna
  transazione. Crash in mezzo → round generato ma sessione non avanzata (o
  viceversa). **Priorità: MEDIA.**

---

## Raccomandazione sintetica (NON applicata — serve conferma)

1. Avvolgere ogni movimento di fiche/punteggio in `db.transaction(...)` così che
   *update saldo + insert ledger + save stato* siano un'unità atomica.
2. Sostituire i read-modify-write con update atomici SQL
   (`fishBalance = fishBalance + delta`, con `WHERE` per le uscite).
3. Rendere idempotenti `spin` / `finishBjHand` / `settleHorse` / `horse-cancel` con
   un token di manche (come già fa `sicilia/draw`).
4. Nel burraco, rendere il guard un `UPDATE ... WHERE submitted=false RETURNING`
   e applicare i delta nella stessa transazione.
5. Per `save*Table`, usare update jsonb mirati o un lock ottimistico sul `config`
   per eliminare la sovrascrittura fra tavoli della stessa serata.

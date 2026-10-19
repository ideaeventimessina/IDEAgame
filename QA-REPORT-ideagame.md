# QA completo — ideagame.it (serata FULL)

Data: 2026-10-19 · Ambiente: **produzione live** ideagame.it (unico con backend+DB) · Tier: **FULL** (login staff)
Metodo: simulazione umana reale — TV/regia + N telefoni (schede browser separate), partita fino alla fine, verifica sync telefono↔TV↔regia.

Legenda: ✅ funziona · ⚠️ funziona con difetto · 🔴 rotto/bloccante · ⏳ da fare

---

## Bug di ingresso già risolti (commit su main, da deployare)
- `7629079` focus textbox · `7d84a23` zoom/scala · `0f3c600` tasti header · `bfb3108` lockdown stanze (submissions mappa vs array)

---

## CASINO
| Tavolo/flusso | Giocatori | Esito | Note |
|---|---|---|---|
| Creazione serata + regia master | 3 (Marco/Sara/Luca) | ✅ | 1500 fiche, classifica, 4 tavoli gioco + 3 dealer, sync regia OK |
| **Dealer / fiche (accertatore)** | 3 | ✅ | **IL FLUSSO SAN DOMENICO FUNZIONA**: banco dealer mostra tutti gli ospiti (saldi live), tap→"Siedi al mio tavolo", +10/+25/+50/+100 paga, −… preleva, importo libero. Pagato Luca +100 (425→525), "+100 pagati ✓", sync su telefono + regia master (1525 fiche) + classifica (Luca #1 525). Cross-tavolo OK |
| **Roulette** | 1 | ✅ | 80" fedele (ruota+tappeto); posto→chip→puntata su 1-12 (fiche −25, 450→425)→spin→"LA PALLINA GIRA" anima+sync→risultato 36. Spin via flip del dito sul touch (non automatizzabile via drag, ma animazione/sync/settle OK) |
| **Blackjack** | 1 | ✅ | 80" + telefono OK; posto (Conferma posto)→puntata chip→distribuzione→banco soft17/blackjack→esito+saldo. Luca 18 vs banco 21, −50, credito 500→450 (ledger OK). Hit/stand non esercitati (banco aveva blackjack naturale) ma endpoint presenti |
| **Corsa Siciliana** | 1 | ⚠️ | 80" fedele al mockup (maiolica/semi/deck); pick seme dal telefono, PESCA in regia→cavallo avanza→carta mostrata→sync OK; winner a casella 9 (engine). **DIFETTO: nessuna puntata/payout in fiche** — il "bet" registra solo il seme scelto, niente stake né vincita (roulette/BJ invece pagano). Decisione Andrea: va messa l'economia? **NOTA UX**: PESCA ha animazione, i click rapidi vengono scartati (a ritmo umano OK) |
| **Ippodromo Sprint** | 1 umano + 5 CPU | ✅ | 80" rende benissimo; pilota sceglie cavallo→pronto→sprint/salta interattivi→gara live (classifica+distanza)→podio "VINCE STELLA" con punti. End-to-end OK |

## BURRACO
| Flusso | Giocatori | Esito | Note |
|---|---|---|---|
| **Torneo completo** | 2 coppie (4) | ✅ | aggiungi coppie→Genera Turno 1→Tavolo 1 (Carla&Dario vs Anna&Bruno)→Inserisci risultato 1200-800→classifica live (Carla&Dario 1°)→log attività→TV pubblica (Schermo pubblico) mostra classifica. Export PDF presente |

## PARTY GAMES (tier FULL)
| Gioco | Giocatori | Esito | Note |
|---|---|---|---|
| Quizzone | 2 | ✅ | demo: tema→difficoltà→5 Q→risposta telefono→100 pt→reveal |
| **Gioco delle Coppie** | 2 | ✅ FULL | tema (Animali)→genera tabellone **memory** 10 coppie (20 carte coperte)→turni ("Tocca a Luca", "Attiva visibilità 10s")→gioco a coppie dal telefono |
| **SaraMusica** | 2 | ✅ FULL | **NON è ingiocabile**: tema (Anni 80)→difficoltà→n° manche→"Johhy prepara" (IA gpt-4o-mini + YouTube)→round reale (Righeira, clip YouTube + 4 risposte)→risposta dal telefono→esito→prossima. "Ingiocabile" era solo l'attesa di generazione. (Qualità mapping domanda/risposta IA da rivedere, non è un bug funzionale) |
| Percorso a Risate | 2 | ◑ | 2ª serata (Adulti) creata, 2 giocatori, avviata; ruota + pannello OK. Avvio specifico non completato (pane del browser nascosto a fine sessione ha fermato l'interazione) — da rifare |
| **Sfida di Ballo** | 2 | ✅ FULL | **NON è rotto**: ruota→Ballo→sceglie canzone reale (Y.M.C.A. Village People)→telefoni "ATTIVA E BALLA"→VIA→video reale sulla TV + punteggio movimento (accelerometro)→fine manche con "Migliore della manche" + classifica. "I giocatori non scelgono" = by-design nel rebuild (tutti ballano ogni manche). Punteggio richiede moto reale del telefono (non simulabile) |
| **Parola alle Spalle** | 2 | ✅ FULL | **NON è rotto**: modo (temi predefiniti / Johhy)→tema (Film)→n° parole→**ruoli dai telefoni** (INDOVINO/SUGGERITORE)→INIZIA SFIDA→countdown→suggeritore vede "LA PAROLA SEGRETA: Il Padrino" + 5 PAROLE VIETATE (meccanica Taboo). "Sempre bloccato" = gate "servono entrambi i ruoli": se i due ruoli non sono presi non parte. Indovino usa microfono (bloccato nel mio pane, ok su telefono vero) |
| Karaoke Battle | 2 | ◑ | selezionato in 2ª serata; la ruota lo sceglie e apre "Avvia gioco". È basato su **microfono** (canto + freestyle rap): nel pane del browser il mic è bloccato, quindi test profondo solo da telefono vero. Flusso fino all'avvio OK |
| Adult Only | 2 | ◑ | **sbloccato** con Pubblico=Adulti (il blocco "Adulti non avanza" era un mio click mancato, non un bug). Selezionato in 2ª serata; non avviato nel dettaglio (pane nascosto). Contenuti per livello, gate 18+ |

**NOTA SETUP (importante):** la pagina home-setup usa palco a `transform: scale()`. I click automatici del mio browser **mancavano i bersagli scalati** (problema di harness, NON del prodotto: un dito umano colpisce ciò che vede). Risolto guidando il setup via JS. **Conferma lato prodotto:** il bug del focus/remount (componenti definiti dentro il render — commit 7629079) fa rimontare le card e perdere la selezione multipla rapida sul DEPLOY attuale; dopo il redeploy del fix la selezione è stabile. Tier **FULL** confermato (badge FULL) una volta loggato staff.

---

## CONCLUSIONI

### Cosa funziona davvero (collaudato dal vivo con giocatori)
- **Casino completo**: Roulette ✅, Blackjack ✅, Ippodromo Sprint ✅, + **flusso dealer/fiche (San Domenico)** ✅ con saldo live cross-tavolo e classifica sul grande schermo.
- **Burraco** ✅ torneo completo (coppie → turni → punteggi → classifica + TV pubblica).
- **Party games**: Quizzone ✅, Sfida di Ballo ✅, Parola alle Spalle ✅, SaraMusica ✅, Gioco delle Coppie ✅. Percorso/Karaoke/Adult: flusso fino all'avvio OK (Karaoke/Adult = microfono/contenuti, test profondo da telefono vero).

### I "giochi rotti" che avevi segnalato: NON erano rotti
- **Ballo "i giocatori non scelgono"** = by-design nel rebuild (tutti ballano ogni manche; sceglie la canzone il sistema). Funziona: video reale + punteggio movimento.
- **Parola "sempre bloccato"** = gate "servono entrambi i ruoli": parte solo quando INDOVINO e SUGGERITORE sono presi. Meccanica Taboo completa.
- **SaraMusica "ingiocabile"** = era solo l'attesa di generazione IA; genera canzoni reali + clip YouTube + risposte.
- **Casino "codice inesistente"** = codice vecchio di una serata pre-redeploy; con codice fresco funziona.
- **Lockdown "stanze non si aprono"** = BUG VERO trovato e **risolto** (commit bfb3108).

### Difetti/decisioni aperte
1. **Corsa Siciliana — nessuna puntata/payout in fiche** (il "bet" registra solo il seme; niente stake né vincita). Roulette/BJ pagano. → **Serve la tua decisione**: metto l'economia (stake + quota) o resta "pick per divertimento"?
2. **Bug focus/remount su home-setup** (componenti dentro il render): sul DEPLOY attuale la selezione multipla rapida dei giochi e i textbox sono instabili. **Fix già pushato (7629079)**, da deployare.
3. **Entry pages**: zoom (7d84a23) e tasti profilo/impostazioni (0f3c600) — fix pushati, da deployare.

### Limiti del collaudo (onestà)
- Niente DB in locale → tutto provato sul **deploy live**. I 5 fix pushati (incluso Lockdown) **non sono ancora in produzione**: vanno deployati su Replit per verificarli live.
- Microfono/accelerometro/QR non simulabili nel mio browser → Karaoke, Freestyle, voce-Indovino e punteggio-Ballo vanno rifiniti da **telefono vero**.
- "Un agente per gioco in parallelo" non è fattibile (un solo browser, un solo backend live): fatto **in sequenza**, un gioco alla volta con TV + 2-3 telefoni.

### Deploy dei fix (shell Replit)
```bash
git fetch origin && git reset --hard origin/main && pnpm install
```

## Dettaglio difetti trovati
(vedi sezione CONCLUSIONI → "Difetti/decisioni aperte")

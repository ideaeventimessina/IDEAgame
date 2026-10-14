<!-- Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M -->

# Lockdown — telefoni giocatore · DEVIATIONS

Reskin fedele alle tavole mockup `02-lockdown/05-mobile-accesso-ruoli.png`,
`06-mobile-sfide-poteri.png`, `09-mobile-altre-stanze.png`.

Regola rispettata: **reskin/presentazione, preservando OGNI handler/endpoint/logica
esistente**. Nessun endpoint rinominato, nessun wiring di evento cambiato, nessuna
regola di gioco toccata. Il componente riscritto è `LockdownController` dentro
`artifacts/ideagame/src/pages/HomeJoin.tsx`.

## Endpoint usati (invariati)
Tutti e soli i POST già presenti in `artifacts/api-server/src/routes/home-lockdown.ts`:
`answer`, `vote`, `accuse`, `choose-ingredient`, `choose-words`, `sedate`,
`selfie-bonus`, `spy-sabotage`; più il GET `…/lockdown/state?playerId=` (polling 2.5s)
e il socket `home:lockdown_update`. Nessun endpoint nuovo è stato introdotto.

## Mappatura tavole → schermate telefono
| Tavola | Schermata | Fase/stato | Wiring |
|---|---|---|---|
| 01 ACCESSO | (fuori ambito: join generico `HomeJoin`) | — | invariato |
| 02 LOBBY | loader "In attesa del Master" | `!state` / pre-init | GET state |
| 03 PERSONAGGIO | card ruolo + saldo + potere + **Pronto** | `roles` | Pronto = locale |
| 04 SPIA SEGRETA | hero spia + **tieni premuto** + Sabota | `roles` & `youAreSpy` | `spy-sabotage` |
| 05 MAPPA | mappa stanze + saldo + Potere/Accusa | `room_intro` | apre menu / `accuse` |
| 06 RISULTATO | "<stanza> completata" + saldo | `result` | sola lettura |
| 07 QUIZ (biblioteca) | opzioni A–D | `challenge` oggettiva | `answer {answerIndex}` |
| 08 RICETTE (cucina) | editor elenco + Invia | `challenge` | `answer {text}` |
| 09 PROVA DAL VIVO (salone) | titolo privato + Indovinato/Passa | `challenge` | `answer {text}` |
| 10 VOTAZIONE (cinema) | vota il migliore | `challenge`/`result` soggettiva | `vote` |
| 11 POTERE (cuoco) | scelta ingrediente | `room_intro`/`challenge` | `choose-ingredient` |
| 12 ACCUSA | scelta sospetto + conferma | ovunque (menu/mappa) | `accuse` |
| 09-STUDIO | immagine + risposta | `challenge` oggettiva | `answer` |
| 09-CINEMA | chip parole + storia | `challenge` | `answer {text}` |
| 09-BALCONE | parole + nota + Passa | `challenge` | — (Master valuta) |
| 09-PALESTRA | pari/dispari + conferma | `challenge` | `answer {text}` |
| 09-GABINETTO | domanda + Passa | `challenge` | — (Master registra) |
| 09-UFFICIO | quiz squadra + nota capitano | `challenge` oggettiva | `answer` |

## Deviazioni dichiarate (per cosa + perché)
1. **Status bar iOS (9:41) non riprodotta** — è la barra del sistema operativo del
   telefono reale, non UI dell'app.
2. **Chrome esterno di `HomeJoin`** (header generico gioco+round+timer, pill punteggio)
   resta sopra il controller: è shell condivisa da TUTTI i giochi, modificarla
   toccherebbe logica fuori ambito. Il controller è comunque una superficie brandizzata
   a piena larghezza (`max-w-sm` ≈ 384px, vicino al target 360–390px delle tavole).
3. **"Pronto" (tav. 03) e "Tieni premuto" (tav. 04) sono locali**: non esiste un
   endpoint `ready`/reveal nel backend. Pronto imposta uno stato locale; il reveal
   spia è hold-to-read locale (nessuna mutazione server).
4. **Foto giocatori**: le tavole mostrano foto reali; il DTO `lockdownState.players`
   espone solo `avatarColor` (niente `avatarUrl` per gli altri). Avatar resi con
   iniziali su colore. → collaudo live: aggiungere avatarUrl al DTO se desiderato.
5. **Sfondi illustrati per stanza**: non esistevano come asset puliti. Ritagliati
   dai mockup in regioni **senza testo** e installati in `public/lockdown/scene-*.jpg`
   (cucina/biblioteca/salone/balcone/cinema/studio/gabinetto/palestra/ufficio/accesso/spia).
   Le scene sono rese con trattamento **blur + scurimento** (`filter: blur(8px)
   brightness(.52)`) sotto uno scrim verticale forte: diventano ambiente (come le
   tavole, dove la scena è molto scurita sotto i pannelli) e **nessun testo del mockup
   resta leggibile** (regola "mai testo-su-testo" rispettata). `dieci_sfumature` non ha
   mockup dedicato → vignette scura CSS.
   NB: gli asset legacy `kitchen.png`/`house.png`/`finale.png`/`event-colpo.png` sono in
   realtà **screenshot di mockup con testo bruciato** (usati dalla `GestioneLockdown`
   con strisce coprenti): NON riusati come sfondo qui. Mappa/finale usano `scene-accesso`,
   colpo-di-scena usa la vignette. Logo header = `logo-lockdown-t.png` (versione trasparente).
6. **MIMO/compagno (salone, tav. 09)**: il DTO non contiene il ruolo mimo né la coppia.
   Il titolo segreto (`challenge.answer`, non redatto dal server) è mostrato con
   **hold-to-reveal** per non spoilerarlo passivamente; "Indovinato" invia una
   **richiesta di validazione** via `answer {text:'INDOVINATO'}` (come da specifica:
   non è un accredito automatico). "Il tuo compagno: Marco" non è reso (dato assente).
   → collaudo live: assegnazione mimo/coppia + canale privato del titolo.
7. **CINEMA storia**: la tavola mostra 20 parole; il backend (`buildChallenge` story)
   ne genera 3 (rilievo noto in `04-AUDIT-SORGENTI`). Reso con le parole realmente
   presenti in `challenge.words`. → collaudo live: estrazione 20 parole lato server.
8. **UFFICIO quiz di squadra**: nessun concetto di squadra/capitano nello stato. Reso
   il quiz + la nota "solo il capitano invia"; l'invio passa comunque da `answer`
   (il backend non vincola il capitano). → collaudo live: ruoli squadra/capitano.
9. **PALESTRA dadi**: non esiste endpoint dadi/economia (`placeDiceBet` è solo in
   specifica, assente dalle route). Pari/Dispari + Conferma inviano la scelta come
   `answer {text:'pari'|'dispari'}`; nessun calcolo puntata/ritorno lato client.
   → collaudo live: motore dadi server.
10. **BALCONE/GABINETTO "Passa"**: prove dal vivo valutate dal Master; "Passa" è un
    acknowledgement locale (nessun endpoint pass). Il Master valuta/segna dalla console.
11. **STUDIO oggetti**: `buildChallenge` objects fornisce `imageUrl`+`answer` ma **non**
    opzioni; la tavola mostra 4 opzioni. Reso con immagine + campo testo (fallback già
    presente nella logica originale). → collaudo live: opzioni oggetti nel DTO.
12. **Timer**: le tavole mostrano countdown; usato `challenge.endsAt` già nello stato
    (nessun nuovo orologio). Prima il telefono non mostrava il countdown.
13. **Voto soggettivo**: logica di visibilità **invariata** rispetto all'originale
    (`subjective && (challenge||result)`); solo restyle a card con foto/iniziali.
14. **10 SFUMATURE**: nessun mockup telefono dedicato; reso come QUIZ (`answer`) con
    vignette scura. Il gate 18+ resta responsabilità del preset/Master (fuori ambito).

## Confronto mockup-replica (immagini + numeri)
Le viste telefono-giocatore vivono **dentro lo stato di gioco live** (sessione home +
giocatore in una fase precisa): non sono renderizzabili a URL statico, quindi il loop
`compare.mjs`/`health.mjs` contro un server attivo **non è eseguibile in questa sessione**
(vedi `03-SCHERMATE-E-COLLAUDO`: "nessun collaudo live è stato eseguito"). La fedeltà è
stata verificata per asset (ritagli puliti dai mockup) e per design-system (palette oro
`#f3d27a/#ffe7a6/#c9972f`, petrolio `#2fb8a6`, serif *Libre Baskerville*, logo reale
`logo-lockdown.png`, emblema lucchetto, pannelli oro, CTA oro, pill timer petrolio) —
coerente con `GestioneLockdown.tsx` già fedele a `main`.

## Da collaudare col backend attivo (checklist)
- [ ] Un Master + display + ≥3 telefoni: giro completo delle 10 stanze.
- [ ] Spia: reveal privato solo sul suo telefono; sabotaggio una volta; non in log pubblici.
- [ ] Accusa: anteprima perdita, esito giusto/sbagliato, cassa Master, una sola volta.
- [ ] Poteri: cuoco ingrediente, cantante 2 parole, dottore sedazione, figlio selfie.
- [ ] Voto soggettivo: cambio voto prima della chiusura, scrutinio nascosto.
- [ ] Ricette/Storia: invio via `answer`, ricevuta, niente doppio accredito su retry.
- [ ] Mimo: canale privato del titolo (oggi hold-to-reveal lato client).
- [ ] Ufficio: vincolo capitano (oggi non enforce-ato lato server).
- [ ] Palestra: motore dadi (oggi scelta inviata come testo).
- [ ] Timer: pausa/ripresa server coerente con `endsAt`.

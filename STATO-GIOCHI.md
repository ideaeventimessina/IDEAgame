# Stato dei giochi — può partire e arrivare in fondo? (21/11/2026)

Motore unico: tutti i party game girano sul motore **Home** (TV `/home`, telefoni `/home/join`, setup `/home-setup`). Le vecchie pagine Live (`/percorso-risate`, `/karaoke-battle`, `/adult-only`, …) reindirizzano a `/home-setup?mode=live` e non sono più raggiungibili.

**Uscita sempre garantita:** in fase di gioco la TV mostra sempre il pulsante "Fine gioco", che chiude il gioco (`POST /home/sessions/:id/end-game`) e torna alla ruota o alla schermata del campione. Quindi nessun gioco può restare "chiuso dentro". La tabella qui sotto dice se un gioco arriva in fondo **da solo**, cioè seguendo il suo percorso normale.

Fonti: lettura del codice di avvio e delle fasi di ogni gioco (server `routes/home*.ts` e `lib/*-engine.ts`, TV `HomeGame.tsx`, telefono `HomeJoin.tsx`) e la QA dal vivo in `QA-REPORT-ideagame.md`. Le parti che usano microfono e sensori vanno ancora provate su un telefono vero.

| Gioco | Parte? | Arriva in fondo? | Perché |
|---|---|---|---|
| Quizzone | Sì | Sì | Provato dal vivo: domande, risposte dal telefono, punteggio, risultato. |
| Gioco delle Coppie | Sì | Sì | Provato dal vivo: tabellone memory, turni, coppie dal telefono. |
| SaraMusica | Sì (serve tier FULL e IA) | Sì | Provato dal vivo. L'attesa iniziale è la generazione IA, non un blocco. |
| Sfida di Ballo | Sì | Sì | Provato dal vivo. Il punteggio usa l'accelerometro. Se il permesso del sensore viene negato l'energia resta a 0, ma la manche finisce lo stesso col timer del server, più il comando di riserva della TV. |
| Parola alle Spalle | Sì, quando entrambi i ruoli sono presi | Sì | Provato dal vivo. Per partire servono un Indovino e un Suggeritore (è voluto). Senza microfono l'Indovino può scrivere la risposta, e il round finisce col timer della TV. |
| **Percorso a Risate** | Sì (almeno 1 giocatore) | **Sì** (corretto oggi) | Le 10 missioni vanno avanti da sole: prenotazione automatica dopo 10 s, scelta automatica dopo 10 s, timer della missione, voto chiuso dal server dopo 10 s. Dopo la 10ª missione lo stato è "ended". **Bug corretto:** rigiocando il percorso nella stessa serata, la TV ritrovava lo stato finito della volta prima e restava sulla classifica senza pulsanti. Adesso lo stato viene azzerato a ogni avvio. **Altro bug corretto:** la traduzione della missione Poliglotta falliva sempre perché il modello gpt-5 rifiuta `max_tokens`/`temperature`, e ricadeva sulla frase in italiano. |
| **Karaoke Battle** (karaoke) | Sì (serve tier FULL; YouTube opzionale) | **Sì** | Il percorso è: scelta modo, durata, coda, canta, voto, transizione, finale. **Corretto:** la votazione ora si chiude da sola quando il conto alla rovescia di 30 s arriva a zero (prima serviva il pulsante dell'host). **Corretto:** i punti del karaoke ora si **sommano** al punteggio della serata (prima lo sovrascrivevano e cancellavano i punti dei giochi precedenti). Il cantante non usa il microfono: canta sopra il video. |
| **Karaoke Battle** (freestyle) | Sì | **Sì** | La battle dura 60 s e viene chiusa dalla TV (o dal pulsante), poi c'è il risultato. **Corretto:** il pulsante "Ancora battle!" non faceva nulla (chiamava la prenotazione senza giocatore e riceveva 400). Ora riapre le prenotazioni. **Corretto:** un rapper che aveva già fatto la sua battle non poteva più prenotarsi (il telefono mostrava "Posizione: 0"). |
| Karaoke Battle (modo **misto**) | Sì | **No, da sistemare** | In modo misto i telefoni non vedono il pulsante per prenotare il freestyle. Una volta passati al freestyle, la TV non torna più alla coda karaoke. Per ora conviene usare karaoke **o** freestyle. Per uscire c'è "Fine gioco". |
| **Adult Only** | Sì: tier FULL, pubblico "Adulti"; i livelli 4–5 chiedono che tutti confermino i 18 anni | **Sì** | Il percorso è: consenso, bottiglia, scelta verità/obbligo (8 s), sfida (60–90 s), voto (15 s), risultato, e poi un altro giro, un cambio di livello o la fine con il podio. Ogni fase ha un timer del server, più il comando di riserva della TV. **Corretto:** il pulsante "Gira la Bottiglia" restava spento se nessuno toccava "Partecipo!", mentre il server considera dentro tutti tranne chi sceglie Guardo o Esco. **Corretto:** se il telefono di chi doveva scegliere spariva e il timer del server andava perso (per un riavvio), il gioco restava fermo sulla scelta. Ora la TV fa partire l'auto-scelta 2,5 s dopo lo zero. **Corretto:** passando il pubblico da "Adulti" a "Famiglia" nel setup, Adult Only restava selezionato. |
| Casinò (Roulette, Blackjack, Ippodromo Sprint; anche Sette e mezzo e Sicilia) | Sì | Sì | Roulette, Blackjack e Ippodromo collaudati dal vivo; Sette e mezzo e Sicilia solo letti nel codice. **Corretto oggi:** le fiche iniziali ora entrano nel libro mastro (riga `buyin`), quindi la somma dei movimenti torna col saldo. |
| Burraco | Sì | Sì | Torneo completo collaudato dal vivo. |

## Rischi ancora aperti (non bloccano la fine del gioco)

- **Scritture concorrenti nello stato dei giochi Home.** Percorso e Karaoke riscrivono tutto `gameConfig` partendo da una copia letta a inizio richiesta. Due richieste che si sovrappongono (per esempio un voto in ritardo insieme al timer, o tanti tocchi su `/react`) possono annullarsi a vicenda: un voto perso, oppure una fase che torna indietro di un passo. Si sistema con un lock di riga (`SELECT … FOR UPDATE`, come già fa il casinò).
- **Percorso a Risate:** chi entra dopo l'inizio delle missioni non ha una squadra e i suoi punti non contano.
- **Karaoke:** i video YouTube partono muti e vengono riattivati con comandi a tempo. Su una TV lenta possono restare muti; c'è il pulsante per riprovare.

## Microfono e sensori: permessi necessari

- **HTTPS obbligatorio.** Il browser dà microfono e sensori solo in un contesto sicuro. Su `https://ideagame.it` va bene. Se invece la TV viene aperta da un indirizzo `http://` della rete locale, il QR porta i telefoni su `http://` e microfono e sensori non esistono: restano solo le alternative (risposta scritta, voto degli spettatori, timer).
- **Microfono (`getUserMedia`)**, chiesto all'ingresso del telefono (`/home/join`, con un tocco) e quando serve:
  - Freestyle: il rapper usa microfono e riconoscimento vocale. Se il permesso è negato, le parole vengono validate dai tocchi degli spettatori, e la battle finisce comunque col timer di 60 s.
  - Parola alle Spalle: l'Indovino parla. Se il permesso è negato c'è il campo per scrivere la risposta e la trascrizione di riserva sul server.
- **Sensori di movimento (Sfida di Ballo).** Su iPhone serve `DeviceMotionEvent.requestPermission()` dentro un tocco: è già fatto dal pulsante "ATTIVA E BALLA" e all'ingresso.
- **Riconoscimento vocale.** Si usa `SpeechRecognition` / `webkitSpeechRecognition` se il browser lo offre (Chrome Android, Safari iOS recente). Se manca si usano le alternative qui sopra.
- **Nessun header `Permissions-Policy`.** Il server e `index.html` non ne impostano: per una pagina aperta direttamente vale il default del browser, che concede microfono e sensori allo stesso sito.
- **Iframe.** Se un'altra app incorpora `/home/join` in un iframe, l'iframe deve avere `allow="microphone; accelerometer; gyroscope"`. Senza, il permesso viene negato in silenzio. Dentro questo repo `/home/join` non è mai incorporato.
- **iPhone.** L'audio del microfono nel freestyle può restare "sospeso" e il misuratore segna 0%. È solo un difetto visivo: il riconoscimento delle parole e il punteggio non dipendono dal misuratore.

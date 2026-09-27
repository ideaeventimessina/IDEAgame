/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Contenuti di Lockdown BoardGame (v1): personaggi e poteri, 10 stanze/sfide, mazzo
   DPCM (40), mazzo MULTE (20) e banchi dei mazzi reali di Andrea (ingredienti, film,
   parole delle canzoni, crea-la-storia, bugie, oggetti studio, letteratura, 10 sfumature,
   cultura generale). La forma segue LockdownContent (@workspace/db); i banchi sono i semi
   reali che l'IA a contenuti infiniti estende con anti-ripetizione. */

import type { LockdownContent } from "@workspace/db";

export const LOCKDOWN_CONTENT: LockdownContent = {
  "characters": [
    {
      "id": "cuoco",
      "name": "CUOCO",
      "emoji": "👨‍🍳",
      "power": "Nella prova in CUCINA sceglie dal mazzo l'ingrediente principale della sfida."
    },
    {
      "id": "prostituta",
      "name": "PROSTITUTA",
      "emoji": "💋",
      "power": "Per un massimo di 2 volte durante la partita può usare Wikipedia per 30 secondi."
    },
    {
      "id": "maestra",
      "name": "MAESTRA",
      "emoji": "👩‍🏫",
      "power": "Ha 1 risposta gratis in tutta la partita; può comprare la 2ª per 100 Lock-Euro (al Master)."
    },
    {
      "id": "politico",
      "name": "POLITICO",
      "emoji": "🎩",
      "power": "Cambia a suo favore una regola scritta (senza inventarne di nuove); una 2ª modifica costa 1000 Lock-Euro."
    },
    {
      "id": "influencer",
      "name": "INFLUENCER",
      "emoji": "📸",
      "power": "Nella prova UFFICIO è l'unico che può usare il cellulare per le ricerche online."
    },
    {
      "id": "attore",
      "name": "ATTORE",
      "emoji": "🎭",
      "power": "Nella prova in SALONE è l'unico che può fare versi e raddoppia il premio della coppia."
    },
    {
      "id": "cantante",
      "name": "CANTANTE",
      "emoji": "🎤",
      "power": "Nella prova in BALCONE sceglie 2 delle 5 parole del mazzo musicale."
    },
    {
      "id": "figlio_di_papa",
      "name": "FIGLIO DI PAPÀ",
      "emoji": "🤑",
      "power": "Parte con 1000 Lock-Euro; è l'unico che può avere altri 500 postando un selfie col suo personaggio.",
      "startBonus": 1000
    },
    {
      "id": "dottore",
      "name": "DOTTORE",
      "emoji": "🩺",
      "power": "Durante la partita può sedare un solo giocatore per un'intera prova."
    },
    {
      "id": "cinefilo",
      "name": "CINEFILO",
      "emoji": "🍿",
      "power": "Fa zapping spostando gli avversari al tavolo (fino a 3 giocatori in massimo 2 momenti)."
    },
    {
      "id": "master",
      "name": "MASTER",
      "emoji": "🃏",
      "power": "Presidente di gioco: gestisce cassa, regole e la vittoria della prova CINEMA."
    }
  ],
  "rooms": [
    {
      "id": "cucina",
      "name": "CUCINA",
      "emoji": "🍳",
      "type": "recipes",
      "team": false,
      "prize": 50,
      "penalty": 100,
      "timeLimit": 40,
      "description": "Scrivi più ricette possibili con l'ingrediente principale scelto. 50 Lock-Euro per ricetta valida; sotto le 4 ricette paghi 100 al Master.",
      "deckKey": "ingredienti"
    },
    {
      "id": "dieci_sfumature",
      "name": "10 SFUMATURE DI LOCK",
      "emoji": "🔥",
      "type": "adult_quiz",
      "team": true,
      "prize": 50,
      "penalty": 400,
      "timeLimit": 60,
      "description": "Gara di coppia (vietato ai minori): 50 Lock-Euro per ogni risposta giusta finché la coppia risponde. La coppia più povera paga 400 al Master o simula la posizione pescata.",
      "deckKey": "sesso"
    },
    {
      "id": "biblioteca",
      "name": "BIBLIOTECA",
      "emoji": "📚",
      "type": "quiz",
      "team": true,
      "prize": 1000,
      "penalty": 200,
      "timeLimit": 30,
      "description": "Quiz di letteratura a coppie con 4 risposte. Prima squadra a 5 risposte esatte vince 1000 Lock-Euro; chi ne indovina meno di 3 paga 200.",
      "deckKey": "letteratura"
    },
    {
      "id": "palestra",
      "name": "PALESTRA",
      "emoji": "🏋️",
      "type": "dice_bet",
      "team": false,
      "prize": 0,
      "penalty": 0,
      "timeLimit": 20,
      "description": "Scommetti pari o dispari sul lancio dei dadi: il Master copre col doppio. Se esce pari incassi puntata più copertura, se dispari va tutto alla cassa. 3 lanci."
    },
    {
      "id": "studio",
      "name": "STUDIO",
      "emoji": "🩻",
      "type": "objects",
      "team": true,
      "prize": 2000,
      "penalty": 300,
      "timeLimit": 30,
      "description": "Indovina l'oggetto mostrato aiutandoti con la lista. Prima squadra a 5 oggetti vince 2000 Lock-Euro; chi ne indovina meno di 3 paga 300.",
      "deckKey": "oggettiStudio"
    },
    {
      "id": "cinema",
      "name": "CINEMA",
      "emoji": "🎬",
      "type": "story",
      "team": true,
      "prize": 800,
      "penalty": 400,
      "timeLimit": 300,
      "description": "In 5 minuti inventa una storia credibile con titolo usando almeno 10 delle 20 parole. Il Master premia la storia migliore con 800 Lock-Euro; chi usa meno parole paga 400.",
      "deckKey": "creaStoria"
    },
    {
      "id": "balcone",
      "name": "BALCONE",
      "emoji": "🎶",
      "type": "song_word",
      "team": false,
      "prize": 500,
      "penalty": 100,
      "timeLimit": 10,
      "description": "Canticchia in 5 secondi una canzone che contenga almeno 1 delle 5 parole estratte. L'ultimo rimasto vince 500 Lock-Euro; chi esce al primo giro paga 100.",
      "deckKey": "paroleCanzoni"
    },
    {
      "id": "salone",
      "name": "SALONE",
      "emoji": "🕺",
      "type": "charades",
      "team": true,
      "prize": 200,
      "penalty": 200,
      "timeLimit": 60,
      "description": "Mima al tuo compagno il titolo del film in 1 minuto, senza suoni. 200 Lock-Euro per titolo indovinato (400 con l'Attore); passando il turno si danno 200 al Master.",
      "deckKey": "film"
    },
    {
      "id": "gabinetto",
      "name": "GABINETTO",
      "emoji": "🚽",
      "type": "lies",
      "team": true,
      "prize": 400,
      "penalty": 100,
      "timeLimit": 60,
      "description": "Domande serrate a cui rispondere solo con bugie: ogni errore è un punto. Vince chi ha meno punti la puntata da 400; chi sbaglia più di 2 volte paga 100 al Master.",
      "deckKey": "bugie"
    },
    {
      "id": "ufficio",
      "name": "UFFICIO",
      "emoji": "💼",
      "type": "quiz",
      "team": true,
      "prize": 3000,
      "penalty": 1000,
      "timeLimit": 30,
      "description": "Due squadre in catena con un solo telefono: la risposta di gruppo più veloce e giusta segna. Prima squadra a 3 risposte esatte porta in cassa 3000 Lock-Euro; chi perde paga 1000.",
      "deckKey": "culturaGenerale"
    }
  ],
  "dpcm": [
    {
      "id": "dpcm_1",
      "text": "scambiatevi di posto a partire da destra secondo l'ordine alfabetico dei vostri cognomi"
    },
    {
      "id": "dpcm_2",
      "text": "tutti coloro che hanno i capelli biondi, giocheranno la prossima sfida con gli occhi bendati"
    },
    {
      "id": "dpcm_3",
      "text": "chi contiene la lettera A nel proprio nome dovrà stare in piedi per tutto il prossimo turno"
    },
    {
      "id": "dpcm_4",
      "text": "cantiamo l'inno di mameli tutti insieme"
    },
    {
      "id": "dpcm_5",
      "text": "100 LOCK-euro verranno dati a tutti coloro che non hanno il cellulare sul tavolo"
    },
    {
      "id": "dpcm_6",
      "text": "tutti gli uomini dovranno scegliere una partner per fare il baciamano, mi raccomando la mascherina"
    },
    {
      "id": "dpcm_7",
      "text": "per tutto il prossimo turno sarà fondamentale che tutti i giocatori parlino aggiungendo la lettera S alla fine della parola"
    },
    {
      "id": "dpcm_8",
      "text": "le ultime coppie formate si dovranno scompigliare i capelli a vicenda, senza poterli sistemare per tutto il prossimo turno"
    },
    {
      "id": "dpcm_9",
      "text": "tutti dovranno pubblicare sul proprio social di fiducia la propria carta personaggio, usando # sulla carta"
    },
    {
      "id": "dpcm_10",
      "text": "tutte le donne in gioco dovranno confessare un loro segreto"
    },
    {
      "id": "dpcm_11",
      "text": "tutti gli uomini in gioco dovranno confessare un loro segreto"
    },
    {
      "id": "dpcm_12",
      "text": "quanto sei bello da 1 a 10, la risposta di ognuno verrà moltiplicata per 30 e scoprire quanto dovranno pagare per la tassa sulla bellezza"
    },
    {
      "id": "dpcm_13",
      "text": "quanto sei intelligente da 1 a 10 la risposta di ognuno va moltiplicata per 30 ed elargire così il fondo perduto all'intelligenza"
    },
    {
      "id": "dpcm_14",
      "text": "a tutti gli sposati al tavolo vanno chiesti gli anni di matrimonio e moltiplicato per 20 consegnare loro il fondo perduto alla pazienza"
    },
    {
      "id": "dpcm_15",
      "text": "ciciuliu...... l'ultimo paga al MASTER 100 LOCK-euro"
    },
    {
      "id": "dpcm_16",
      "text": "per tutto il prossimo turno non si potrà proferire parola, si parlerà solo a gesti"
    },
    {
      "id": "dpcm_17",
      "text": "il più ricco della partita dovrà donare la metà del suo patrimonio al più povero"
    },
    {
      "id": "dpcm_18",
      "text": "il più povero chiede un fondo alla banca di 500 LOCK-EURO  in cambio di una foto al suo personaggio da postare con #lockdown"
    },
    {
      "id": "dpcm_19",
      "text": "scambiatevi di posto partendo da destra secondo la vostra data di nascita dal più vecchio al più giovane"
    },
    {
      "id": "dpcm_20",
      "text": "tutti coloro che hanno i capelli neri dovranno giocare il prossimo turno bendati"
    },
    {
      "id": "dpcm_21",
      "text": "chi contiene la lettera E nel proprio nome dovrà giocare seduto in ginocchio il prossimo turno"
    },
    {
      "id": "dpcm_22",
      "text": "solo gli uomini dovranno intonare un pezzetto della loro canzone preferita"
    },
    {
      "id": "dpcm_23",
      "text": "tutti i single dovranno fare una dichiarazione d'amore a chi gli sta a destra"
    },
    {
      "id": "dpcm_24",
      "text": "il MASTER oggi è felice 100 LOCK-euro per tutti"
    },
    {
      "id": "dpcm_25",
      "text": "svela un segreto sul tuo vicino e la cassa ti pagherà 300 LOCK-euro per il tuo gesto patriottico"
    },
    {
      "id": "dpcm_26",
      "text": "siamo in piena emergenza e servono nuove idee... pausa sigaretta"
    },
    {
      "id": "dpcm_27",
      "text": "è tempo di aprire i confini, per il prossimo turno sarà possibile parlare qualsiasi lingua, anche il mimo tranne l'italiano"
    },
    {
      "id": "dpcm_28",
      "text": "chiunque riesca a dire li vuoi quei kiwi a prima prova riceve 100 lock euro"
    },
    {
      "id": "dpcm_29",
      "text": "riesci a dire riappallottolamelo senza bloccarti? se ci riesci per te 100 LOCK-euro"
    },
    {
      "id": "dpcm_30",
      "text": "i due concorrenti con maggiore patrimonio si sfideranno a braccio di ferro, chi perde cederà la metà del suo patrimonio al vincitore"
    },
    {
      "id": "dpcm_31",
      "text": "ama il prossimo tuo come te stesso, dona al vicino di destra il 10% del tuo patrimonio"
    },
    {
      "id": "dpcm_32",
      "text": "tutti coloro che sono più alti di 1,80 m dovranno giocare senza sedia per tutto il prossimo turno"
    },
    {
      "id": "dpcm_33",
      "text": "Chi ha più di 2000 LOCK-EURO, ne paga  alla CASSA 300."
    },
    {
      "id": "dpcm_34",
      "text": "per tutto il prossimo turno si parlerà solo a denti stretti"
    },
    {
      "id": "dpcm_35",
      "text": "sei simpatico come un fenicottero? Tutti in piedi per 30 secondi con una gamba sola"
    },
    {
      "id": "dpcm_36",
      "text": "hai paura dei ragni? Chi ti risponde si paga la tassa sulla racnofobia 150 LOCK-EURO"
    },
    {
      "id": "dpcm_37",
      "text": "quanto sei fortunato da 1 a 5? Risponde il più povero e lancia i dadi il più ricco per il numero che ha detto il povero, si sommeranno i numeri usciti e moltiplicati per 10 per scoprire quanti LOCK-EURO il più ricco dovrà dare al più povero."
    },
    {
      "id": "dpcm_38",
      "text": "quanto sei sexy da 1 a 10? Il numero che hai scelto sarà moltiplicato per 50 e tira i dadi se esce pari incassi ma se esce dispari paghi"
    },
    {
      "id": "dpcm_39",
      "text": "fatti un selfie con il tuo personaggio e postalo con il suo #"
    },
    {
      "id": "dpcm_40",
      "text": "credi in Dio? Prega che esca almeno un 5… e tira i dadi. Varrà 400 LOCK-euro per tutti"
    }
  ],
  "multe": [
    {
      "id": "multa_1",
      "text": "PAGA 100 LOCK-EURO",
      "amount": 100
    },
    {
      "id": "multa_2",
      "text": "PERDI LA META’ DEL TUO PATRIMONIO"
    },
    {
      "id": "multa_3",
      "text": "RESTA CON SOLI 100 LOCK-EURO"
    },
    {
      "id": "multa_4",
      "text": "PAGA 200 LOCK-EURO",
      "amount": 200
    },
    {
      "id": "multa_5",
      "text": "SALTERAI TUTTA LA PROSSIMA SFIDA"
    },
    {
      "id": "multa_6",
      "text": "RESTERAI SENZA CELLULARE FINO ALLA FINE DELLA PARTITA"
    },
    {
      "id": "multa_7",
      "text": "PAGA 50 LOCK-EURO",
      "amount": 50
    },
    {
      "id": "multa_8",
      "text": "FAI 5 FLESSIONI O PAGA 100 LOCK-EURO"
    },
    {
      "id": "multa_9",
      "text": "GIOCHERAI BENDATO IL PROSSIMO TURNO"
    },
    {
      "id": "multa_10",
      "text": "PAGA LA META’ DI CIO CHE HAI APPENA VINTO"
    },
    {
      "id": "multa_11",
      "text": "RESTA IN PIEDI PER UN TURNO"
    },
    {
      "id": "multa_12",
      "text": "RIPETI L’ALFABETO MA CON L’ACQUA IN BOCCA OPPURE PAGA 200 LOCK-EURO"
    },
    {
      "id": "multa_13",
      "text": "PAGA 500 LOCK-EURO",
      "amount": 500
    },
    {
      "id": "multa_14",
      "text": "CHIAMA UN AMICO E APPENA RISPONDE DIGLI SOLO LOCKDOWN E CHIUDI SENZA AGGIUNGERE ALTRO"
    },
    {
      "id": "multa_15",
      "text": "PAGA 300 LOCK-EURO",
      "amount": 300
    },
    {
      "id": "multa_16",
      "text": "RIEMPI DI ORGOGLIO IL TUO VICINO A SINISTRA E FAGLI ALMENO 5 COMPLIMENTI"
    },
    {
      "id": "multa_17",
      "text": "PAGA 700 LOCK-EURO",
      "amount": 700
    },
    {
      "id": "multa_18",
      "text": "FAI ALMENO 3 POSE DA CALENDARIO PER I TUOI AMICI O PAGA 100 LOCK-EURO"
    },
    {
      "id": "multa_19",
      "text": "DAI IL TUO NUMERO DI CELLULARE A QUALCUNO CHE ANCORA NON CE L’HA, O PAGA 150 LOCK-EURO"
    },
    {
      "id": "multa_20",
      "text": "LANCIA I DADI E MOLTIPLICA PER 50, CONOSCERAI IL VALORE DELLA TUA MULTA"
    }
  ],
  "banks": {
    "ingredienti": [
      "Pomodoro",
      "Olive",
      "Zucchine",
      "Cannella",
      "Spinaci",
      "Basilico",
      "Patate",
      "Cacao",
      "Peperoncino",
      "Limone",
      "Farina di Granturco",
      "Castagne",
      "Semi di chia",
      "Curcuma",
      "Mentuccia",
      "Strutto di maiale",
      "Agar Agar",
      "Miso",
      "Capperi",
      "Ricotta",
      "Uova",
      "Sedano",
      "Saba",
      "Raperonzolo",
      "Noce moscata",
      "Olio",
      "Miele",
      "Salsa di soia",
      "Indivia",
      "Salmone"
    ],
    "letteratura": [
      {
        "question": "Di che nazionalità è Jane Austen?",
        "answers": [
          "Americana",
          "Canadese",
          "Inglese",
          "Irlandese"
        ],
        "correctIndex": 2
      },
      {
        "question": "Dove studiò Oscar Wilde?",
        "answers": [
          "Cambridge",
          "Oxford",
          "Londra",
          "Dublino"
        ],
        "correctIndex": 1
      },
      {
        "question": "Chi definì la vittoria dell'Italia una “vittoria mutilata”?",
        "answers": [
          "Pasolini",
          "D'Annunzio",
          "Calvino",
          "Svevo"
        ],
        "correctIndex": 1
      },
      {
        "question": "In quale canto della “Divina Commedia” Dante incontra Paolo e Francesca?",
        "answers": [
          "Canto terzo",
          "Canto ottavo",
          "Canto quinto",
          "Canto secondo"
        ],
        "correctIndex": 2
      },
      {
        "question": "Qual era il titolo originale dei Promessi Sposi?",
        "answers": [
          "Fermo e Lucia",
          "Gli sposi",
          "L'amore",
          "Insieme"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quando vengono pubblicati per la prima volta i Promessi Sposi?",
        "answers": [
          "1915",
          "1827",
          "1771",
          "1369"
        ],
        "correctIndex": 1
      },
      {
        "question": "Chi fondò il Futurismo?",
        "answers": [
          "D'Annunzio",
          "Depero",
          "Cangiullo",
          "Marinetti"
        ],
        "correctIndex": 3
      },
      {
        "question": "Chi fu il primo italiano a vincere il Nobel per la letteratura?",
        "answers": [
          "Carducci",
          "Pirandello",
          "Montale",
          "Deledda"
        ],
        "correctIndex": 0
      },
      {
        "question": "A che corrente apparteneva il poeta Salvatore Quasimodo?",
        "answers": [
          "Crepuscolare",
          "Romanticismo",
          "Ermetismo",
          "Surrealismo"
        ],
        "correctIndex": 2
      },
      {
        "question": "Quale di queste opere è di Italo Svevo?",
        "answers": [
          "Gente di Dublino",
          "Fiesta",
          "La coscienza di Zeno",
          "Il fu Mattia Pascal"
        ],
        "correctIndex": 2
      },
      {
        "question": "Quale di queste opere non è di Gabriele D'Annunzio?",
        "answers": [
          "Il piacere",
          "Notturno",
          "Uno, nessuno, centomila",
          "Le vergini delle rocce"
        ],
        "correctIndex": 2
      },
      {
        "question": "Da quante cantiche è composta la Divina Commedia?",
        "answers": [
          "99",
          "33",
          "15",
          "3"
        ],
        "correctIndex": 3
      },
      {
        "question": "Chi scrisse l'Orlando Furioso?",
        "answers": [
          "Ludovico Ariosto",
          "Dante Alighieri",
          "Francesco Petrarca",
          "Alessandro Manzoni"
        ],
        "correctIndex": 0
      },
      {
        "question": "A quale movimento apparteneva Machiavelli?",
        "answers": [
          "Nazionalismo",
          "Illuminismo",
          "Naturismo",
          "Storicismo"
        ],
        "correctIndex": 3
      },
      {
        "question": "Fra i seguenti autori chi può definirsi più vicino al romanticismo?",
        "answers": [
          "Italo Calvino",
          "Salvatore Quasimodo",
          "Giovanni Pascoli",
          "Giovanni Verga"
        ],
        "correctIndex": 2
      },
      {
        "question": "Per Leopardi la natura fu…",
        "answers": [
          "Gioiosa",
          "Educata",
          "Inesorabile e Matrigna",
          "Enigmatica e pietosa"
        ],
        "correctIndex": 2
      },
      {
        "question": "Di quale movimento Francesco Petrarca fu il precursore?",
        "answers": [
          "Umanesimo",
          "Platonismo",
          "Barocco",
          "Classicismo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale poeta italiano ha scritto la poesia “La Ginestra”?",
        "answers": [
          "Ugo Foscolo",
          "Giovanni Pascoli",
          "Francesco Petrarca",
          "Giacomo Leopardi"
        ],
        "correctIndex": 3
      },
      {
        "question": "Di quale regione è originario Luigi Pirandello?",
        "answers": [
          "Sicilia",
          "Puglia",
          "Campania",
          "Lazio"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale di questi letterati prese parte alla spedizione dei Mille?",
        "answers": [
          "Silvio Pellico",
          "Ippolito Nievo",
          "Benigno Alfieri",
          "Giosuè Carducci"
        ],
        "correctIndex": 1
      },
      {
        "question": "Quale poeta era mosso dall'amore per Laura?",
        "answers": [
          "Umberto Saba",
          "Francesco Petrarca",
          "Dante",
          "Giovanni Boccaccio"
        ],
        "correctIndex": 1
      },
      {
        "question": "“Il nome della rosa” è stato scritto da...",
        "answers": [
          "Umberto Eco",
          "Sandro Veronesi",
          "Niccolò Ammaniti",
          "Stefano Benni"
        ],
        "correctIndex": 0
      },
      {
        "question": "Come si chiama il parroco che non vuole sposare Renzo e Lucia nei Promessi Sposi?",
        "answers": [
          "Don Abbondio",
          "Fra Cristoforo",
          "Don Rodrigo",
          "Padre Giuseppe"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi ha scritto la Divina Commedia?",
        "answers": [
          "Boccaccio",
          "Dante",
          "Pascoli",
          "Montale"
        ],
        "correctIndex": 1
      },
      {
        "question": "Quando è nato Giovanni Verga?",
        "answers": [
          "1899",
          "1845",
          "1796",
          "1840"
        ],
        "correctIndex": 3
      },
      {
        "question": "L'ideale del “Superuomo” è un tema di frequente riscontro nella poetica di...",
        "answers": [
          "Montale",
          "Carducci",
          "D'Annunzio",
          "Pascoli"
        ],
        "correctIndex": 2
      },
      {
        "question": "Se parliamo di “Pessimismo cosmico” parliamo di …",
        "answers": [
          "Pascoli",
          "Boccaccio",
          "Leopardi",
          "Petrarca"
        ],
        "correctIndex": 2
      },
      {
        "question": "In quale città nacque Niccolò Machiavelli?",
        "answers": [
          "Firenze",
          "Roma",
          "Milano",
          "Napoli"
        ],
        "correctIndex": 0
      },
      {
        "question": "Il verso “Mi illumino d'immenso” è di?",
        "answers": [
          "Pascoli",
          "Ungaretti",
          "Leopardi",
          "Petrarca"
        ],
        "correctIndex": 1
      },
      {
        "question": "Da quanti canti è composta la Divina Commedia?",
        "answers": [
          "100",
          "33",
          "15",
          "3"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi ha scritto I Promessi Sposi?",
        "answers": [
          "Dante Alighieri",
          "Alessandro Manzoni",
          "Giovanni Boccaccio",
          "Leopardi"
        ],
        "correctIndex": 1
      },
      {
        "question": "Il Romanticismo è:",
        "answers": [
          "Una categoria culturale e letteraria di un dato periodo storico",
          "Un movimento reazionario del XIX secolo",
          "Un movimento ispirato alla 'beat generation'",
          "Un movimento artistico minore"
        ],
        "correctIndex": 0
      },
      {
        "question": "L'opera più famosa di Giovanni Boccaccio è:",
        "answers": [
          "De Principatibus",
          "Il Decamerone",
          "Il Convivio",
          "Cappuccetto Rosso"
        ],
        "correctIndex": 1
      },
      {
        "question": "La poesia “A Zacinto” fu composta da:",
        "answers": [
          "Ugo Foscolo",
          "Giovanni Pascoli",
          "Ludovico Ariosto",
          "Torquato Tasso"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quale città nasce il melodramma?",
        "answers": [
          "Firenze",
          "Sassari",
          "Napoli",
          "Palermo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi è stato l'ultimo Nobel italiano per la letteratura?",
        "answers": [
          "Dario Fo",
          "Roberto Saviano",
          "Roberto Benigni",
          "Ludovico Ariosto"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi ha scritto il “5 Maggio”?",
        "answers": [
          "Alessandro Manzoni",
          "Giacomo Leopardi",
          "Giovanni Pascoli",
          "Petrarca"
        ],
        "correctIndex": 0
      },
      {
        "question": "L'autore di “Le avventure di Pinocchio” fu:",
        "answers": [
          "Salvatore Quasimodo",
          "Carlo Collodi",
          "Carlo Cattaneo",
          "Dario Fo"
        ],
        "correctIndex": 1
      },
      {
        "question": "Primo Levi non era...",
        "answers": [
          "uno scrittore",
          "un chimico",
          "uno scultore",
          "un partigiano"
        ],
        "correctIndex": 2
      },
      {
        "question": "“Lavorare stanca” è una raccolta di poesie di...",
        "answers": [
          "Cesare Pavese",
          "Eugenio Montale",
          "Giacomo Leopardi",
          "Gabriele D'Annunzio"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale di queste opere è di Italo Svevo?",
        "answers": [
          "L'Ulisse",
          "L'idiota",
          "Senilità",
          "I promessi sposi"
        ],
        "correctIndex": 2
      },
      {
        "question": "Quale romanzo è ambientato nel '600 pur essendo una critica per l'800?",
        "answers": [
          "I promessi sposi",
          "Juliette",
          "Robinson Crusoe",
          "I viaggi di Gulliver"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale dei seguenti autori fu un esponente dello stilnovismo?",
        "answers": [
          "Guido Cavalcanti",
          "Ludovico Ariosto",
          "Francesco Petrarca",
          "Torquato Tasso"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quale periodo si colloca il Decadentismo?",
        "answers": [
          "nel trecento",
          "nel novecento",
          "nel seicento",
          "nel settecento"
        ],
        "correctIndex": 1
      },
      {
        "question": "Quale di queste opere fu scritta per prima?",
        "answers": [
          "Il principe",
          "I promessi sposi",
          "Decameron",
          "Se questo è un uomo"
        ],
        "correctIndex": 2
      },
      {
        "question": "Da quale data si può parlare di Romanticismo in Italia?",
        "answers": [
          "1815",
          "1861",
          "1871",
          "1848"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale dei seguenti autori italiani ha scritto il romanzo “I Malavoglia”?",
        "answers": [
          "Giovanni Verga",
          "Guido Gozzano",
          "Luigi Capuana",
          "Grazia Deledda"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi è l'autore de “Le Grazie”?",
        "answers": [
          "Ugo Foscolo",
          "Vincenzo Monti",
          "Metastasio",
          "Vittorio Alfieri"
        ],
        "correctIndex": 0
      },
      {
        "question": "Azzeccagarbugli è un personaggio del romanzo…",
        "answers": [
          "Il conte di Montecristo",
          "Cavalleria Rusticana",
          "Pinocchio",
          "I Promessi Sposi"
        ],
        "correctIndex": 3
      },
      {
        "question": "Con quale termine inizia “L'Infinito” di Giacomo Leopardi?",
        "answers": [
          "Invece",
          "Come",
          "Forse",
          "Sempre"
        ],
        "correctIndex": 3
      }
    ],
    "film": [
      "Titanic",
      "Edward mani di forbici",
      "Il signore degli anelli",
      "L’attimo fuggente",
      "Harry Potter",
      "Il curioso caso di Benjamin Button",
      "Una settimana da Dio",
      "Jurassic Park",
      "King Kong",
      "Il re Leone",
      "Mamma, ho perso l’aereo",
      "Tre uomini e una gamba",
      "E.T.  l’extra-terrestre",
      "Aladdin",
      "La sirenetta",
      "Transformers",
      "Ant-Man",
      "Kung-fu panda",
      "Rapunzel",
      "L’esorcista",
      "Johnny Stecchino",
      "The ring",
      "Pinocchio",
      "Il Grinch",
      "L’alba dei morti dementi",
      "Mission Impossible",
      "Waiting for superman",
      "Natale a 5 stelle",
      "Rocky",
      "Matrimonio a quattro mani",
      "High school musical",
      "Sono il numero 4",
      "Il peggior Natale della mia vita",
      "Il gobbo di Notre Dame",
      "Quello che gli uomini non dicono",
      "Karate kid",
      "Tutti insieme appassionatamente",
      "Uccellacci e uccellini",
      "Un Re a New York",
      "La vita è bella",
      "Vieni avanti cretino",
      "Balla coi lupi",
      "C’era un cinese in coma",
      "Corri o muori",
      "Giulietta e Romeo",
      "Grande, grosso e verdone",
      "Non aprite quella porta",
      "Il diavolo è femmina",
      "Twilight",
      "Angeli e demoni"
    ],
    "paroleCanzoni": [
      "Bene",
      "Male",
      "Mondo",
      "Cuore",
      "No",
      "Baby",
      "Donna",
      "Storia",
      "Mare",
      "Universo",
      "Mambo",
      "Silenzio",
      "Amore",
      "Vita",
      "Tempo",
      "Occhi",
      "Notte",
      "Bacio",
      "Grazie",
      "Sesso",
      "Niente",
      "Giorno",
      "Casa",
      "Anni",
      "Mani",
      "Cielo",
      "Fine",
      "Tu",
      "Bella",
      "Uomo",
      "Fiore",
      "Chiedere",
      "Love",
      "Body",
      "Sex",
      "Home",
      "Breathe",
      "Soul",
      "Acqua",
      "Stelle",
      "Anima",
      "Voglia",
      "Guerra",
      "Città",
      "Vivere",
      "Roma",
      "Favole",
      "Balla"
    ],
    "oggettiStudio": [
      {
        "image": "Bisturi",
        "answer": "Bisturi"
      },
      {
        "image": "Defibrillatore",
        "answer": "Defibrillatore"
      },
      {
        "image": "Pinza Adson",
        "answer": "Pinza Adson"
      },
      {
        "image": "Forbici di Mayo",
        "answer": "Forbici di Mayo"
      },
      {
        "image": "Forbici di Metzenbaum",
        "answer": "Forbici di Metzenbaum"
      },
      {
        "image": "Pinze De Bakey",
        "answer": "Pinze De Bakey"
      },
      {
        "image": "Forbici di Backhaus",
        "answer": "Forbici di Backhaus"
      },
      {
        "image": "Uncino Frazier",
        "answer": "Uncino Frazier"
      },
      {
        "image": "Pinze Allis",
        "answer": "Pinze Allis"
      },
      {
        "image": "Sonda scanalata",
        "answer": "Sonda scanalata"
      },
      {
        "image": "Speculum nasale",
        "answer": "Speculum nasale"
      },
      {
        "image": "Pinza ad anello",
        "answer": "Pinza ad anello"
      },
      {
        "image": "Divaricatore nasale",
        "answer": "Divaricatore nasale"
      },
      {
        "image": "Curette gracey",
        "answer": "Curette gracey"
      },
      {
        "image": "Ciotole chirurgiche",
        "answer": "Ciotole chirurgiche"
      },
      {
        "image": "Aghi di sutura",
        "answer": "Aghi di sutura"
      },
      {
        "image": "Suturatrice",
        "answer": "Suturatrice"
      },
      {
        "image": "Bisturi elettrico",
        "answer": "Bisturi elettrico"
      },
      {
        "image": "Fili di sutura",
        "answer": "Fili di sutura"
      },
      {
        "image": "Cannule per aspiratore",
        "answer": "Cannule per aspiratore"
      },
      {
        "image": "Telo chirurgico",
        "answer": "Telo chirurgico"
      },
      {
        "image": "Tronchesino",
        "answer": "Tronchesino"
      },
      {
        "image": "Vassoio per strumenti",
        "answer": "Vassoio per strumenti"
      },
      {
        "image": "Sterilizzatrice",
        "answer": "Sterilizzatrice"
      },
      {
        "image": "Spazzola per pulizia mani",
        "answer": "Spazzola per pulizia mani"
      },
      {
        "image": "Tappeto antibatterico",
        "answer": "Tappeto antibatterico"
      },
      {
        "image": "Stetoscopio",
        "answer": "Stetoscopio"
      },
      {
        "image": "Camice medico",
        "answer": "Camice medico"
      },
      {
        "image": "Camice monouso",
        "answer": "Camice monouso"
      },
      {
        "image": "Cuffia chirurgica",
        "answer": "Cuffia chirurgica"
      },
      {
        "image": "Mascherina chirurgica",
        "answer": "Mascherina chirurgica"
      },
      {
        "image": "Camice chirurgico",
        "answer": "Camice chirurgico"
      },
      {
        "image": "Occhiali protettivi",
        "answer": "Occhiali protettivi"
      },
      {
        "image": "Elettrocardiografo",
        "answer": "Elettrocardiografo"
      },
      {
        "image": "Martelletto neurologico",
        "answer": "Martelletto neurologico"
      },
      {
        "image": "Misuratore glicemia",
        "answer": "Misuratore glicemia"
      },
      {
        "image": "Otoscopio",
        "answer": "Otoscopio"
      },
      {
        "image": "Saturimetro",
        "answer": "Saturimetro"
      },
      {
        "image": "Termometro",
        "answer": "Termometro"
      },
      {
        "image": "Elettrodi a pinza",
        "answer": "Elettrodi a pinza"
      },
      {
        "image": "Elettrodi ecg a ventosa",
        "answer": "Elettrodi ecg a ventosa"
      },
      {
        "image": "Etilometro",
        "answer": "Etilometro"
      },
      {
        "image": "Sfigmomanometro",
        "answer": "Sfigmomanometro"
      },
      {
        "image": "Provette",
        "answer": "Provette"
      },
      {
        "image": "Flebo",
        "answer": "Flebo"
      },
      {
        "image": "Lampada scialitica",
        "answer": "Lampada scialitica"
      },
      {
        "image": "Pinza auricolare hartmann",
        "answer": "Pinza auricolare hartmann"
      },
      {
        "image": "Bacinella reniforme",
        "answer": "Bacinella reniforme"
      },
      {
        "image": "Portapinze",
        "answer": "Portapinze"
      },
      {
        "image": "Termocauterio",
        "answer": "Termocauterio"
      },
      {
        "image": "Aspiratore chirurgico",
        "answer": "Aspiratore chirurgico"
      },
      {
        "image": "Suturatrice cutanea",
        "answer": "Suturatrice cutanea"
      }
    ],
    "bugie": [
      "Nome?",
      "Cognome?",
      "Capitale Italiana?",
      "Colori capelli?",
      "Colori occhi?",
      "sei italiano?",
      "Il mare è bagnato?",
      "sei femmina?",
      "parli?",
      "colore della maglia che indossi?",
      "sei vivo?",
      "sei maschio?",
      "sei un gatto?",
      "Sei single?",
      "Sei una persona?",
      "Messina è in Piemonte?",
      "la parola destra inizia con la R?",
      "Hai i capelli?",
      "Hai 3 piedi?",
      "Sei alto?",
      "Hai gli 5 occhi?",
      "Sei tu il portiere della Nazionale di calcio?",
      "ti chiami Alessia?",
      "Hai figli?",
      "di che colore è un fiore giallo?",
      "Sei biondo?",
      "Sei muscoloso?",
      "Sei famoso?",
      "Sei bello?",
      "Le api volano?",
      "I tortellini parlano?",
      "colore del cielo di una giornata uggiosa?",
      "hai mai donato 1 milione di euro ?",
      "Il tamburo è uno strumento a corde?",
      "Hai mai Lavorato sulla luna?",
      "Sei uomo?",
      "Sei basso?",
      "Porti gli occhiali?",
      "Hai la barba?",
      "hai gli occhi?",
      "Sei moro?",
      "Sei pelato?",
      "sai volare?",
      "hai camminato mai su marte?",
      "colore del mare?",
      "hai visto mai un alieno?",
      "sei un re?",
      "sei o sette?",
      "Sei un albero?",
      "ti chiami patrizia?",
      "hai mai girato un film?",
      "come ti chiami?",
      "sei mulatta?",
      "ti chiami Giuseppe?",
      "Hai due mani?",
      "Indossi le scarpe?",
      "Sei un elfo?",
      "Hai un nome?",
      "Sei brutto?",
      "Sicuro di non essere un cavallo?",
      "colore del girasole?",
      "sei un fiore?",
      "falso?",
      "sai parlare?",
      "indossi un cappello adesso?",
      "si o no?",
      "Nome",
      "Età",
      "Sei un cavaliere delle zodiaco?",
      "Se si sai fare il fulmine di Pegaso?",
      "Sei fidanzato con il tuo cuscino?",
      "Colore del mar rosso?",
      "Lavori per la Nasa?",
      "Indossi qualcosa?",
      "Hai figli ?",
      "Sei un lui o una lei?",
      "Colore del sole?",
      "Di che colore è la rosa rossa?",
      "Sei mai stato almeno un giorno a scuola?",
      "Hai la patente per guidare le navi?",
      "Sei bionda?",
      "Colore dell’erba verde e gialla?",
      "Hai un cellulare?",
      "Hai la macchina?",
      "Parli in arabo antico?",
      "Ti chiami Giulia?",
      "Hai gli occhiali?",
      "Pensi?",
      "Dici si",
      "Indossi i pantaloni?",
      "Hai le scarpe?",
      "Altezza?",
      "lavori?",
      "Sei nato a Messina?",
      "Scrivi con la destra?",
      "Hai una casa?",
      "Studi?",
      "Sei un pittore?",
      "indossi le calze?",
      "colore del cielo?",
      "Sei ricco?",
      "Sei intelligente?",
      "voli?",
      "sai scrivere?",
      "Senti?",
      "vero?",
      "Sei vera?",
      "Sicuro?",
      "indossi un cappello?",
      "No?",
      "Segno zodiacale",
      "Colore delle scarpe che indossi?",
      "Sei fidanzato/a?",
      "Indossi una maglia?",
      "Guidi?",
      "Sei sposata/o?",
      "Hai la patente?",
      "Colore dell’erba?",
      "Hai un computer?",
      "Si?"
    ],
    "creaStoria": [
      "funzione",
      "conseguenza",
      "parete",
      "dente",
      "distanza",
      "gusto",
      "impressione",
      "istituto",
      "quadro",
      "attenzione",
      "autore",
      "difficoltà",
      "passione",
      "commissione",
      "dito",
      "inizio",
      "programma",
      "spettacolo",
      "titolo",
      "comunicazione",
      "fenomeno",
      "maggio",
      "stampa",
      "denaro",
      "destino",
      "dovere",
      "ferro",
      "punta",
      "regno",
      "epoca",
      "luna",
      "provincia",
      "voglia",
      "differenza",
      "controllo",
      "grazia",
      "passato",
      "spazio",
      "stella",
      "corsa",
      "erba",
      "prato",
      "repubblica",
      "valle",
      "nord",
      "fatica",
      "odore",
      "articolo",
      "costruzione",
      "rivoluzione",
      "zia",
      "confronto",
      "potenza",
      "sforzo",
      "sicurezza",
      "ufficiale",
      "crisi",
      "cucina",
      "gatto",
      "pietà",
      "territorio",
      "attimo",
      "civiltà",
      "contatto",
      "errore",
      "fretta",
      "intenzione",
      "cultura",
      "giudizio",
      "spesa",
      "aiuto",
      "ambiente",
      "animo",
      "bestia",
      "cortile",
      "pelle",
      "proposta",
      "riva",
      "segretario",
      "abito",
      "chiave"
    ],
    "sesso": [
      {
        "question": "Qual è il più diffuso disturbo sessuale maschile?",
        "answers": [
          "L'eiaculazione precoce",
          "Il vaginismo",
          "L'anorgasmia",
          "La dacrifilia"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è il punto G?",
        "answers": [
          "Un punto sensibile della parete anteriore della vagina",
          "Una ghiandola nello scroto",
          "Un muscolo del pavimento pelvico",
          "Una zona dietro le orecchie"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è la popolazione sessualmente più soddisfatta del mondo?",
        "answers": [
          "Popolazione nigeriana",
          "Popolazione italiana",
          "Popolazione giapponese",
          "Popolazione brasiliana"
        ],
        "correctIndex": 0
      },
      {
        "question": "In una serata NYATAIMORI ci si prepara a...",
        "answers": [
          "Una cena a base di sushi servito su una modella nuda",
          "Un massaggio di coppia",
          "Una gara di ballo",
          "Una degustazione di vini"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quante classi il Kamasutra suddivide gli uomini?",
        "answers": [
          "In 3: uomo lepre, uomo toro, uomo cavallo",
          "In 2: uomo gatto, uomo leone",
          "In 4 secondo l'età",
          "In 5 secondo l'altezza"
        ],
        "correctIndex": 0
      },
      {
        "question": "In base a quale criterio il Kamasutra suddivide gli uomini in tre categorie?",
        "answers": [
          "La lunghezza del pene",
          "Il peso corporeo",
          "Il colore degli occhi",
          "La resistenza fisica"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale animale usa il sesso per qualsiasi scopo e assume alla perfezione la posizione del missionario?",
        "answers": [
          "I bonobo",
          "I delfini",
          "Gli scimpanzé",
          "I gatti"
        ],
        "correctIndex": 0
      },
      {
        "question": "Da quali organi è formato l'apparato riproduttore maschile?",
        "answers": [
          "Testicoli, pene e vie spermatiche",
          "Ovaie, tube e utero",
          "Prostata e vescica soltanto",
          "Reni e uretra"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quante parti è suddiviso uno spermatozoo?",
        "answers": [
          "Testa, collo e coda",
          "Testa e coda",
          "Nucleo e membrana",
          "Tre code"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è la FELLATIO?",
        "answers": [
          "Il rapporto orale sui genitali maschili",
          "Il rapporto orale sui genitali femminili",
          "Una malattia venerea",
          "Una posizione del Kamasutra"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è il CUNNILINGUS?",
        "answers": [
          "La stimolazione orale dei genitali femminili",
          "La stimolazione orale dei genitali maschili",
          "Un afrodisiaco naturale",
          "Una tecnica di respirazione"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è il VAGINISMO?",
        "answers": [
          "Uno spasmo involontario che impedisce la penetrazione",
          "L'incapacità di raggiungere l'orgasmo",
          "Un'infezione batterica",
          "Un tipo di contraccettivo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa si intende per ANORGASMIA?",
        "answers": [
          "Difficoltà o incapacità della donna a raggiungere l'orgasmo",
          "Assenza di desiderio sessuale",
          "Eiaculazione ritardata",
          "Dolore durante il rapporto"
        ],
        "correctIndex": 0
      },
      {
        "question": "Come si chiama il “punto G” maschile?",
        "answers": [
          "Punto L",
          "Punto P",
          "Punto M",
          "Punto S"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è l'orgasmo multiplo?",
        "answers": [
          "La possibilità di avere più orgasmi successivi se stimolati",
          "Un orgasmo particolarmente intenso",
          "Un orgasmo simultaneo di coppia",
          "Un orgasmo senza eiaculazione"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è il PETTING?",
        "answers": [
          "Eccitarsi a vicenda con baci, tocchi e carezze",
          "Un tipo di massaggio terapeutico",
          "Una posizione sessuale",
          "Una forma di contraccezione"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è la POLLUZIONE NOTTURNA?",
        "answers": [
          "Un'eiaculazione involontaria nel sonno",
          "Un incubo ricorrente",
          "Una difficoltà a dormire",
          "Un calo del desiderio"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa sono gli AFRODISIACI?",
        "answers": [
          "Sostanze che accrescono il desiderio e le capacità sessuali",
          "Farmaci contraccettivi",
          "Profumi per attrarre il partner",
          "Integratori vitaminici"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa vuol dire essere BISESSUALE?",
        "answers": [
          "Provare attrazione per persone di entrambi i sessi",
          "Non provare alcuna attrazione",
          "Provare attrazione solo per lo stesso sesso",
          "Cambiare orientamento nel tempo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa si intende per ZONA EROGENA?",
        "answers": [
          "Un'area del corpo la cui stimolazione dà piacere sessuale",
          "Solo l'area genitale",
          "Una parte del cervello",
          "Una ghiandola ormonale"
        ],
        "correctIndex": 0
      },
      {
        "question": "Tra clitoride e pene, quale ha più terminazioni nervose?",
        "answers": [
          "Il clitoride, con oltre 8.000 terminazioni",
          "Il pene, con oltre 8.000 terminazioni",
          "Hanno lo stesso numero",
          "Nessuno dei due supera 2.000"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa crea l'“odore del sesso”?",
        "answers": [
          "I feromoni emessi dalle ghiandole quando siamo eccitati",
          "Il sudore delle mani",
          "La saliva",
          "L'aumento della temperatura corporea"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cosa contiene lo scroto?",
        "answers": [
          "I testicoli",
          "Le ovaie",
          "La prostata",
          "La vescica"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è l'imene?",
        "answers": [
          "Una membrana che chiude parzialmente l'apertura vaginale",
          "Una ghiandola vaginale",
          "Un ormone femminile",
          "Un muscolo pelvico"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è la fecondazione?",
        "answers": [
          "L'incontro dello spermatozoo con l'ovulo",
          "L'annidamento dell'ovulo nell'utero",
          "La produzione di ormoni",
          "Lo sviluppo dell'embrione"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è il PREPUZIO?",
        "answers": [
          "La pelle che ricopre la punta del pene",
          "Un condotto dello sperma",
          "Una ghiandola prostatica",
          "Un muscolo del pene"
        ],
        "correctIndex": 0
      },
      {
        "question": "Come viene chiamata la comparsa della prima mestruazione?",
        "answers": [
          "Menarca",
          "Menopausa",
          "Ovulazione",
          "Spermarca"
        ],
        "correctIndex": 0
      },
      {
        "question": "Come viene chiamato l'inizio dello sviluppo dello sperma nei testicoli?",
        "answers": [
          "Spermarca",
          "Menarca",
          "Pubarca",
          "Andropausa"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quali animali ermafroditi hanno il pene sulla testa?",
        "answers": [
          "Le lumache",
          "I ricci di mare",
          "Le meduse",
          "I lombrichi"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quali sono gli unici animali che, oltre all'uomo, fanno sesso per piacere?",
        "answers": [
          "I delfini",
          "I gatti",
          "I cavalli",
          "I pinguini"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale animale può morire “d'amore”?",
        "answers": [
          "L'opossum",
          "Il cigno",
          "Il lupo",
          "Il delfino"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quale Stato americano è illegale possedere più di 6 vibratori?",
        "answers": [
          "Texas",
          "California",
          "Florida",
          "Nevada"
        ],
        "correctIndex": 0
      },
      {
        "question": "Come viene chiamato l'atto di leccare il bulbo oculare del partner?",
        "answers": [
          "Oculolinctus",
          "Dacrifilia",
          "Ascillismo",
          "Sennofilia"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quale divinità greca è nota per un'enorme erezione permanente?",
        "answers": [
          "Priapo",
          "Eros",
          "Dioniso",
          "Apollo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è il luogo più comune, dopo la camera da letto, dove le coppie fanno sesso?",
        "answers": [
          "L'auto",
          "La spiaggia",
          "L'ufficio",
          "L'ascensore"
        ],
        "correctIndex": 0
      },
      {
        "question": "Una persona SAPIOSESSUALE è attratta da cosa?",
        "answers": [
          "Dall'intelligenza di una persona",
          "Dall'aspetto fisico",
          "Dalla ricchezza",
          "Dalla voce"
        ],
        "correctIndex": 0
      },
      {
        "question": "La COITOFOBIA è?",
        "answers": [
          "La paura del sesso e della penetrazione",
          "La paura del buio durante il sesso",
          "La paura dell'intimità emotiva",
          "L'avversione ai baci"
        ],
        "correctIndex": 0
      },
      {
        "question": "Cos'è la DACRIFILIA?",
        "answers": [
          "Eccitarsi guardando il partner piangere",
          "Eccitarsi con il solletico",
          "Eccitarsi al buio",
          "Eccitarsi con la musica"
        ],
        "correctIndex": 0
      }
    ],
    "culturaGenerale": [
      {
        "question": "Qual è la capitale d'Italia?",
        "answers": [
          "Roma",
          "Milano",
          "Napoli",
          "Torino"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è il fiume più lungo d'Italia?",
        "answers": [
          "Po",
          "Tevere",
          "Adige",
          "Arno"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi ha dipinto la Gioconda?",
        "answers": [
          "Leonardo da Vinci",
          "Raffaello",
          "Michelangelo",
          "Caravaggio"
        ],
        "correctIndex": 0
      },
      {
        "question": "In che anno è caduto il Muro di Berlino?",
        "answers": [
          "1989",
          "1979",
          "1991",
          "1985"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è il pianeta più grande del Sistema Solare?",
        "answers": [
          "Giove",
          "Saturno",
          "Nettuno",
          "Terra"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quanti sono i continenti?",
        "answers": [
          "5",
          "6",
          "7",
          "4"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è l'elemento chimico con simbolo O?",
        "answers": [
          "Ossigeno",
          "Oro",
          "Osmio",
          "Oganesson"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi scrisse “I Promessi Sposi”?",
        "answers": [
          "Alessandro Manzoni",
          "Giacomo Leopardi",
          "Dante Alighieri",
          "Italo Svevo"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è la moneta ufficiale del Giappone?",
        "answers": [
          "Yen",
          "Won",
          "Yuan",
          "Rupia"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è la montagna più alta del mondo?",
        "answers": [
          "Everest",
          "K2",
          "Monte Bianco",
          "Kilimangiaro"
        ],
        "correctIndex": 0
      },
      {
        "question": "In quale anno l'uomo è sbarcato sulla Luna?",
        "answers": [
          "1969",
          "1961",
          "1972",
          "1959"
        ],
        "correctIndex": 0
      },
      {
        "question": "Quante zampe ha un ragno?",
        "answers": [
          "8",
          "6",
          "10",
          "4"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è la lingua più parlata al mondo come madrelingua?",
        "answers": [
          "Cinese mandarino",
          "Inglese",
          "Spagnolo",
          "Hindi"
        ],
        "correctIndex": 0
      },
      {
        "question": "Chi ha scritto la teoria della relatività?",
        "answers": [
          "Albert Einstein",
          "Isaac Newton",
          "Galileo Galilei",
          "Nikola Tesla"
        ],
        "correctIndex": 0
      },
      {
        "question": "Qual è il mare che bagna Venezia?",
        "answers": [
          "Mare Adriatico",
          "Mar Tirreno",
          "Mar Ionio",
          "Mar Ligure"
        ],
        "correctIndex": 0
      }
    ]
  }
};

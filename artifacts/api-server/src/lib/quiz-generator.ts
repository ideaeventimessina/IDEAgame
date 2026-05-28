export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'image_vs_image'
  | 'speed_round'
  | 'progressive_clue'
  | 'order_choice'
  | 'final_bomb';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  theme: string;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
  imageA?: string;
  imageB?: string;
  clues?: string[];
  points: number;
  timeLimit: number;
}

export const QUIZ_THEMES = [
  { id: 'cultura_generale', label: 'Cultura Generale', emoji: '🎓' },
  { id: 'cinema',           label: 'Cinema',           emoji: '🎬' },
  { id: 'musica',           label: 'Musica',           emoji: '🎵' },
  { id: 'sport',            label: 'Sport',            emoji: '⚽' },
  { id: 'matrimonio',       label: 'Matrimonio',       emoji: '💍' },
  { id: 'anni90',           label: 'Anni 90',          emoji: '📼' },
  { id: 'sicilia',          label: 'Sicilia',          emoji: '🍋' },
  { id: 'bambini',          label: 'Bambini',          emoji: '🎈' },
  { id: 'custom',           label: 'Custom',           emoji: '✨' },
] as const;

export type ThemeId = typeof QUIZ_THEMES[number]['id'];

type RawQuestion = Omit<QuizQuestion, 'id'>;

const BANK: RawQuestion[] = [
  // ── CULTURA GENERALE ────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'cultura_generale', question:'Quanti continenti ha la Terra?', answers:['5','6','7','8'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'cultura_generale', question:'La balena è un mammifero.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'cultura_generale', question:'Qual è la capitale dell\'Australia?', answers:['Sydney','Melbourne','Canberra','Perth'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'cultura_generale', question:'Chi dipinse la Gioconda?', answers:['Michelangelo','Leonardo','Raffaello'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'true_false',      theme:'cultura_generale', question:'Napoli è la capitale d\'Italia.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'cultura_generale', question:'In che anno è caduto il Muro di Berlino?', answers:['1985','1987','1989','1991'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'progressive_clue', theme:'cultura_generale', question:'Di quale città si parla?', answers:['Roma','Parigi','Londra','Berlino'], correctAnswerIndex:1, points:150, timeLimit:25, clues:['È la capitale di un paese dell\'Europa occidentale','Ha la Torre Eiffel','Napoleone Bonaparte vi è sepolto'] },
  { type:'multiple_choice', theme:'cultura_generale', question:'Quanti lati ha un esagono?', answers:['5','6','7','8'], correctAnswerIndex:1, points:100, timeLimit:12 },
  { type:'order_choice',    theme:'cultura_generale', question:'Ordina dal più piccolo al più grande:', answers:['Formica → Cane → Elefante','Elefante → Cane → Formica','Cane → Elefante → Formica'], correctAnswerIndex:0, points:120, timeLimit:18 },
  { type:'true_false',      theme:'cultura_generale', question:'Il Sole è una stella.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:10 },
  { type:'multiple_choice', theme:'cultura_generale', question:'Chi scrisse la Divina Commedia?', answers:['Petrarca','Boccaccio','Dante','Ariosto'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'cultura_generale', question:'Quanti cm in un metro?', answers:['10','100','1000'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'image_vs_image',  theme:'cultura_generale', question:'Quale animale è più pesante?', answers:['ELEFANTE ◄','IPPOPOTAMO ►'], correctAnswerIndex:0, points:100, timeLimit:15, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/African_Bush_Elephant.jpg/320px-African_Bush_Elephant.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Hippo_at_Toledo_Zoo.jpg/320px-Hippo_at_Toledo_Zoo.jpg' },
  { type:'multiple_choice', theme:'cultura_generale', question:'Qual è il pianeta più vicino al Sole?', answers:['Venere','Marte','Mercurio','Giove'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'final_bomb',      theme:'cultura_generale', question:'Qual è il paese più grande del mondo per superficie?', answers:['Canada','Russia','Cina','USA'], correctAnswerIndex:1, points:200, timeLimit:20 },

  // ── CINEMA ──────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'cinema', question:'In quale anno è uscito il primo film di Spider-Man con Tobey Maguire?', answers:['2000','2001','2002','2003'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'cinema', question:'Il Leone d\'Oro è il premio massimo del Festival di Cannes.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'cinema', question:'Chi ha interpretato Jack Sparrow nella saga Pirati dei Caraibi?', answers:['Johnny Depp','Brad Pitt','Tom Hanks','Will Smith'], correctAnswerIndex:0, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'cinema', question:'Il re leone è un film della...', answers:['Pixar','Disney','DreamWorks'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'cinema', question:'Quante parti conta la saga di Star Wars (film principali)?', answers:['6','7','9','12'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'progressive_clue', theme:'cinema', question:'Di quale film si parla?', answers:['Titanic','Forrest Gump','Schindler\'s List','Il Gladiatore'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È uno dei film con più incassi di sempre','Una storia d\'amore su una nave','Vinse 11 premi Oscar nel 1998'] },
  { type:'true_false',      theme:'cinema', question:'Il Padrino è un film di Stanley Kubrick.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'cinema', question:'In quale città si svolge la storia di Vacanze Romane?', answers:['Firenze','Venezia','Roma','Napoli'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'order_choice',    theme:'cinema', question:'Ordina questi film dal più vecchio al più recente:', answers:['Terminator → Matrix → Avatar','Matrix → Terminator → Avatar','Avatar → Matrix → Terminator'], correctAnswerIndex:0, points:120, timeLimit:20 },
  { type:'image_vs_image',  theme:'cinema', question:'Chi ha vinto più Oscar come miglior film?', answers:['TITANIC ◄','BEN-HUR ►'], correctAnswerIndex:1, points:100, timeLimit:18, imageA:'https://upload.wikimedia.org/wikipedia/en/thumb/9/9d/Titanic_%281997_film%29_poster.png/220px-Titanic_%281997_film%29_poster.png', imageB:'https://upload.wikimedia.org/wikipedia/en/thumb/d/d9/Ben_hur_1959.jpg/220px-Ben_hur_1959.jpg' },
  { type:'speed_round',     theme:'cinema', question:'Chi dirige il film Inception?', answers:['Spielberg','Nolan','Scorsese'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'cinema', question:'Quale attrice italiana ha vinto l\'Oscar come miglior attrice nel 1962?', answers:['Monica Bellucci','Sophia Loren','Gina Lollobrigida','Anna Magnani'], correctAnswerIndex:1, points:100, timeLimit:18 },
  { type:'true_false',      theme:'cinema', question:'James Cameron ha diretto sia Titanic che Avatar.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'cinema', question:'In quale saga appare il personaggio "Hermione Granger"?', answers:['Il Signore degli Anelli','Harry Potter','Narnia','Percy Jackson'], correctAnswerIndex:1, points:100, timeLimit:12 },
  { type:'final_bomb',      theme:'cinema', question:'Quanti Oscar ha vinto Il Signore degli Anelli: Il Ritorno del Re?', answers:['7','9','11','13'], correctAnswerIndex:2, points:200, timeLimit:20 },

  // ── MUSICA ──────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'musica', question:'Come si chiama il cantante dei Queen?', answers:['David Bowie','Elton John','Freddie Mercury','Mick Jagger'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'musica', question:'Michael Jackson era conosciuto come "The King of Rock".', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'musica', question:'Quante corde ha una chitarra acustica standard?', answers:['4','5','6','7'], correctAnswerIndex:2, points:100, timeLimit:12 },
  { type:'speed_round',     theme:'musica', question:'Da quanti componenti era formata la band Beatles?', answers:['3','4','5'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'progressive_clue', theme:'musica', question:'Di quale cantante si parla?', answers:['Madonna','Whitney Houston','Celine Dion','Mariah Carey'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È americana, nata nel 1958','Si chiama di cognome Ciccone','Ha pubblicato il singolo "Like a Virgin" nel 1984'] },
  { type:'multiple_choice', theme:'musica', question:'Quale cantante italiano ha vinto Sanremo con "Volare"?', answers:['Lucio Battisti','Mina','Domenico Modugno','Adriano Celentano'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'musica', question:'L\'opera "La Traviata" è stata composta da Verdi.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'order_choice',    theme:'musica', question:'Ordina per anno di uscita:', answers:['Hotel California → Bohemian Rhapsody → Smells Like Teen Spirit','Bohemian Rhapsody → Hotel California → Smells Like Teen Spirit','Smells Like Teen Spirit → Bohemian Rhapsody → Hotel California'], correctAnswerIndex:1, points:120, timeLimit:20 },
  { type:'multiple_choice', theme:'musica', question:'In quale paese è nato Mozart?', answers:['Germania','Austria','Italia','Ungheria'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'image_vs_image',  theme:'musica', question:'Chi ha venduto più dischi nella storia?', answers:['ELVIS ◄','THE BEATLES ►'], correctAnswerIndex:1, points:100, timeLimit:18, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Elvis_Presley_promoting_Jailhouse_Rock.jpg/220px-Elvis_Presley_promoting_Jailhouse_Rock.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/The_Fabs.JPG/220px-The_Fabs.JPG' },
  { type:'speed_round',     theme:'musica', question:'Quante note musicali di base esistono?', answers:['5','7','12'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'musica', question:'Come si chiama la nota musicale che segue il "Sol"?', answers:['Fa','La','Si','Do'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'musica', question:'Jimi Hendrix era mancino ma suonava con la chitarra destra capovolta.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:15 },
  { type:'multiple_choice', theme:'musica', question:'Quale famosa cantante è soprannominata "Lady Gaga"?', answers:['Stefani Germanotta','Alicia Keys','Beyoncé','Rihanna'], correctAnswerIndex:0, points:100, timeLimit:15 },
  { type:'final_bomb',      theme:'musica', question:'Quante settimane è rimasta in cima alle classifiche "Shape of You" di Ed Sheeran in UK?', answers:['8','12','14','16'], correctAnswerIndex:2, points:200, timeLimit:20 },

  // ── SPORT ───────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'sport', question:'Quanti giocatori ci sono in una squadra di pallavolo?', answers:['5','6','7','8'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'sport', question:'Usain Bolt ha corso i 100m in meno di 9.5 secondi.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'sport', question:'In quale paese si svolge il Tour de France?', answers:['Belgio','Spagna','Francia','Italia'], correctAnswerIndex:2, points:100, timeLimit:12 },
  { type:'speed_round',     theme:'sport', question:'Quante ore dura una partita di calcio (tempo regolare)?', answers:['60 min','90 min','120 min'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'sport', question:'Quale paese ha vinto più titoli mondiali di calcio?', answers:['Argentina','Germania','Italia','Brasile'], correctAnswerIndex:3, points:100, timeLimit:15 },
  { type:'progressive_clue', theme:'sport', question:'Di quale sportivo si parla?', answers:['Michael Jordan','Lebron James','Kobe Bryant','Magic Johnson'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È un cestista americano','Ha giocato nei Chicago Bulls','Vinse 6 anelli NBA'] },
  { type:'true_false',      theme:'sport', question:'Il golf è stato introdotto alle Olimpiadi nel 1900.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'order_choice',    theme:'sport', question:'Ordina per numero di Mondiali vinti (calcio):', answers:['Italia(4) → Germania(4) → Brasile(5)','Brasile(5) → Italia(4) → Germania(4)','Germania(4) → Brasile(5) → Italia(4)'], correctAnswerIndex:1, points:120, timeLimit:20 },
  { type:'multiple_choice', theme:'sport', question:'Quale atleta ha vinto il maggior numero di ori olimpici nella storia?', answers:['Carl Lewis','Michael Phelps','Usain Bolt','Mark Spitz'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'image_vs_image',  theme:'sport', question:'Chi è più alto?', answers:['LEBRON JAMES ◄','CRISTIANO RONALDO ►'], correctAnswerIndex:0, points:100, timeLimit:15, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/LeBron_James_%2851959977144%29_%28cropped%29.jpg/220px-LeBron_James_%2851959977144%29_%28cropped%29.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Cristiano_Ronaldo_2018.jpg/220px-Cristiano_Ronaldo_2018.jpg' },
  { type:'speed_round',     theme:'sport', question:'In quale sport si usa il "birdie"?', answers:['Tennis','Golf','Bowling'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'sport', question:'Quale squadra italiana di calcio ha vinto più scudetti?', answers:['Inter','Milan','Roma','Juventus'], correctAnswerIndex:3, points:100, timeLimit:15 },
  { type:'true_false',      theme:'sport', question:'La maratona è lunga esattamente 42,195 km.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'sport', question:'Dove si svolgono le Olimpiadi del 2028?', answers:['Parigi','Sydney','Los Angeles','Brisbane'], correctAnswerIndex:2, points:100, timeLimit:18 },
  { type:'final_bomb',      theme:'sport', question:'Quanti Grand Slam ha vinto Novak Djokovic (al 2024)?', answers:['20','22','24','26'], correctAnswerIndex:2, points:200, timeLimit:20 },

  // ── MATRIMONIO ──────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'matrimonio', question:'Quale fiore è tradizionalmente associato al matrimonio?', answers:['Tulipano','Girasole','Rosa bianca','Garofano'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'matrimonio', question:'In Italia il confetto da matrimonio è tradizionalmente bianco.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'matrimonio', question:'In quale anno la principessa Diana si è sposata con Carlo?', answers:['1979','1981','1983','1985'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'matrimonio', question:'Il bouquet della sposa viene tradizionalmente lanciato...', answers:['Prima','Durante','Dopo la cerimonia'], correctAnswerIndex:2, points:100, timeLimit:5 },
  { type:'progressive_clue', theme:'matrimonio', question:'Quale tradizione di nozze si descrive?', answers:['Valzer degli sposi','Taglio della torta','Lancio del bouquet','Lancio del riso'], correctAnswerIndex:3, points:150, timeLimit:25, clues:['Si svolge dopo la cerimonia','Gli ospiti partecipano lanciando qualcosa','Simboleggia prosperità e fertilità'] },
  { type:'true_false',      theme:'matrimonio', question:'La luna di miele prende il nome da una bevanda di miele.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'matrimonio', question:'Quante volte si può dire "sì" in un matrimonio civile italiano (max legale)?', answers:['1','2','3','Illimitato'], correctAnswerIndex:3, points:100, timeLimit:18 },
  { type:'order_choice',    theme:'matrimonio', question:'Ordina questi momenti tipici di un matrimonio:', answers:['Cerimonia → Ricevimento → Luna di miele','Luna di miele → Cerimonia → Ricevimento','Ricevimento → Luna di miele → Cerimonia'], correctAnswerIndex:0, points:120, timeLimit:15 },
  { type:'multiple_choice', theme:'matrimonio', question:'Quale dito si usa tradizionalmente per la fede nuziale?', answers:['Pollice','Indice','Anulare','Mignolo'], correctAnswerIndex:2, points:100, timeLimit:12 },
  { type:'true_false',      theme:'matrimonio', question:'Il colore bianco del vestito da sposa è una tradizione millenaria.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'matrimonio', question:'Cosa rappresenta tradizionalmente il confetto al matrimonio italiano?', answers:['Ricchezza','Fertilità e dolcezza','Amore eterno','Fortuna'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'matrimonio', question:'La frase "lo voglio" si dice...', answers:['Prima degli anelli','Dopo gli anelli','Con gli anelli'], correctAnswerIndex:0, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'matrimonio', question:'In quale regione italiana è più diffusa la tradizione della "serenata" pre-matrimoniale?', answers:['Lombardia','Toscana','Sicilia e Sud Italia','Veneto'], correctAnswerIndex:2, points:100, timeLimit:18 },
  { type:'image_vs_image',  theme:'matrimonio', question:'Quale torta nuziale è più tradizionale in Italia?', answers:['MILLEFOGLIE ◄','NAKED CAKE ►'], correctAnswerIndex:0, points:100, timeLimit:15, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Millefoeglie_pasticceria.jpg/320px-Millefoeglie_pasticceria.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Naked_cake.jpg/320px-Naked_cake.jpg' },
  { type:'final_bomb',      theme:'matrimonio', question:'In quante regioni italiane è legalmente riconosciuto l\'unione civile tra persone dello stesso sesso?', answers:['Solo alcune','Metà','Tutte e 20','Solo al nord'], correctAnswerIndex:2, points:200, timeLimit:20 },

  // ── ANNI 90 ─────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'anni90', question:'Quale console Nintendo è uscita nel 1990?', answers:['NES','Super NES','Nintendo 64','Game Boy Color'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'anni90', question:'"Titanic" di James Cameron è uscito negli anni 90.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'anni90', question:'Quale gruppo popolare degli anni 90 cantava "Wannabe"?', answers:['Backstreet Boys','Spice Girls','NSYNC','Take That'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'anni90', question:'Come si chiamavano le Tartarughe Ninja degli anni 90?', answers:['Artisti rinascimentali','Animali','Colori'], correctAnswerIndex:0, points:100, timeLimit:5 },
  { type:'progressive_clue', theme:'anni90', question:'Di quale film animato si parla?', answers:['Il Re Leone','Aladdin','La Sirenetta','La Bella e la Bestia'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È un film Disney del 1994','Ambientato in Africa','Il personaggio principale si chiama Simba'] },
  { type:'multiple_choice', theme:'anni90', question:'Quale famoso videogioco ha fatto il suo debutto nel 1996?', answers:['Pac-Man','Pokemon','Tetris','Zelda'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'anni90', question:'Nirvana era un gruppo musicale degli anni 90.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:10 },
  { type:'order_choice',    theme:'anni90', question:'Ordina per anno di uscita:', answers:['Home Alone(1990) → Lion King(1994) → Titanic(1997)','Titanic(1997) → Home Alone(1990) → Lion King(1994)','Lion King(1994) → Home Alone(1990) → Titanic(1997)'], correctAnswerIndex:0, points:120, timeLimit:20 },
  { type:'multiple_choice', theme:'anni90', question:'Quale tecnologia di comunicazione ha rivoluzionato gli anni 90?', answers:['Il fax','Gli SMS','La posta elettronica','Il cercapersone'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'image_vs_image',  theme:'anni90', question:'Quale film ha incassato di più al cinema negli anni 90?', answers:['HOME ALONE ◄','TITANIC ►'], correctAnswerIndex:1, points:100, timeLimit:15, imageA:'https://upload.wikimedia.org/wikipedia/en/thumb/7/76/Home_alone_poster.jpg/220px-Home_alone_poster.jpg', imageB:'https://upload.wikimedia.org/wikipedia/en/thumb/9/9d/Titanic_%281997_film%29_poster.png/220px-Titanic_%281997_film%29_poster.png' },
  { type:'speed_round',     theme:'anni90', question:'In quale anno è stato fondato Google?', answers:['1996','1998','2000'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'anni90', question:'Quale pop star aveva il soprannome "Baby One More Time"?', answers:['Mariah Carey','Britney Spears','Christina Aguilera','Madonna'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'anni90', question:'Il Tamagotchi è stato inventato in Giappone.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'anni90', question:'Come si chiamava il dinosauro protagonista del film del 1993?', answers:['T-Rex','Barney','Rex','Dino'], correctAnswerIndex:0, points:100, timeLimit:15 },
  { type:'final_bomb',      theme:'anni90', question:'Quante stagioni ha avuto Friends, la popolare serie TV degli anni 90/2000?', answers:['8','10','12','14'], correctAnswerIndex:1, points:200, timeLimit:20 },

  // ── SICILIA ─────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'sicilia', question:'Qual è il vulcano attivo più alto d\'Europa?', answers:['Vesuvio','Stromboli','Etna','Vulcano'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'true_false',      theme:'sicilia', question:'La Sicilia è l\'isola più grande del Mediterraneo.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'sicilia', question:'Quale dolce siciliano è a base di ricotta, canditi e pasta di mandorle?', answers:['Sfogliatella','Cannolo','Babà','Cassata'], correctAnswerIndex:3, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'sicilia', question:'Come si chiamano i famosi arancini siciliani nel palermitano?', answers:['Arancini','Arancine','Arancinotti'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'progressive_clue', theme:'sicilia', question:'Di quale città siciliana si parla?', answers:['Palermo','Catania','Messina','Trapani'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È la capitale della Sicilia','Ospita il mercato storico della Vucciria','Si trova nella parte nord-occidentale dell\'isola'] },
  { type:'multiple_choice', theme:'sicilia', question:'Quale popolo ha dominato la Sicilia prima dei Romani?', answers:['Fenici','Cartaginesi','Greci','Normanni'], correctAnswerIndex:2, points:100, timeLimit:18 },
  { type:'true_false',      theme:'sicilia', question:'La Valle dei Templi si trova ad Agrigento.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'order_choice',    theme:'sicilia', question:'Ordina queste città siciliane per popolazione (crescente):', answers:['Trapani → Messina → Palermo','Palermo → Messina → Trapani','Messina → Trapani → Palermo'], correctAnswerIndex:0, points:120, timeLimit:20 },
  { type:'multiple_choice', theme:'sicilia', question:'Come si chiama il dialetto tipico del personaggio del Commissario Montalbano?', answers:['Catanese','Ragusano','Palermitano','Agrigentino'], correctAnswerIndex:1, points:100, timeLimit:18 },
  { type:'image_vs_image',  theme:'sicilia', question:'Quale street food siciliano è più iconico?', answers:['CANNOLO ◄','ARANCINO ►'], correctAnswerIndex:0, points:100, timeLimit:15, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Genuine_cannoli.jpg/320px-Genuine_cannoli.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Arancine_%28Sicilian_snack%29.jpg/320px-Arancine_%28Sicilian_snack%29.jpg' },
  { type:'speed_round',     theme:'sicilia', question:'Il simbolo della Sicilia si chiama...', answers:['Trinacria','Trinità','Tridente'], correctAnswerIndex:0, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'sicilia', question:'In quale città siciliana si trova il teatro greco più grande del mondo antico?', answers:['Palermo','Siracusa','Agrigento','Selinunte'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'sicilia', question:'Lo Stretto di Messina separa la Sicilia dalla Sardegna.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'sicilia', question:'Il pane con la milza è un tipico street food di...', answers:['Catania','Trapani','Palermo','Messina'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'final_bomb',      theme:'sicilia', question:'Quante province ha la Sicilia?', answers:['7','8','9','10'], correctAnswerIndex:2, points:200, timeLimit:18 },

  // ── BAMBINI ─────────────────────────────────────────────────────────────────
  { type:'multiple_choice', theme:'bambini', question:'Di che colore è Peppa Pig?', answers:['Giallo','Rosa','Rosso','Arancione'], correctAnswerIndex:1, points:100, timeLimit:12 },
  { type:'true_false',      theme:'bambini', question:'Pinocchio è burattino di legno.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:10 },
  { type:'multiple_choice', theme:'bambini', question:'Quante stelle hanno le stelle di Natale nella canzone?', answers:['4','5','6','7'], correctAnswerIndex:1, points:100, timeLimit:12 },
  { type:'speed_round',     theme:'bambini', question:'Di che colore è Elmo di Sesame Street?', answers:['Blu','Verde','Rosso'], correctAnswerIndex:2, points:100, timeLimit:5 },
  { type:'progressive_clue', theme:'bambini', question:'Di quale personaggio si parla?', answers:['Spiderman','Batman','Superman','Flash'], correctAnswerIndex:2, points:150, timeLimit:25, clues:['È un supereroe','Può volare','Viene dal pianeta Krypton'] },
  { type:'multiple_choice', theme:'bambini', question:'Quante streghe ci sono nella fiaba Biancaneve?', answers:['1','2','3','4'], correctAnswerIndex:0, points:100, timeLimit:12 },
  { type:'true_false',      theme:'bambini', question:'Mickey Mouse è un personaggio Pixar.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:12 },
  { type:'order_choice',    theme:'bambini', question:'Ordina per altezza della voce (più acuta prima):', answers:['Topolino → Paperino → Pluto','Pluto → Paperino → Topolino','Paperino → Topolino → Pluto'], correctAnswerIndex:0, points:120, timeLimit:15 },
  { type:'multiple_choice', theme:'bambini', question:'In quale paese vive Babbo Natale secondo la tradizione?', answers:['Norvegia','Finlandia','Islanda','Svezia'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'image_vs_image',  theme:'bambini', question:'Quale animale può nuotare?', answers:['CANE ◄','GATTO ►'], correctAnswerIndex:0, points:100, timeLimit:12, imageA:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/YellowLabradorLooking_new.jpg/220px-YellowLabradorLooking_new.jpg', imageB:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/220px-Cat_November_2010-1a.jpg' },
  { type:'speed_round',     theme:'bambini', question:'Quante zampe ha un gatto?', answers:['2','4','6'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'bambini', question:'Come si chiama il pesce amico di Nemo?', answers:['Dory','Gill','Bruce','Pearl'], correctAnswerIndex:0, points:100, timeLimit:12 },
  { type:'true_false',      theme:'bambini', question:'Nella storia di Cenerentola, la carrozza era una zucca trasformata.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'bambini', question:'Di che animale è fatto il mantello di Bambi?', answers:['Cervo','Coniglio','Lepre','Daino'], correctAnswerIndex:0, points:100, timeLimit:12 },
  { type:'final_bomb',      theme:'bambini', question:'Come si chiama il villaggio dove vive Asterix?', answers:['Armorica','Gallia','Lutezia','Il villaggio dei Galli irriducibili'], correctAnswerIndex:3, points:200, timeLimit:20 },

  // ── CUSTOM (generic fallback questions) ─────────────────────────────────────
  { type:'multiple_choice', theme:'custom', question:'Quante ore ha un giorno?', answers:['12','18','24','48'], correctAnswerIndex:2, points:100, timeLimit:10 },
  { type:'true_false',      theme:'custom', question:'Il ghiaccio è più leggero dell\'acqua.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:12 },
  { type:'multiple_choice', theme:'custom', question:'Qual è il colore ottenuto mescolando rosso e giallo?', answers:['Verde','Viola','Arancione','Marrone'], correctAnswerIndex:2, points:100, timeLimit:12 },
  { type:'speed_round',     theme:'custom', question:'Quanti giorni ha febbraio in un anno bisestile?', answers:['27','28','29'], correctAnswerIndex:2, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'custom', question:'Qual è il numero primo più piccolo?', answers:['1','2','3','5'], correctAnswerIndex:1, points:100, timeLimit:12 },
  { type:'true_false',      theme:'custom', question:'I canguri vivono in Australia.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:10 },
  { type:'progressive_clue', theme:'custom', question:'Di quale paese si parla?', answers:['Giappone','Cina','Corea del Sud','Taiwan'], correctAnswerIndex:0, points:150, timeLimit:25, clues:['È un paese dell\'Asia orientale','È formato da isole','La sua capitale si chiama Tokyo'] },
  { type:'multiple_choice', theme:'custom', question:'Quante ossa ha il corpo umano adulto?', answers:['186','206','226','256'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'order_choice',    theme:'custom', question:'Ordina per dimensione (crescente):', answers:['Atomo → Cellula → Corpo umano','Corpo umano → Cellula → Atomo','Cellula → Corpo umano → Atomo'], correctAnswerIndex:0, points:120, timeLimit:15 },
  { type:'true_false',      theme:'custom', question:'La luna ha la propria luce.', answers:['VERO','FALSO'], correctAnswerIndex:1, points:80, timeLimit:10 },
  { type:'multiple_choice', theme:'custom', question:'Quale metallo è liquido a temperatura ambiente?', answers:['Piombo','Alluminio','Mercurio','Zinco'], correctAnswerIndex:2, points:100, timeLimit:15 },
  { type:'speed_round',     theme:'custom', question:'Quante ore ci sono in una settimana?', answers:['100','168','200'], correctAnswerIndex:1, points:100, timeLimit:5 },
  { type:'multiple_choice', theme:'custom', question:'Come si chiama il processo per cui le piante producono ossigeno?', answers:['Respirazione','Fotosintesi','Digestione','Evaporazione'], correctAnswerIndex:1, points:100, timeLimit:15 },
  { type:'true_false',      theme:'custom', question:'L\'oro è un metallo.', answers:['VERO','FALSO'], correctAnswerIndex:0, points:80, timeLimit:10 },
  { type:'final_bomb',      theme:'custom', question:'Quante lingue ufficiali ha la Svizzera?', answers:['2','3','4','5'], correctAnswerIndex:2, points:200, timeLimit:18 },
];

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i]!, a[j]!] = [a[j]!, a[i]!];
  }
  return a;
}

let _idCounter = 0;
function makeId(): string {
  return `q_${Date.now()}_${++_idCounter}`;
}

const TIME_LIMITS: Record<QuestionType, number> = {
  multiple_choice:  15,
  true_false:       12,
  image_vs_image:   15,
  speed_round:       8,
  progressive_clue: 25,
  order_choice:     18,
  final_bomb:       20,
};

function validateAndRepair(raw: Record<string, unknown>, theme: string): QuizQuestion | null {
  const type = (raw['type'] as string) ?? 'multiple_choice';
  const question = (raw['question'] as string)?.trim();
  if (!question) return null;

  const answers = Array.isArray(raw['answers']) ? (raw['answers'] as unknown[]).map(String) : [];
  if (answers.length < 2) return null;

  const correctAnswerIndex = Number(raw['correctAnswerIndex'] ?? raw['correct_answer_index'] ?? 0);
  if (correctAnswerIndex < 0 || correctAnswerIndex >= answers.length) return null;

  const points  = Number(raw['points']    ?? 100);
  const timeLimit = Number(raw['timeLimit'] ?? raw['time_limit'] ?? TIME_LIMITS[type as QuestionType] ?? 15);

  let imageA = raw['imageA'] as string | undefined;
  let imageB = raw['imageB'] as string | undefined;

  if (type === 'image_vs_image') {
    const labelA = answers[0] ?? 'A';
    const labelB = answers[1] ?? 'B';
    if (!imageA) imageA = `https://placehold.co/600x400/1a1a2e/F5B642?text=${encodeURIComponent(labelA)}`;
    if (!imageB) imageB = `https://placehold.co/600x400/1a1a2e/F5B642?text=${encodeURIComponent(labelB)}`;
  }

  return {
    id: makeId(),
    type: type as QuestionType,
    theme,
    question,
    answers,
    correctAnswerIndex,
    imageA,
    imageB,
    clues: Array.isArray(raw['clues']) ? (raw['clues'] as string[]) : undefined,
    points:    Math.max(50, Math.round(points)),
    timeLimit: Math.max(5, Math.round(timeLimit)),
  };
}

async function generateQuizQuestionsAI(
  themeText: string,
  count: number,
  difficulty: "easy" | "medium" | "hard",
): Promise<QuizQuestion[]> {
  const baseUrl = process.env['AI_INTEGRATIONS_OPENAI_BASE_URL'];
  const apiKey  = process.env['AI_INTEGRATIONS_OPENAI_API_KEY'];
  if (!baseUrl || !apiKey) throw new Error("AI env vars not set");

  const timeMult = difficulty === "easy" ? 1.4 : difficulty === "hard" ? 0.7 : 1.0;
  const ptsMult  = difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.25 : 1.0;

  const systemPrompt = `Sei Jonny, il co-host di IDEAgame, un'app di quiz per feste italiane.
Genera esattamente ${count} domande sul tema: "${themeText}".
TUTTE le domande DEVONO essere strettamente sul tema indicato.
Rispondi SOLO con un array JSON valido. Nessun testo aggiuntivo.

Struttura ogni domanda:
{
  "type": "multiple_choice"|"true_false"|"image_vs_image"|"speed_round"|"progressive_clue"|"order_choice"|"final_bomb",
  "question": "testo della domanda",
  "answers": ["risposta A","risposta B","risposta C","risposta D"],
  "correctAnswerIndex": 0,
  "imageA": "URL immagine solo per image_vs_image (opzionale)",
  "imageB": "URL immagine solo per image_vs_image (opzionale)",
  "clues": ["indizio 1","indizio 2","indizio 3"] // solo per progressive_clue,
  "points": 100,
  "timeLimit": 15
}

Regole:
- true_false: answers deve essere ["VERO","FALSO"]
- speed_round: 3 risposte, timeLimit = 8
- image_vs_image: 2 risposte (etichette tipo "HARRY ◄","HERMIONE ►"), fornisci imageA e imageB se possibile
- final_bomb: ultima domanda, points = 200, timeLimit = 20
- progressive_clue: clues array con 3 indizi
- Usa sempre l'italiano.
- L'ultima domanda DEVE essere di tipo "final_bomb".
- Mix di tipi: almeno 1 true_false, 1 speed_round.`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.8,
      max_tokens: 3000,
    }),
  });

  if (!resp.ok) throw new Error(`AI error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? '[]';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>[];

  const valid: QuizQuestion[] = [];
  for (const q of parsed) {
    const repaired = validateAndRepair(q, themeText);
    if (repaired) {
      valid.push({
        ...repaired,
        timeLimit: Math.max(5, Math.round(repaired.timeLimit * timeMult)),
        points:    Math.round(repaired.points * ptsMult),
      });
    }
  }
  return valid;
}

export function generateQuiz(themeId: string, count: number, difficulty: "easy" | "medium" | "hard" = "medium"): QuizQuestion[] {
  const normalizedTheme = themeId === 'fallback' ? 'cultura_generale' : themeId;
  const pool = BANK.filter(q => q.theme === normalizedTheme);
  const fallback = BANK.filter(q => q.theme === 'cultura_generale');
  const source = pool.length >= 5 ? pool : fallback;

  const finals   = shuffleArr(source.filter(q => q.type === 'final_bomb'));
  const regulars = shuffleArr(source.filter(q => q.type !== 'final_bomb'));
  const taken = regulars.slice(0, Math.max(count - 1, 1));

  const desiredTypes: QuestionType[] = ['true_false', 'speed_round', 'progressive_clue'];
  for (const dt of desiredTypes) {
    const hasType = taken.some(q => q.type === dt);
    if (!hasType && taken.length < count - 1) {
      const extra = source.find(q => q.type === dt && !taken.includes(q));
      if (extra) taken.push(extra);
    }
  }

  if (taken.length < count - 1) {
    const pad = shuffleArr(BANK.filter(q => q.theme === 'custom' && q.type !== 'final_bomb'))
      .filter(q => !taken.includes(q))
      .slice(0, count - 1 - taken.length);
    taken.push(...pad);
  }

  const finalQ = finals[0] ?? shuffleArr(BANK.filter(q => q.type === 'final_bomb'))[0];
  const questions: QuizQuestion[] = [
    ...shuffleArr(taken).slice(0, count - 1),
    ...(finalQ ? [finalQ] : []),
  ].map(q => ({ ...q, id: makeId() }));

  const timeMult = difficulty === "easy" ? 1.4 : difficulty === "hard" ? 0.7 : 1.0;
  const ptsMult  = difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.25 : 1.0;
  return questions.map(q => ({
    ...q,
    timeLimit: Math.max(5, Math.round(q.timeLimit * timeMult)),
    points:    Math.round(q.points * ptsMult),
  }));
}

/** Async entry point: uses AI for custom/unknown themes, bank for known themes. */
export async function generateQuizAsync(
  themeId: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<QuizQuestion[]> {
  const knownTheme = QUIZ_THEMES.find(t => t.id === themeId);
  const hasBank    = knownTheme && BANK.filter(q => q.theme === themeId).length >= 5;

  if (!hasBank) {
    const themeText = knownTheme ? knownTheme.label : themeId;
    try {
      const aiQuestions = await generateQuizQuestionsAI(themeText, count, difficulty);
      if (aiQuestions.length >= Math.min(count, 3)) {
        return aiQuestions.slice(0, count);
      }
    } catch (err) {
      console.error('[QUIZ_GENERATE] AI failed, using bank fallback', err instanceof Error ? err.message : err);
    }
    const bankQuestions = generateQuiz('cultura_generale', count, difficulty);
    return bankQuestions.map(q => ({ ...q, theme: themeId }));
  }

  return generateQuiz(themeId, count, difficulty);
}

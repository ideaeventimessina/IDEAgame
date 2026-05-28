import OpenAI from "openai";
import { logger } from "./logger.js";

export interface WordBackRound {
  mode: "home-wordback";
  roundIndex: number;
  setName: string;
  word: string;
  tabooWords: string[];
  hint: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  timeLimit: number;
  guessed: boolean;
}

export const WB_PRESET_PACKS = [
  { id: "film",        name: "Film & Cinema",       emoji: "🎬" },
  { id: "musica",      name: "Musica",               emoji: "🎵" },
  { id: "sport",       name: "Sport",                emoji: "⚽" },
  { id: "disney",      name: "Disney & Animazione",  emoji: "🏰" },
  { id: "oggetti",     name: "Oggetti",              emoji: "🔧" },
  { id: "personaggi",  name: "Personaggi famosi",    emoji: "⭐" },
  { id: "cibo",        name: "Cibo & Cucina",        emoji: "🍕" },
  { id: "animali",     name: "Animali",              emoji: "🐘" },
  { id: "cultura",     name: "Cultura Generale",     emoji: "📚" },
] as const;

export type WbPresetId = typeof WB_PRESET_PACKS[number]["id"];

interface WordEntry { word: string; taboo: string[]; hint: string }

// ── Static word banks (9 categories × 15 entries) ─────────────────────────────

const BANK: Record<string, WordEntry[]> = {
  film: [
    { word: "Titanic",          taboo: ["Nave","Oceano","Naufragio","DiCaprio","Ghiacciaio"],   hint: "Film romantico con disastro navale" },
    { word: "Avatar",           taboo: ["Blu","Pianeta","Alieno","Pandora","Foresta"],           hint: "Film con creature blu su Pandora" },
    { word: "Gladiatore",       taboo: ["Arena","Roma","Spada","Colosseo","Combattimento"],     hint: "Film con Russell Crowe a Roma" },
    { word: "Joker",            taboo: ["Villain","Batman","Clown","Gotham","Riso"],            hint: "Supercriminale di Gotham City" },
    { word: "Frozen",           taboo: ["Elsa","Neve","Ghiaccio","Principessa","Sorella"],      hint: "Film Disney con la regina del ghiaccio" },
    { word: "Jurassic Park",    taboo: ["Dinosauro","Isola","Giurassico","T-Rex","DNA"],        hint: "Parco con animali preistorici" },
    { word: "Matrix",           taboo: ["Simulazione","Realtà","Computer","Neo","Pillola"],     hint: "Fantascienza con Keanu Reeves" },
    { word: "Shrek",            taboo: ["Orco","Palude","Asinello","Principessa","Verde"],      hint: "Orco verde animato" },
    { word: "Interstellar",     taboo: ["Spazio","Wormhole","Buco nero","Astronauta","Nolan"], hint: "Film di Nolan sullo spazio-tempo" },
    { word: "Indiana Jones",    taboo: ["Cappello","Frusta","Archeologia","Avventura","Serpenti"], hint: "Avventuriero con cappello di paglia" },
    { word: "Rocky",            taboo: ["Boxe","Allenamento","Campione","Philadelphia","Ring"], hint: "Pugile famoso del cinema" },
    { word: "Forrest Gump",     taboo: ["Correre","Tom Hanks","Vietnam","Cioccolatini","Piuma"], hint: "Personaggio che corre attraverso l'America" },
    { word: "Il Padrino",       taboo: ["Mafia","Don","Sicilia","Offerta","Brando"],            hint: "Film sulla criminalità organizzata" },
    { word: "Bambi",            taboo: ["Cerbiatto","Foresta","Mamma","Renna","Animale"],       hint: "Piccolo cervo Disney" },
    { word: "Terminator",       taboo: ["Robot","Futuro","Arnie","Pistola","Cyborg"],           hint: "Robot assassino dal futuro" },
  ],
  musica: [
    { word: "Chitarra",         taboo: ["Corde","Rock","Strumento","Suonare","Plettro"],        hint: "Strumento a corde del rock" },
    { word: "Concerto",         taboo: ["Palco","Cantante","Stadio","Pubblico","Live"],         hint: "Spettacolo musicale dal vivo" },
    { word: "Sanremo",          taboo: ["Festival","Italia","Canzone","RAI","Liguria"],         hint: "Festival della canzone italiana" },
    { word: "Discoteca",        taboo: ["Ballo","DJ","Notte","Pista","Locale"],                 hint: "Locale notturno con musica" },
    { word: "Microfono",        taboo: ["Cantare","Voce","Studio","Registrare","Amplificare"], hint: "Amplifica la voce" },
    { word: "Vinile",           taboo: ["Disco","33 giri","Giradischi","Analogico","Vecchio"], hint: "Supporto audio retrò" },
    { word: "Beatles",          taboo: ["Inglesi","John","Rock","Liverpool","Paul"],            hint: "Famoso gruppo rock anni '60" },
    { word: "Karaoke",          taboo: ["Cantare","Giapponese","Testo","Schermo","Base"],       hint: "Cantare su basi musicali" },
    { word: "Freddie Mercury",  taboo: ["Queen","Rock","Bohemian","Baffi","Voce"],             hint: "Frontman dei Queen" },
    { word: "Michael Jackson",  taboo: ["Moonwalk","Pop","King","Americano","Danza"],           hint: "Il Re del Pop" },
    { word: "Rap",              taboo: ["Hip hop","Rime","Ritmo","Rapper","Beat"],              hint: "Stile musicale con testo ritmato parlato" },
    { word: "Orchestra",        taboo: ["Strumenti","Direttore","Classica","Violino","Bacchetta"], hint: "Grande ensemble musicale classico" },
    { word: "Accordo",          taboo: ["Note","Chitarra","Pianoforte","Musica","Armonia"],    hint: "Più note suonate insieme" },
    { word: "Spotify",          taboo: ["Streaming","App","Playlist","Digitale","Cuffie"],     hint: "Piattaforma di streaming musicale" },
    { word: "Basso",            taboo: ["Chitarra","Frequenza","Grave","Band","Strumento"],    hint: "Strumento grave della band" },
  ],
  sport: [
    { word: "Calcio",           taboo: ["Pallone","Gol","Porta","Campo","Squadra"],            hint: "Sport più popolare al mondo" },
    { word: "Tennis",           taboo: ["Racchetta","Wimbledon","Rete","Federer","Palla"],     hint: "Sport con racchetta e pallina" },
    { word: "Nuoto",            taboo: ["Piscina","Vasca","Acqua","Stile","Rana"],             hint: "Sport acquatico olimpico" },
    { word: "Pallacanestro",    taboo: ["Canestro","NBA","Palla","Basket","Rimbalzo"],         hint: "Sport con canestro alto" },
    { word: "Maratona",         taboo: ["42 km","Correre","Resistenza","Atene","Atletica"],    hint: "Gara di corsa su lunga distanza" },
    { word: "Ciclismo",         taboo: ["Bicicletta","Giro","Pedalare","Tour","Ruote"],        hint: "Sport su due ruote" },
    { word: "Formula 1",        taboo: ["Macchina","Pilota","Circuito","GP","Ferrari"],        hint: "Corse automobilistiche veloci" },
    { word: "Olimpiadi",        taboo: ["Medaglia","Atleti","Torcia","Anelli","Ogni 4 anni"], hint: "Evento sportivo internazionale" },
    { word: "Sci",              taboo: ["Neve","Montagna","Piste","Discesa","Slalom"],         hint: "Sport invernale su neve" },
    { word: "Rugby",            taboo: ["Ovale","Mischia","Meta","Tackle","Inglese"],          hint: "Sport con palla ovale" },
    { word: "Golf",             taboo: ["Buca","Mazza","Campo","Par","Verde"],                 hint: "Sport con mazze e buche" },
    { word: "Boxe",             taboo: ["Ring","Pugni","Round","Guantoni","Combattimento"],    hint: "Sport da combattimento con pugni" },
    { word: "Pallavolo",        taboo: ["Rete","Volley","Palla","Spike","Attacco"],            hint: "Sport di squadra con rete alta" },
    { word: "Judo",             taboo: ["Tatami","Giapponese","Kimono","Lotta","Cintura"],    hint: "Arte marziale di lancio" },
    { word: "Scherma",          taboo: ["Spada","Maschera","Duello","Tocco","Stocco"],        hint: "Sport con spade e maschere" },
  ],
  disney: [
    { word: "Cenerentola",      taboo: ["Principe","Zucca","Scarpa","Ballo","Fata"],           hint: "Principessa con scarpetta di cristallo" },
    { word: "Simba",            taboo: ["Leone","Re","Africa","Mufasa","Zia"],                 hint: "Cucciolo di leone del Re Leone" },
    { word: "Topolino",         taboo: ["Mickey","Mouse","Disney","Guanti","Orecchie"],        hint: "Mascotte Disney con orecchie tonde" },
    { word: "Aladdin",          taboo: ["Genio","Lampada","Arabia","Jasmine","Tappeto"],       hint: "Giovane con lampada magica" },
    { word: "Rapunzel",         taboo: ["Capelli","Torre","Principe","Lanterne","Lunghi"],    hint: "Principessa con capelli lunghissimi" },
    { word: "Nemo",             taboo: ["Pesce","Oceano","Padre","Clownfish","Tartaruga"],     hint: "Pesce pagliaccio Disney" },
    { word: "Buzz Lightyear",   taboo: ["Toy Story","Astronauta","Giocattolo","Woody","Spazio"], hint: "Personaggio spaziale di Toy Story" },
    { word: "Biancaneve",       taboo: ["Specchio","Mela","Regina","Nani","Principe"],        hint: "Principessa con sette nani" },
    { word: "Pinocchio",        taboo: ["Naso","Bugiardo","Burattino","Legno","Balena"],      hint: "Burattino con naso che cresce" },
    { word: "Mulan",            taboo: ["Cina","Guerriera","Dragone","Esercito","Padre"],     hint: "Guerriera cinese travestita" },
    { word: "Lilo e Stitch",    taboo: ["Alieno","Hawaii","Blu","Esperimento","Surf"],        hint: "Alieno azzurro simile a un cane" },
    { word: "Dumbo",            taboo: ["Elefante","Orecchie","Volare","Circo","Piuma"],      hint: "Elefante con orecchie che vola" },
    { word: "Ariel",            taboo: ["Sirena","Oceano","Rossi","Principe","Conchiglie"],   hint: "Sirenetta con capelli rossi" },
    { word: "Gli Incredibili",  taboo: ["Supereroi","Famiglia","Poteri","Elastico","Pixar"],  hint: "Famiglia di supereroi Pixar" },
    { word: "Coco",             taboo: ["Messico","Morti","Musica","Famiglia","Scheletro"],   hint: "Film Disney-Pixar sul Dia de los Muertos" },
  ],
  oggetti: [
    { word: "Ombrello",         taboo: ["Pioggia","Aprire","Impermeabile","Riparo","Manico"], hint: "Protegge dalla pioggia" },
    { word: "Frigorifero",      taboo: ["Freddo","Cucina","Cibo","Conservare","Elettrodomestico"], hint: "Conserva i cibi freschi" },
    { word: "Orologio",         taboo: ["Tempo","Ore","Lancette","Polso","Minuti"],           hint: "Misura il tempo" },
    { word: "Zaino",            taboo: ["Spalle","Scuola","Borsa","Tracolla","Contenere"],   hint: "Si porta sulle spalle" },
    { word: "Lampada",          taboo: ["Luce","Illuminare","Bulbo","Elettricità","Notte"],  hint: "Fonte di luce artificiale" },
    { word: "Bussola",          taboo: ["Nord","Navigare","Orientamento","Ago","Direzione"], hint: "Indica il nord magnetico" },
    { word: "Specchio",         taboo: ["Riflesso","Vetro","Guardare","Immagine","Bagno"],   hint: "Riflette la tua immagine" },
    { word: "Scala",            taboo: ["Salire","Pioli","Altezza","Pompiere","Costruzione"], hint: "Serve per salire in alto" },
    { word: "Forbici",          taboo: ["Tagliare","Carta","Lame","Parrucchiere","Metallo"], hint: "Due lame per tagliare" },
    { word: "Calendario",       taboo: ["Mesi","Giorni","Date","Muro","Anno"],               hint: "Mostra i giorni del mese" },
    { word: "Cuscino",          taboo: ["Dormire","Letto","Morbido","Testa","Divano"],       hint: "Si mette sotto la testa" },
    { word: "Termometro",       taboo: ["Temperatura","Febbre","Gradi","Mercurio","Medico"], hint: "Misura la temperatura corporea" },
    { word: "Mappamondo",       taboo: ["Globo","Terra","Continenti","Oceani","Rotondo"],    hint: "Sfera che rappresenta la Terra" },
    { word: "Coltello",         taboo: ["Lama","Tagliare","Cucina","Affilato","Acciaio"],   hint: "Utensile da cucina con lama" },
    { word: "Chiave",           taboo: ["Aprire","Porta","Serratura","Metallo","Mazzo"],    hint: "Apre serrature" },
  ],
  personaggi: [
    { word: "Napoleon Bonaparte", taboo: ["Francese","Imperatore","Guerra","Sant'Elena","Corto"], hint: "Imperatore francese famoso" },
    { word: "Cleopatra",        taboo: ["Egitto","Faraone","Regina","Nilo","Cobra"],          hint: "Regina dell'antico Egitto" },
    { word: "Albert Einstein",  taboo: ["Fisica","Relatività","Tedesco","Nobel","Matematica"], hint: "Fisico della relatività" },
    { word: "Cristoforo Colombo", taboo: ["America","Navigatore","1492","Spagna","Scoperta"], hint: "Scoprì l'America" },
    { word: "Leonardo da Vinci", taboo: ["Artista","Inventore","Rinascimento","Monna Lisa","Genio"], hint: "Genio del Rinascimento" },
    { word: "Marco Polo",       taboo: ["Viaggiatore","Cina","Venezia","Seta","Esploratore"], hint: "Viaggiatore veneziano in Cina" },
    { word: "Madre Teresa",     taboo: ["India","Poveri","Calcutta","Nobel","Suora"],         hint: "Suora che aiutava i poveri" },
    { word: "Elvis Presley",    taboo: ["Rock","Memphis","Capelli","Re","Americano"],         hint: "Il Re del Rock and Roll" },
    { word: "Marilyn Monroe",   taboo: ["Attrice","Americana","Bionda","Kennedy","Hollywood"], hint: "Famosa attrice bionda" },
    { word: "Nikola Tesla",     taboo: ["Elettricità","Inventore","Corrente","Edison","Serbo"], hint: "Inventore dell'elettricità alternata" },
    { word: "Gandhi",           taboo: ["India","Pace","Non violenza","Indipendenza","Digiuno"], hint: "Leader indiano per la pace" },
    { word: "Dante Alighieri",  taboo: ["Divina Commedia","Inferno","Poeta","Fiorentino","Beatrice"], hint: "Autore della Divina Commedia" },
    { word: "Galileo Galilei",  taboo: ["Telescopio","Astronomia","Italiano","Terra","Scienza"], hint: "Astronomo italiano del '600" },
    { word: "Che Guevara",      taboo: ["Rivoluzione","Cuba","Argentina","Guerriglia","Basco"], hint: "Rivoluzionario sudamericano" },
    { word: "Sherlock Holmes",  taboo: ["Detective","Londra","Watson","Pipa","Deduzione"],    hint: "Detective immaginario londinese" },
  ],
  cibo: [
    { word: "Lasagna",          taboo: ["Pasta","Besciamella","Ragù","Forno","Strati"],       hint: "Pasta al forno a strati" },
    { word: "Tiramisù",         taboo: ["Dolce","Mascarpone","Caffè","Savoiardi","Italiano"], hint: "Dolce italiano al caffè" },
    { word: "Sushi",            taboo: ["Giapponese","Riso","Pesce crudo","Bacchette","Nori"], hint: "Piatto giapponese con riso" },
    { word: "Hamburger",        taboo: ["Carne","Panino","Fast food","McDonald","Formaggio"], hint: "Panino con polpetta di carne" },
    { word: "Carbonara",        taboo: ["Uova","Pancetta","Roma","Pecorino","Guanciale"],    hint: "Pasta romana con uova e guanciale" },
    { word: "Gelato",           taboo: ["Freddo","Gusto","Cono","Estate","Cremoso"],         hint: "Dessert freddo italiano" },
    { word: "Brioche",          taboo: ["Colazione","Cornetto","Bar","Francese","Forno"],    hint: "Pasta dolce lievitata per colazione" },
    { word: "Parmigiano",       taboo: ["Formaggio","Grattugiato","Parma","Stagionato","Vacca"], hint: "Formaggio italiano stagionato" },
    { word: "Prosciutto",       taboo: ["Salume","Crudo","Parma","Maiale","Affettato"],     hint: "Salume di coscia di maiale" },
    { word: "Cannolo",          taboo: ["Siciliano","Dolce","Ricotta","Croccante","Cilindro"], hint: "Dolce siciliano con ricotta" },
    { word: "Risotto",          taboo: ["Riso","Milano","Cremoso","Brodo","Parmigiano"],    hint: "Riso cremoso italiano" },
    { word: "Bruschetta",       taboo: ["Pane","Pomodoro","Antipasto","Aglio","Tostato"],   hint: "Antipasto con pane e pomodoro" },
    { word: "Mozzarella",       taboo: ["Formaggio","Bufala","Bianca","Pizza","Latte"],     hint: "Formaggio bianco morbido italiano" },
    { word: "Cioccolata",       taboo: ["Cacao","Dolce","Fondente","Barra","Marrone"],      hint: "Dolce a base di cacao" },
    { word: "Spaghetti",        taboo: ["Pasta","Italiana","Lunga","Salsa","Forchetta"],   hint: "Pasta lunga e sottile" },
  ],
  animali: [
    { word: "Elefante",         taboo: ["Grande","Proboscide","Africa","Grigio","Zanne"],    hint: "Il più grande animale terrestre" },
    { word: "Delfino",          taboo: ["Mare","Intelligente","Salto","Mammifero","Grigio"], hint: "Mammifero marino che salta" },
    { word: "Giraffa",          taboo: ["Collo lungo","Africa","Alto","Macchie","Erba"],    hint: "Animale con collo lunghissimo" },
    { word: "Pinguino",         taboo: ["Ghiaccio","Antarctica","Uccello","Nuota","Nero"],  hint: "Uccello che non vola nel freddo" },
    { word: "Koala",            taboo: ["Australia","Eucalipto","Marsupiale","Albero","Addormentato"], hint: "Marsupiale australiano sugli alberi" },
    { word: "Coccodrillo",      taboo: ["Denti","Fiume","Verde","Rettile","Africa"],        hint: "Rettile con denti affilati" },
    { word: "Fenicottero",      taboo: ["Rosa","Gamba","Uccello","Laguna","Equilibrio"],   hint: "Uccello rosa su una gamba sola" },
    { word: "Panda",            taboo: ["Cina","Bambù","Bianco e nero","Orso","Raro"],     hint: "Orso bianco e nero che mangia bambù" },
    { word: "Polpo",            taboo: ["Otto","Tentacoli","Mare","Inchiostro","Mollusco"], hint: "Animale marino con otto tentacoli" },
    { word: "Gufo",             taboo: ["Notte","Occhi grandi","Volare","Saggio","Uccello"], hint: "Uccello notturno con grandi occhi" },
    { word: "Gorilla",          taboo: ["Scimmia","Africa","Forte","Grande","Foresta"],    hint: "La più grande scimmia" },
    { word: "Medusa",           taboo: ["Trasparente","Mare","Pungere","Gelatinosa","Fluttuare"], hint: "Animale marino trasparente" },
    { word: "Leopardo",         taboo: ["Macchie","Africa","Felino","Veloce","Giungla"],   hint: "Felino africano con macchie" },
    { word: "Cigno",            taboo: ["Bianco","Lago","Uccello","Elegante","Collo"],     hint: "Uccello bianco elegante sull'acqua" },
    { word: "Cavallo",          taboo: ["Galoppo","Cavalcare","Fattoria","Crini","Zoccoli"], hint: "Animale da equitazione" },
  ],
  cultura: [
    { word: "Piramide",         taboo: ["Egitto","Faraone","Triangolo","Deserto","Pietra"], hint: "Monumento egizio triangolare" },
    { word: "Venezia",          taboo: ["Gondola","Canale","Acqua","Carnevale","Laguna"],  hint: "Città italiana sull'acqua" },
    { word: "Colosseo",         taboo: ["Roma","Anfiteatro","Gladiatori","Archi","Pietra"], hint: "Anfiteatro romano famoso" },
    { word: "Torre di Pisa",    taboo: ["Pendente","Toscana","Inclinata","Mattoni","Italia"], hint: "Torre italiana che pende" },
    { word: "Mandolino",        taboo: ["Strumento","Corde","Napoletano","Pizzicare","Musica"], hint: "Strumento a corde napoletano" },
    { word: "Opera lirica",     taboo: ["Cantare","Teatro","Soprano","Verdi","Melodramma"], hint: "Forma musicale teatrale cantata" },
    { word: "Carnevale",        taboo: ["Maschera","Venezia","Coriandoli","Costume","Festa"], hint: "Festa con maschere e costumi" },
    { word: "Faro",             taboo: ["Mare","Luce","Costa","Nave","Torre"],             hint: "Torre luminosa per guidare le navi" },
    { word: "Fiat 500",         taboo: ["Macchina","Italiana","Piccola","Torino","Icona"], hint: "Famosa utilitaria italiana" },
    { word: "Corrida",          taboo: ["Toro","Spagna","Torero","Arena","Muleta"],        hint: "Spettacolo tradizionale spagnolo" },
    { word: "Pasta",            taboo: ["Italiana","Grano","Cuocere","Forchetta","Sugo"], hint: "Alimento base della cucina italiana" },
    { word: "Cappuccino",       taboo: ["Caffè","Latte","Spuma","Bar","Mattina"],         hint: "Bevanda italiana con latte schiumoso" },
    { word: "Gondola",          taboo: ["Venezia","Barca","Canale","Gondoliere","Romantico"], hint: "Barca veneziana tipica" },
    { word: "Piazza",           taboo: ["Centro","Fontana","Statua","Città","Incontro"],  hint: "Spazio aperto nel centro della città" },
    { word: "Mosaico",          taboo: ["Tessere","Colorato","Romano","Arte","Pavimento"], hint: "Arte con piccoli tasselli colorati" },
  ],
};

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildRounds(
  entries: WordEntry[],
  count: number,
  setName: string,
  category: string,
  difficulty: "easy" | "medium" | "hard",
): WordBackRound[] {
  const timeMult = difficulty === "easy" ? 1.4 : difficulty === "hard" ? 0.7 : 1.0;
  const ptsMult  = difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.25 : 1.0;
  const shuffled = shuffleArr(entries);
  const result: WordEntry[] = [];
  while (result.length < count) {
    for (const e of shuffled) { if (result.length >= count) break; result.push(e); }
  }
  return result.slice(0, count).map((e, i) => ({
    mode: "home-wordback" as const,
    roundIndex: i,
    setName,
    word: e.word,
    tabooWords: e.taboo,
    hint: e.hint,
    category,
    difficulty,
    points: Math.round(150 * ptsMult),
    timeLimit: Math.max(15, Math.round(45 * timeMult)),
    guessed: false,
  }));
}

// ── Fallback generator (static bank) ─────────────────────────────────────────

export function generateWordBackFallback(
  themeId: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
): WordBackRound[] {
  const pack = WB_PRESET_PACKS.find(p => p.id === themeId);
  const bank = BANK[themeId] ?? BANK["cultura"]!;
  const setName = pack?.name ?? themeId;
  logger.info({ themeId, count, difficulty }, "[WORDBACK_AI_FALLBACK]");
  return buildRounds(bank, count, setName, themeId, difficulty);
}

// ── AI generator ──────────────────────────────────────────────────────────────

export async function generateWordBackRoundsAI(
  theme: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<WordBackRound[]> {
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) throw new Error("AI non configurato");

  const openai = new OpenAI({ baseURL, apiKey });

  const diffLabel = difficulty === "easy"
    ? "Facile — parole comuni e note, taboo ovvi"
    : difficulty === "hard"
    ? "Difficile — parole specifiche, taboo inusuali"
    : "Medio — bilanciato";

  const timeMult = difficulty === "easy" ? 1.4 : difficulty === "hard" ? 0.7 : 1.0;
  const ptsMult  = difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.25 : 1.0;
  const baseTime = Math.max(15, Math.round(45 * timeMult));
  const basePts  = Math.round(150 * ptsMult);

  const systemPrompt = `Sei Jonny, host di un gioco tipo Taboo per feste italiane.
Difficoltà: ${diffLabel}.
Rispondi SOLO con un array JSON valido, senza markdown, senza commenti.`;

  const userPrompt = `Genera esattamente ${count} parole sul tema "${theme}" per il gioco Parola alle Spalle.

Struttura JSON di ogni elemento:
{
  "word": "Parola da indovinare",
  "tabooWords": ["Taboo1", "Taboo2", "Taboo3", "Taboo4", "Taboo5"],
  "hint": "Breve descrizione in italiano per l'host",
  "category": "${theme.toLowerCase().replace(/\s+/g, "_")}"
}

Regole:
- word: facile da descrivere a gesti o parole
- tabooWords: esattamente 5 parole vietate, NON includere word stessa, NO sinonimi diretti
- nessuna parola duplicata tra word
- tutte le parole in italiano
- difficoltà: ${diffLabel}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_completion_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(jsonStr) as Array<{
    word: string; tabooWords: string[]; hint: string; category: string;
  }>;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("AI returned empty");

  return parsed.slice(0, count).map((e, i) => ({
    mode: "home-wordback" as const,
    roundIndex: i,
    setName: theme,
    word: e.word ?? "",
    tabooWords: (e.tabooWords ?? []).slice(0, 5),
    hint: e.hint ?? "",
    category: e.category ?? theme.toLowerCase(),
    difficulty,
    points: basePts,
    timeLimit: baseTime,
    guessed: false,
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateWordBackRounds(
  theme: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
  fallbackThemeId: string = "cultura",
): Promise<WordBackRound[]> {
  logger.info({ theme, count, difficulty }, "[JONNY_WORDBACK_AI] start");
  try {
    const rounds = await generateWordBackRoundsAI(theme, count, difficulty);
    if (!Array.isArray(rounds) || rounds.length === 0) throw new Error("empty");
    logger.info({ theme, count, generated: rounds.length }, "[JONNY_WORDBACK_AI] success");
    return rounds;
  } catch (err) {
    logger.warn({ err, theme }, "[JONNY_WORDBACK_AI] fallback");
    return generateWordBackFallback(fallbackThemeId, count, difficulty);
  }
}

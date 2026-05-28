/* ─── Percorso a Risate — Missioni Improvvise v2 (server copy) ───────────────
   Keep in sync with artifacts/ideagame/src/data/risate-missions.ts
──────────────────────────────────────────────────────────────────────────── */

export type RisatePhase =
  | 'mission_intro'
  | 'booking'
  | 'public_choice'
  | 'active'
  | 'voting'
  | 'result';

export type RisateScoringType = 'star_vote' | 'journalist' | 'head2head' | 'first_found';

export type RisatePublicAction =
  | 'none'
  | 'validate'
  | 'react'
  | 'found'
  | 'ripetilo'
  | 'cambio_stile';

export interface RisateMission {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  emoji: string;
  playerCount: 1 | 2;
  roles: string[];
  phases: RisatePhase[];
  duration: number;
  prepTime?: number;
  scoringType: RisateScoringType;
  activePublicAction: RisatePublicAction;
  activePublicLabel?: string;
  choiceLabel?: string;
  choiceOptions?: string[];
  questions?: string[];
  bgMusic?: string;
  /** true = each booked player gets a different choice (e.g. venditore, sfilata) */
  perPlayerChoice?: boolean;
}

export const RISATE_MISSIONS: RisateMission[] = [
  {
    id: 'giornalista',
    index: 0,
    title: 'NON DIRE "SÌ"',
    subtitle: 'Rispondi a 10 domande in 30 sec senza dire "sì"',
    emoji: '🎙️',
    playerCount: 2,
    roles: ['Concorrente', 'Giornalista'],
    phases: ['mission_intro', 'booking', 'active', 'result'],
    duration: 30,
    scoringType: 'journalist',
    activePublicAction: 'validate',
    activePublicLabel: '🚨 HA DETTO "SÌ"!',
    questions: [
      'Ti stai divertendo?',
      'Vuoi vincere?',
      'Ti piace la pizza?',
      'Sei pronto?',
      'Hai mai mentito?',
      'Hai fame adesso?',
      'Hai Instagram?',
      'Sei competitivo?',
      'Ti piace questa festa?',
      'Vuoi continuare?',
    ],
  },
  {
    id: 'yoga',
    index: 1,
    title: 'YOGA IMPOSSIBILE',
    subtitle: 'Mantieni la posa scelta dal pubblico per 30 secondi',
    emoji: '🧘',
    playerCount: 2,
    roles: ['Yogi 1', 'Yogi 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 35,
    prepTime: 5,
    scoringType: 'star_vote',
    activePublicAction: 'none',
    choiceLabel: 'Scegli la posa yoga!',
    bgMusic: 'bg-yoga-loop',
  },
  {
    id: 'barzelletta',
    index: 2,
    title: 'RACCONTA UNA BARZELLETTA',
    subtitle: 'Fai ridere il pubblico in 45 secondi',
    emoji: '😂',
    playerCount: 2,
    roles: ['Comico 1', 'Comico 2'],
    phases: ['mission_intro', 'booking', 'active', 'voting', 'result'],
    duration: 45,
    scoringType: 'star_vote',
    activePublicAction: 'none',
    bgMusic: 'bg-joke-loop',
  },
  {
    id: 'amore',
    index: 3,
    title: "DICHIARAZIONE D'AMORE",
    subtitle: 'Dichiara il tuo amore al bersaglio scelto in 40 secondi',
    emoji: '❤️',
    playerCount: 1,
    roles: ['Innamorato/a'],
    phases: ['mission_intro', 'booking', 'active', 'voting', 'result'],
    duration: 40,
    scoringType: 'star_vote',
    activePublicAction: 'react',
    bgMusic: 'bg-love-loop',
  },
  {
    id: 'scioglilingua',
    index: 4,
    title: 'SCIOGLILINGUA',
    subtitle: 'Pronuncia più velocemente possibile lo scioglilingua scelto dal pubblico',
    emoji: '👅',
    playerCount: 2,
    roles: ['Performer 1', 'Performer 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 25,
    scoringType: 'star_vote',
    activePublicAction: 'ripetilo',
    activePublicLabel: '🔁 RIPETILO!',
    choiceLabel: 'Scegli lo scioglilingua!',
    choiceOptions: [
      'Sopra la panca la capra campa, sotto la panca la capra crepa',
      'Trentatré trentini entrarono a Trento, tutti e trentatré trotterellando',
      'Apelle figlio di Apollo fece una palla di pelle di pollo',
      "Se l'arcivescovo di Costantinopoli si disarcivescovizzasse chi lo disarcivescovizzerebbe?",
      'Tigre contro tigre, tre tigri contro tre tigri',
      'Nel pozzo lo storto fece il salto e lo storto dal pozzo uscì storto',
    ],
  },
  {
    id: 'venditore',
    index: 5,
    title: 'VENDITORE AMBULANTE',
    subtitle: 'Vendi tutti e 5 i prodotti scelti dal pubblico in 40 secondi',
    emoji: '🛒',
    playerCount: 2,
    roles: ['Venditore 1', 'Venditore 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 40,
    scoringType: 'star_vote',
    activePublicAction: 'none',
    choiceLabel: 'Scegli 5 prodotti da vendere!',
    choiceOptions: [
      'limoni 🍋', 'angurie 🍉', 'patate 🥔', 'melanzane 🍆', 'cipolle 🧅',
      'lattuga 🥬', 'zucchine 🥒', 'pomodori 🍅', 'banane 🍌', 'arance 🍊',
    ],
    bgMusic: 'bg-market-loop',
  },
  {
    id: 'poliglotta',
    index: 6,
    title: 'POLIGLOTTA IMPROVVISATO',
    subtitle: 'Leggi le frasi del pubblico nella lingua scelta col miglior accento possibile',
    emoji: '🌍',
    playerCount: 2,
    roles: ['Poliglotta 1', 'Poliglotta 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 30,
    scoringType: 'star_vote',
    activePublicAction: 'none',
    choiceLabel: 'Che lingua devono parlare?',
    choiceOptions: [
      'English 🇬🇧', 'Español 🇪🇸', 'Français 🇫🇷',
      'Deutsch 🇩🇪', '日本語 🇯🇵', 'Русский 🇷🇺',
      'Português 🇵🇹', 'العربية 🇸🇦',
    ],
    bgMusic: 'bg-world-loop',
  },
  {
    id: 'oggetto',
    index: 7,
    title: "TROVA L'OGGETTO",
    subtitle: 'Trova per primo il bersaglio scelto dal pubblico entro 40 secondi',
    emoji: '🔍',
    playerCount: 2,
    roles: ['Cercatore 1', 'Cercatore 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'result'],
    duration: 40,
    scoringType: 'first_found',
    activePublicAction: 'found',
    choiceLabel: 'Cosa devono trovare?',
    choiceOptions: [
      'qualcosa di rosso 🔴', 'qualcosa di bianco ⚪', 'qualcosa di nero ⚫',
      'qualcosa a punta 📌', 'qualcosa di rotondo ⭕', 'qualcosa che brilla ✨',
      "l'ospite più anziano 👴", "l'ospite più giovane 👶",
      'qualcuno con occhiali 👓', 'qualcuno con cravatta 👔',
    ],
    bgMusic: 'bg-search-loop',
  },
  {
    id: 'sfilata',
    index: 8,
    title: 'SFILATA SEXY',
    subtitle: 'Conquista il pubblico con la tua passerella improvvisata',
    emoji: '💃',
    playerCount: 2,
    roles: ['Modello 1', 'Modella 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 50,
    scoringType: 'head2head',
    activePublicAction: 'none',
    choiceLabel: 'Che musica per la sfilata?',
    choiceOptions: [
      'latino caliente 🌶️', 'disco anni 80 🕺', 'sax sexy 🎷',
      'fashion runway 👠', 'funky 🎸', 'romantic slow 🌹',
    ],
    perPlayerChoice: true,
  },
  {
    id: 'coreografia',
    index: 9,
    title: 'COREOGRAFIA IMPROVVISATA',
    subtitle: 'Inventate una coreografia sulla musica scelta dal pubblico',
    emoji: '🕺',
    playerCount: 2,
    roles: ['Ballerino 1', 'Ballerina 2'],
    phases: ['mission_intro', 'booking', 'public_choice', 'active', 'voting', 'result'],
    duration: 50,
    prepTime: 20,
    scoringType: 'star_vote',
    activePublicAction: 'cambio_stile',
    activePublicLabel: '🔀 CAMBIO STILE!',
    choiceLabel: 'Che musica per la coreografia?',
    choiceOptions: [
      'reggaeton 🔥', 'disco 🪩', 'classica epica 🎻',
      'country 🤠', 'pop anni 2000 ⭐', 'trap assurda 🎤',
    ],
  },
];

/* ─── Yoga poses (30) ─────────────────────────────────────────────────── */
export const YOGA_POSES = [
  { id: 'mountain',     name: 'Posizione della Montagna', emoji: '🏔️' },
  { id: 'warrior1',     name: 'Guerriero 1',              emoji: '⚔️'  },
  { id: 'warrior2',     name: 'Guerriero 2',              emoji: '🗡️'  },
  { id: 'tree',         name: 'Albero',                   emoji: '🌳'  },
  { id: 'downdog',      name: 'Cane a Testa in Giù',      emoji: '🐕'  },
  { id: 'cobra',        name: 'Cobra',                    emoji: '🐍'  },
  { id: 'child',        name: 'Posizione del Bambino',    emoji: '👶'  },
  { id: 'plank',        name: 'Plank',                    emoji: '💪'  },
  { id: 'bridge',       name: 'Ponte',                    emoji: '🌉'  },
  { id: 'pigeon',       name: 'Piccione',                 emoji: '🐦'  },
  { id: 'lotus',        name: 'Loto',                     emoji: '🪷'  },
  { id: 'eagle',        name: 'Aquila',                   emoji: '🦅'  },
  { id: 'crow',         name: 'Corvo',                    emoji: '🦝'  },
  { id: 'camel',        name: 'Cammello',                 emoji: '🐪'  },
  { id: 'boat',         name: 'Barca',                    emoji: '🚤'  },
  { id: 'squat',        name: 'Squat Profondo',           emoji: '🏋️' },
  { id: 'flamingo',     name: 'Fenicottero',              emoji: '🦩'  },
  { id: 'sphinx',       name: 'Sfinge',                   emoji: '🦁'  },
  { id: 'fish',         name: 'Pesce',                    emoji: '🐟'  },
  { id: 'chair',        name: 'Sedia',                    emoji: '🪑'  },
  { id: 'split_stand',  name: 'Spaccata in Piedi',        emoji: '🤸'  },
  { id: 'triangle',     name: 'Triangolo',                emoji: '📐'  },
  { id: 'half_moon',    name: 'Mezzaluna',                emoji: '🌙'  },
  { id: 'bow',          name: 'Arco',                     emoji: '🏹'  },
  { id: 'headstand',    name: 'Testa in Giù',             emoji: '🙃'  },
  { id: 'frog',         name: 'Rana',                     emoji: '🐸'  },
  { id: 'scorpion',     name: 'Scorpione',                emoji: '🦂'  },
  { id: 'forward_fold', name: 'Piegamento Avanti Seduto', emoji: '🧘'  },
  { id: 'corpse',       name: 'Savasana',                 emoji: '😴'  },
  { id: 'happy_baby',   name: 'Bambino Felice',           emoji: '🍼'  },
];

/* ─── Scioglilingua bank — 30 tongue twisters ────────────────────────── */
export const TONGUE_TWISTER_BANK: string[] = [
  'Trentatré trentini entrarono a Trento, tutti e trentatré trotterellando',
  'Sopra la panca la capra campa, sotto la panca la capra crepa',
  'Apelle figlio di Apollo fece una palla di pelle di pollo',
  "Se l'arcivescovo di Costantinopoli si disarcivescovizzasse chi lo disarcivescovizzerebbe?",
  'Tigre contro tigre, tre tigri contro tre tigri',
  'Nel pozzo lo storto fece il salto e lo storto dal pozzo uscì storto',
  'Frugano in fondo al furgone frenetici fruttivendoli frenetici',
  'Porta la coperta rotta al corvo sotto il bordo del porto corto',
  'Sedici, sedicimila sedici, e sedicimilasedici!',
  'Re Carlo era un re calvo, il re calvo era Carlo',
  'Chi è di guardia guardi di là, di là guardi chi è di guardia',
  'Il papa non papà, il papà non papa, papà papa papa',
  'Bufalo gufò, gufò bufalo, bufalo bufò, bufò bufalo',
  'A Capri mi capisce capì, a Capri non capisce nessun capì',
  'Un limone mezzo limone, mezzo limone un limone',
  'La rana nera e rara nella radura raduna le rane nere e rare',
  'Sette sassi spigolosi in sette strette strade sassose',
  'Guglielmo il gaglioffo gargarizza con garofano e glicerina',
  'Bello è il babbo di Beppe e bello è il bimbo di Beppe bello',
  'La gallina di Gregorio gracchiò su un greto del Garda grigio',
  'Pelo di capra, capra di pelo, pelo di capra, capra di pelo',
  'Cielo stellato non stellato, chi lo stellerà, chi lo distell­erà?',
  'Tre mele, sei pele, una mela bela, sei pele tre mele',
  'Fatti i fatti tuoi e lascia fare i fatti degli altri agli altri',
  'Pipa pipa pipì, pipa pipì, pipì pipa, pipa pipì',
  'Sotto i ponti di Praga passa gente frettolosa e presa fresca',
  'Sono cinque cinghiali che cinguettano in cima al campanile',
  'Caro Carla, Carlo canta canzoni carini con calore carissimo',
  'Mi ricordo la rondine che corre nel corridoio corridore',
  'Pesci asciutti e asciutti pesci, pesci asciutti asciugatevi',
];

/* ─── Language phrases ────────────────────────────────────────────────── */
export const LANGUAGE_PHRASES: Record<string, string> = {
  'English 🇬🇧':    'I am the king of the dance floor and I love pizza very much!',
  'Español 🇪🇸':    'Necesito una paella gigante para bailar en la fiesta esta noche!',
  'Français 🇫🇷':   "Je voudrais un croissant au chocolat s'il vous plaît mon ami!",
  'Deutsch 🇩🇪':    'Ich tanze mit einer Kartoffel auf dem großen Tisch ja wirklich!',
  '日本語 🇯🇵':      'Watashi wa sushi to ramen ga daisuki desu totemo oishii ne!',
  'Русский 🇷🇺':    'Ya lyublyu piccu i tantsy pod dozhdem kazhdy vecher!',
  'Português 🇵🇹':  'Quero uma sandes de presunto com queijo e muito obrigado!',
  'العربية 🇸🇦':   'Uhibbu al-pizza wal-musiqa wa-ardaqsu kulla layla!',
};

import OpenAI from "openai";
import { logger } from "./logger.js";

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MusicRoundType =
  | "guess_song"
  | "guess_artist"
  | "complete_lyrics"
  | "speed_music"
  | "song_vs_song"
  | "progressive_clue_music"
  | "final_tormentone"
  | "seconds_bid";

export type ClipType = 'chorus_guess' | 'missing_word' | 'artist_guess' | 'stop_and_continue' | 'duel_song';

export interface YoutubeClip {
  youtubeId: string;
  startSecond: number;
  durationSeconds: number;
  clipType: ClipType;
}

export interface MusicRound {
  id: string;
  type: MusicRoundType;
  theme: string;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
  songTitle?: string;
  artist?: string;
  year?: number;
  audioPreviewUrl?: string;
  clues?: string[];
  points: number;
  timeLimit: number;
  explanation?: string;
  youtubeClip?: YoutubeClip;
}

export const SM_THEMES = [
  { id: "anni80",     label: "Anni 80",     emoji: "🕺" },
  { id: "anni90",     label: "Anni 90",     emoji: "💿" },
  { id: "anni2000",   label: "Anni 2000",   emoji: "📀" },
  { id: "sanremo",    label: "Sanremo",     emoji: "🌹" },
  { id: "sigle_tv",   label: "Sigle TV",    emoji: "📺" },
  { id: "disney",     label: "Disney",      emoji: "🏰" },
  { id: "rock",       label: "Rock",        emoji: "🎸" },
  { id: "dance",      label: "Dance",       emoji: "🎶" },
  { id: "trap_urban", label: "Trap/Urban",  emoji: "🎤" },
  { id: "custom",     label: "Misto",       emoji: "✨" },
] as const;

export type SmThemeId = typeof SM_THEMES[number]["id"];

// ── Default points/time per type ──────────────────────────────────────────────

const TYPE_POINTS: Record<MusicRoundType, number> = {
  guess_song: 100,
  guess_artist: 100,
  complete_lyrics: 120,
  speed_music: 100,
  song_vs_song: 100,
  progressive_clue_music: 150,
  final_tormentone: 200,
  seconds_bid: 100,
};

const TYPE_TIME: Record<MusicRoundType, number> = {
  guess_song: 20,
  guess_artist: 15,
  complete_lyrics: 20,
  speed_music: 8,
  song_vs_song: 12,
  progressive_clue_music: 35,
  final_tormentone: 25,
  seconds_bid: 60,
};

// ── Compact round builder ─────────────────────────────────────────────────────

type RawRound = {
  t: MusicRoundType;
  q: string;
  a: string[];
  c: number;
  st?: string;
  ar?: string;
  yr?: number;
  cl?: string[];
  pts?: number;
  tl?: number;
  ex?: string;
  yt?: { id: string; s: number; d: number; ct: ClipType };
};

function r(theme: string, idx: number, raw: RawRound): MusicRound {
  return {
    id: `${theme}_${idx}`,
    type: raw.t,
    theme,
    question: raw.q,
    answers: raw.a,
    correctAnswerIndex: raw.c,
    songTitle: raw.st,
    artist: raw.ar,
    year: raw.yr,
    clues: raw.cl,
    points: raw.pts ?? TYPE_POINTS[raw.t],
    timeLimit: raw.tl ?? TYPE_TIME[raw.t],
    explanation: raw.ex,
    youtubeClip: raw.yt ? { youtubeId: raw.yt.id, startSecond: raw.yt.s, durationSeconds: raw.yt.d, clipType: raw.yt.ct } : undefined,
  };
}

// ── Fallback Bank ─────────────────────────────────────────────────────────────

const BANK: Record<string, MusicRound[]> = {

  anni80: [
    r("anni80", 0, { t: "guess_artist", q: "Chi canta 'Thriller' (1982)?", a: ["Michael Jackson", "Prince", "David Bowie", "Madonna"], c: 0, ar: "Michael Jackson", st: "Thriller", yr: 1982, yt: { id: "sOnqjkJTMaA", s: 50, d: 15, ct: "chorus_guess" } }),
    r("anni80", 1, { t: "complete_lyrics", q: "Completa: 'We will, we will ___ you!'", a: ["ROCK", "BEAT", "HIT", "LOVE"], c: 0, ar: "Queen", st: "We Will Rock You", yr: 1977, ex: "Queen - We Will Rock You (1977)" }),
    r("anni80", 2, { t: "song_vs_song", q: "Quale è uscita prima?", a: ["Billie Jean (1983)", "Like a Virgin (1984)"], c: 0, ex: "Billie Jean di Michael Jackson uscì nel 1983, un anno prima di Like a Virgin di Madonna" }),
    r("anni80", 3, { t: "speed_music", q: "VELOCE! Chi è il cantante dei Wham!?", a: ["George Michael", "Sting", "Bono", "Simon Le Bon"], c: 0, ar: "Wham!" }),
    r("anni80", 4, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["ABBA", "Bee Gees", "Boney M", "Donna Summer"], c: 0, cl: ["Questo gruppo svedese ha dominato la disco degli anni '80", "Il loro album 'Gold' è tra i più venduti di sempre", "Una loro hit si chiama 'Dancing Queen'"], ex: "ABBA è il gruppo svedese più iconico della storia pop" }),
    r("anni80", 5, { t: "guess_song", q: "Che canzone è? 🎵 'Take on me, take me on...'", a: ["Take On Me", "Don't You (Forget About Me)", "Girls Just Want to Have Fun", "Wake Me Up Before You Go-Go"], c: 0, ar: "a-ha", yr: 1985, yt: { id: "djV11Xbc914", s: 45, d: 12, ct: "chorus_guess" } }),
    r("anni80", 6, { t: "guess_artist", q: "Chi canta 'Don't Stop Believin'' (1981)?", a: ["Journey", "Foreigner", "Boston", "REO Speedwagon"], c: 0, st: "Don't Stop Believin'", yr: 1981, yt: { id: "1k8craCGpgs", s: 60, d: 12, ct: "artist_guess" } }),
    r("anni80", 7, { t: "complete_lyrics", q: "Completa: 'Girls just want to have ___'", a: ["FUN", "LOVE", "MORE", "LIFE"], c: 0, ar: "Cyndi Lauper", yr: 1983, yt: { id: "PIb6AZdTr-A", s: 37, d: 10, ct: "missing_word" } }),
    r("anni80", 8, { t: "guess_artist", q: "Chi canta 'Vado al Massimo' (1982)?", a: ["Vasco Rossi", "Lucio Battisti", "Zucchero", "Gianna Nannini"], c: 0, st: "Vado al Massimo", yr: 1982 }),
    r("anni80", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale canzone italiana ha vinto il Festival di Sanremo 1987?", a: ["Si può dare di più (Morandi/Ruggeri/Tozzi)", "Sarà perché ti amo (Ricchi e Poveri)", "Ci sei o non ci sei (Ornella Vanoni)", "Brivido felice (Pino Daniele)"], c: 0, yr: 1987, ex: "Si può dare di più di Gianni Morandi, Umberto Tozzi e Enrico Ruggeri vinse Sanremo 1987", pts: 200, tl: 25 }),
    r("anni80", 10, { t: "seconds_bid", q: "🎵 ASTA! Quanti secondi ti bastano per indovinare questa canzone?", a: ["Take On Me (a-ha)", "Don't You (Forget About Me) (Simple Minds)", "Girls Just Want to Have Fun (Cyndi Lauper)", "Wake Me Up Before You Go-Go (Wham!)"], c: 0, ar: "a-ha", st: "Take On Me", yr: 1985, yt: { id: "djV11Xbc914", s: 45, d: 30, ct: "chorus_guess" }, pts: 100, tl: 60 }),
    r("anni80", 11, { t: "seconds_bid", q: "🎵 ASTA! Pochi secondi bastano al campione — quanti ne vuoi?", a: ["Billie Jean (Michael Jackson)", "Purple Rain (Prince)", "Beat It (Michael Jackson)", "Karma Chameleon (Culture Club)"], c: 0, ar: "Michael Jackson", st: "Billie Jean", yr: 1983, yt: { id: "Zi_XLOBDo_Y", s: 55, d: 30, ct: "chorus_guess" }, pts: 100, tl: 60 }),
  ],

  anni90: [
    r("anni90", 0, { t: "guess_artist", q: "Chi canta '...Baby One More Time' (1998)?", a: ["Britney Spears", "Christina Aguilera", "Mariah Carey", "Whitney Houston"], c: 0, st: "...Baby One More Time", yr: 1998, yt: { id: "C-u5WLJ9Ig0", s: 54, d: 12, ct: "artist_guess" } }),
    r("anni90", 1, { t: "guess_song", q: "Che canzone è? 🎵 'Wannabe' era delle...", a: ["Spice Girls", "Destiny's Child", "TLC", "En Vogue"], c: 0, ex: "Wannabe è il primo singolo delle Spice Girls (1996)", yt: { id: "gJLIiF15wGQ", s: 0, d: 10, ct: "artist_guess" } }),
    r("anni90", 2, { t: "complete_lyrics", q: "Completa: 'Macarena... Hey! ___'", a: ["Macarena", "Olé", "Asereje", "Baila"], c: 0, ar: "Los Del Rio", yr: 1994, yt: { id: "HwY7PACdsgQ", s: 35, d: 12, ct: "chorus_guess" } }),
    r("anni90", 3, { t: "song_vs_song", q: "Quale canzone è degli anni '90?", a: ["Smells Like Teen Spirit (1991)", "Bohemian Rhapsody (1975)"], c: 0, ex: "Smells Like Teen Spirit dei Nirvana uscì nel 1991" }),
    r("anni90", 4, { t: "speed_music", q: "VELOCE! In quale anno esce 'Vivo per lei' di Andrea Bocelli?", a: ["1995", "1993", "1998", "2000"], c: 0, ar: "Andrea Bocelli" }),
    r("anni90", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Eros Ramazzotti", "Zucchero", "Laura Pausini", "Giorgia"], c: 0, cl: ["Ha vinto il Festival di Sanremo nel 1994 tra i giovani", "La sua voce è riconoscibile in tutto il mondo", "Ha cantato 'La Solitudine'"], ex: "Laura Pausini vinse Sanremo Nuove Proposte 1993 con La Solitudine" }),
    r("anni90", 6, { t: "guess_song", q: "Che canzone è? 🎵 'Return of the Mack' era di...", a: ["Mark Morrison", "Craig David", "R. Kelly", "Ginuwine"], c: 0, yr: 1996 }),
    r("anni90", 7, { t: "complete_lyrics", q: "Completa: 'No woman, no ___' (Bob Marley)", a: ["CRY", "WAY", "LOVE", "MORE"], c: 0, ar: "Bob Marley" }),
    r("anni90", 8, { t: "guess_artist", q: "Chi canta 'Un'estate italiana' (Italia 90)?", a: ["Edoardo Bennato & Gianna Nannini", "Vasco Rossi & Zucchero", "Lucio Dalla & Francesco De Gregori", "Eros Ramazzotti & Laura Pausini"], c: 0, yr: 1990 }),
    r("anni90", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale artista italiano ha venduto più dischi negli anni '90?", a: ["Eros Ramazzotti", "Zucchero", "Laura Pausini", "Andrea Bocelli"], c: 0, pts: 200, tl: 25, ex: "Eros Ramazzotti ha venduto oltre 60 milioni di dischi nel mondo" }),
    r("anni90", 10, { t: "seconds_bid", q: "🎵 ASTA! Quanti secondi ti bastano per indovinare questa hit?", a: ["...Baby One More Time (Britney Spears)", "Genie in a Bottle (Christina Aguilera)", "I Want It That Way (Backstreet Boys)", "Bye Bye Bye (NSYNC)"], c: 0, ar: "Britney Spears", st: "...Baby One More Time", yr: 1998, yt: { id: "C-u5WLJ9Ig0", s: 54, d: 30, ct: "chorus_guess" }, pts: 100, tl: 60 }),
    r("anni90", 11, { t: "seconds_bid", q: "🎵 ASTA! Il campione di musica ne ha bisogno di pochi — e tu?", a: ["Wannabe (Spice Girls)", "Independent Women (Destiny's Child)", "Waterfalls (TLC)", "Say My Name (Destiny's Child)"], c: 0, ar: "Spice Girls", st: "Wannabe", yr: 1996, yt: { id: "gJLIiF15wGQ", s: 0, d: 30, ct: "chorus_guess" }, pts: 100, tl: 60 }),
  ],

  anni2000: [
    r("anni2000", 0, { t: "guess_artist", q: "Chi canta 'Toxic' (2003)?", a: ["Britney Spears", "Kylie Minogue", "Beyoncé", "Shakira"], c: 0, st: "Toxic", yr: 2003, yt: { id: "LOZuxwVk7TU", s: 44, d: 12, ct: "chorus_guess" } }),
    r("anni2000", 1, { t: "guess_song", q: "Che canzone è? 🎵 'Crazy in Love' era di...", a: ["Beyoncé ft. Jay-Z", "Rihanna ft. Jay-Z", "Mariah Carey", "Alicia Keys"], c: 0, yr: 2003 }),
    r("anni2000", 2, { t: "complete_lyrics", q: "Completa: 'Somebody that I used to ___' (Gotye)", a: ["KNOW", "LOVE", "SEE", "MISS"], c: 0, ar: "Gotye", yr: 2011 }),
    r("anni2000", 3, { t: "song_vs_song", q: "Quale canzone è degli anni 2000?", a: ["Since U Been Gone - Kelly Clarkson (2004)", "My Heart Will Go On - Céline Dion (1997)"], c: 0 }),
    r("anni2000", 4, { t: "speed_music", q: "VELOCE! Chi canta 'Fix You' (2005)?", a: ["Coldplay", "U2", "Radiohead", "Muse"], c: 0, yt: { id: "k4V3Mo61fJM", s: 75, d: 12, ct: "artist_guess" } }),
    r("anni2000", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Marco Carta", "Valerio Scanu", "Gigi D'Alessio", "Tiziano Ferro"], c: 0, cl: ["Ha partecipato ad Amici di Maria De Filippi e ha vinto Sanremo nel 2009", "Il suo singolo di esordio ha battuto tutti i record di vendita italiani", "Ha cantato 'La Forza Mia'"], ex: "Marco Carta vinse Sanremo 2009 con 'La Forza Mia'" }),
    r("anni2000", 6, { t: "guess_artist", q: "Chi canta 'Perdono' e 'Xdono' con un mix di italiano e spagnolo?", a: ["Tiziano Ferro", "Marco Mengoni", "Francesco Renga", "Biagio Antonacci"], c: 0 }),
    r("anni2000", 7, { t: "complete_lyrics", q: "Completa: 'Siamo una generazione ___' (Elisa, Sanremo 2001)", a: ["appesa a un filo", "che non si ferma", "che corre via", "senza paura"], c: 0, ar: "Elisa", st: "Luce (Tramonti a Nord Est)", yr: 2001 }),
    r("anni2000", 8, { t: "guess_song", q: "Che canzone è? 🎵 'Beautiful' era di...", a: ["Christina Aguilera", "Mariah Carey", "Whitney Houston", "Pink"], c: 0, yr: 2002 }),
    r("anni2000", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale canzone ha vinto l'Eurovision 2006?", a: ["Hard Rock Hallelujah (Lordi, Finlandia)", "L'Important c'est la Rose", "Molitva (Zeljko Joksimovic)", "Fairytale (Alexander Rybak)"], c: 0, pts: 200, tl: 25, ex: "Hard Rock Hallelujah dei Lordi (Finlandia) vinse l'Eurovision 2006 a Helsinki" }),
  ],

  sanremo: [
    r("sanremo", 0, { t: "guess_artist", q: "Chi ha vinto Sanremo 2016 con 'No Degree of Separation'?", a: ["Francesca Michielin", "Alessandra Amoroso", "Emma Marrone", "Annalisa"], c: 0, yr: 2016 }),
    r("sanremo", 1, { t: "guess_song", q: "Con quale canzone Mahmood ha vinto Sanremo 2019?", a: ["Soldi", "Barrio", "Rapide", "Takagi"], c: 0, ar: "Mahmood", yr: 2019, yt: { id: "9k_KqHe8ULQ", s: 52, d: 12, ct: "chorus_guess" } }),
    r("sanremo", 2, { t: "complete_lyrics", q: "Completa: 'Ciao ciao, arrivederci e grazie...' (Arisa, Sanremo 2014)", a: ["a tutti voi", "al mio amore", "per sempre", "e addio"], c: 0, ar: "Arisa", ex: "Controvento di Arisa a Sanremo 2014" }),
    r("sanremo", 3, { t: "song_vs_song", q: "Quale ha vinto Sanremo?", a: ["Grande Amore - Il Volo (2015)", "Almeno tu nell'universo - Mia Martini (1989)"], c: 0, ex: "Grande Amore del trio Il Volo vinse Sanremo 2015" }),
    r("sanremo", 4, { t: "speed_music", q: "VELOCE! Chi ha vinto Sanremo 2021?", a: ["Måneskin", "Ermal Meta", "Diodato", "Francesco Renga"], c: 0, yt: { id: "DnuJFY1PBQQ", s: 50, d: 12, ct: "artist_guess" } }),
    r("sanremo", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Lucio Battisti", "Fabrizio De André", "Lucio Dalla", "Francesco De Gregori"], c: 0, cl: ["Non ha mai partecipato a Sanremo come artista in gara", "Ha scritto hit come '4/3/1943' e 'Caruso'", "La sua canzone 'Canzone' è fra le più suonate della storia italiana"], ex: "Lucio Dalla è uno degli artisti italiani più amati e influenti di sempre" }),
    r("sanremo", 6, { t: "guess_artist", q: "Chi ha vinto Sanremo 2023 con 'Due Vite'?", a: ["Marco Mengoni", "Tiziano Ferro", "Ultimo", "Lazza"], c: 0, yr: 2023 }),
    r("sanremo", 7, { t: "complete_lyrics", q: "Completa: 'Zitti e buoni, fuori dal coro...' (Måneskin, Sanremo 2021)", a: ["siamo fuori di testa", "siamo ancora vivi", "siamo la rivoluzione", "siamo diversi dagli altri"], c: 0, ar: "Måneskin" }),
    r("sanremo", 8, { t: "guess_song", q: "Con quale canzone Elisa ha vinto Sanremo 2001?", a: ["Luce (Tramonti a Nord Est)", "Eppure sentire", "Anche fragile", "Vivere"], c: 0, ar: "Elisa", yr: 2001 }),
    r("sanremo", 9, { t: "final_tormentone", q: "FINALE DOPPIO! In quale anno Toto Cutugno vinse l'Eurovision con 'Insieme: 1992'?", a: ["1990", "1988", "1992", "1986"], c: 0, ar: "Toto Cutugno", pts: 200, tl: 25, ex: "Toto Cutugno vinse l'Eurovision 1990 con 'Insieme: 1992' a Zagabria" }),
  ],

  sigle_tv: [
    r("sigle_tv", 0, { t: "guess_artist", q: "Chi canta la sigla originale italiana di 'Dragon Ball Z'?", a: ["Giorgio Vanni", "Cristina D'Avena", "Luca Sepe", "Aldo Tagliapietra"], c: 0 }),
    r("sigle_tv", 1, { t: "guess_song", q: "Come si chiama la sigla di 'Sailor Moon' in italiano?", a: ["Sailor Moon Crystal", "Moonlight Densetsu", "Siamo Sailor Moon", "Luna e Stella"], c: 2, ex: "La sigla italiana di Sailor Moon si chiama 'Siamo Sailor Moon'" }),
    r("sigle_tv", 2, { t: "complete_lyrics", q: "Completa la sigla di 'Dragon Ball': 'Una storia che non ha ___'", a: ["confini", "fine", "paura", "limiti"], c: 0, ar: "Giorgio Vanni" }),
    r("sigle_tv", 3, { t: "song_vs_song", q: "Quale sigla TV è più famosa?", a: ["Pollon fra gli elfi - Pollon", "Bim bum bam - Bim Bum Bam"], c: 0, ex: "Pollon fra gli elfi è una delle sigle più iconiche della TV italiana degli anni '80" }),
    r("sigle_tv", 4, { t: "speed_music", q: "VELOCE! Chi canta la maggior parte delle sigle dei cartoni animati italiani dagli anni '80?", a: ["Cristina D'Avena", "Giorgio Vanni", "Alvin", "Enzo Draghi"], c: 0 }),
    r("sigle_tv", 5, { t: "progressive_clue_music", q: "Di quale cartone è questa sigla?", a: ["Holly e Benji (Captain Tsubasa)", "Ken il Guerriero", "Jeeg Robot", "Mazinga Z"], c: 0, cl: ["La sigla italiana dice 'noi siamo i campioni'", "Il protagonista vuole diventare il migliore al mondo nel suo sport", "Il suo nome giapponese è 'Captain Tsubasa'"], ex: "Holly e Benji è la sigla italiana di Captain Tsubasa" }),
    r("sigle_tv", 6, { t: "guess_artist", q: "Chi canta 'Fivelandia' e molte sigle Mediaset degli anni '80?", a: ["Cristina D'Avena", "Antonella Ruggiero", "Fiordaliso", "Rossana Casale"], c: 0 }),
    r("sigle_tv", 7, { t: "complete_lyrics", q: "Completa la sigla: 'Candy Candy, vivi e ___ anche tu'", a: ["sorridi", "sogna", "ama", "canta"], c: 0, st: "Candy Candy", ar: "Cristina D'Avena" }),
    r("sigle_tv", 8, { t: "guess_song", q: "Come si chiama la sigla italiana de 'I Simpson'?", a: ["È la mia famiglia", "Siamo i Simpson", "Springfield", "La famiglia Simpson"], c: 0, ex: "La sigla italiana dei Simpson si chiama 'È la mia famiglia'" }),
    r("sigle_tv", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Di quale anime è la sigla 'Mahou Shoujo Madoka Magica'?", a: ["Sailor Moon", "Card Captor Sakura", "Madoka Magica", "Winx Club"], c: 2, pts: 200, tl: 25 }),
  ],

  disney: [
    r("disney", 0, { t: "guess_song", q: "In quale film Disney si canta 'Let It Go'?", a: ["Frozen", "Brave", "Tangled", "Encanto"], c: 0, yr: 2013, yt: { id: "moSFlvxnbgk", s: 62, d: 15, ct: "chorus_guess" } }),
    r("disney", 1, { t: "guess_artist", q: "Chi doppia Simba ne 'Il Re Leone' (versione italiana)?", a: ["Marco Columbro", "Luca Biagini", "Stefano Masciarelli", "Pietro Ubaldi"], c: 0 }),
    r("disney", 2, { t: "complete_lyrics", q: "Completa: 'Hakuna Matata, che ___ vita è!'", a: ["bella", "magnifica", "straordinaria", "meravigliosa"], c: 0, st: "Hakuna Matata", ex: "Hakuna Matata dal Re Leone - 'che bella vita è!'" }),
    r("disney", 3, { t: "song_vs_song", q: "Quale film Disney è più recente?", a: ["Encanto (2021)", "Frozen (2013)"], c: 0 }),
    r("disney", 4, { t: "speed_music", q: "VELOCE! In quale film Disney si canta 'We Don't Talk About Bruno'?", a: ["Encanto", "Coco", "Moana", "Raya"], c: 0, yr: 2021 }),
    r("disney", 5, { t: "progressive_clue_music", q: "Di quale film Disney è questa canzone?", a: ["Coco", "Moana", "Vaiana", "Lilo & Stitch"], c: 0, cl: ["Ambientato in Polinesia", "La protagonista salva la sua isola e scopre l'oceano", "Una delle canzoni si chiama 'Sei Tu'"], ex: "Moana (Vaiana in Italia) è il film Disney del 2016 ambientato in Polinesia" }),
    r("disney", 6, { t: "guess_song", q: "Come si chiama la canzone principale de 'La Bella e la Bestia'?", a: ["La bella e la bestia", "Tale as Old as Time", "Something There", "Be Our Guest"], c: 0, yr: 1991 }),
    r("disney", 7, { t: "complete_lyrics", q: "Completa: 'Io vorrei... poter restare qui, con te ___' (La Sirenetta)", a: ["per sempre", "un'altra vita", "ancora un po'", "nel tuo mondo"], c: 0, st: "Part of Your World", ex: "In This World (Nel Tuo Mondo) de La Sirenetta" }),
    r("disney", 8, { t: "guess_artist", q: "Chi canta 'How Far I'll Go' nella versione italiana di Moana?", a: ["Katia Sorrentino", "Francesca Michielin", "Giorgia", "Elisa"], c: 0 }),
    r("disney", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale canzone Disney ha vinto l'Oscar nel 2022?", a: ["Dos Oruguitas (Encanto)", "Reflect (Encanto)", "Dos Oruguitas (Encanto) - Sebástian Yatra", "No time to die"], c: 2, pts: 200, tl: 25, ex: "Dos Oruguitas di Sebastián Yatra da Encanto vinse l'Oscar 2022 come Miglior Canzone Originale" }),
  ],

  rock: [
    r("rock", 0, { t: "guess_artist", q: "Chi canta 'Bohemian Rhapsody' (1975)?", a: ["Queen", "Led Zeppelin", "Pink Floyd", "The Rolling Stones"], c: 0, st: "Bohemian Rhapsody", yr: 1975, yt: { id: "fJ9rUzIMcZQ", s: 0, d: 15, ct: "chorus_guess" } }),
    r("rock", 1, { t: "guess_song", q: "Che canzone rock è? 🎵 'I can't get no satisfaction...'", a: ["Satisfaction (Rolling Stones)", "Start Me Up (Rolling Stones)", "Paint It Black (Rolling Stones)", "Jumpin' Jack Flash"], c: 0, yr: 1965 }),
    r("rock", 2, { t: "complete_lyrics", q: "Completa: 'We are the champions, my ___'", a: ["friends", "kings", "people", "world"], c: 0, ar: "Queen", st: "We Are the Champions", yr: 1977 }),
    r("rock", 3, { t: "song_vs_song", q: "Quale canzone è dei Led Zeppelin?", a: ["Stairway to Heaven (Led Zeppelin)", "Born to Run (Bruce Springsteen)"], c: 0, yr: 1971 }),
    r("rock", 4, { t: "speed_music", q: "VELOCE! Quante corde ha una chitarra standard?", a: ["6", "4", "5", "7"], c: 0, ex: "Una chitarra standard ha 6 corde" }),
    r("rock", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Nirvana", "Pearl Jam", "Soundgarden", "Alice in Chains"], c: 0, cl: ["Il loro frontman si chiamava Kurt Cobain", "L'album 'Nevermind' del 1991 ha rivoluzionato la musica rock", "La loro canzone più famosa è 'Smells Like Teen Spirit'"], ex: "Nirvana, la band grunge di Seattle guidata da Kurt Cobain" }),
    r("rock", 6, { t: "guess_artist", q: "Chi canta 'Hotel California' (1977)?", a: ["Eagles", "Fleetwood Mac", "The Doobie Brothers", "Steely Dan"], c: 0, st: "Hotel California", yr: 1977, yt: { id: "BciS5grgsF8", s: 0, d: 12, ct: "artist_guess" } }),
    r("rock", 7, { t: "complete_lyrics", q: "Completa: 'Should I stay or should I ___' (The Clash)", a: ["go", "run", "leave", "stay"], c: 0, ar: "The Clash", yr: 1982 }),
    r("rock", 8, { t: "guess_song", q: "Che canzone è? 🎵 'Under the bridge downtown, I could not get enough...'", a: ["Under the Bridge (RHCP)", "Californication (RHCP)", "Give It Away (RHCP)", "Scar Tissue (RHCP)"], c: 0, ar: "Red Hot Chili Peppers", yr: 1992 }),
    r("rock", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale canzone rock italiana è considerata l'inno di una generazione?", a: ["Albachiara (Vasco Rossi)", "Come Vorrei (Battisti)", "La Locomotiva (Guccini)", "Generale (De Gregori)"], c: 0, pts: 200, tl: 25, ex: "Albachiara di Vasco Rossi (1979) è considerata l'inno generazionale del rock italiano" }),
  ],

  dance: [
    r("dance", 0, { t: "guess_artist", q: "Chi canta 'Blue (Da Ba Dee)' (1998)?", a: ["Eiffel 65", "Aqua", "Real McCoy", "2 Unlimited"], c: 0, st: "Blue (Da Ba Dee)", yr: 1998, yt: { id: "68ugkg9RePc", s: 0, d: 12, ct: "chorus_guess" } }),
    r("dance", 1, { t: "guess_song", q: "Che hit eurodance è? 🎵 'Around the world, around the world...'", a: ["Around the World (Daft Punk)", "Blue (Eiffel 65)", "Get Ready for This (2 Unlimited)", "Gonna Make You Sweat (C+C Music Factory)"], c: 0, ar: "Daft Punk", yr: 1997 }),
    r("dance", 2, { t: "complete_lyrics", q: "Completa: 'Freed from desire, mind and ___ sensation!' (Gala)", a: ["senses", "body", "soul", "rhythm"], c: 0, ar: "Gala", yr: 1997 }),
    r("dance", 3, { t: "song_vs_song", q: "Quale hit dance è più recente?", a: ["Lean On - Major Lazer (2015)", "One More Time - Daft Punk (2000)"], c: 0 }),
    r("dance", 4, { t: "speed_music", q: "VELOCE! Chi canta 'Sandstorm'?", a: ["Darude", "Tiësto", "Paul van Dyk", "Armin van Buuren"], c: 0, yr: 1999, yt: { id: "y6120QOlsfU", s: 42, d: 12, ct: "artist_guess" } }),
    r("dance", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Corona", "Alexia", "Prezioso", "Gigi D'Agostino"], c: 0, cl: ["DJ e produttore italiano di Torino", "La sua hit più famosa è ambientata in estate", "Ha inciso 'L'Amour Toujours'"], ex: "Gigi D'Agostino, DJ e produttore italiano autore di L'Amour Toujours (1999)" }),
    r("dance", 6, { t: "guess_artist", q: "Chi canta 'Barbie Girl' (1997)?", a: ["Aqua", "Ace of Base", "La Bouche", "Whigfield"], c: 0, st: "Barbie Girl", yr: 1997 }),
    r("dance", 7, { t: "complete_lyrics", q: "Completa: 'Saturday night, I feel the air, I feel the ___' (Whigfield)", a: ["beat", "love", "music", "night"], c: 0, ar: "Whigfield", st: "Saturday Night", yr: 1994 }),
    r("dance", 8, { t: "guess_song", q: "Che brano dance è? 🎵 La canzone italiana 'Tu sei l'unica donna per me' è stata remixata in stile dance da?", a: ["Mr. Flagio", "Corona", "Alexia", "Prezioso"], c: 0 }),
    r("dance", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale hit dance ha venduto più copie nel mondo?", a: ["Blue (Da Ba Dee) - Eiffel 65", "Rhythm Is a Dancer - Snap!", "What Is Love - Haddaway", "Because the Night - Cascada"], c: 0, pts: 200, tl: 25, ex: "Blue (Da Ba Dee) degli Eiffel 65 è tra le hit eurodance più vendute di sempre con oltre 10 milioni di copie" }),
  ],

  trap_urban: [
    r("trap_urban", 0, { t: "guess_artist", q: "Chi canta 'Giovani Wannabe' (2018)?", a: ["Psicologi", "Sfera Ebbasta", "Ghali", "Tedua"], c: 0 }),
    r("trap_urban", 1, { t: "guess_song", q: "Quale canzone ha reso famoso Sfera Ebbasta nel 2015?", a: ["XDVR", "Cupido", "Rockstar", "Stellato"], c: 0, ar: "Sfera Ebbasta", yr: 2015 }),
    r("trap_urban", 2, { t: "complete_lyrics", q: "Completa: 'Cara Italia, ho bisogno di stare da ___' (Ghali)", a: ["solo", "te", "voi", "lei"], c: 0, ar: "Ghali", st: "Cara Italia", yr: 2019 }),
    r("trap_urban", 3, { t: "song_vs_song", q: "Quale è uscita prima?", a: ["Good Vibes - Ghali (2017)", "Notti in Bianco - Blanco (2021)"], c: 0 }),
    r("trap_urban", 4, { t: "speed_music", q: "VELOCE! Chi canta 'Brividi' a Sanremo 2022?", a: ["Mahmood & Blanco", "Ghali & Sfera Ebbasta", "Lazza & Mahmood", "Irama & Rkomi"], c: 0, yr: 2022, yt: { id: "RQZr2NgKPiU", s: 60, d: 12, ct: "artist_guess" } }),
    r("trap_urban", 5, { t: "progressive_clue_music", q: "Di chi si tratta?", a: ["Lazza", "Salmo", "Marracash", "Club Dogo"], c: 0, cl: ["È uno dei rapper italiani più ascoltati di sempre su Spotify", "Il suo album 'Sirio' del 2022 ha battuto ogni record di streaming", "Ha cantato 'Cenere' e 'Stressed Out'"], ex: "Lazza con l'album Sirio (2022) ha raggiunto 1 miliardo di stream in meno di un anno" }),
    r("trap_urban", 6, { t: "guess_artist", q: "Chi canta 'Sapore' con Sfera Ebbasta?", a: ["Mahmood", "Ghali", "Gué Pequeno", "Lazza"], c: 0 }),
    r("trap_urban", 7, { t: "complete_lyrics", q: "Completa: 'Rolls Royce mia, lei è con ___' (Sfera Ebbasta)", a: ["me", "noi", "te", "lei"], c: 0, ar: "Sfera Ebbasta", st: "Rolls Royce" }),
    r("trap_urban", 8, { t: "guess_song", q: "Come si chiama il brano di Mahmood vincitore di Sanremo 2019?", a: ["Soldi", "Barrio", "Calipso", "Rapide"], c: 0, ar: "Mahmood", yr: 2019 }),
    r("trap_urban", 9, { t: "final_tormentone", q: "FINALE DOPPIO! Quale artista italiano è il più ascoltato su Spotify nel 2023?", a: ["Lazza", "Sfera Ebbasta", "Mahmood", "Ghali"], c: 0, pts: 200, tl: 25, ex: "Lazza è stato l'artista italiano più ascoltato su Spotify nel 2023" }),
  ],

};

// "custom" = shuffle from all themes
BANK["custom"] = shuffleArr(
  Object.entries(BANK)
    .filter(([k]) => k !== "custom")
    .flatMap(([, rounds]) => rounds.slice(0, 2))
).map((round, i) => ({ ...round, id: `custom_${i}` }));

// ── Fallback generator ────────────────────────────────────────────────────────

export function generateSaraMusicaFallback(themeId: string, count: number, difficulty: "easy" | "medium" | "hard" = "medium"): MusicRound[] {
  const bank = BANK[themeId] ?? BANK["anni90"] ?? [];
  const shuffled = shuffleArr([...bank]);
  // If count > bank size, repeat shuffled rounds with new ids
  const result: MusicRound[] = [];
  while (result.length < count) {
    for (const round of shuffled) {
      if (result.length >= count) break;
      const idx = result.length;
      result.push({ ...round, id: `${themeId}_${idx}` });
    }
  }
  // Apply difficulty multipliers
  const timeMult = difficulty === "easy" ? 1.4 : difficulty === "hard" ? 0.7 : 1.0;
  const ptsMult  = difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.25 : 1.0;
  const adjusted = result.map(r => ({
    ...r,
    timeLimit: Math.max(5, Math.round(r.timeLimit * timeMult)),
    points: Math.round(r.points * ptsMult),
  }));
  // Ensure last round is final_tormentone
  if (adjusted.length > 0) {
    const last = adjusted[adjusted.length - 1]!;
    adjusted[adjusted.length - 1] = {
      ...last,
      type: "final_tormentone",
      points: 200,
      timeLimit: 25,
      question: last.question.startsWith("FINALE") ? last.question : `FINALE DOPPIO! ${last.question}`,
    };
  }
  return adjusted;
}

// ── AI generator ──────────────────────────────────────────────────────────────

export async function generateSaraMusicaRoundsAI(themeId: string, count: number, difficulty: "easy" | "medium" | "hard" = "medium"): Promise<MusicRound[]> {
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) throw new Error("AI non configurato");

  const themeName = SM_THEMES.find(t => t.id === themeId)?.label ?? themeId;
  const openai = new OpenAI({ baseURL, apiKey });

  const diffLabel = difficulty === "easy"
    ? "Facile — artisti famosissimi, canzoni iconiche, risposte ovvie, timeLimit generosi"
    : difficulty === "hard"
    ? "Difficile — artisti di nicchia, canzoni meno note, clues ambigui, timeLimit ridotti"
    : "Medio — equilibrato, artisti noti ma non banali";

  const systemPrompt = `Sei Jonny, l'host di un gioco musicale per feste italiane. Genera domande musicali sul tema "${themeName}" per un quiz party.
Difficoltà richiesta: ${diffLabel}.
Rispondi SOLO con un array JSON valido, senza markdown, senza spiegazioni.`;

  const userPrompt = `Genera esattamente ${count} domande musicali sul tema "${themeName}" (musica italiana e internazionale).
Mescola questi tipi: guess_song, guess_artist, complete_lyrics, speed_music, song_vs_song, progressive_clue_music.
L'ultima domanda DEVE essere di tipo final_tormentone con points: 200.

Struttura JSON di ogni elemento:
{
  "id": "ai_0",
  "type": "guess_song|guess_artist|complete_lyrics|speed_music|song_vs_song|progressive_clue_music|final_tormentone",
  "theme": "${themeId}",
  "question": "domanda in italiano",
  "answers": ["risposta A", "risposta B", "risposta C", "risposta D"],
  "correctAnswerIndex": 0,
  "songTitle": "titolo (opzionale)",
  "artist": "artista (opzionale)",
  "year": 2000,
  "clues": ["indizio 1", "indizio 2", "indizio 3"],
  "points": 100,
  "timeLimit": 20,
  "explanation": "spiegazione breve (opzionale)"
}

Regole:
- song_vs_song ha SOLO 2 risposte
- progressive_clue_music ha SEMPRE 3 clues e 4 risposte
- speed_music: timeLimit 8, domanda velocissima
- final_tormentone: points 200, timeLimit 25, domanda emozionante
- Tutte le domande in italiano
- Usa artisti e canzoni reali e verificabili
- Rispetta il livello di difficoltà: ${diffLabel}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  // Strip possible markdown fences
  const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(jsonStr) as unknown[];

  return (parsed as MusicRound[]).map((round, i) => ({
    id: `ai_${i}`,
    type: (round.type as MusicRoundType) || "guess_song",
    theme: themeId,
    question: String(round.question ?? ""),
    answers: Array.isArray(round.answers) ? round.answers.map(String) : [],
    correctAnswerIndex: Number(round.correctAnswerIndex ?? 0),
    songTitle: round.songTitle ? String(round.songTitle) : undefined,
    artist: round.artist ? String(round.artist) : undefined,
    year: round.year ? Number(round.year) : undefined,
    clues: Array.isArray(round.clues) ? round.clues.map(String) : undefined,
    points: Number(round.points ?? TYPE_POINTS[round.type as MusicRoundType] ?? 100),
    timeLimit: Number(round.timeLimit ?? TYPE_TIME[round.type as MusicRoundType] ?? 20),
    explanation: round.explanation ? String(round.explanation) : undefined,
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSaraMusicaRounds(themeId: string, count: number, difficulty: "easy" | "medium" | "hard" = "medium"): Promise<MusicRound[]> {
  logger.info({ themeId, count, difficulty }, "[JONNY_SARAMUSICA_AI] start");
  try {
    const rounds = await generateSaraMusicaRoundsAI(themeId, count, difficulty);
    if (!Array.isArray(rounds) || rounds.length === 0) throw new Error("AI returned empty");
    logger.info({ themeId, count, difficulty, generated: rounds.length }, "[JONNY_SARAMUSICA_AI] success");
    return rounds;
  } catch (err) {
    logger.warn({ err, themeId, count, difficulty }, "[JONNY_SARAMUSICA_AI] fallback");
    return generateSaraMusicaFallback(themeId, count, difficulty);
  }
}

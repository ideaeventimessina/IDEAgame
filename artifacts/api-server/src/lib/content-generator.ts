import OpenAI from "openai";
import { logger } from "./logger.js";

function makeClient(): OpenAI | null {
  const base = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const key  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!base || !key) return null;
  return new OpenAI({ baseURL: base, apiKey: key });
}

export interface GeneratedItem {
  type:        string;
  title:       string;
  payloadJson: Record<string, unknown>;
  sortOrder:   number;
}

export interface GenerateRequest {
  gameSlug:   string;
  themeName:  string;
  difficulty: "easy" | "medium" | "hard";
  count:      number;
  extraHint?: string;
}

export interface GenerateResult {
  items:  GeneratedItem[];
  source: "ai" | "fallback";
  error?: string;
}

function promptFor(req: GenerateRequest): string {
  const { gameSlug, themeName, difficulty, count } = req;
  const diffLabel = { easy: "facile (accessibile a tutti)", medium: "medio (bilanciato)", hard: "difficile (per esperti)" }[difficulty] ?? "medio";
  switch (gameSlug) {
    case "adult-only":
      return `Sei un content creator per giochi di gruppo italiani per adulti.\nGenera ${count} sfide per il tema "${themeName}", difficoltà ${diffLabel}.\nCrea metà VERITÀ (domande personali) e metà OBBLIGHI (prove fisiche/creative). Assegna level 1-5.\nFormato JSON array: [{"category":"verita"|"obbligo","text":"...","level":1,"durationSeconds":60}]\nSolo JSON valido.`;
    case "saramusica":
      return `Sei un quiz musicale italiano.\nGenera ${count} domande musicali a tema "${themeName}", difficoltà ${diffLabel}.\nTipi: guess_song, guess_artist, complete_lyrics, speed_music, song_vs_song.\nOgni item: {"type":"guess_song","question":"...","answers":["A","B","C","D"],"correctAnswerIndex":0,"year":1985,"artist":"...","songTitle":"...","explanation":"...","points":100,"timeLimit":20}\nSolo JSON array valido.`;
    case "quizzone":
      return `Sei un quiz show italiano.\nGenera ${count} domande a tema "${themeName}", difficoltà ${diffLabel}.\nOgni item: {"type":"multiple_choice","question":"...","answers":["A","B","C","D"],"correctAnswerIndex":0,"points":100,"timeLimit":15,"explanation":"..."}\nSolo JSON array valido.`;
    case "parola-alle-spalle":
      return `Gioco italiano "Parola alle Spalle". Genera ${count} schede a tema "${themeName}", difficoltà ${diffLabel}.\nOgni item: {"word":"PAROLA","category":"Categoria","tabooWords":["p1","p2","p3","p4","p5"]}\nSolo JSON array valido.`;
    case "percorso-risate":
      return `Game show italiano "Percorso a Risate". Genera ${count} sfide a tema "${themeName}", difficoltà ${diffLabel}.\nTipi: sfida, domanda, mimo, ballo, veloce, coppia, reazione, fantasia.\nOgni item: {"type":"sfida","text":"...","points":100,"timeLimit":60}\nSolo JSON array valido.`;
    case "karaoke-battle":
      return `DJ karaoke italiano. Genera ${count} canzoni a tema "${themeName}", difficoltà ${diffLabel}.\nOgni item: {"title":"Titolo","artist":"Artista","year":2005,"genre":"pop","youtubeSearch":"artista titolo karaoke"}\nSolo JSON array valido.`;
    case "card-sets":
      return `Memory game per adulti italiani. Genera ${count} coppie di carte a tema "${themeName}".\nOgni item: {"pairLabel":"Nome","descriptionA":"Carta A","descriptionB":"Carta B","imageUrlHint":"keyword"}\nSolo JSON array valido.`;
    default:
      return `Genera ${count} elementi per un gioco italiano a tema "${themeName}", difficoltà ${diffLabel}.\nOgni item: {"title":"...","text":"...","points":100}\nSolo JSON array valido.`;
  }
}

const FALLBACK_BANKS: Record<string, Array<{ type: string; title: string; payload: Record<string, unknown> }>> = {
  "adult-only": [
    { type:"verita",  title:"Racconta il momento più imbarazzante della tua vita",            payload:{category:"verita", text:"Racconta il momento più imbarazzante della tua vita.",level:1,durationSeconds:60}},
    { type:"obbligo", title:"Fai una voce strana e tienila per 30 secondi",                   payload:{category:"obbligo",text:"Fai una voce strana e tienila per 30 secondi.",level:1,durationSeconds:60}},
    { type:"verita",  title:"Chi è la persona del gruppo che ti fa più ridere?",              payload:{category:"verita", text:"Chi è la persona del gruppo che ti fa più ridere e perché?",level:1,durationSeconds:60}},
    { type:"obbligo", title:"Balla per 30 secondi senza musica",                              payload:{category:"obbligo",text:"Balla per 30 secondi senza musica.",level:1,durationSeconds:60}},
    { type:"verita",  title:"Qual è il tuo peggior difetto?",                                 payload:{category:"verita", text:"Qual è il tuo peggior difetto secondo te?",level:2,durationSeconds:60}},
    { type:"obbligo", title:"Imita qualcuno del gruppo per 30 secondi",                       payload:{category:"obbligo",text:"Imita qualcuno del gruppo per 30 secondi senza dire il nome.",level:2,durationSeconds:60}},
    { type:"verita",  title:"Qual è la cosa più strana che hai fatto per amore?",             payload:{category:"verita", text:"Qual è la cosa più strana che hai fatto per amore?",level:2,durationSeconds:60}},
    { type:"obbligo", title:"Chiedi il numero a qualcuno del gruppo in modo ridicolo",        payload:{category:"obbligo",text:"Chiedi il numero a qualcuno nel modo più ridicolo possibile.",level:2,durationSeconds:60}},
    { type:"verita",  title:"Sei mai stato sorpreso a fare qualcosa di imbarazzante?",        payload:{category:"verita", text:"Sei mai stato/a sorpreso/a a fare qualcosa di imbarazzante? Racconta.",level:3,durationSeconds:60}},
    { type:"obbligo", title:"Scrivi un messaggio ridicolo e mandalo all'ultima persona",      payload:{category:"obbligo",text:"Scrivi un messaggio ridicolo e mandalo all'ultima persona con cui hai chattato.",level:3,durationSeconds:60}},
    { type:"verita",  title:"C'è qualcuno qui stasera che trovi attraente?",                  payload:{category:"verita", text:"C'è qualcuno qui stasera che trovi attraente? Devi rispondere.",level:3,durationSeconds:60}},
    { type:"obbligo", title:"Fai una serenata a qualcuno del gruppo",                         payload:{category:"obbligo",text:"Fai una serenata di 30 secondi a qualcuno del gruppo.",level:4,durationSeconds:60}},
    { type:"verita",  title:"Racconta il tuo flirt più fallimentare",                         payload:{category:"verita", text:"Racconta nel dettaglio il tuo flirt più fallimentare.",level:4,durationSeconds:60}},
    { type:"obbligo", title:"Recita la scena più romantica di un film",                       payload:{category:"obbligo",text:"Recita la scena più romantica di un film con qualcuno del gruppo.",level:4,durationSeconds:60}},
    { type:"verita",  title:"Qual è il tuo desiderio segreto confessabile?",                  payload:{category:"verita", text:"Qual è il tuo desiderio segreto confessabile?",level:5,durationSeconds:60}},
    { type:"obbligo", title:"Dai un massaggio alle spalle per 1 minuto",                      payload:{category:"obbligo",text:"Dai un massaggio alle spalle al giocatore alla tua sinistra per 1 minuto.",level:5,durationSeconds:60}},
  ],
  "saramusica": [
    { type:"guess_artist",    title:"Chi ha cantato 'Volare'?",                payload:{type:"guess_artist",   question:"Chi ha cantato 'Volare (Nel blu dipinto di blu)'?",answers:["Domenico Modugno","Lucio Battisti","Mina","Adriano Celentano"],correctAnswerIndex:0,year:1958,artist:"Domenico Modugno",songTitle:"Volare",explanation:"Vincitore Sanremo 1958",points:100,timeLimit:20}},
    { type:"guess_song",      title:"Indovina la canzone di Vasco Rossi",      payload:{type:"guess_song",     question:"Vasco Rossi: 'Una vita spericolata, voglio...'",answers:["Una vita spericolata","Albachiara","Rosso relativo","Siamo soli"],correctAnswerIndex:0,year:1983,artist:"Vasco Rossi",songTitle:"Una vita spericolata",explanation:"Album 1983",points:100,timeLimit:20}},
    { type:"complete_lyrics", title:"Completa: 'Nel blu dipinto di ___'",      payload:{type:"complete_lyrics",question:"'Volare, oh oh. Cantare, oh oh. Nel blu dipinto di ___'",answers:["blu","bianco","rosso","nero"],correctAnswerIndex:0,year:1958,artist:"Domenico Modugno",songTitle:"Volare",explanation:"Il colore del cielo!",points:150,timeLimit:15}},
    { type:"guess_artist",    title:"Chi ha cantato 'Con te partirò'?",        payload:{type:"guess_artist",   question:"Chi ha portato al successo 'Con te partirò'?",answers:["Andrea Bocelli","Eros Ramazzotti","Zucchero","Tiziano Ferro"],correctAnswerIndex:0,year:1995,artist:"Andrea Bocelli",songTitle:"Con te partirò",explanation:"Duetto con Sarah Brightman",points:100,timeLimit:20}},
    { type:"guess_song",      title:"Indovina la canzone di Ligabue",          payload:{type:"guess_song",     question:"Ligabue: 'Certe notti la radio che gracchia...'",answers:["Certe notti","Urlando contro il cielo","Ho messo via","Tra palco e realtà"],correctAnswerIndex:0,year:1995,artist:"Ligabue",songTitle:"Certe notti",explanation:"Album Buon compleanno Elvis",points:100,timeLimit:20}},
    { type:"guess_artist",    title:"Chi ha cantato 'Azzurro'?",               payload:{type:"guess_artist",   question:"Chi ha reso famosa 'Azzurro'?",answers:["Adriano Celentano","Claudio Villa","Bobby Solo","Al Bano"],correctAnswerIndex:0,year:1968,artist:"Adriano Celentano",songTitle:"Azzurro",explanation:"Scritta da Paolo Conte",points:100,timeLimit:20}},
    { type:"speed_music",     title:"Speed: 5 cantanti italiani anni '90",     payload:{type:"speed_music",    question:"Chi completa prima: nomina 5 cantanti italiani degli anni '90!",answers:[],correctAnswerIndex:-1,year:1990,artist:"",songTitle:"",explanation:"Sfida velocità!",points:200,timeLimit:30}},
    { type:"guess_song",      title:"Indovina la canzone di Zucchero",         payload:{type:"guess_song",     question:"Zucchero: 'Miserere, miserere, ho le lacrime agli occhi...'",answers:["Miserere","Senza una donna","Baila","Diavolo in me"],correctAnswerIndex:0,year:1992,artist:"Zucchero",songTitle:"Miserere",explanation:"Duetto con Pavarotti",points:100,timeLimit:20}},
    { type:"complete_lyrics", title:"Completa: 'Senza una donna, ___'",        payload:{type:"complete_lyrics",question:"'Senza una donna, ___, senza una donna, che notte lunga'",answers:["ah ah ah","oh oh oh","uh uh uh","eh eh eh"],correctAnswerIndex:0,year:1991,artist:"Zucchero",songTitle:"Senza una donna",explanation:"Hit mondiale!",points:150,timeLimit:15}},
    { type:"song_vs_song",    title:"A vs B: quale è più recente?",            payload:{type:"song_vs_song",   question:"Quale canzone è più recente?",answers:["Azzurro (1968)","L'italiano (1983)"],correctAnswerIndex:1,year:1983,artist:"",songTitle:"",explanation:"L'italiano di Toto Cutugno è del 1983",points:100,timeLimit:15}},
  ],
  "quizzone": [
    { type:"multiple_choice", title:"Capitale dell'Australia?",                payload:{type:"multiple_choice",question:"Qual è la capitale dell'Australia?",answers:["Canberra","Sydney","Melbourne","Brisbane"],correctAnswerIndex:0,points:100,timeLimit:15,explanation:"Canberra, non Sydney!"}},
    { type:"multiple_choice", title:"Quanti pianeti ha il sistema solare?",    payload:{type:"multiple_choice",question:"Quanti pianeti ci sono nel sistema solare?",answers:["8","9","7","10"],correctAnswerIndex:0,points:100,timeLimit:15,explanation:"Plutone fu declassato nel 2006"}},
    { type:"true_false",      title:"Il DNA ha la forma di doppia elica?",     payload:{type:"true_false",     question:"Il DNA ha la struttura a doppia elica.",answers:["Vero","Falso"],correctAnswerIndex:0,points:50,timeLimit:10,explanation:"Watson e Crick, 1953"}},
    { type:"multiple_choice", title:"Chi ha dipinto la Cappella Sistina?",     payload:{type:"multiple_choice",question:"Chi ha affrescato la volta della Cappella Sistina?",answers:["Michelangelo","Leonardo da Vinci","Raffaello","Botticelli"],correctAnswerIndex:0,points:100,timeLimit:15,explanation:"1508-1512"}},
    { type:"multiple_choice", title:"Anno della Rivoluzione Francese?",        payload:{type:"multiple_choice",question:"In quale anno iniziò la Rivoluzione Francese?",answers:["1789","1776","1804","1799"],correctAnswerIndex:0,points:100,timeLimit:15,explanation:"Presa della Bastiglia: 14 luglio 1789"}},
    { type:"multiple_choice", title:"Simbolo chimico dell'oro?",               payload:{type:"multiple_choice",question:"Qual è il simbolo chimico dell'oro?",answers:["Au","Or","Ag","Fe"],correctAnswerIndex:0,points:100,timeLimit:10,explanation:"Da Aurum, nome latino"}},
    { type:"multiple_choice", title:"Chi ha scritto la Divina Commedia?",      payload:{type:"multiple_choice",question:"Chi ha scritto la Divina Commedia?",answers:["Dante Alighieri","Francesco Petrarca","Giovanni Boccaccio","Ludovico Ariosto"],correctAnswerIndex:0,points:100,timeLimit:15,explanation:"Scritta tra il 1304 e il 1321"}},
    { type:"multiple_choice", title:"Quante regioni ha l'Italia?",             payload:{type:"multiple_choice",question:"Quante sono le regioni d'Italia?",answers:["20","18","22","19"],correctAnswerIndex:0,points:100,timeLimit:10,explanation:"20 regioni, 5 a statuto speciale"}},
    { type:"true_false",      title:"Venezia è costruita su isole?",           payload:{type:"true_false",     question:"Venezia è costruita su oltre 100 isole.",answers:["Vero","Falso"],correctAnswerIndex:0,points:50,timeLimit:10,explanation:"118 isole circa"}},
    { type:"multiple_choice", title:"Qual è il fiume più lungo d'Italia?",     payload:{type:"multiple_choice",question:"Qual è il fiume più lungo d'Italia?",answers:["Po","Tevere","Adige","Arno"],correctAnswerIndex:0,points:100,timeLimit:10,explanation:"Il Po misura circa 652 km"}},
  ],
  "parola-alle-spalle": [
    { type:"word_card", title:"PIZZA",     payload:{word:"PIZZA",     category:"Cibo",        tabooWords:["forno","mozzarella","pomodoro","fetta","tonda"]}},
    { type:"word_card", title:"GATTO",     payload:{word:"GATTO",     category:"Animali",     tabooWords:["felino","baffi","miao","zampe","pelo"]}},
    { type:"word_card", title:"CALCIO",    payload:{word:"CALCIO",    category:"Sport",       tabooWords:["pallone","campo","portiere","gol","squadra"]}},
    { type:"word_card", title:"MARE",      payload:{word:"MARE",      category:"Natura",      tabooWords:["acqua","spiaggia","sabbia","pesce","onda"]}},
    { type:"word_card", title:"TRENO",     payload:{word:"TRENO",     category:"Trasporti",   tabooWords:["stazione","rotaie","vagone","veloce","ferrovia"]}},
    { type:"word_card", title:"MEDICO",    payload:{word:"MEDICO",    category:"Professioni", tabooWords:["dottore","ospedale","cura","malato","visita"]}},
    { type:"word_card", title:"CHITARRA",  payload:{word:"CHITARRA",  category:"Musica",      tabooWords:["corde","suonare","rock","strumento","musica"]}},
    { type:"word_card", title:"CASTELLO",  payload:{word:"CASTELLO",  category:"Luoghi",      tabooWords:["torre","medievale","re","mura","fortezza"]}},
    { type:"word_card", title:"TORTA",     payload:{word:"TORTA",     category:"Cibo",        tabooWords:["dolce","candeline","forno","crema","fetta"]}},
    { type:"word_card", title:"ELEFANTE",  payload:{word:"ELEFANTE",  category:"Animali",     tabooWords:["proboscide","grande","Africa","grigio","zanna"]}},
    { type:"word_card", title:"AEROPLANO", payload:{word:"AEROPLANO", category:"Trasporti",   tabooWords:["volare","cielo","pilota","aeroporto","ala"]}},
    { type:"word_card", title:"PRESIDENTE",payload:{word:"PRESIDENTE",category:"Politica",    tabooWords:["governo","stato","elezioni","capo","palazzo"]}},
  ],
  "percorso-risate": [
    { type:"mimo",     title:"Mimare un pesce rosso in acquario",        payload:{type:"mimo",    text:"Mimati un pesce rosso che nuota nell'acquario mentre tutti guardano.",          points:100,timeLimit:60}},
    { type:"ballo",    title:"Balla come un robot anni '80",             payload:{type:"ballo",   text:"Balla per 30 secondi come un robot degli anni '80.",                           points:150,timeLimit:45}},
    { type:"sfida",    title:"Parla 30 secondi senza dire 'io'",         payload:{type:"sfida",   text:"Racconta la tua giornata di ieri per 30 secondi senza mai dire 'io'.",         points:100,timeLimit:60}},
    { type:"veloce",   title:"5 città italiane in 10 secondi",           payload:{type:"veloce",  text:"Nomina 5 città italiane diverse in meno di 10 secondi!",                      points:200,timeLimit:15}},
    { type:"domanda",  title:"Chi cucina meglio nel gruppo?",            payload:{type:"domanda", text:"Tutti votano: chi di voi cucina meglio? Il perdente mangia con la forchetta al contrario.", points:100,timeLimit:30}},
    { type:"coppia",   title:"Costruire una torre con le dita in coppia",payload:{type:"coppia",  text:"In coppia: costruite la torre più alta intrecciando solo le dita in 30 secondi.", points:150,timeLimit:45}},
    { type:"reazione", title:"Viso di chi trova un insetto nel piatto",  payload:{type:"reazione",text:"Fai la faccia di qualcuno che trova un insetto nel piatto. Regge 20 secondi senza ridere?", points:100,timeLimit:30}},
    { type:"fantasia", title:"Inventa uno slogan per il tuo vicino",     payload:{type:"fantasia",text:"Inventa uno slogan pubblicitario per vendere il tuo vicino di sinistra come prodotto.", points:150,timeLimit:60}},
    { type:"mimo",     title:"Mimare una doccia fredda",                 payload:{type:"mimo",    text:"Mimare di fare una doccia fredda gelata in estate.",                           points:100,timeLimit:45}},
    { type:"sfida",    title:"Accento siciliano per 1 minuto",           payload:{type:"sfida",   text:"Parla con un forte accento siciliano per il prossimo minuto in qualunque cosa dici.", points:200,timeLimit:60}},
  ],
  "karaoke-battle": [
    { type:"song", title:"Azzurro — Adriano Celentano",        payload:{title:"Azzurro",             artist:"Adriano Celentano",year:1968,genre:"pop italiano",  youtubeSearch:"Adriano Celentano Azzurro karaoke"}},
    { type:"song", title:"Volare — Domenico Modugno",          payload:{title:"Volare",              artist:"Domenico Modugno", year:1958,genre:"pop italiano",  youtubeSearch:"Domenico Modugno Volare karaoke"}},
    { type:"song", title:"Gloria — Umberto Tozzi",             payload:{title:"Gloria",              artist:"Umberto Tozzi",    year:1979,genre:"pop italiano",  youtubeSearch:"Umberto Tozzi Gloria karaoke"}},
    { type:"song", title:"L'italiano — Toto Cutugno",          payload:{title:"L'italiano",          artist:"Toto Cutugno",     year:1983,genre:"pop italiano",  youtubeSearch:"Toto Cutugno L'italiano karaoke"}},
    { type:"song", title:"Con te partirò — Andrea Bocelli",    payload:{title:"Con te partirò",      artist:"Andrea Bocelli",   year:1995,genre:"opera-pop",     youtubeSearch:"Andrea Bocelli Con te partirò karaoke"}},
    { type:"song", title:"Despacito — Luis Fonsi",             payload:{title:"Despacito",           artist:"Luis Fonsi",       year:2017,genre:"reggaeton",     youtubeSearch:"Luis Fonsi Despacito karaoke"}},
    { type:"song", title:"Bohemian Rhapsody — Queen",          payload:{title:"Bohemian Rhapsody",   artist:"Queen",            year:1975,genre:"rock",          youtubeSearch:"Queen Bohemian Rhapsody karaoke"}},
    { type:"song", title:"Don't Stop Me Now — Queen",          payload:{title:"Don't Stop Me Now",   artist:"Queen",            year:1978,genre:"rock",          youtubeSearch:"Queen Don't Stop Me Now karaoke"}},
    { type:"song", title:"Sweet Caroline — Neil Diamond",      payload:{title:"Sweet Caroline",      artist:"Neil Diamond",     year:1969,genre:"pop",           youtubeSearch:"Neil Diamond Sweet Caroline karaoke"}},
    { type:"song", title:"Livin' on a Prayer — Bon Jovi",      payload:{title:"Livin' on a Prayer",  artist:"Bon Jovi",         year:1986,genre:"rock",          youtubeSearch:"Bon Jovi Livin on a Prayer karaoke"}},
    { type:"song", title:"Shallow — Lady Gaga",                payload:{title:"Shallow",             artist:"Lady Gaga",        year:2018,genre:"pop",           youtubeSearch:"Lady Gaga Shallow karaoke"}},
  ],
  "card-sets": [
    { type:"pair", title:"Sole / Luna",     payload:{pairLabel:"Sole/Luna",     descriptionA:"Il sole (astro del giorno)", descriptionB:"La luna (astro della notte)", imageUrlHint:"sun moon"}},
    { type:"pair", title:"Gatto / Cane",    payload:{pairLabel:"Gatto/Cane",    descriptionA:"Un gatto curioso",           descriptionB:"Un cane fedele",              imageUrlHint:"cat dog"}},
    { type:"pair", title:"Pizza / Pasta",   payload:{pairLabel:"Pizza/Pasta",   descriptionA:"Una pizza margherita",       descriptionB:"Spaghetti al pomodoro",       imageUrlHint:"pizza pasta"}},
    { type:"pair", title:"Amore / Cuore",   payload:{pairLabel:"Amore/Cuore",   descriptionA:"Simbolo amore",              descriptionB:"Cuore rosso",                 imageUrlHint:"love heart"}},
    { type:"pair", title:"Mare / Montagna", payload:{pairLabel:"Mare/Montagna", descriptionA:"Spiaggia al tramonto",       descriptionB:"Vetta innevata",              imageUrlHint:"sea mountain"}},
  ],
  "sfida-ballo": [
    { type:"dance_challenge", title:"Hip-Hop Freestyle",     payload:{mood:"hip-hop",   difficulty:"easy",  duration:30,description:"Freestyle hip-hop, movimento libero!"}},
    { type:"dance_challenge", title:"Lento Romantico",       payload:{mood:"romantic",  difficulty:"easy",  duration:45,description:"Ballo lento con il partner più vicino."}},
    { type:"dance_challenge", title:"Tarantella Napoletana", payload:{mood:"tarantella",difficulty:"medium",duration:60,description:"Ritmo veloce! Scalda le gambe e vai!"}},
    { type:"dance_challenge", title:"Robot Dance",           payload:{mood:"robot",     difficulty:"medium",duration:30,description:"Muoviti come un robot degli anni '80."}},
    { type:"dance_challenge", title:"TikTok Viral",          payload:{mood:"tiktok",    difficulty:"hard",  duration:45,description:"Replica la coreografia virale del momento!"}},
  ],
};

function fallbackItems(req: GenerateRequest): GeneratedItem[] {
  const bank = FALLBACK_BANKS[req.gameSlug] ?? [{ type:"item", title:"Elemento", payload:{ text: `Elemento di ${req.themeName}` } }];
  return Array.from({ length: req.count }, (_, i) => {
    const entry = bank[i % bank.length]!;
    return { type: entry.type, title: entry.title, payloadJson: { ...entry.payload, theme: req.themeName }, sortOrder: i };
  });
}

function parseAIResponse(gameSlug: string, raw: unknown[]): Omit<GeneratedItem, "sortOrder">[] {
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    switch (gameSlug) {
      case "adult-only":         return { type: String(o["category"] ?? "verita"),       title: String(o["text"] ?? "").slice(0, 120), payloadJson: o };
      case "saramusica":         return { type: String(o["type"] ?? "guess_song"),        title: String(o["question"] ?? "").slice(0, 80), payloadJson: o };
      case "quizzone":           return { type: String(o["type"] ?? "multiple_choice"),  title: String(o["question"] ?? "").slice(0, 80), payloadJson: o };
      case "parola-alle-spalle": return { type: "word_card",                             title: String(o["word"] ?? ""), payloadJson: o };
      case "percorso-risate":    return { type: String(o["type"] ?? "sfida"),            title: String(o["text"] ?? "").slice(0, 80), payloadJson: o };
      case "karaoke-battle":     return { type: "song",                                  title: `${String(o["title"] ?? "")} — ${String(o["artist"] ?? "")}`, payloadJson: o };
      case "card-sets":          return { type: "pair",                                  title: String(o["pairLabel"] ?? "Coppia"), payloadJson: o };
      default:                   return { type: "item",                                  title: String(o["title"] ?? o["question"] ?? o["word"] ?? "").slice(0, 80), payloadJson: o };
    }
  });
}

export async function generateContentItems(req: GenerateRequest): Promise<GenerateResult> {
  const client = makeClient();
  if (!client) {
    logger.warn("[CONTENT_GEN] No OpenAI client — using fallback bank");
    return { items: fallbackItems(req), source: "fallback", error: "AI non configurata — contenuto statico generato" };
  }

  const prompt = promptFor(req);
  logger.info({ gameSlug: req.gameSlug, theme: req.themeName }, "[CONTENT_GEN_AI] Generating");

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Sei un content creator esperto per giochi italiani. Rispondi SOLO con JSON valido, nessun testo aggiuntivo." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 3000,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 25000)),
    ]);

    const text = completion.choices[0]?.message?.content ?? "[]";
    const clean = text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(clean) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Risposta AI vuota");

    logger.info({ count: parsed.length }, "[CONTENT_GEN_AI] Success");
    const items = parseAIResponse(req.gameSlug, parsed.slice(0, req.count)).map((item, i) => ({ ...item, sortOrder: i }));
    return { items, source: "ai" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[CONTENT_GEN_AI] Failed — fallback");
    return { items: fallbackItems(req), source: "fallback", error: `AI fallita (${errMsg}) — contenuto statico generato` };
  }
}

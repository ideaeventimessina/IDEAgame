// ── Types ─────────────────────────────────────────────────────────────────────

export type BottleLevel = 1 | 2 | 3 | 4 | 5;

export interface BottleChallenge {
  id: string;
  level: BottleLevel;
  category: string;
  text: string;
  requiredPlayers: number;
  durationSeconds: number;
  requiresConsent: boolean;
  allowPublicVote: boolean;
  tags: string[];
}

export const BOTTLE_LEVELS: { level: BottleLevel; label: string; emoji: string; color: string; desc: string }[] = [
  { level: 1, label: "Sociale",    emoji: "🥂",  color: "#34D399", desc: "Giochi di gruppo divertenti" },
  { level: 2, label: "Flirt",      emoji: "💋",  color: "#FB7185", desc: "Verità e osi spinti" },
  { level: 3, label: "Hot",        emoji: "🔥",  color: "#EF4444", desc: "Contatto fisico e prove audaci" },
  { level: 4, label: "Pack Admin", emoji: "🔒",  color: "#A855F7", desc: "Contenuto pacchetto privato" },
  { level: 5, label: "Esclusivo",  emoji: "🌙",  color: "#818CF8", desc: "Pack riservato organizzatore" },
];

export type SuperpowerType = "reroll" | "extra_time" | "swap_player" | "validate" | "double_points" | "public_vote";

export const SUPERPOWERS: { id: SuperpowerType; label: string; emoji: string; desc: string }[] = [
  { id: "reroll",        label: "Rigioca",      emoji: "🎲", desc: "Cambia la sfida corrente" },
  { id: "extra_time",   label: "+30 sec",      emoji: "⏱️", desc: "Aggiunge 30 secondi" },
  { id: "swap_player",  label: "Scambia",      emoji: "🔄", desc: "Cambia il giocatore selezionato" },
  { id: "validate",     label: "Auto-Valida",  emoji: "✅", desc: "Sfida automaticamente superata" },
  { id: "double_points",label: "Doppio",       emoji: "2️⃣", desc: "Punti raddoppiati per questo round" },
  { id: "public_vote",  label: "Voto totale",  emoji: "👥", desc: "Forza voto pubblico di tutti" },
];

// ── Challenge bank (levels 1-3) ────────────────────────────────────────────────

function c(id: string, level: BottleLevel, category: string, text: string, durationSeconds: number, requiredPlayers = 1, allowPublicVote = false, requiresConsent = false): BottleChallenge {
  return { id, level, category, text, requiredPlayers, durationSeconds, requiresConsent, allowPublicVote, tags: [] };
}

export const BOTTLE_BANK: BottleChallenge[] = [

  // ── Livello 1 — Sociale ────────────────────────────────────────────────────
  c("l1_01", 1, "imitazione",    "Imita un personaggio famoso finché gli altri non lo indovinano. Max 90 secondi.", 90),
  c("l1_02", 1, "telefono",      "Chiama il contatto numero 5 in rubrica e digli 'Ho vinto un viaggio — vuoi venire?'. Aspetta la risposta!", 60),
  c("l1_03", 1, "musicale",      "Fischietta una canzone finché il gruppo non la indovina. Il gruppo ha 3 tentativi.", 45),
  c("l1_04", 1, "confessione",   "Confessa la bugia più credibile che hai detto stasera — o inventane una. Il gruppo vota se è vera.", 45, 1, true),
  c("l1_05", 1, "storytelling",  "Racconta la trama di un film come se fosse la storia della tua vita. Hai 45 secondi.", 45),
  c("l1_06", 1, "imitazione",    "Imita per 60 secondi il modo di parlare di qualcuno in questa stanza. Nessuno deve scoppiare a ridere.", 60, 1, true),
  c("l1_07", 1, "sfida vocale",  "Canta la sigla di un cartone degli anni 90 senza fermarti per 30 secondi.", 30),
  c("l1_08", 1, "infomercial",   "Inventa un prodotto assurdo e vendilo al gruppo con un discorso di 30 secondi.", 30, 1, true),
  c("l1_09", 1, "indovinello",   "Parla per 60 secondi senza dire 'io', 'tu' o 'si'. Il gruppo ti blocca se sbagli.", 60, 1, true),
  c("l1_10", 1, "teatrale",      "Fai una posa drammatica da eroe del cinema e mantienila per 30 secondi mentre il gruppo fa 3 domande.", 30),
  c("l1_11", 1, "gruppo",        "Il gruppo sceglie un argomento: tu devi difendere la posizione opposta a quella che pensi, per 60 secondi.", 60, 1, true),
  c("l1_12", 1, "segreto",       "Di' una cosa vera su di te che nessuno qui sa ancora.", 45),
  c("l1_13", 1, "reazione",      "Reagisci con esagerazione alla parola 'ananas' ogni volta che viene detta — per tutto il prossimo round.", 60),
  c("l1_14", 1, "emoji",         "Racconta la tua giornata di oggi usando solo suoni e gesti — zero parole. Il gruppo deve capire.", 45),
  c("l1_15", 1, "domande",       "Rispondi per 60 secondi alle domande del gruppo rispondendo solo con 'Forse', 'Decisamente' o 'Mai'.", 60, 1, true),

  // ── Livello 2 — Flirt ─────────────────────────────────────────────────────
  c("l2_01", 2, "sguardo",       "Guarda negli occhi la persona che il gruppo sceglie per 30 secondi senza ridere o distogliere lo sguardo.", 35, 2, true),
  c("l2_02", 2, "complimento",   "Fai un complimento vero e specifico a ogni persona del gruppo — niente banalità.", 60, 1, true),
  c("l2_03", 2, "segreto",       "Sussurra un segreto all'orecchio della persona alla tua sinistra. Poi lei lo ripete ad alta voce come vuole.", 30, 2, true),
  c("l2_04", 2, "tipo ideale",   "Descrivi la persona più attraente in questa stanza senza dire il nome — tutti indovinano.", 30, 1, true),
  c("l2_05", 2, "messaggio",     "Scrivi un messaggio di flirt convincente (niente di volgare) per qualcuno nel gruppo. Mostralo prima di inviare.", 60),
  c("l2_06", 2, "verità",        "Rispondi onestamente: hai mai fantasticato romanticamente su qualcuno in questa stanza? Solo sì o no.", 20),
  c("l2_07", 2, "primo appuntamento", "Descrivi come sarebbe il tuo primo appuntamento ideale. Il gruppo vota chi ti inviterebbe davvero.", 45, 1, true),
  c("l2_08", 2, "coppia",        "Il gruppo sceglie due persone: devono dirsi tre cose vere che li attraggono l'uno dell'altro.", 60, 2, true),
  c("l2_09", 2, "danza",         "Balla con la persona che il gruppo sceglie per 30 secondi.", 35, 2, false, true),
  c("l2_10", 2, "confessione",   "Racconta la tua storia di flirt più imbarazzante — tutti i dettagli che puoi condividere.", 60, 1, true),
  c("l2_11", 2, "massaggio",     "Fai un massaggio alle spalle alla persona alla tua destra per 30 secondi.", 35, 2, false, true),
  c("l2_12", 2, "seduzione",     "Di' la cosa più audace che hai fatto per attirare l'attenzione di qualcuno.", 45),
  c("l2_13", 2, "profilo",       "Crea il tuo profilo perfetto di dating app in 45 secondi e leggilo ad alta voce.", 45, 1, true),
  c("l2_14", 2, "rivelazione",   "Chi in questa stanza ti è sembrato più interessante appena lo hai incontrato? Rispondi ad alta voce.", 20),
  c("l2_15", 2, "ballo",         "Il gruppo sceglie due persone: devono improvvisare una scenetta romantica in stile soap opera per 90 secondi.", 90, 2, true, true),

  // ── Livello 3 — Hot ───────────────────────────────────────────────────────
  c("l3_01", 3, "bacio",         "Descrivi nei minimi dettagli il tuo bacio più memorabile — dove eri, chi era, com'è andata.", 60),
  c("l3_02", 3, "messaggio",     "Leggi ad alta voce il messaggio più piccante che hai inviato o ricevuto — puoi cambiare i nomi.", 45),
  c("l3_03", 3, "classifica",    "Scrivi su un foglio con chi passeresti una serata romantica tra le persone presenti. Poi giri il foglio.", 30),
  c("l3_04", 3, "sfida",         "Di' la cosa più audace che sei disposto a fare qui stasera. Il gruppo vota se ci credi.", 30, 1, true),
  c("l3_05", 3, "massaggio",     "Fai un massaggio ai piedi di qualcuno del gruppo per 60 secondi.", 65, 2, true, true),
  c("l3_06", 3, "storia",        "Racconta la serata più folle e romantica della tua vita — tutti i dettagli che puoi condividere.", 90, 1, true),
  c("l3_07", 3, "danza",         "Fai una danza sensuale per 30 secondi davanti al gruppo. Il gruppo vota il livello di intensità.", 35, 1, true),
  c("l3_08", 3, "coppia",        "Il gruppo sceglie due persone: devono mimeare una scena romantica dal film che il gruppo nomina.", 120, 2, true, true),
  c("l3_09", 3, "confidenza",    "Confessa la cosa più audace che hai fatto o ti hanno fatto in una relazione romantica.", 60),
  c("l3_10", 3, "ex",            "Sei il tuo ex per 3 minuti: parla, gesticola e rispondi alle domande come se fossi lui/lei.", 180, 1, true),
  c("l3_11", 3, "seduzione",     "Hai 60 secondi per convincere la persona che il gruppo sceglie ad uscire con te. Usa solo parole.", 60, 2, true),
  c("l3_12", 3, "verità",        "Il gruppo fa 3 domande a cui non puoi rispondere 'non lo so'. Le risposte devono essere oneste.", 90, 1, true),
  c("l3_13", 3, "fantasia",      "Descrivi la tua fantastica serata da sogno: dove, con chi (puoi essere vago), cosa fate.", 60),
  c("l3_14", 3, "giudizio",      "Il gruppo giudica quanto sei 'dateable' su scala 1-10 con motivazione. Tu ascolti in silenzio.", 60, 1, true),
  c("l3_15", 3, "improvvisazione","Il gruppo sceglie due persone: costruiscono insieme la storia di 'come si sono incontrate'. Deve essere romantica e credibile. 2 minuti.", 120, 2, true),
];

// ── Superpower helpers ────────────────────────────────────────────────────────

const ALL_POWERS: SuperpowerType[] = ["reroll", "extra_time", "swap_player", "validate", "double_points", "public_vote"];

export function randomPower(): SuperpowerType {
  return ALL_POWERS[Math.floor(Math.random() * ALL_POWERS.length)]!;
}

export function assignSpectatorPowers(spectatorIds: string[], existing: Record<string, string | null>): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const id of spectatorIds) {
    // Assign new power if they don't already have one (or if it was cleared after use)
    result[id] = existing[id] != null ? existing[id] : randomPower();
  }
  return result;
}

// ── Challenge selector ────────────────────────────────────────────────────────

export function pickFromBank(level: BottleLevel, usedIds: string[]): BottleChallenge | null {
  const pool = BOTTLE_BANK.filter(c => c.level === level);
  const fresh = pool.filter(c => !usedIds.includes(c.id));
  const source = fresh.length > 0 ? fresh : pool; // reset if exhausted
  return source.length > 0 ? source[Math.floor(Math.random() * source.length)]! : null;
}

// ── Truth / Dare banks (Obbligo o Verità) ────────────────────────────────────

export const ADULT_TRUTH_BANK: Record<1 | 2 | 3, string[]> = {
  1: [
    "Qual è stata la tua figuraccia più grande in pubblico?",
    "Qual è la cosa più strana che hai fatto da solo/a a casa?",
    "Chi era il tuo crush segreto al liceo?",
    "Qual è la bugia più grande che hai detto a un amico/a?",
    "Qual è la cosa più imbarazzante che ti è capitata a scuola o al lavoro?",
    "Qual è l'acquisto più stupido che hai fatto?",
    "Quante volte hai fatto la firma falsa dei tuoi genitori?",
    "Qual è la cosa più infantile che fai ancora oggi?",
    "Qual è il film che hai rivisto più volte senza ammetterlo?",
    "Hai mai mentito sulla tua età? Quanti anni hai detto di avere?",
    "Qual è il cibo che mangi in segreto?",
    "Qual è il momento in cui ti sei sentito/a più stupido/a?",
    "Hai mai rubato qualcosa di piccolo? Cosa?",
    "Qual è la cosa che non ammetteresti mai ai tuoi genitori?",
    "Quale abitudine segreta hai che nessuno qui sa?",
  ],
  2: [
    "Chi baceresti tra i presenti se potessi?",
    "Descriva il tuo primo bacio: dove, come, con chi (senza il nome).",
    "Qual è il tuo flirt più imbarazzante mai tentato?",
    "Qual è il messaggio più cringe che hai inviato per conquistare qualcuno?",
    "Chi è la persona più attraente in questa stanza? Di' solo la prima lettera del nome.",
    "Hai mai avuto un crush su qualcuno già impegnato?",
    "Qual è la cosa più audace che hai fatto per attirare l'attenzione di qualcuno?",
    "Hai mai scritto un messaggio romantico e non inviato? A chi era?",
    "Qual è la serata romantica più disastrosa che hai vissuto?",
    "Hai mai ingelosito qualcuno apposta? Come?",
    "Ti sei mai innamorato/a di un amico/a? Come è finita?",
    "Qual è la cosa che cerchi in un partner e non hai mai ammesso?",
    "Hai mai fatto una cosa romantica per qualcuno e fatto una figura pessima?",
    "Qual è la persona più inaspettata che hai mai baciato?",
    "Descrivi la persona che ti ha fatto battere più forte il cuore quest'anno.",
  ],
  3: [
    "Descrivi il tuo bacio più memorabile — dove eri, com'è andata.",
    "Qual è la cosa più hot che avresti voglia di dire ma non dici mai?",
    "Qual è il tuo scenario romantico ideale? Nessun limite.",
    "Hai mai guardato qualcuno in questa stanza pensando cose che non dovresti?",
    "Qual è il tuo superpotere di seduzione? Sii onesto/a.",
    "Descrivi la serata più selvaggia della tua vita (versione censurata).",
    "Cosa faresti se potessi essere invisibile per una notte?",
    "Hai mai baciato qualcuno per scommessa?",
    "Qual è il tuo punto G sentimentale — cosa ti fa innamorare in modo irrazionale?",
    "Hai mai confessato qualcosa a qualcuno sotto effetto della serata?",
    "Qual è la dedica romantica più audace che hai ricevuto o fatto?",
    "Chi nel gruppo ti ha fatto una buona impressione appena l'hai visto/a stasera?",
    "Descrivi con una metafora l'ultima persona di cui ti sei innamorato/a.",
    "Qual è la cosa più coraggiosa che hai fatto in una notte?",
    "Qual è la cosa che ami delle relazioni fisiche e non dici mai ad alta voce?",
  ],
};

export const ADULT_DARE_BANK: Record<1 | 2 | 3, string[]> = {
  1: [
    "Imita qualcuno nel gruppo per 30 secondi. Il gruppo indovina chi è.",
    "Balla 20 secondi senza musica con la massima serietà.",
    "Canta i primi 10 secondi di una canzone a scelta del gruppo.",
    "Telefona a qualcuno in rubrica e di' 'ho qualcosa di importante da dirti' — poi riaggancia.",
    "Fai un complimento sincero e specifico a ogni persona nel gruppo.",
    "Parla per 30 secondi usando solo parole di massimo 3 lettere.",
    "Descrivi la tua giornata di oggi in stile telenovela drammatica.",
    "Manda un messaggio vocale assurdo a un contatto a caso dalla rubrica.",
    "Racconta una barzelletta. Se non fa ridere nessuno, fanne un'altra.",
    "Cammina come un robot per i prossimi 2 minuti.",
    "Inventa uno slogan per il prodotto più strano che hai in borsa/tasca.",
    "Fai una posa da supereroe per 30 secondi mentre il gruppo fa 3 domande.",
    "Fai 10 salti sul posto cantando una filastrocca.",
    "Imita un personaggio famoso per 45 secondi — il gruppo indovina.",
    "Lascia che il gruppo ti faccia fare una foto imbarazzante da postare.",
  ],
  2: [
    "Sussurra all'orecchio del giocatore alla tua sinistra qualcosa che non diresti ad alta voce.",
    "Guarda negli occhi la persona di fronte a te per 30 secondi senza ridere.",
    "Di' a ognuno nel gruppo una cosa che ti piace di lui/lei senza imbarazzo.",
    "Lascia che il gruppo legga il tuo ultimo messaggio ricevuto ad alta voce.",
    "Fai un massaggio alle spalle al giocatore alla tua destra per 30 secondi.",
    "Crea un profilo di dating app per te in 1 minuto e leggilo al gruppo.",
    "Di' tre cose che trovi attraenti del giocatore davanti a te — in modo serio.",
    "Balla lentamente da solo/a per 20 secondi mentre il gruppo guarda.",
    "Lascia che il gruppo veda le tue ultime 5 emoji usate.",
    "Stai seduto/a sulle ginocchia di qualcuno scelto dal gruppo per il prossimo round.",
    "Invia un GIF romantico a un numero del gruppo senza spiegazioni.",
    "Manda uno sticker romantico a un contatto scelto dal gruppo.",
    "Descriva il tipo ideale — il gruppo indovina a chi assomiglia tra i presenti.",
    "Scrivi un messaggio di flirt convincente e mostralo prima di inviare.",
    "Di' il nome del tuo ex in maniera artistica — con musica di sottofondo immaginaria.",
  ],
  3: [
    "Di' la frase più hot che ti viene in mente al giocatore di fronte a te.",
    "Mostra al gruppo il messaggio più piccante che hai ricevuto (puoi censurare il nome).",
    "Recita una scena romantica improvvisata con il giocatore scelto dal gruppo.",
    "Fai una posa sexy e tieni il personaggio per 20 secondi.",
    "Racconta il dettaglio più hot di una serata che non hai mai condiviso.",
    "Di' una cosa che non diresti mai sobrio/a — ma sei libero/a di dirla ora.",
    "Il gruppo sceglie due persone: guardarsi negli occhi per 1 minuto senza parlare.",
    "Lascia che il gruppo scelga il tuo prossimo messaggio da inviare a un contatto.",
    "Manda un messaggio romantico al contatto scelto dal gruppo.",
    "Lascia che il gruppo ti ponga 3 domande sulla tua vita amorosa a cui devi rispondere onestamente.",
    "Fai una dedica musicale a qualcuno nel gruppo — canta o canticchia.",
    "Siedi sul grembo del giocatore scelto dal gruppo per 30 secondi.",
    "Dai un bacio sulla guancia al giocatore alla tua sinistra.",
    "Il gruppo sceglie due persone che devono dirsi 3 cose vere che si attraggono.",
    "Descrive la persona a destra come se fosse il protagonista di un romanzo romantico.",
  ],
};

export function pickRandomTruth(level: number): string {
  const l = Math.min(3, Math.max(1, level)) as 1 | 2 | 3;
  const bank = ADULT_TRUTH_BANK[l];
  return bank[Math.floor(Math.random() * bank.length)]!;
}

export function pickRandomDare(level: number): string {
  const l = Math.min(3, Math.max(1, level)) as 1 | 2 | 3;
  const bank = ADULT_DARE_BANK[l];
  return bank[Math.floor(Math.random() * bank.length)]!;
}

// ── Old AdultMission compat (kept for backward compat, not used by new engine) ─

export type AdultLevel = "flirt" | "tension" | "hot" | "extreme" | "after_dark";
export interface AdultMission { id: string; level: AdultLevel; title: string; body: string; points: number; timeLimit: number; tag: "solo" | "duo" | "group"; }
export const ADULT_LEVELS: { id: AdultLevel; label: string; emoji: string; color: string; desc: string }[] = [
  { id: "flirt",      label: "Flirt",       emoji: "😊", color: "#FB7185", desc: "Leggero e divertente" },
  { id: "tension",    label: "Tensione",    emoji: "😏", color: "#F97316", desc: "Un po' più audace" },
  { id: "hot",        label: "Hot",         emoji: "🔥", color: "#EF4444", desc: "Per i coraggiosi" },
  { id: "extreme",    label: "Extreme",     emoji: "💣", color: "#A855F7", desc: "Nessun limite" },
  { id: "after_dark", label: "After Dark",  emoji: "🌙", color: "#818CF8", desc: "Solo adulti" },
];
export async function generateAdultMissions(_level: AdultLevel, _count: number): Promise<AdultMission[]> { return []; }

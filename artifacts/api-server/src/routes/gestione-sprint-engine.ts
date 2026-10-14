/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ════════════════════════════════════════════════════════════════════════════
   IPPODROMO SPRINT — MOTORE DI GARA AUTOREVOLE (porting fedele da demo/engine.mjs).

   Modalità DISTINTA dall'ippodromo classico: NESSUN ordine vincente estratto prima
   della corsa. L'arrivo deriva dal tempo interpolato con cui ogni cavallo attraversa
   i 600 m, cioè dall'avanzamento REALE simulato sul server a passo fisso. 6 cavalli,
   velocità base, sprint (energia/costo/cooldown), 4 salti con finestra, countdown,
   stati lobby→countdown→race→results, pausa e nuova gara.

   DETERMINISMO / RIPETIBILITÀ: lo stato di una corsa è una FUNZIONE PURA di
   (piloti, lista di input timestampati, tempo di gara). `projectRace()` ricostruisce
   lo stato a un tempo qualsiasi ripetendo `step()` a passo fisso (STEP_MS, 20 Hz) e
   applicando gli input alla loro casella di griglia. Così il server non ha bisogno di
   un tick a 20 Hz che martella il DB: calcola lo stato "al volo" da tempo persistito +
   log input (come chiede 03-SERVER: "ricostruire l'animazione da time"). I comandi sono
   idempotenti e validati contro lo stato ricostruito. Nessun controllo privilegiato
   sceglie il vincitore; nessuna quota/accredito economico (modalità separata).

   NB: per TEST eseguibili con `node --test` questo file resta puro (niente db/express)
   e mantiene le stesse firme della demo (fresh/action/step/jumpHeight/publicState).
   ════════════════════════════════════════════════════════════════════════════ */

/* Catalogo UNICO (01-MECCANICA): nome + colore stabili, indice 0 = cavallo 1.
   Fulmine rosso, Stella blu, Vento verde, Saetta giallo, Tempesta viola, Luna arancio. */
export const HORSES: ReadonlyArray<readonly [string, string]> = [
  ["Fulmine", "#e74747"],
  ["Stella", "#4597ef"],
  ["Vento", "#39bc7f"],
  ["Saetta", "#edc449"],
  ["Tempesta", "#a580ec"],
  ["Luna", "#f49045"],
];

/* Configurazione EFFETTIVA UNICA (01-MECCANICA): ostacoli a 120/240/360/480 m del
   motore — NON i valori discordanti stampati nei mockup regia (140/270/410/540).
   Parametri di bilanciamento proposti. */
export const RULES = {
  length: 600,
  hurdles: [120, 240, 360, 480] as number[],
  countdownMs: 3000,
  baseSpeed: 10,
  sprintBonus: 6,
  sprintMs: 230,
  sprintCooldownMs: 250,
  sprintCost: 8,
  regenPerSec: 12,
  jumpMs: 1100,
  jumpCooldownMs: 1250,
  hitSlowMs: 1200,
  points: [100, 80, 60, 40, 20, 10] as number[],
} as const;

/* Passo fisso della simulazione (20 Hz). Usato sia dal server (ricostruzione) sia dai
   test. Il risultato NON dipende dagli FPS del client. */
export const STEP_MS = 50;

export type RaceStatus = "lobby" | "countdown" | "race" | "paused" | "results";
export type RaceAction = "start" | "pause" | "resume" | "ready" | "sprint" | "jump";

export type Pilot = { name: string; token?: string; connectedAt?: number } | null;

export type Horse = {
  id: number;
  name: string;
  color: string;
  pilot: Pilot;
  position: number;
  energy: number;
  speed: number;
  sprintUntil: number;
  lastSprint: number;
  jumpAt: number;
  lastJump: number;
  slowUntil: number;
  nextHurdle: number;
  cleared: number;
  hits: number;
  finish: number | null;
  ready: boolean;
};

export type ResultRow = {
  horse: number; name: string; pilot: string; time: number;
  cleared: number; hits: number; place: number; points: number;
};

export type RaceState = {
  version: number;
  revision: number;
  status: RaceStatus;
  time: number;
  countdown: number;
  pausedFrom: RaceStatus | null;
  race: number;
  horses: Horse[];
  results: ResultRow[];
};

export function fresh(): RaceState {
  return {
    version: 1, revision: 0, status: "lobby", time: 0, countdown: 0, pausedFrom: null, race: 1,
    horses: HORSES.map(([name, color], i) => ({
      id: i + 1, name, color, pilot: null, position: 0, energy: 100, speed: 0,
      sprintUntil: 0, lastSprint: -1e9, jumpAt: -1e9, lastJump: -1e9, slowUntil: 0,
      nextHurdle: 0, cleared: 0, hits: 0, finish: null, ready: false,
    })),
    results: [],
  };
}

export const jumpHeight = (h: Horse, t: number): number => {
  const u = (t - h.jumpAt) / RULES.jumpMs;
  return u >= 0 && u <= 1 ? Math.sin(Math.PI * u) : 0;
};

/* Nuova gara: conserva i piloti, azzera la dinamica, incrementa raceId. */
export function resetRace(s: RaceState): RaceState {
  const n = fresh();
  n.race = s.race + 1;
  for (const h of n.horses) {
    const old = s.horses.find((x) => x.id === h.id);
    h.pilot = old ? old.pilot : null;
  }
  return n;
}

/* Comando: valida la FASE/ENERGIA/COOLDOWN e muta lo stato, oppure lancia. Nessuna
   corsa predecisa: sprint/salto cambiano davvero la gara. */
export function action(s: RaceState, a: RaceAction, horseId?: number): void {
  const h = s.horses.find((x) => x.id === horseId);
  if (a === "start") {
    if (s.status !== "lobby") throw new Error("La gara non è in lobby");
    if (s.horses.some((x) => x.pilot && !x.ready)) throw new Error("Attendi i piloti pronti");
    s.status = "countdown"; s.countdown = RULES.countdownMs; return;
  }
  if (a === "pause") {
    if (!["race", "countdown"].includes(s.status)) throw new Error("Pausa non disponibile");
    s.pausedFrom = s.status; s.status = "paused"; return;
  }
  if (a === "resume") {
    if (s.status !== "paused") throw new Error("La gara non è in pausa");
    s.status = s.pausedFrom ?? "race"; s.pausedFrom = null; return;
  }
  if (a === "ready") {
    if (s.status !== "lobby" || !h) throw new Error("Preparazione chiusa");
    h.ready = !h.ready; return;
  }
  if (s.status !== "race" || !h || h.finish !== null) throw new Error("Comando fuori fase");
  if (a === "sprint") {
    if (s.time - h.lastSprint < RULES.sprintCooldownMs) throw new Error("Sprint troppo frequente");
    if (h.energy < RULES.sprintCost) throw new Error("Energia insufficiente");
    h.energy -= RULES.sprintCost; h.lastSprint = s.time; h.sprintUntil = s.time + RULES.sprintMs; return;
  }
  if (a === "jump") {
    if (s.time - h.lastJump < RULES.jumpCooldownMs) throw new Error("Salto in recupero");
    h.lastJump = s.time; h.jumpAt = s.time; return;
  }
  throw new Error("Comando sconosciuto");
}

/* Avanza la simulazione di dt ms. Countdown → race → collisioni/arrivo → results.
   I posti SENZA pilota sono guidati da CPU deterministica (riempi-posti etichettati
   altrove come CPU): non è simulazione sportiva bilanciata, solo dimostrazione. */
export function step(s: RaceState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 100);
  if (s.status === "countdown") {
    s.countdown -= dt;
    if (s.countdown <= 0) { s.status = "race"; s.countdown = 0; s.time = 0; }
    return;
  }
  if (s.status !== "race") return;
  const before = s.time; s.time += dt;
  for (const h of s.horses) {
    if (h.finish !== null) { h.speed = 0; continue; }
    if (!h.pilot) {
      const dist = (RULES.hurdles[h.nextHurdle] ?? Infinity) - h.position;
      if (dist > 4 && dist < 7 && s.time - h.lastJump >= RULES.jumpCooldownMs) { h.jumpAt = s.time; h.lastJump = s.time; }
      if (h.energy > 35 && s.time - h.lastSprint > 400 + h.id * 37) { h.energy -= RULES.sprintCost; h.lastSprint = s.time; h.sprintUntil = s.time + RULES.sprintMs; }
    }
    h.energy = Math.min(100, h.energy + RULES.regenPerSec * dt / 1000);
    const target = (RULES.baseSpeed + (h.sprintUntil > s.time ? RULES.sprintBonus : 0)) * (h.slowUntil > s.time ? 0.45 : 1);
    h.speed += (target - h.speed) * (1 - Math.exp(-dt / 180));
    const old = h.position; h.position += h.speed * dt / 1000;
    const obstacle = RULES.hurdles[h.nextHurdle];
    if (obstacle !== undefined && old < obstacle && h.position >= obstacle) {
      const crossing = before + dt * (obstacle - old) / (h.position - old);
      if (jumpHeight(h, crossing) >= 0.48) h.cleared++;
      else { h.hits++; h.energy = Math.max(0, h.energy - 10); h.slowUntil = s.time + RULES.hitSlowMs; }
      h.nextHurdle++;
    }
    if (h.position >= RULES.length) {
      const fraction = (RULES.length - old) / (h.position - old);
      h.finish = before + dt * Math.max(0, Math.min(1, fraction));
      h.position = RULES.length;
    }
  }
  if (s.horses.every((h) => h.finish !== null)) {
    s.status = "results";
    s.results = [...s.horses]
      .sort((a, b) => (a.finish! - b.finish!) || (a.id - b.id))
      .map((h, i) => ({
        horse: h.id, name: h.name, pilot: h.pilot?.name ?? "CPU", time: h.finish!,
        cleared: h.cleared, hits: h.hits, place: i + 1, points: RULES.points[i] ?? 0,
      }));
  }
}

/* Snapshot pubblico: non rivela token privati dei piloti. */
export function publicState(s: RaceState): RaceState {
  return {
    ...s,
    horses: s.horses.map((h) => ({
      ...h,
      pilot: h.pilot ? { name: h.pilot.name, connectedAt: h.pilot.connectedAt } : null,
    })),
  };
}

/* ── Ricostruzione server ─────────────────────────────────────────────────────
   Input registrato: azione di un pilota in un istante di gara (raceTime ms, già
   agganciato alla griglia STEP_MS). */
export type RaceInput = { seq: number; horseId: number; action: "sprint" | "jump"; at: number };

/* Aggancia un tempo di gara alla griglia a passo fisso (determinismo). */
export const snapToGrid = (raceMs: number): number => Math.max(0, Math.floor(raceMs / STEP_MS) * STEP_MS);

/* Ricostruisce lo stato della corsa a `raceTimeMs` dato l'insieme dei piloti e il log
   di input. Ripete `step()` a passo fisso applicando ogni input alla sua casella di
   griglia: processo IDENTICO qualunque sia il tempo finale, quindi risultati stabili. */
export function projectRace(pilots: Record<number, Pilot>, inputs: RaceInput[], raceTimeMs: number): RaceState {
  const s = fresh();
  for (const h of s.horses) h.pilot = pilots[h.id] ?? null;
  s.status = "race"; s.time = 0; s.countdown = 0;
  const ordered = [...inputs].sort((a, b) => a.at - b.at || a.seq - b.seq);
  const cap = Math.min(raceTimeMs, 180000); // tetto di sicurezza (una corsa reale finisce ~60–70 s)
  let ii = 0;
  const applyDue = (upto: number) => {
    while (ii < ordered.length && ordered[ii]!.at <= upto + 1e-9) {
      const inp = ordered[ii]!;
      try { action(s, inp.action, inp.horseId); } catch { /* input non più valido: scartato */ }
      ii++;
    }
  };
  for (let t = 0; t < cap - 1e-9; t += STEP_MS) {
    applyDue(t);                                   // input della casella corrente PRIMA dello step
    if (s.status !== "race") break;                // tutti arrivati → results
    step(s, Math.min(STEP_MS, cap - t));
  }
  if (s.status === "race") applyDue(cap);
  return s;
}

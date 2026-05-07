import bcrypt from "bcryptjs";
import { db, tenantsTable, usersTable, gamesTable, eventsTable, teamsTable, questionsTable, mediaTable } from "@workspace/db";
import { logger } from "./lib/logger";

async function main() {
  const existing = await db.select().from(tenantsTable).limit(1);
  if (existing.length > 0) {
    logger.info("Seed skipped: tenants already exist");
    return;
  }

  // Tenants
  const [mango, aurora, nightowl] = await db.insert(tenantsTable).values([
    { slug: "mango", name: "Mango Events", plan: "pro", brandColor: "#F5B642", locale: "it", mrr: 149 },
    { slug: "aurora", name: "Aurora Wedding Studio", plan: "studio", brandColor: "#E84A8E", locale: "it", mrr: 349 },
    { slug: "nightowl", name: "NightOwl Bars", plan: "pro", brandColor: "#9B5DE5", locale: "en", mrr: 149 },
  ]).returning();

  // Users
  const pwd = await bcrypt.hash("ideagame", 10);
  await db.insert(usersTable).values([
    { email: "admin@ideagame.app", name: "Marco Rossi", role: "super_admin", locale: "it", passwordHash: pwd, tenantId: null },
    { email: "owner@mango.events", name: "Giulia Conte", role: "tenant_owner", locale: "it", passwordHash: pwd, tenantId: mango!.id },
    { email: "manager@mango.events", name: "Luca Ferraro", role: "game_manager", locale: "it", passwordHash: pwd, tenantId: mango!.id },
    { email: "host@mango.events", name: "Sara De Luca", role: "entertainer", locale: "it", passwordHash: pwd, tenantId: mango!.id },
    { email: "tom@nightowl.bar", name: "Tom Vega", role: "tenant_owner", locale: "en", passwordHash: pwd, tenantId: nightowl!.id },
  ]);

  // Games
  await db.insert(gamesTable).values([
    { slug: "percorso-a-risate", name: "Percorso a Risate", tagline: "A laughing obstacle course on the big screen.", accentColor: "#F5B642", icon: "route", settings: { rounds: 6, timeLimit: 45, scoringWeight: 1 } },
    { slug: "gioco-delle-coppie", name: "Gioco delle Coppie", tagline: "How well do you really know each other?", accentColor: "#E84A8E", icon: "heart", settings: { rounds: 5, timeLimit: 30, scoringWeight: 1 } },
    { slug: "quizzone", name: "Quizzone", tagline: "The flagship trivia showdown.", accentColor: "#5BC0EB", icon: "brain", settings: { rounds: 10, timeLimit: 25, scoringWeight: 1.2 } },
    { slug: "saramusica", name: "SaraMusica", tagline: "Name the tune. Win the room.", accentColor: "#9B5DE5", icon: "music", settings: { rounds: 8, timeLimit: 20, scoringWeight: 1.1 } },
    { slug: "adult-only", name: "Adult Only", tagline: "Late-night, lights low, gloves off.", accentColor: "#FF1F6D", icon: "flame", adultOnly: true, settings: { rounds: 6, timeLimit: 40, scoringWeight: 1 } },
    { slug: "sfida-di-ballo", name: "Sfida di Ballo", tagline: "Step. Spin. Slay the floor.", accentColor: "#00F5A0", icon: "sparkles", settings: { rounds: 5, timeLimit: 60, scoringWeight: 1.3 } },
  ]);

  // Live event for Mango with 4 teams
  const [liveEvent] = await db.insert(eventsTable).values({
    tenantId: mango!.id,
    name: "Compleanno Sorrento 40",
    venue: "Hotel Mediterraneo",
    startsAt: new Date(),
    status: "live",
    brandColor: "#F5B642",
    expectedPlayers: 24,
    enabledGames: ["percorso-a-risate", "quizzone", "saramusica", "sfida-di-ballo"],
    joinCode: "SORR40",
  }).returning();

  await db.insert(teamsTable).values([
    { eventId: liveEvent!.id, name: "I Falchi", color: "#F5B642", score: 8400 },
    { eventId: liveEvent!.id, name: "Le Pantere", color: "#E84A8E", score: 9200 },
    { eventId: liveEvent!.id, name: "I Lupi", color: "#5BC0EB", score: 7150 },
    { eventId: liveEvent!.id, name: "Le Volpi", color: "#00F5A0", score: 6800 },
  ]);

  // Draft event for Aurora
  await db.insert(eventsTable).values({
    tenantId: aurora!.id,
    name: "Matrimonio Conte–Bianchi",
    venue: "Villa Aurora",
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
    status: "draft",
    brandColor: "#E84A8E",
    expectedPlayers: 60,
    enabledGames: ["gioco-delle-coppie", "saramusica", "sfida-di-ballo"],
    joinCode: "AURWED",
  });

  // Sample questions (global pool)
  await db.insert(questionsTable).values([
    {
      tenantId: null, category: "Geografia", difficulty: "easy", timeLimit: 20, correctIndex: 2,
      prompts: { it: "Qual è la capitale dell'Australia?", en: "What is the capital of Australia?", es: "¿Cuál es la capital de Australia?", fr: "Quelle est la capitale de l'Australie ?" },
      options: [
        { it: "Sydney", en: "Sydney", es: "Sídney", fr: "Sydney" },
        { it: "Melbourne", en: "Melbourne", es: "Melbourne", fr: "Melbourne" },
        { it: "Canberra", en: "Canberra", es: "Canberra", fr: "Canberra" },
        { it: "Perth", en: "Perth", es: "Perth", fr: "Perth" },
      ],
    },
    {
      tenantId: null, category: "Musica", difficulty: "medium", timeLimit: 25, correctIndex: 1,
      prompts: { it: "Chi ha composto la Quarta Sinfonia 'Italiana'?", en: "Who composed the 'Italian' Fourth Symphony?", es: "¿Quién compuso la Cuarta Sinfonía 'Italiana'?", fr: "Qui a composé la Quatrième Symphonie « Italienne » ?" },
      options: [
        { it: "Mozart", en: "Mozart", es: "Mozart", fr: "Mozart" },
        { it: "Mendelssohn", en: "Mendelssohn", es: "Mendelssohn", fr: "Mendelssohn" },
        { it: "Verdi", en: "Verdi", es: "Verdi", fr: "Verdi" },
        { it: "Puccini", en: "Puccini", es: "Puccini", fr: "Puccini" },
      ],
    },
    {
      tenantId: null, category: "Cinema", difficulty: "hard", timeLimit: 30, correctIndex: 1,
      prompts: { it: "Anno di uscita di 'C'era una volta in America'?", en: "Release year of 'Once Upon a Time in America'?", es: "Año de estreno de 'Érase una vez en América'?", fr: "Année de sortie de 'Il était une fois en Amérique' ?" },
      options: [
        { it: "1982", en: "1982", es: "1982", fr: "1982" },
        { it: "1984", en: "1984", es: "1984", fr: "1984" },
        { it: "1986", en: "1986", es: "1986", fr: "1986" },
        { it: "1988", en: "1988", es: "1988", fr: "1988" },
      ],
    },
  ]);

  // Sample media for Mango
  await db.insert(mediaTable).values([
    { tenantId: mango!.id, name: "Quizzone Intro Sting", kind: "audio", url: "/audio/intro.mp3", tags: ["intro", "quizzone"], sizeBytes: 480000 },
    { tenantId: mango!.id, name: "Drumroll Reveal", kind: "audio", url: "/audio/drumroll.mp3", tags: ["reveal"], sizeBytes: 220000 },
    { tenantId: mango!.id, name: "Hexagon Backdrop", kind: "image", url: "/img/hex.jpg", tags: ["backdrop"], sizeBytes: 1200000 },
  ]);

  logger.info("Seed complete");
}

main().then(() => process.exit(0)).catch((err) => { logger.error({ err }, "Seed failed"); process.exit(1); });

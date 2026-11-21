/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import rateLimit from "express-rate-limit";

/** 20 join attempts per IP per minute — prevents flood on public /players endpoint */
export const playerJoinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppi tentativi di join. Riprova tra un minuto." },
  skip: () => process.env["NODE_ENV"] === "test",
});

/** 10 login attempts per IP per 15 min */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppi tentativi di login. Riprova più tardi." },
  skip: () => process.env["NODE_ENV"] === "test",
});

/** 5 richieste di reset password per IP ogni 15 min (anti-spam di email e anti-forza bruta sui token) */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppe richieste di reset. Riprova più tardi." },
  skip: () => process.env["NODE_ENV"] === "test",
});

/** Serata Home: scritture dei punteggi (la TV ne manda molte, i telefoni poche) */
export const homeScoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppe richieste di punteggio. Rallenta." },
  skip: () => process.env["NODE_ENV"] === "test",
});

/** Serata Home: chiusura / cancellazione */
export const homeHostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppe richieste. Riprova tra un minuto." },
  skip: () => process.env["NODE_ENV"] === "test",
});

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

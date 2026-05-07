import { Router, type IRouter } from "express";
import { loadUser } from "../middlewares/auth";
import { loginLimiter } from "../middlewares/rateLimit";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import gamesRouter from "./games";
import eventsRouter from "./events";
import eventsByCodeRouter from "./events-by-code";
import teamsRouter from "./teams";
import playersRouter from "./players";
import scoresRouter from "./scores";
import scoreboardRouter from "./scoreboard";
import mediaRouter from "./media";
import questionsRouter from "./questions";
import translationsRouter from "./translations";
import kpisRouter from "./kpis";
import devicesRouter from "./devices";
import gameSessionsRouter from "./game-sessions";
import roundsRouter from "./rounds";
import cardSetsRouter from "./card-sets";
import quizCategoriesRouter from "./quiz-categories";
import systemSettingsRouter from "./system-settings";
import auditLogRouter from "./audit-log";

const router: IRouter = Router();

router.use(loadUser);
router.use(healthRouter);
// Apply rate limiting to login route
router.use("/auth/login", loginLimiter);
router.use(authRouter);
router.use(tenantsRouter);
router.use(usersRouter);
router.use(gamesRouter);
// events/by-code must come BEFORE events/:id to avoid param collision
router.use(eventsByCodeRouter);
router.use(eventsRouter);
router.use(teamsRouter);
router.use(playersRouter);
router.use(scoresRouter);
router.use(scoreboardRouter);
router.use(mediaRouter);
router.use(questionsRouter);
router.use(translationsRouter);
router.use(kpisRouter);
router.use(devicesRouter);
router.use(gameSessionsRouter);
router.use(roundsRouter);
router.use(cardSetsRouter);
router.use(quizCategoriesRouter);
router.use(systemSettingsRouter);
router.use(auditLogRouter);

export default router;

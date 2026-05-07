import { Router, type IRouter } from "express";
import { loadUser } from "../middlewares/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import gamesRouter from "./games";
import eventsRouter from "./events";
import teamsRouter from "./teams";
import playersRouter from "./players";
import scoresRouter from "./scores";
import mediaRouter from "./media";
import questionsRouter from "./questions";
import translationsRouter from "./translations";
import kpisRouter from "./kpis";

const router: IRouter = Router();

router.use(loadUser);
router.use(healthRouter);
router.use(authRouter);
router.use(tenantsRouter);
router.use(usersRouter);
router.use(gamesRouter);
router.use(eventsRouter);
router.use(teamsRouter);
router.use(playersRouter);
router.use(scoresRouter);
router.use(mediaRouter);
router.use(questionsRouter);
router.use(translationsRouter);
router.use(kpisRouter);

export default router;

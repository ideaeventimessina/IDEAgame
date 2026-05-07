import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const PgStore = connectPgSimple(session);
const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) throw new Error("SESSION_SECRET is required");

app.use(
  session({
    store: new PgStore({
      conString: process.env["DATABASE_URL"],
      createTableIfMissing: true,
      tableName: "user_sessions",
    }),
    name: "ideagame.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use("/api", router);

export default app;

import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { muxWebhookRouter } from "./routes/mux-webhook.routes.js";
import { videosRouter } from "./routes/videos.routes.js";

const e = env();

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (e.WEB_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use("/webhooks/mux", muxWebhookRouter);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", authRouter);
  app.use("/videos", videosRouter);
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(errorHandler);
  return app;
}

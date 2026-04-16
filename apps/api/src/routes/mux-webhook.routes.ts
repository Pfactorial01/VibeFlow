import { Router, raw } from "express";
import { getMux } from "../lib/mux.js";
import { processMuxWebhookEvent } from "../services/video.service.js";
import { logger } from "../lib/logger.js";

export const muxWebhookRouter = Router();

muxWebhookRouter.post(
  "/",
  raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
      const mux = getMux();
      const event = mux.webhooks.unwrap(body, req.headers);
      await processMuxWebhookEvent(event);
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.warn({ err }, "Mux webhook rejected");
      res.status(400).json({ error: "Invalid webhook" });
    }
  },
);

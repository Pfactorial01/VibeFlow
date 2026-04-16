import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  const status = (err as Error & { status?: number }).status ?? 500;
  if (status >= 500) {
    logger.error({ err }, "Unhandled error");
  }
  const message = status === 500 ? "Internal Server Error" : err.message;
  res.status(status).json({ error: message });
};

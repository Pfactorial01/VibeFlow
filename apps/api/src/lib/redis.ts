import { Redis as IORedis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!client) {
    client = new IORedis(env().REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => logger.error({ err }, "Redis error"));
  }
  return client;
}

export const TRENDING_KEY = "vibeflow:trending:scores";

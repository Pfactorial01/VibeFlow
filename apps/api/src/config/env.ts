import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: process.env.VIBEFLOW_ENV_PATH });

/** Legacy name; prefer MUX_SIGNING_KEY_SECRET (Mux dashboard → Signing keys). */
if (!process.env.MUX_SIGNING_KEY_SECRET && process.env.MUX_SIGNING_SECRET) {
  process.env.MUX_SIGNING_KEY_SECRET = process.env.MUX_SIGNING_SECRET;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  /** Comma-separated browser origins (e.g. `http://localhost:5173,http://127.0.0.1:5173`). `localhost` and `127.0.0.1` are different for CORS. */
  WEB_ORIGIN: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6380"),
  /** Mux dashboard → General → Environment ID */
  MUX_ENVIRONMENT_ID: z.string().optional(),
  /** Mux dashboard → General → Environment Key */
  MUX_ENVIRONMENT_KEY: z.string().optional(),
  /** e.g. Production */
  MUX_ENVIRONMENT_NAME: z.string().optional(),
  /** Mux dashboard → Access Tokens → Token ID */
  MUX_ACCESS_TOKEN_ID: z.string().min(1),
  /** Mux dashboard → Access Tokens → Secret Key */
  MUX_ACCESS_TOKEN_SECRET: z.string().min(1),
  /** Mux dashboard → Signing keys → Signing Key ID (optional reference; not passed to SDK) */
  MUX_SIGNING_KEY_ID: z.string().optional(),
  /**
   * Mux dashboard → **Settings → Webhooks** → signing secret for your webhook URL (verifies `Mux-Signature`).
   * This is different from playback “Signing keys”. If unset, `MUX_SIGNING_KEY_SECRET` is used (often wrong for webhooks).
   */
  MUX_WEBHOOK_SECRET: z.string().optional(),
  /** Legacy fallback when `MUX_WEBHOOK_SECRET` is not set; prefer setting the Webhooks signing secret above. */
  MUX_SIGNING_KEY_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema> & { WEB_ORIGINS: string[] };

let cached: Env | null = null;

function parseWebOrigins(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of parts) {
    try {
      new URL(u);
    } catch {
      throw new Error(`Invalid WEB_ORIGIN entry (must be a URL): ${u}`);
    }
  }
  return parts;
}

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  const WEB_ORIGINS = parseWebOrigins(parsed.data.WEB_ORIGIN);
  cached = { ...parsed.data, WEB_ORIGINS };
  return cached;
}

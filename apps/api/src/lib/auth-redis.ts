import { getRedis } from "./redis.js";

const PREFIX_RT = "vibeflow:rt:";
const PREFIX_DENY = "vibeflow:jwt:deny:";

async function ensureConnected(): Promise<void> {
  const redis = getRedis();
  await redis.connect().catch(() => undefined);
}

/** Opaque refresh session: hash(raw) -> userId with TTL (no Postgres). */
export async function redisSetRefreshSession(
  tokenHash: string,
  userId: string,
  ttlSeconds: number,
): Promise<void> {
  await ensureConnected();
  await getRedis().set(`${PREFIX_RT}${tokenHash}`, userId, "EX", ttlSeconds);
}

export async function redisGetRefreshUserId(tokenHash: string): Promise<string | null> {
  await ensureConnected();
  return getRedis().get(`${PREFIX_RT}${tokenHash}`);
}

export async function redisDelRefreshToken(tokenHash: string): Promise<void> {
  await ensureConnected();
  await getRedis().del(`${PREFIX_RT}${tokenHash}`);
}

/** Blocklist access JWT by `jti` until original `exp` (seconds TTL). */
export async function redisDenyAccessJti(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  await ensureConnected();
  await getRedis().set(`${PREFIX_DENY}${jti}`, "1", "EX", ttlSeconds);
}

export async function redisIsAccessJtiDenied(jti: string): Promise<boolean> {
  await ensureConnected();
  const n = await getRedis().exists(`${PREFIX_DENY}${jti}`);
  return n === 1;
}

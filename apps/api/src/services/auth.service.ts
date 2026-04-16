import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  redisDelRefreshToken,
  redisDenyAccessJti,
  redisGetRefreshUserId,
  redisIsAccessJtiDenied,
  redisSetRefreshSession,
} from "../lib/auth-redis.js";

const ACCESS_COOKIE = "vibeflow_access";
const REFRESH_COOKIE = "vibeflow_refresh";
const SALT_ROUNDS = 10;
const ACCESS_EXPIRES = "15m";
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TTL_SEC = Math.floor(REFRESH_MS / 1000);

export type AuthUser = { id: string; username: string };

export function accessCookieName(): string {
  return ACCESS_COOKIE;
}

export function refreshCookieName(): string {
  return REFRESH_COOKIE;
}

export function getAuthCookieBaseOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
} {
  const e = env();
  return {
    httpOnly: true,
    secure: e.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_MAX_AGE_MS = REFRESH_MS;

export function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshRaw: string,
): void {
  const base = getAuthCookieBaseOptions();
  res
    .cookie(accessCookieName(), accessToken, {
      ...base,
      maxAge: ACCESS_MAX_AGE_MS,
    })
    .cookie(refreshCookieName(), refreshRaw, {
      ...base,
      maxAge: REFRESH_MAX_AGE_MS,
    });
}

export function clearTokenCookies(res: Response): void {
  const e = env();
  const base = {
    path: "/" as const,
    secure: e.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
  res.clearCookie(accessCookieName(), base);
  res.clearCookie(refreshCookieName(), base);
}

export function buildAccessToken(user: AuthUser): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { sub: user.id, username: user.username, typ: "access", jti },
    env().JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES },
  );
}

export async function verifyAccessTokenAsync(token: string): Promise<AuthUser> {
  const payload = jwt.verify(token, env().JWT_SECRET) as jwt.JwtPayload & {
    sub: string;
    username: string;
    typ?: string;
    jti?: string;
  };
  if (payload.typ !== "access") {
    const err = new Error("Invalid token");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (!payload.jti) {
    const err = new Error("Invalid token");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (await redisIsAccessJtiDenied(payload.jti)) {
    const err = new Error("Token revoked");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return { id: payload.sub, username: payload.username };
}

/** After logout, blocklist access JWT `jti` until its natural expiry. */
export async function revokeAccessTokenAsync(accessToken: string | undefined): Promise<void> {
  if (!accessToken) return;
  try {
    const payload = jwt.verify(accessToken, env().JWT_SECRET) as jwt.JwtPayload & {
      typ?: string;
      jti?: string;
    };
    if (payload.typ !== "access" || !payload.jti || !payload.exp) return;
    const ttl = Math.max(1, Math.floor(payload.exp - Date.now() / 1000));
    await redisDenyAccessJti(payload.jti, ttl);
  } catch {
    /* expired or malformed — nothing to deny */
  }
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function createRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("base64url");
  const tokenHash = hashRefreshToken(raw);
  await redisSetRefreshSession(tokenHash, userId, REFRESH_TTL_SEC);
  return raw;
}

export async function revokeRefreshTokenByRaw(raw: string | undefined): Promise<void> {
  if (!raw) return;
  await redisDelRefreshToken(hashRefreshToken(raw));
}

export async function rotateRefreshSession(
  oldRefreshRaw: string,
): Promise<{ user: AuthUser; accessToken: string; newRefreshRaw: string } | null> {
  const hash = hashRefreshToken(oldRefreshRaw);
  const userId = await redisGetRefreshUserId(hash);
  if (!userId) return null;
  await redisDelRefreshToken(hash);
  const user = await getUserById(userId);
  if (!user) return null;
  const newRefreshRaw = await createRefreshToken(user.id);
  const accessToken = buildAccessToken(user);
  return { user, accessToken, newRefreshRaw };
}

export async function signup(username: string, password: string): Promise<AuthUser> {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    const err = new Error("Username already taken");
    (err as Error & { status: number }).status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { username, passwordHash },
    select: { id: true, username: true },
  });
  return user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    const err = new Error("Invalid credentials");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const err = new Error("Invalid credentials");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return { id: user.id, username: user.username };
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  });
  return user;
}

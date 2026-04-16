import type { RequestHandler } from "express";
import { verifyAccessTokenAsync } from "../services/auth.service.js";
import * as authService from "../services/auth.service.js";

/** Like GET /auth/me: use access JWT if valid; otherwise rotate via refresh cookie so uploads work after ~15m idle. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const access = req.cookies?.[authService.accessCookieName()];
  if (access) {
    try {
      req.user = await verifyAccessTokenAsync(access);
      next();
      return;
    } catch {
      /* try refresh */
    }
  }
  const oldRefresh = req.cookies?.[authService.refreshCookieName()];
  if (oldRefresh) {
    const rotated = await authService.rotateRefreshSession(oldRefresh);
    if (rotated) {
      authService.setTokenCookies(res, rotated.accessToken, rotated.newRefreshRaw);
      req.user = rotated.user;
      next();
      return;
    }
    authService.clearTokenCookies(res);
  }
  res.status(401).json({ error: "Unauthorized" });
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[authService.accessCookieName()];
  if (!token) {
    next();
    return;
  }
  try {
    req.user = await verifyAccessTokenAsync(token);
  } catch {
    /* ignore */
  }
  next();
};

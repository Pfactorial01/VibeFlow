import { Router } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service.js";

const router = Router();

const signupSchema = z.object({
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = signupSchema;

router.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const user = await authService.signup(body.username, body.password);
    const accessToken = authService.buildAccessToken(user);
    const refreshRaw = await authService.createRefreshToken(user.id);
    authService.setTokenCookies(res, accessToken, refreshRaw);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await authService.login(body.username, body.password);
    const accessToken = authService.buildAccessToken(user);
    const refreshRaw = await authService.createRefreshToken(user.id);
    authService.setTokenCookies(res, accessToken, refreshRaw);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

/** Issue new access + refresh cookies using the HttpOnly refresh cookie (no JSON tokens). */
router.post("/refresh", async (req, res, next) => {
  try {
    const oldRefresh = req.cookies?.[authService.refreshCookieName()];
    if (!oldRefresh) {
      res.status(401).json({ error: "No refresh session" });
      return;
    }
    const rotated = await authService.rotateRefreshSession(oldRefresh);
    if (!rotated) {
      authService.clearTokenCookies(res);
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    authService.setTokenCookies(res, rotated.accessToken, rotated.newRefreshRaw);
    res.json({ user: rotated.user });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const access = req.cookies?.[authService.accessCookieName()];
    const refresh = req.cookies?.[authService.refreshCookieName()];
    await authService.revokeAccessTokenAsync(access);
    await authService.revokeRefreshTokenByRaw(refresh);
    authService.clearTokenCookies(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Session probe: 200 with `{ user }` or `{ user: null }`. Rotates cookies when refresh is valid but access is missing/expired. */
router.get("/me", async (req, res, next) => {
  try {
    const access = req.cookies?.[authService.accessCookieName()];
    if (access) {
      try {
        const user = await authService.verifyAccessTokenAsync(access);
        res.json({ user });
        return;
      } catch {
        /* try refresh below */
      }
    }
    const oldRefresh = req.cookies?.[authService.refreshCookieName()];
    if (oldRefresh) {
      const rotated = await authService.rotateRefreshSession(oldRefresh);
      if (rotated) {
        authService.setTokenCookies(res, rotated.accessToken, rotated.newRefreshRaw);
        res.json({ user: rotated.user });
        return;
      }
      authService.clearTokenCookies(res);
    }
    res.json({ user: null });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };

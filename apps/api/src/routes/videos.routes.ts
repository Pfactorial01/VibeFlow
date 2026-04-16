import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth } from "../middleware/auth.middleware.js";
import * as videoService from "../services/video.service.js";
import { decodeCursor } from "../lib/feed.js";
import * as likeService from "../services/like.service.js";
import * as commentService from "../services/comment.service.js";
import * as reportService from "../services/report.service.js";
import { Prisma } from "@prisma/client";

const router = Router();

const uploadSchema = z.object({
  title: z.string().max(200).optional(),
});

router.post("/upload-url", requireAuth, async (req, res, next) => {
  try {
    const body = uploadSchema.parse(req.body);
    const out = await videoService.createDirectUpload(
      req.user!.id,
      body.title,
      req.get("origin"),
    );
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

/** Poll Mux for asset/playback and promote DB row to `ready` (author only). Use after browser PUT to upload URL. */
router.post("/:id/confirm-upload", requireAuth, async (req, res, next) => {
  try {
    const video = await videoService.confirmMuxUploadAfterBrowserPut(
      req.params.id,
      req.user!.id,
    );
    if (!video) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ video });
  } catch (err) {
    next(err);
  }
});

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).optional().default(20),
      })
      .parse(req.query);
    const cursor = decodeCursor(q.cursor);
    const data = await videoService.listFeed(cursor, q.limit, req.user?.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/trending", optionalAuth, async (req, res, next) => {
  try {
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).optional().default(20),
      })
      .parse(req.query);
    const { listTrending } = await import("../services/trending.service.js");
    const data = await listTrending(q.limit, q.cursor, req.user?.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const v = await videoService.getVideoById(req.params.id, req.user?.id);
    if (!v) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ video: v });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/like", requireAuth, async (req, res, next) => {
  try {
    await likeService.likeVideo(req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Already liked" });
      return;
    }
    next(err);
  }
});

router.delete("/:id/like", requireAuth, async (req, res, next) => {
  try {
    await likeService.unlikeVideo(req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const commentBody = z.object({
  body: z.string().min(1).max(2000),
});

router.post("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const parsed = commentBody.parse(req.body);
    const comment = await commentService.addComment(req.user!.id, req.params.id, parsed.body);
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/comments", optionalAuth, async (req, res, next) => {
  try {
    const q = z
      .object({
        offset: z.coerce.number().min(0).optional().default(0),
        limit: z.coerce.number().min(1).max(100).optional().default(20),
      })
      .parse(req.query);
    const data = await commentService.listComments(req.params.id, q.offset, q.limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const reportBody = z.object({
  reason: z.string().min(1).max(500),
});

router.post("/:id/report", requireAuth, async (req, res, next) => {
  try {
    const parsed = reportBody.parse(req.body);
    const report = await reportService.createReport(req.user!.id, req.params.id, parsed.reason);
    res.status(201).json({ report: { id: report.id, status: report.status } });
  } catch (err) {
    next(err);
  }
});

export { router as videosRouter };

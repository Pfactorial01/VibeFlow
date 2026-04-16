import { prisma } from "../lib/prisma.js";
import { bumpTrendingScore } from "./trending.service.js";

export async function likeVideo(userId: string, videoId: string): Promise<void> {
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.video.findFirst({
      where: { id: videoId, status: "ready" },
      select: { id: true },
    });
    if (!v) {
      const err = new Error("Video not found");
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    await tx.like.create({
      data: { userId, videoId },
    });
    return tx.video.update({
      where: { id: videoId },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    });
  });
  await bumpTrendingScore(videoId, updated.likesCount);
}

export async function unlikeVideo(userId: string, videoId: string): Promise<void> {
  const updated = await prisma.$transaction(async (tx) => {
    const del = await tx.like.deleteMany({
      where: { userId, videoId },
    });
    if (del.count === 0) {
      const err = new Error("Not liked");
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    return tx.video.update({
      where: { id: videoId },
      data: { likesCount: { decrement: 1 } },
      select: { likesCount: true },
    });
  });
  await bumpTrendingScore(videoId, Math.max(0, updated.likesCount));
}

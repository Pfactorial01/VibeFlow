import { prisma } from "../lib/prisma.js";

export async function addComment(userId: string, videoId: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.video.findFirst({
      where: { id: videoId, status: "ready" },
      select: { id: true },
    });
    if (!v) {
      const err = new Error("Video not found");
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    const comment = await tx.comment.create({
      data: { userId, videoId, body },
      include: { user: { select: { id: true, username: true } } },
    });
    await tx.video.update({
      where: { id: videoId },
      data: { commentsCount: { increment: 1 } },
    });
    return comment;
  });
}

export async function listComments(videoId: string, offset: number, limit: number) {
  const take = Math.min(Math.max(limit, 1), 100);
  const skip = Math.max(offset, 0);
  const v = await prisma.video.findFirst({
    where: { id: videoId, status: "ready" },
    select: { id: true },
  });
  if (!v) {
    const err = new Error("Video not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const items = await prisma.comment.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    skip,
    take: take + 1,
    include: { user: { select: { id: true, username: true } } },
  });

  let nextOffset: number | null = null;
  const page = items.slice(0, take);
  if (items.length > take) {
    nextOffset = skip + take;
  }

  return { items: page, nextOffset };
}

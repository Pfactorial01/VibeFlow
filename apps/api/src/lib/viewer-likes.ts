import { prisma } from "./prisma.js";

export async function attachViewerLikes<
  T extends { id: string },
>(viewerId: string | undefined, items: T[]): Promise<Array<T & { viewerHasLiked: boolean }>> {
  if (!viewerId || items.length === 0) {
    return items.map((i) => ({ ...i, viewerHasLiked: false }));
  }
  const likes = await prisma.like.findMany({
    where: { userId: viewerId, videoId: { in: items.map((i) => i.id) } },
    select: { videoId: true },
  });
  const liked = new Set(likes.map((l) => l.videoId));
  return items.map((i) => ({ ...i, viewerHasLiked: liked.has(i.id) }));
}

import type { Prisma } from "@prisma/client";

export type FeedCursor = { createdAt: string; id: string };

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(s: string | undefined): FeedCursor | null {
  if (!s) return null;
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as FeedCursor;
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const videoPublicSelect = {
  id: true,
  muxPlaybackId: true,
  thumbnail: true,
  title: true,
  status: true,
  likesCount: true,
  commentsCount: true,
  createdAt: true,
  author: { select: { id: true, username: true } },
} as const satisfies Prisma.VideoSelect;

export type VideoPublic = Prisma.VideoGetPayload<{ select: typeof videoPublicSelect }>;

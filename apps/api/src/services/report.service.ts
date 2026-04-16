import { prisma } from "../lib/prisma.js";

export async function createReport(reporterId: string, videoId: string, reason: string) {
  const v = await prisma.video.findFirst({
    where: { id: videoId },
    select: { id: true },
  });
  if (!v) {
    const err = new Error("Video not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  return prisma.report.create({
    data: {
      reporterId,
      videoId,
      reason,
      status: "open",
    },
  });
}

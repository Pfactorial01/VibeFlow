import { API_BASE } from "../config";

export type User = { id: string; username: string };

async function parseError(res: Response): Promise<Error> {
  let msg = res.statusText;
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) msg = j.error;
  } catch {
    /* ignore */
  }
  return new Error(msg);
}

export async function apiJson<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function uploadVideo(title?: string): Promise<{
  videoId: string;
  uploadUrl: string;
  muxUploadId: string;
}> {
  return apiJson("/videos/upload-url", {
    method: "POST",
    body: JSON.stringify(title !== undefined ? { title } : {}),
  });
}

export type VideoItem = {
  id: string;
  muxPlaybackId: string | null;
  thumbnail: string;
  title: string | null;
  status: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  author: { id: string; username: string };
  viewerHasLiked?: boolean;
};

export async function fetchFeed(cursor?: string, limit = 12): Promise<{
  items: VideoItem[];
  nextCursor: string | null;
}> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set("cursor", cursor);
  return apiJson(`/videos?${q}`);
}

export async function fetchTrending(cursor?: string, limit = 12) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set("cursor", cursor);
  return apiJson<{ items: VideoItem[]; nextCursor: string | null }>(
    `/videos/trending?${q}`,
  );
}

export async function fetchVideo(id: string): Promise<{ video: VideoItem & { author: unknown } }> {
  return apiJson(`/videos/${id}`);
}

/** After PUT to Mux upload URL: sync asset/playback from Mux into our DB (author-only). */
export async function confirmVideoUpload(id: string): Promise<{
  video: VideoItem & { author: unknown };
}> {
  return apiJson(`/videos/${id}/confirm-upload`, {
    method: "POST",
    body: "{}",
  });
}

export async function signup(username: string, password: string): Promise<{ user: User }> {
  return apiJson("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<{ user: User }> {
  return apiJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/** Rotates access + refresh cookies using the HttpOnly refresh cookie. */
export async function refreshSession(): Promise<{ user: User }> {
  return apiJson("/auth/refresh", { method: "POST" });
}

export async function logout(): Promise<void> {
  await apiJson("/auth/logout", { method: "POST" });
}

export async function me(): Promise<{ user: User | null }> {
  return apiJson("/auth/me");
}

export async function likeVideo(id: string): Promise<void> {
  await apiJson(`/videos/${id}/like`, { method: "POST", body: "{}" });
}

export async function unlikeVideo(id: string): Promise<void> {
  await apiJson(`/videos/${id}/like`, { method: "DELETE" });
}

export async function addComment(videoId: string, body: string) {
  return apiJson<{ comment: unknown }>(`/videos/${videoId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function fetchComments(
  videoId: string,
  offset = 0,
  limit = 20,
): Promise<{
  items: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; username: string };
  }>;
  nextOffset: number | null;
}> {
  const q = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  return apiJson(`/videos/${videoId}/comments?${q}`);
}

export async function reportVideo(
  videoId: string,
  reason: string,
): Promise<void> {
  await apiJson(`/videos/${videoId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

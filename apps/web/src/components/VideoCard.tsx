import { useCallback, useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type { MuxCSSProperties } from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import type { VideoItem } from "../api/client";
import * as api from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Props = {
  video: VideoItem & { viewerHasLiked?: boolean };
  onUpdate: (v: VideoItem & { viewerHasLiked?: boolean }) => void;
  registerMediaEl: (id: string, el: HTMLDivElement | null) => void;
  isActive: boolean;
};

export function VideoCard({ video, onUpdate, registerMediaEl, isActive }: Props) {
  const { user } = useAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<
    Awaited<ReturnType<typeof api.fetchComments>>["items"]
  >([]);
  const [commentBody, setCommentBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [bottomChromeVisible, setBottomChromeVisible] = useState(false);
  const playerRef = useRef<MuxPlayerElement | null>(null);

  const mediaRef = useCallback(
    (el: HTMLDivElement | null) => {
      registerMediaEl(video.id, el);
    },
    [registerMediaEl, video.id],
  );

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const { items } = await api.fetchComments(video.id, 0, 30);
      setComments(items);
    } finally {
      setLoadingComments(false);
    }
  }, [video.id]);

  useEffect(() => {
    if (commentsOpen) void loadComments();
  }, [commentsOpen, loadComments]);

  const toggleLike = async () => {
    if (!user) return;
    const liked = video.viewerHasLiked;
    try {
      if (liked) {
        await api.unlikeVideo(video.id);
        onUpdate({
          ...video,
          viewerHasLiked: false,
          likesCount: Math.max(0, video.likesCount - 1),
        });
      } else {
        await api.likeVideo(video.id);
        onUpdate({
          ...video,
          viewerHasLiked: true,
          likesCount: video.likesCount + 1,
        });
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Like failed");
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !commentBody.trim()) return;
    await api.addComment(video.id, commentBody.trim());
    setCommentBody("");
    await loadComments();
    onUpdate({ ...video, commentsCount: video.commentsCount + 1 });
  };

  const report = async () => {
    if (!user) return;
    const reason = window.prompt("Why are you reporting this video?");
    if (!reason?.trim()) return;
    setReportBusy(true);
    try {
      await api.reportVideo(video.id, reason.trim());
      alert("Report submitted.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Report failed");
    } finally {
      setReportBusy(false);
    }
  };

  const canPlay = Boolean(video.muxPlaybackId && video.status === "ready");

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !canPlay) return;
    if (isActive) {
      void player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [canPlay, isActive]);

  useEffect(() => {
    if (!isActive) setBottomChromeVisible(false);
  }, [isActive]);

  useEffect(() => {
    if (!bottomChromeVisible) return;
    const id = window.setTimeout(() => setBottomChromeVisible(false), 4000);
    return () => window.clearTimeout(id);
  }, [bottomChromeVisible]);

  return (
    <article className="video-card">
      <header className="video-card__head">
        <span className="video-card__author">@{video.author.username}</span>
        {video.title ? <h2 className="video-card__title">{video.title}</h2> : null}
      </header>
      <div ref={mediaRef} className="video-card__media">
        {canPlay ? (
          <>
            <MuxPlayer
              ref={playerRef}
              playbackId={video.muxPlaybackId!}
              streamType="on-demand"
              thumbnailTime={0}
              accentColor="#6366f1"
              muted
              playsInline
              loop
              style={
                {
                  width: "100%",
                  maxHeight: "70vh",
                  aspectRatio: "9 / 16",
                  background: "#0f0f12",
                  "--top-controls": "none",
                  "--bottom-controls": bottomChromeVisible ? "inline-flex" : "none",
                } satisfies MuxCSSProperties
              }
            />
            <button
              type="button"
              className="video-card__bottom-hit"
              aria-label="Show video controls"
              style={{
                pointerEvents: bottomChromeVisible ? "none" : "auto",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!bottomChromeVisible) setBottomChromeVisible(true);
              }}
            />
          </>
        ) : (
          <div className="video-card__placeholder">
            {video.thumbnail ? (
              <img src={video.thumbnail} alt="" className="video-card__thumb" />
            ) : (
              <span>Processing video…</span>
            )}
          </div>
        )}
      </div>
      <div className="video-card__actions">
        <button
          type="button"
          className={
            video.viewerHasLiked ? "btn btn--like active" : "btn btn--like"
          }
          disabled={!user}
          onClick={() => void toggleLike()}
          title={user ? "Like" : "Sign in to like"}
        >
          ♥ {video.likesCount}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setCommentsOpen((o) => !o)}
        >
          💬 {video.commentsCount}
        </button>
        {user ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={reportBusy}
            onClick={() => void report()}
          >
            Report
          </button>
        ) : null}
      </div>
      {commentsOpen ? (
        <div className="video-card__comments">
          {loadingComments ? (
            <p className="muted">Loading comments…</p>
          ) : (
            <ul className="comment-list">
              {comments.map((c) => (
                <li key={c.id} className="comment-list__item">
                  <strong>@{c.user.username}</strong>{" "}
                  <span className="muted">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                  <p>{c.body}</p>
                </li>
              ))}
              {comments.length === 0 ? (
                <li className="muted">No comments yet.</li>
              ) : null}
            </ul>
          )}
          {user ? (
            <form className="comment-form" onSubmit={(e) => void submitComment(e)}>
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add a comment"
                maxLength={2000}
              />
              <button type="submit" className="btn btn--primary">
                Post
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

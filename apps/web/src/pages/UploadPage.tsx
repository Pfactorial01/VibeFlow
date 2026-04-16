import { type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import * as api from "../api/client";

export function UploadPage() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Uses POST /confirm-upload so we pull readiness from the Mux API (webhooks optional). */
  const pollUntilReady = async (videoId: string) => {
    const maxAttempts = 90;
    for (let i = 0; i < maxAttempts; i++) {
      const { video } = await api.confirmVideoUpload(videoId);
      if (video.status === "ready" && video.muxPlaybackId) {
        return true;
      }
      if (video.status === "error") {
        throw new Error("Mux failed to process this video.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setErr("Choose a video file.");
      return;
    }
    setErr(null);
    setBusy(true);
    setStatus("Creating upload…");
    try {
      const { uploadUrl, videoId } = await api.uploadVideo(title || undefined);
      setStatus("Uploading to Mux…");
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
      if (!put.ok) {
        throw new Error(`Upload failed (${put.status})`);
      }
      setStatus("Processing… This usually takes under a minute.");
      const ok = await pollUntilReady(videoId);
      if (!ok) {
        throw new Error(
          "Timed out waiting for Mux to finish processing. Refresh the feed in a moment or try again.",
        );
      }
      setStatus("Done! Redirecting…");
      nav("/feed");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-page">
      <h1>Upload</h1>
      <p className="muted">
        Files go directly to Mux from your browser ({API_BASE} only signs the
        URL).
      </p>
      {err ? <p className="error-banner">{err}</p> : null}
      {status ? <p className="status-line">{status}</p> : null}
      <form className="upload-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Title (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="My short"
          />
        </label>
        <label>
          Video file
          <input ref={inputRef} type="file" accept="video/*" />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Working…" : "Upload"}
        </button>
      </form>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { VideoItem } from "../api/client";
import * as api from "../api/client";
import { VideoCard } from "../components/VideoCard";

type Tab = "latest" | "trending";

const IO_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

export function FeedPage({ tab }: { tab: Tab }) {
  const [items, setItems] = useState<Array<VideoItem & { viewerHasLiked?: boolean }>>(
    [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const mediaElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const visibilityRatiosRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setNextCursor(null);
    setLoading(true);
    setError(null);
    setActiveVideoId(null);
    void (async () => {
      try {
        const data =
          tab === "latest"
            ? await api.fetchFeed(undefined, 12)
            : await api.fetchTrending(undefined, 12);
        if (cancelled) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load feed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data =
        tab === "latest"
          ? await api.fetchFeed(nextCursor, 12)
          : await api.fetchTrending(nextCursor, 12);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, tab]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "240px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const registerMediaEl = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) mediaElsRef.current.set(id, el);
    else mediaElsRef.current.delete(id);
  }, []);

  const feedItemIdsKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  useLayoutEffect(() => {
    const ratios = visibilityRatiosRef.current;
    const currentIds = new Set(
      feedItemIdsKey.length === 0 ? [] : feedItemIdsKey.split("|"),
    );
    for (const id of Array.from(ratios.keys())) {
      if (!currentIds.has(id)) ratios.delete(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-feed-video-id");
          if (id) ratios.set(id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let best = 0;
        for (const [id, r] of ratios) {
          if (r > best) {
            best = r;
            bestId = id;
          }
        }
        if (best < 0.01) bestId = null;
        setActiveVideoId((prev) => (prev !== bestId ? bestId : prev));
      },
      { threshold: IO_THRESHOLDS },
    );

    for (const [id, el] of mediaElsRef.current) {
      if (!currentIds.has(id)) continue;
      el.setAttribute("data-feed-video-id", id);
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [feedItemIdsKey]);

  const patchVideo = useCallback(
    (id: string, patch: VideoItem & { viewerHasLiked?: boolean }) => {
      setItems((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      );
    },
    [],
  );

  return (
    <div className="feed">
      {error ? <p className="error-banner">{error}</p> : null}
      {items.map((v) => (
        <VideoCard
          key={v.id}
          video={v}
          onUpdate={(nv) => patchVideo(v.id, nv)}
          registerMediaEl={registerMediaEl}
          isActive={activeVideoId === v.id}
        />
      ))}
      {loading && items.length === 0 ? (
        <p className="muted center">Loading…</p>
      ) : null}
      <div ref={sentinelRef} className="feed__sentinel" />
      {loadingMore ? (
        <p className="muted center">Loading more…</p>
      ) : null}
      {!error && !nextCursor && !loading && items.length === 0 ? (
        <p className="muted center">No videos yet. Upload one!</p>
      ) : null}
    </div>
  );
}

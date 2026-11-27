'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { reportMediaStart, useMediaBox } from '@/hooks/useOnePlayer/useOnePlayer';
import { useXPost } from '@/hooks/useXPost/useXPost';
import { getXPostId, getXPostVideo } from '@/pipes/x-post/x-post';

/** How long the video may take to have any data before X's own post takes its place. */
export const X_POST_VIDEO_START_MS = 8_000;

/** The width to height of a video X names none for. */
const DEFAULT_ASPECT = 16 / 9;

/**
 * The frame's own document: the video alone, filling the frame, asked for with no Referer. X's video
 * host refuses a request that names another site as its referrer, and a `<video>` has no referrer policy
 * of its own, so the video sits in a document of its own whose policy sends none. The page's own policy
 * is not changed. Built only from the validated, normalized MP4 address (`getXPostVideo`'s `href` on
 * `https://video.twimg.com/`), every character that could end the attribute escaped.
 */
function getVideoDocument(href: string): string {
  const quoted = href
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return (
    '<!doctype html><meta name="referrer" content="no-referrer">' +
    '<style>html,body{margin:0;height:100%;background:#000}video{display:block;width:100%;height:100%}</style>' +
    `<video controls playsinline autoplay src="${quoted}"></video>`
  );
}

interface XPostVideoProps {
  /** The MP4 on X's video host. */
  src: string;
  /** Its width to height; 16:9 without one. */
  aspect?: number | null;
  /** What shows instead when the video does not load (X's own post). */
  fallback: () => ReactNode;
}

/**
 * An X post's video in the app's own player, inside the post's card: its MP4 on X's video host, mounted
 * by the press on the post's Play and started by it. The video sits in a same-origin frame whose document
 * sends no Referer (`getVideoDocument`), sized to the video's shape, its controls reached by the keyboard;
 * nothing is asked from X's video host before the press. Like any media of the page it is the one that
 * plays: its start stops the others (`reportMediaStart` with the frame), and it pauses when other media
 * starts (`useMediaBox`). A video that errs, or has no data within `X_POST_VIDEO_START_MS`, gives way to
 * X's own post in the same place (`fallback`), never a dead player.
 */
export function XPostVideo({ src, aspect, fallback }: XPostVideoProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const isFailed = failed === src;
  // Only an MP4 on X's video host, as `getXPostVideo` validates and normalizes it, goes into the frame.
  const href = getXPostVideo({ stream: { url: src, type: 'video/mp4', preview: false } });
  const innerVideo = () => frameRef.current?.contentDocument?.querySelector('video') ?? null;

  useMediaBox(boxRef, { onStop: () => innerVideo()?.pause() });

  useEffect(() => {
    if (isFailed) return;
    const timer = setTimeout(() => {
      const video = innerVideo();
      if (!video || video.readyState === 0) setFailed(src);
    }, X_POST_VIDEO_START_MS);
    return () => clearTimeout(timer);
  }, [src, isFailed]);

  const onLoad = () => {
    const video = innerVideo();
    const frame = frameRef.current;
    if (!video || !frame) return;
    // It may have failed or started (`autoplay`) before this load: as if just now.
    if (video.error) {
      setFailed(src);
      return;
    }
    video.addEventListener('play', () => reportMediaStart(frame));
    video.addEventListener('error', () => setFailed(src));
    if (!video.paused) reportMediaStart(frame);
    // Started by the press that opened it (the page's activation reaches its same-origin frame).
    else video.play().catch(() => {});
  };

  if (isFailed || !href) return <>{fallback()}</>;
  return (
    <Container
      overrideDefaults
      ref={boxRef}
      data-testid="x-post-video"
      data-src={src}
      className="w-full overflow-hidden rounded-md bg-black"
      style={{ aspectRatio: String(aspect ?? DEFAULT_ASPECT) }}
    >
      <iframe
        ref={frameRef}
        title="Video of the post"
        srcDoc={getVideoDocument(href)}
        allow="autoplay; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        className="block size-full border-0"
      />
    </Container>
  );
}

/**
 * What the Play of an X post opens inside its card: its MP4 (`src`, the card's own, else read from the
 * app's server, `useXPost`, `/api/x-post`, which the Play starts reading as the viewer reaches for it:
 * `prefetchXPost`), played in the app's own player (`XPostVideo`), started by that press; the place held
 * while it is read. A post with no MP4 (a live broadcast), one the server could not read, a video that
 * does not load, or any other site's post shows the site's own (`fallback`).
 */
export function XPostPlayer({
  link,
  src,
  fallback,
}: {
  link: string;
  /** The MP4 the card carries (`getXPostVideo`), when it does. */
  src?: string | null;
  fallback: () => ReactNode;
}) {
  const { post, pending } = useXPost(getXPostId(link));
  const video = src ?? post?.video ?? null;
  if (!video && pending) {
    return <Skeleton className="aspect-video w-full rounded-md" data-testid="x-post-video-loading" />;
  }
  return video ? <XPostVideo src={video} aspect={post?.videoAspect} fallback={fallback} /> : <>{fallback()}</>;
}

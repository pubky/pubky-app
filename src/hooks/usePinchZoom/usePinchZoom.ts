'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useEffectEvent, useRef, useState } from 'react';

/** Scale and pan of the zoomed content, in px, relative to its fitted position (transform-origin: center). */
type ZoomTransform = { scale: number; x: number; y: number };

type Size = { width: number; height: number };
type Point = { x: number; y: number };

// exported for tests
export const PINCH_ZOOM_MAX_SCALE = 5;
/** Where a double tap lands: close enough to read text in a screenshot, far enough from the max to pinch further. */
const PINCH_ZOOM_DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 30;
/** Movement under this is still a tap, not a drag. */
const TAP_SLOP_PX = 10;
const WHEEL_ZOOM_SPEED = 0.002;
/** Trackpad pinch arrives as ctrl+wheel with small deltas. */
const TRACKPAD_PINCH_SPEED = 0.01;
/** Firefox reports a mouse wheel in lines (deltaMode 1); one line is read as this many px, as browsers scroll it. */
const WHEEL_LINE_PX = 16;
/**
 * A gesture that ends below this scale snaps back to the fitted size: a zoom too small to see would otherwise keep the
 * carousel from swiping with nothing on screen to say why.
 */
const ZOOM_SNAP_SCALE = 1.1;
/** Wheel and trackpad pinch send no end event: this long without one ends the gesture. */
const WHEEL_IDLE_MS = 250;

const IDENTITY: ZoomTransform = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Rescales around `focal` (relative to the frame centre) so the content point under it stays put. */
// exported for tests
export function zoomAround(transform: ZoomTransform, scale: number, focal: Point): ZoomTransform {
  const ratio = scale / transform.scale;
  return {
    scale,
    x: focal.x - (focal.x - transform.x) * ratio,
    y: focal.y - (focal.y - transform.y) * ratio,
  };
}

/**
 * Keeps the scaled content covering the frame: no pan past an image edge, and none at all on an axis where the scaled
 * content is still narrower than the frame (a tall photo stays centred horizontally).
 */
// exported for tests
export function clampZoomTransform(transform: ZoomTransform, frame: Size, content: Size): ZoomTransform {
  const scale = clamp(transform.scale, 1, PINCH_ZOOM_MAX_SCALE);
  const maxX = Math.max(0, (content.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (content.height * scale - frame.height) / 2);
  // `+ 0` turns a -0 into 0 so a clamped axis reads as plainly zero
  return { scale, x: clamp(transform.x, -maxX, maxX) + 0, y: clamp(transform.y, -maxY, maxY) + 0 };
}

/** Wheel delta in px, whatever unit the browser counted it in. */
const wheelDeltaPx = (event: WheelEvent, pageHeight: number) => {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_PX;
  if (event.deltaMode === 2) return event.deltaY * pageHeight;
  return event.deltaY;
};

/** Safari's own pinch event (macOS trackpad, iOS): not in the DOM typings. */
type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

interface UsePinchZoomOptions {
  /** False resets to the fitted size and ignores input: the slide is not the visible one. */
  enabled: boolean;
}

interface Gesture {
  start: ZoomTransform;
  /** Two-finger gesture: the pinch's starting spread and centre, relative to the frame centre. */
  pinch?: { distance: number; midpoint: Point };
  /** One-pointer gesture: where it went down, for pan deltas and tap detection. */
  origin?: Point;
  moved: boolean;
}

/**
 * Pinch, double-tap, wheel and drag zoom for one piece of media inside a frame.
 *
 * The page itself never zooms (the root viewport sets `userScalable: false`), so this zooms the content with a CSS
 * transform instead. Spread `handlers` on the frame, give the frame `touch-none` so the browser leaves the gestures to
 * us, and apply `transform` to an inner wrapper: the frame stays untransformed so its rect is the fitted box. A
 * one-pointer drag at the fitted size is left alone so a surrounding carousel can still swipe.
 */
export function usePinchZoom({ enabled }: UsePinchZoomOptions) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ZoomTransform>(IDENTITY);
  const [isGesturing, setIsGesturing] = useState(false);
  // Gesture maths reads the latest transform between renders; every write goes through `apply` so the two agree.
  const transformRef = useRef(transform);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null);
  const safariGestureRef = useRef<{ start: ZoomTransform; focal: Point } | null>(null);
  const wheelIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = () => {
    const frameEl = frameRef.current;
    if (!frameEl) return null;
    const rect = frameEl.getBoundingClientRect();
    const frame = { width: rect.width, height: rect.height };
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    // The image is object-contain, so the drawn picture can be smaller than its box: pan limits follow the picture.
    const img = frameEl.querySelector('img:not(.size-0)');
    let content = frame;
    if (img instanceof HTMLImageElement && img.naturalWidth && img.naturalHeight && img.offsetWidth) {
      const fit = Math.min(img.offsetWidth / img.naturalWidth, img.offsetHeight / img.naturalHeight);
      content = { width: img.naturalWidth * fit, height: img.naturalHeight * fit };
    }
    return { frame, content, centre };
  };

  const apply = (next: ZoomTransform) => {
    transformRef.current = next;
    setTransform(next);
  };

  type Measured = ReturnType<typeof measure>;

  const commit = (next: ZoomTransform, m: Measured = measure()) => {
    apply(m ? clampZoomTransform(next, m.frame, m.content) : next);
  };

  const toFrame = (point: Point, m: Measured = measure()): Point =>
    m ? { x: point.x - m.centre.x, y: point.y - m.centre.y } : point;

  /** The end of a gesture: a zoom too small to see goes back to the fitted size. */
  const settle = () => {
    const { scale } = transformRef.current;
    if (scale > 1 && scale < ZOOM_SNAP_SCALE) commit(IDENTITY);
  };

  const startGesture = () => {
    const points = [...pointersRef.current.values()];
    const start = transformRef.current;
    if (points.length >= 2) {
      const [a, b] = points;
      gestureRef.current = {
        start,
        pinch: { distance: distance(a, b) || 1, midpoint: toFrame(midpoint(a, b)) },
        moved: true,
      };
    } else if (points.length === 1) {
      gestureRef.current = { start, origin: points[0], moved: false };
    } else {
      gestureRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled) {
      apply(IDENTITY);
      pointersRef.current.clear();
      gestureRef.current = null;
      lastTapRef.current = null;
      safariGestureRef.current = null;
      setIsGesturing(false);
    }
  }, [enabled]);

  useEffect(
    () => () => {
      if (wheelIdleRef.current) clearTimeout(wheelIdleRef.current);
    },
    [enabled],
  );

  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    // Safari may report the pinch it already sends as gesture events as ctrl+wheel too: apply it once
    if (event.ctrlKey && safariGestureRef.current) return;
    const m = measure();
    const speed = event.ctrlKey ? TRACKPAD_PINCH_SPEED : WHEEL_ZOOM_SPEED;
    const deltaY = wheelDeltaPx(event, m?.frame.height ?? window.innerHeight);
    const current = transformRef.current;
    const scale = clamp(current.scale * Math.exp(-deltaY * speed), 1, PINCH_ZOOM_MAX_SCALE);
    commit(zoomAround(current, scale, toFrame({ x: event.clientX, y: event.clientY }, m)), m);
    if (wheelIdleRef.current) clearTimeout(wheelIdleRef.current);
    wheelIdleRef.current = setTimeout(() => {
      wheelIdleRef.current = null;
      if (!gestureRef.current && !safariGestureRef.current) settle();
    }, WHEEL_IDLE_MS);
    // A drag or pinch in progress carries on from the wheel's result, not from where it started
    if (gestureRef.current) {
      const wasMoved = gestureRef.current.moved;
      startGesture();
      if (gestureRef.current) gestureRef.current.moved = wasMoved;
    }
  });

  // Safari sends a trackpad pinch as gesture events, not ctrl+wheel, and zooms the page unless they are cancelled. On
  // iOS a finger pinch sends them too, beside the pointer events that already handle it, so they are ignored then.
  const onSafariGesture = useEffectEvent((event: Event) => {
    event.preventDefault();
    if (pointersRef.current.size > 0) return;
    const gesture = event as SafariGestureEvent;
    if (event.type === 'gesturestart') {
      safariGestureRef.current = {
        start: transformRef.current,
        focal: toFrame({ x: gesture.clientX, y: gesture.clientY }),
      };
      return;
    }
    const active = safariGestureRef.current;
    if (!active) return;
    if (event.type === 'gesturechange') {
      const scale = clamp(active.start.scale * gesture.scale, 1, PINCH_ZOOM_MAX_SCALE);
      commit(zoomAround(active.start, scale, active.focal));
      return;
    }
    safariGestureRef.current = null;
    settle();
  });

  // Attached natively: React's wheel listener is passive, so it cannot stop the page scrolling or zooming, and React
  // has no gesture events at all.
  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl || !enabled) return;
    const handleWheel = (event: WheelEvent) => onWheel(event);
    const handleGesture = (event: Event) => onSafariGesture(event);
    frameEl.addEventListener('wheel', handleWheel, { passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) frameEl.addEventListener(type, handleGesture);
    return () => {
      frameEl.removeEventListener('wheel', handleWheel);
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
        frameEl.removeEventListener(type, handleGesture);
      }
    };
  }, [enabled]);

  // Pan limits follow the frame: a resize or a phone rotation re-clamps, so no empty space shows past an image edge.
  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl || !enabled || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const current = transformRef.current;
      if (current.scale <= 1) return;
      const m = measure();
      if (!m) return;
      const next = clampZoomTransform(current, m.frame, m.content);
      if (next.x !== current.x || next.y !== current.y || next.scale !== current.scale) apply(next);
    });
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, [enabled]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer the browser already released cannot be captured; the gesture still works without it.
    }
    setIsGesturing(true);
    startGesture();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    const points = [...pointersRef.current.values()];

    if (gesture.pinch && points.length >= 2) {
      const [a, b] = points;
      const m = measure();
      const scale = clamp(gesture.start.scale * (distance(a, b) / gesture.pinch.distance), 1, PINCH_ZOOM_MAX_SCALE);
      const centre = toFrame(midpoint(a, b), m);
      const zoomed = zoomAround(gesture.start, scale, gesture.pinch.midpoint);
      // Moving both fingers together pans as well
      commit(
        {
          scale,
          x: zoomed.x + centre.x - gesture.pinch.midpoint.x,
          y: zoomed.y + centre.y - gesture.pinch.midpoint.y,
        },
        m,
      );
      return;
    }

    if (gesture.origin) {
      const dx = event.clientX - gesture.origin.x;
      const dy = event.clientY - gesture.origin.y;
      if (!gesture.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) gesture.moved = true;
      // At the fitted size a one-finger drag belongs to the carousel swipe
      if (gesture.moved && gesture.start.scale > 1) {
        commit({ scale: gesture.start.scale, x: gesture.start.x + dx, y: gesture.start.y + dy });
      }
    }
  };

  const handleTap = (point: Point) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.at <= DOUBLE_TAP_MS && distance(last.point, point) <= DOUBLE_TAP_SLOP_PX) {
      lastTapRef.current = null;
      const current = transformRef.current;
      commit(current.scale > 1 ? IDENTITY : zoomAround(current, PINCH_ZOOM_DOUBLE_TAP_SCALE, toFrame(point)));
      return;
    }
    lastTapRef.current = { at: now, point };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const gesture = gestureRef.current;
    const wasSinglePointer = pointersRef.current.size === 1;
    pointersRef.current.delete(event.pointerId);

    if (event.type === 'pointerup' && wasSinglePointer && gesture?.origin && !gesture.moved) {
      handleTap({ x: event.clientX, y: event.clientY });
    } else if (gesture?.moved) {
      lastTapRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      setIsGesturing(false);
      settle();
    } else {
      // Lifting one finger of a pinch hands over to a pan from where the other finger is
      startGesture();
      if (gestureRef.current) gestureRef.current.moved = true;
    }
  };

  return {
    frameRef,
    transform,
    isZoomed: transform.scale > 1,
    /** True while a pointer is down: callers drop the transform transition so the content tracks the finger. */
    isGesturing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      // A capture the browser drops (the element moved, a system gesture took over) never sends pointerup: without
      // this the pointer stays counted and the next tap reads as the second finger of a pinch.
      onLostPointerCapture: onPointerEnd,
    },
  };
}

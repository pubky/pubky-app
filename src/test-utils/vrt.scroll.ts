/**
 * Scroll a container to its end so a viewport-rooted IntersectionObserver
 * notices the sentinel.
 *
 * Assigning `scrollTop = scrollHeight` paints in Chromium and Firefox, and
 * WebKit paints it too. Delivery of the intersection callback is the flake:
 * inside a transformed popover (Radix / Floating UI) WebKit can take long
 * enough that a 300ms load debounce no longer fits in the caller's poll, or
 * skip the update for an observer that was already watching. Yield a frame,
 * dispatch `scroll`, then wait until a real IntersectionObserver reports the
 * sentinel (or the sentinel unmounts because the page finished) before
 * returning. Callers poll row counts only after that.
 */

const FRAME_TIMEOUT_MS = 100;
const INTERSECTION_TIMEOUT_MS = 2_000;
const SENTINEL_SELECTOR = '[data-testid$="sentinel"]';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, FRAME_TIMEOUT_MS);
    requestAnimationFrame(finish);
  });
}

function commitScrollToEnd(element: Element) {
  // Read layout first so scrollHeight includes rows that landed in the same
  // turn the caller decided the list was ready.
  void element.scrollHeight;
  element.scrollTop = element.scrollHeight;
  // The native scroll event does not bubble. Dispatch one so an ancestor
  // listener still observes the programmatic write.
  element.dispatchEvent(new Event('scroll', { bubbles: true }));
}

function watchSentinel(sentinel: HTMLElement) {
  let intersecting = false;
  const observer = new IntersectionObserver(
    (entries) => {
      // One target can cross the threshold more than once before delivery.
      // The last entry is the current state, same as useInfiniteScroll.
      intersecting = Boolean(entries.at(-1)?.isIntersecting);
    },
    { root: null, rootMargin: '0px', threshold: 0 },
  );
  // observe() schedules a document-wide intersection update, which also
  // flushes observers that missed the programmatic scroll.
  const flush = () => {
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  };
  flush();
  return {
    /** True once the browser has reported the sentinel, or it unmounted. */
    isSettled: () => intersecting || !sentinel.isConnected,
    flush,
    stop: () => observer.disconnect(),
  };
}

function describeScroll(element: Element, sentinel: HTMLElement | null) {
  const sentinelRect = sentinel?.isConnected ? sentinel.getBoundingClientRect() : null;
  const rootRect = element.getBoundingClientRect();
  const overlap = sentinelRect
    ? Math.min(sentinelRect.bottom, rootRect.bottom) - Math.max(sentinelRect.top, rootRect.top)
    : null;
  const shortBy = element.scrollHeight - element.clientHeight - element.scrollTop;
  return `scrollTop=${element.scrollTop} shortBy=${shortBy} sentinelOverlap=${overlap}`;
}

/**
 * Scroll `element` to the bottom and, when it contains a `*-sentinel` node,
 * resolve only after IntersectionObserver has seen that sentinel.
 */
export async function scrollElementToEnd(element: Element): Promise<void> {
  commitScrollToEnd(element);
  await nextFrame();
  // A popover can still be measuring on the first write. Repeat after layout.
  commitScrollToEnd(element);

  const candidate = element.querySelector(SENTINEL_SELECTOR);
  const sentinel = candidate instanceof HTMLElement ? candidate : null;
  if (!sentinel) {
    await nextFrame();
    return;
  }

  const watch = watchSentinel(sentinel);
  const deadline = performance.now() + INTERSECTION_TIMEOUT_MS;
  try {
    while (performance.now() < deadline) {
      await nextFrame();
      if (watch.isSettled()) return;
      commitScrollToEnd(element);
      watch.flush();
    }
  } finally {
    watch.stop();
  }

  throw new Error(
    `VRT scroll timed out after ${INTERSECTION_TIMEOUT_MS}ms before the sentinel intersected (${describeScroll(element, sentinel)})`,
  );
}

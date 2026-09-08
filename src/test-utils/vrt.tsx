import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScreenshotMatcherOptions } from '@vitest/browser/context';
import type { ReactNode } from 'react';
import { expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { TOOLTIP_DELAY_MS } from '@/config/ui';
import { freezeNow } from './vrt.clock';
import type { VrtViewport } from './vrt.viewports';

export interface RenderForVRTOptions {
  viewport: VrtViewport;
}

export const VRT_ROOT_TESTID = 'vrt-root';

/**
 * Park the pointer at `(0, 0)` so the screenshot is free of `:hover` styles.
 *
 * Playwright leaves the cursor in the centre of the body by default. On a
 * small mobile viewport that can land on an action button, so the
 * screenshot captures the `:hover` state (e.g. `bg-brand/30` instead of
 * `bg-brand/16`). `page.unhover()` is not enough — it moves the cursor to
 * the body, which can still sit over a centre-screen button.
 *
 * Hover a throwaway 8×8 target at the corner, then remove it. Do not click
 * or move keyboard focus: click-outside handlers (QuickReply) would collapse
 * the card, and tests that need a focused field (expanded QuickReply) would
 * lose `:focus-within`.
 */
async function moveCursorToTopLeftCorner() {
  document.querySelectorAll('[data-vrt-cursor-target="true"]').forEach((el) => el.remove());
  const target = document.createElement('div');
  target.setAttribute('data-vrt-cursor-target', 'true');
  target.setAttribute('aria-hidden', 'true');
  target.style.position = 'fixed';
  target.style.left = '0';
  target.style.top = '0';
  target.style.width = '8px';
  target.style.height = '8px';
  target.style.opacity = '0.01';
  target.style.backgroundColor = 'transparent';
  target.style.pointerEvents = 'auto';
  target.style.zIndex = '10000';
  document.body.appendChild(target);
  try {
    await page
      .elementLocator(target)
      .hover()
      .catch(() => undefined);
  } finally {
    target.remove();
  }
}

/**
 * Screenshot the iframe document so Radix Dialog portals on `document.body`
 * are included. Do not reparent those nodes into `vrt-root`: React still
 * thinks they live on `body`, and `removeChild` then throws NotFoundError
 * (and can leave the Vitest browser process hanging).
 *
 * Do not `vi.mock('radix-ui')` to retarget the portal either —
 * `importOriginal()` of that barrel can shift `oklch` brand green on
 * unrelated screenshots.
 */
export async function matchVrtFrameScreenshot(name: string, options?: ScreenshotMatcherOptions) {
  await moveCursorToTopLeftCorner();
  await waitForImagesReady(document.documentElement);
  await expect(page.elementLocator(document.documentElement)).toMatchScreenshot(name, options);
}

interface VRTProvidersProps {
  children: ReactNode;
  viewport: VrtViewport;
  queryClient: QueryClient;
}

function VRTProviders({ children, viewport, queryClient }: VRTProvidersProps) {
  // The wrapper clamps the rendered tree to the requested viewport so
  // `locator.screenshot()` returns a viewport-sized image instead of the full
  // scrollable document height. The data-testid lets tests target this element
  // via `screen.getByTestId(VRT_ROOT_TESTID)` for a deterministic crop.
  const rootStyle: React.CSSProperties = {
    width: viewport.width,
    height: viewport.height,
    overflow: 'hidden',
  };

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <QueryClientProvider client={queryClient}>
        <div data-testid={VRT_ROOT_TESTID} style={rootStyle}>
          {children}
        </div>
      </QueryClientProvider>
    </TooltipProvider>
  );
}

export async function renderForVRT(ui: ReactNode, options: RenderForVRTOptions) {
  await page.viewport(options.viewport.width, options.viewport.height);
  await moveCursorToTopLeftCorner();
  freezeNow();
  mockMathRandom(0xdeadbeef);
  // Fresh QueryClient per test keeps cache state isolated; instantiating here
  // (rather than in the component body) avoids re-creation on every React render.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const screen = render(
    <VRTProviders viewport={options.viewport} queryClient={queryClient}>
      {ui}
    </VRTProviders>,
  );
  // Wait for Inter Tight (loaded in vrt.setup.ts via Google Fonts) to be
  // ready so the screenshot is never taken while the browser is still
  // showing the fallback face.
  await document.fonts.ready;
  // Images (mocked next/image → plain <img>, including SVGs like the header
  // logo) load asynchronously. `decode()` alone is not enough: it can reject
  // before the request finishes (we used to ignore that), or resolve before
  // layout/paint, which produced intermittent blank logos / brand marks in CI.
  // Wait until each <img> has successfully loaded pixels (`naturalWidth > 0`),
  // then decode + two animation frames so paint catches up. Broken assets fail
  // the test instead of becoming a blank baseline.
  const root = document.querySelector(`[data-testid="${VRT_ROOT_TESTID}"]`);
  if (root) {
    await waitForImagesReady(root);
    await waitForDynamicIconsReady(root);
  }
  return screen;
}

/** Per-capture budget for lazily-loaded Lucide icon chunks. */
const DYNAMIC_ICON_READY_TIMEOUT_MS = 8_000;

/**
 * DynamicLucideIcon renders an empty, size-preserving `svg.lucide` while its
 * chunk loads. Capturing that frame would bake a blank icon box into the
 * baseline nondeterministically (whichever state the race happened to be in),
 * so wait until no icon under the root is still empty — a hung chunk fails the
 * test instead of becoming a blank baseline, matching the image policy above.
 */
async function waitForDynamicIconsReady(root: Element) {
  const hasPendingIcon = () => root.querySelector('svg.lucide:not(:has(*))') !== null;
  if (!hasPendingIcon()) return;

  let frame = 0;
  try {
    await withTimeout(
      new Promise<void>((resolve) => {
        const check = () => {
          if (!hasPendingIcon()) resolve();
          else frame = requestAnimationFrame(check);
        };
        check();
      }),
      DYNAMIC_ICON_READY_TIMEOUT_MS,
      () => `VRT dynamic icon timed out after ${DYNAMIC_ICON_READY_TIMEOUT_MS}ms (empty svg.lucide in capture root)`,
    );
  } finally {
    // The poll must stop on timeout too, or it keeps burning frames for the
    // rest of the page's life and slows every later capture in the file.
    cancelAnimationFrame(frame);
  }
}

async function waitForImagesReady(root: Element) {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map((img) => waitForHtmlImage(img)));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Per-image budget so a hung load/decode fails with the offending URL instead
 * of the whole test dying at the project `testTimeout` with no context. */
const IMAGE_READY_TIMEOUT_MS = 8_000;

/**
 * Wait until an <img> has loaded real pixels. Re-checks `complete` after
 * attaching listeners so a cached load cannot race past us. Load/decode
 * failures reject with the image URL so VRT never treats a blank mark as ready.
 */
async function waitForHtmlImage(img: HTMLImageElement): Promise<void> {
  const src = img.currentSrc || img.src || img.getAttribute('src') || '(unknown src)';
  await withTimeout(waitForHtmlImageReady(img, src), IMAGE_READY_TIMEOUT_MS, () => {
    const state = `complete=${img.complete} naturalWidth=${img.naturalWidth}`;
    return `VRT image timed out after ${IMAGE_READY_TIMEOUT_MS}ms (${state}): ${src}`;
  });
}

async function waitForHtmlImageReady(img: HTMLImageElement, src: string): Promise<void> {
  if (!img.complete) {
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`VRT image failed to load: ${src}`));
      };
      const cleanup = () => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      };
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
      // Cached images can flip to complete between the early check and the
      // listeners above; settle immediately so we neither hang nor double-fire.
      if (img.complete) {
        cleanup();
        if (img.naturalWidth > 0) resolve();
        else reject(new Error(`VRT image loaded without pixels: ${src}`));
      }
    });
  }

  if (img.naturalWidth === 0) {
    throw new Error(`VRT image loaded without pixels: ${src}`);
  }

  try {
    await img.decode();
  } catch {
    throw new Error(`VRT image failed to decode: ${src}`);
  }
}

/**
 * Preload static assets (e.g. logo SVGs) into the browser's image cache before
 * mounting. `waitForImagesReady` already waits for every `<img>` under the VRT
 * root, but a cold fetch racing the initial paint is what caused the
 * intermittent blank Pubky / Synonym / "a tether. company" logos in CI (see
 * `docs/visual-regression-testing.md`). Preloading first means the `<img>` the
 * component renders resolves from cache immediately, removing that race
 * instead of only reacting to it after the fact.
 */
export async function preloadImages(urls: readonly string[]) {
  await Promise.all(
    urls.map(async (url) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error(`Failed to preload VRT image: ${url}`)), {
          once: true,
        });
        image.src = url;
      });
      await image.decode();
    }),
  );
}

/** `next/dynamic` can take several seconds on CI. */
const MARKDOWN_EDITOR_READY_TIMEOUT_MS = 15_000;

/** Wait until the article editor chunk has mounted (textarea is in the DOM). */
export async function waitForMarkdownEditorReady(root: ParentNode = document) {
  await vi.waitFor(
    () => {
      const editor = root.querySelector('[data-testid="markdown-textarea"]');
      if (!editor) {
        throw new Error('Markdown editor did not hydrate');
      }
    },
    { timeout: MARKDOWN_EDITOR_READY_TIMEOUT_MS },
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: () => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message())), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// VRT compares pixels, so random values must be stable across runs. This
// replaces Math.random with a seeded pseudo-random generator: it does not return
// the same number every time, but the sequence is identical on every test run
// when calls happen in the same order. In other words, calls are not “truly
// random”; given the seed and the call order, every return value is predictable
// ahead of time (deterministic / reproducible). For example, QuickReply
// component chooses a random placeholder prompt; without a stable sequence,
// text and line wrapping can change between screenshots.
// Vitest calls out random values as dynamic content that should be mocked:
// https://vitest.dev/guide/browser/visual-regression-testing#handle-dynamic-content
function mockMathRandom(seed: number) {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

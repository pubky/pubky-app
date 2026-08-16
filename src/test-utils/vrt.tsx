import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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
  }
  return screen;
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

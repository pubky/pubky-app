import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { TOOLTIP_DELAY_MS } from '@/config/ui';
import enMessages from '../../messages/en.json';
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
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <QueryClientProvider client={queryClient}>
          <div data-testid={VRT_ROOT_TESTID} style={rootStyle}>
            {children}
          </div>
        </QueryClientProvider>
      </TooltipProvider>
    </NextIntlClientProvider>
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
  // Images (e.g. the mocked next/image <img>) load their src asynchronously.
  // Without waiting for decode, the screenshot can fire before an image paints,
  // producing intermittent diffs. Decode every image in the rendered tree; a
  // failed/again-pending decode is ignored so a broken src never hangs the test.
  const root = document.querySelector(`[data-testid="${VRT_ROOT_TESTID}"]`);
  if (root) {
    await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => img.decode().catch(() => {})));
  }
  return screen;
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

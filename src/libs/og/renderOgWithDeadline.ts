import { Logger } from '@/libs/logger/logger';
import { OG_RENDER_DEADLINE_MS } from './ogConstants';
import { renderFallbackOg } from './renderFallbackOg';

/**
 * Runs an OG render under `OG_RENDER_DEADLINE_MS`, answering with the generic
 * fallback card if it has not produced a response by then. The abandoned
 * render keeps running to completion (its result is discarded), so its Nexus,
 * CDN and satori asset caches are warm for the crawler's next attempt. The
 * short fallback cache policy makes that next attempt happen soon.
 *
 * Applied at the route boundary so it bounds every stage of a render in one
 * place, whatever renderer the route delegates to.
 */
export async function renderOgWithDeadline(
  render: () => Promise<Response>,
  context: Record<string, string>,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deadline'>((resolve) => {
    timer = setTimeout(() => resolve('deadline'), OG_RENDER_DEADLINE_MS);
  });
  try {
    const result = await Promise.race([render(), deadline]);
    if (result !== 'deadline') return result;
    Logger.warn('[renderOgWithDeadline] OG render exceeded the deadline; serving the fallback card', {
      ...context,
      deadlineMs: OG_RENDER_DEADLINE_MS,
    });
    return await renderFallbackOg();
  } finally {
    clearTimeout(timer);
  }
}

import { describe, expect, it } from 'vitest';
import { renderFallbackOg } from './renderFallbackOg';

describe('renderFallbackOg', () => {
  it('redirects (307) to the configured preview image as an absolute URL', () => {
    const res = renderFallbackOg();

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/preview.webp');
    // Location must be absolute so crawlers can follow it.
    expect(() => new URL(location ?? '')).not.toThrow();
  });
});

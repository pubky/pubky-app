import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OG_RENDER_DEADLINE_MS } from './ogConstants';
import { renderOgWithDeadline } from './renderOgWithDeadline';

const fallback = vi.hoisted(() => vi.fn(async () => new Response('fallback')));
vi.mock('./renderFallbackOg', () => ({ renderFallbackOg: fallback }));

describe('renderOgWithDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fallback.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a render that finishes in time straight through', async () => {
    const real = new Response('real');

    const res = await renderOgWithDeadline(async () => real, { route: 'post' });

    expect(res).toBe(real);
  });

  it('prepares the fallback concurrently so it is ready the moment the deadline fires', async () => {
    const promise = renderOgWithDeadline(() => new Promise<Response>(() => {}), { route: 'post' });

    // Started alongside the render, not after the deadline.
    expect(fallback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OG_RENDER_DEADLINE_MS);
    expect(await (await promise).text()).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('serves the fallback card once the deadline passes, leaving the render to finish on its own', async () => {
    let finishRender: (res: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      finishRender = resolve;
    });

    const promise = renderOgWithDeadline(() => pending, { route: 'post' });
    await vi.advanceTimersByTimeAsync(OG_RENDER_DEADLINE_MS);
    const res = await promise;

    expect(await res.text()).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);

    // The abandoned render settling later is harmless.
    finishRender(new Response('late'));
    await vi.runAllTimersAsync();
  });

  it('does not fire the fallback just short of the deadline', async () => {
    const real = new Response('real');
    const promise = renderOgWithDeadline(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(real), OG_RENDER_DEADLINE_MS - 1)),
      { route: 'post' },
    );
    await vi.advanceTimersByTimeAsync(OG_RENDER_DEADLINE_MS - 1);

    expect(await promise).toBe(real);
  });
});

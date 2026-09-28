import { Buffer } from 'node:buffer';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseUserDetailsFromIdsParams } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import { useMentionAutocomplete } from './useMentionAutocomplete';
import { MENTION_DEBOUNCE_MS } from './useMentionAutocomplete.constants';

// Keep the real debounce, controller, application, service and query cache. Only
// hydration is unrelated to the number of search requests made while typing.
vi.mock('@/hooks/useUserDetailsFromIds/useUserDetailsFromIds', () => ({
  useUserDetailsFromIds: ({ userIds }: UseUserDetailsFromIdsParams) => ({
    users: userIds.map((id) => ({ id, name: id })),
  }),
}));

const requests: string[] = [];
let names: string[] = [];
const fetchMock = vi.fn<typeof fetch>();

// Model Nexus's actual Redis byte interval, not startsWith: [lower, lower + '~').
// pubky-nexus 9efd34f7, nexus-common/src/models/user/search.rs:53-66.
function searchResponse(input: Parameters<typeof fetch>[0]) {
  const prefix = decodeURIComponent(new URL(String(input)).pathname.split('/by_name/')[1]);
  requests.push(prefix);
  const lower = Buffer.from(prefix.toLowerCase());
  const upper = Buffer.from(`${prefix.toLowerCase()}~`);
  const matches = names.filter((name) => {
    const member = Buffer.from(`${name.toLowerCase()}:user-id`);
    return Buffer.compare(member, lower) >= 0 && Buffer.compare(member, upper) < 0;
  });
  return new Response(JSON.stringify(matches), { status: 200 });
}

async function settleSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS);
  });
}

function renderAutocomplete() {
  return renderHook(({ content, caret }) => useMentionAutocomplete({ content, caret }), {
    initialProps: { content: '', caret: 0 },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  nexusQueryClient.clear();
  names = [];
  requests.length = 0;
  fetchMock.mockReset().mockImplementation(async (input) => searchResponse(input));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  nexusQueryClient.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mention search request lifetime', () => {
  it.each([
    ['Hello @john', ' ', 'thanks.', ' see', ' you', ' later', ' tonight'],
    ['mail@example.com', ' ', 'is', ' my', ' address', ' for', ' now'],
  ])('stops empty searches while extending %s into prose', async (...fragments) => {
    const { result, rerender } = renderAutocomplete();
    let content = '';
    for (const fragment of fragments) {
      content += fragment;
      rerender({ content, caret: content.length });
      await settleSearch();
    }
    expect(requests).toHaveLength(1);
    expect(result.current.isOpen).toBe(false);
  });

  it('keeps the real debounce when typing faster than the delay', async () => {
    const { rerender } = renderAutocomplete();
    for (const content of ['@jo', '@john', '@john thanks.', '@john thanks. see']) {
      rerender({ content, caret: content.length });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    await settleSearch();
    expect(requests).toEqual(['john thanks. see']);
  });

  it('continues through a valid long name and repeated internal spaces', async () => {
    names = ['John  Ronald Reuel Tolkien'];
    const { result, rerender } = renderAutocomplete();
    for (const content of ['@John', '@John  Ronald', '@John  Ronald Reuel', '@John  Ronald Reuel Tolkien']) {
      rerender({ content, caret: content.length });
      await settleSearch();
    }
    expect(requests).toEqual(['John', 'John  Ronald', 'John  Ronald Reuel', 'John  Ronald Reuel Tolkien']);
    expect(result.current.users).toEqual([{ id: names[0], name: names[0] }]);
    expect(result.current.isOpen).toBe(true);
  });

  it.each(['🚀', 'é', '👩🏽‍💻', '\u0301', '🇷🇸'])(
    'searches a Unicode extension outside an empty interval: %s',
    async (suffix) => {
      names = [`Rocket${suffix} Alice`];
      const { result, rerender } = renderAutocomplete();
      for (const content of ['@Rocket', `@Rocket${suffix}`, `@Rocket${suffix} Alice`]) {
        rerender({ content, caret: content.length });
        await settleSearch();
      }
      expect(requests).toEqual(['Rocket', `Rocket${suffix}`, names[0]]);
      expect(result.current.isOpen).toBe(true);
      expect(result.current.users).toEqual([{ id: names[0], name: names[0] }]);
    },
  );

  it('does not treat a failed search as an empty interval', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    names = ['John Smith'];
    const { result, rerender } = renderAutocomplete();
    for (const content of ['@John', '@John Smith']) {
      rerender({ content, caret: content.length });
      await settleSearch();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isOpen).toBe(true);
  });

  it.each([
    ['@john', '@john nobody', '@john nobod', '@john nobod else'],
    ['@john', '@john nobody', '@jane nobody', '@jane nobody else'],
    ['@john', '@john nobody', '@john nobody @john else', '@john nobody @john else now'],
    ['@john', '@john nobody', '@john nobody,', '@john nobody, @john else'],
  ])('restarts searching after editing or leaving the mention: %j', async (...stages) => {
    const { rerender } = renderAutocomplete();
    for (const content of stages) {
      rerender({ content, caret: content.length });
      await settleSearch();
    }
    expect(requests).toHaveLength(2);
  });

  it('restarts after moving the caret even before another debounced search', async () => {
    const { rerender } = renderAutocomplete();
    const content = '@john nobody';
    rerender({ content: '@john', caret: 5 });
    await settleSearch();
    rerender({ content, caret: content.length });
    await settleSearch();
    rerender({ content, caret: 0 });
    rerender({ content, caret: content.length });
    await settleSearch();
    expect(requests).toEqual(['john', 'john nobody']);
  });

  it('does not let a response from before a caret change suppress the new attempt', async () => {
    let resolveFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { rerender } = renderAutocomplete();
    rerender({ content: '@john', caret: 5 });
    await settleSearch();
    rerender({ content: '@john', caret: 0 });
    rerender({ content: '@john smith', caret: 11 });
    await act(async () => {
      resolveFirst(new Response('[]', { status: 200 }));
    });
    await settleSearch();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests).toEqual(['john smith']);
  });
});

import { act, renderHook } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import type { UseFormReturn } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useCustomFeedForm } from './useCustomFeedForm';
import { CUSTOM_FEED_CONTENT_ALL, CUSTOM_FEED_FORM_FIELDS, type CustomFeedFormData } from './useCustomFeedForm.types';

const mocks = vi.hoisted(() => ({
  commitCreate: vi.fn(),
  commitUpdate: vi.fn(),
  commitDelete: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/home' as string,
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
    commitUpdate: (...args: unknown[]) => mocks.commitUpdate(...args),
    commitDelete: (...args: unknown[]) => mocks.commitDelete(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const createFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  icon: 'mountain',
  tags: ['bitcoin'],
  domain_tags: [],
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  layout: PubkyAppFeedLayout.Columns,
  content: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

/** Fills the create form with the minimum a feed needs to validate. */
const fillValidForm = async (form: UseFormReturn<CustomFeedFormData>) => {
  await act(async () => {
    form.setValue(CUSTOM_FEED_FORM_FIELDS.NAME, 'My Feed');
    form.setValue(CUSTOM_FEED_FORM_FIELDS.TAGS, ['bitcoin']);
    await form.trigger();
  });
};

describe('useCustomFeedForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = APP_ROUTES.HOME;
  });

  describe('form seeding', () => {
    it('starts create mode from the shared defaults', () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      expect(result.current.form.getValues()).toEqual({
        [CUSTOM_FEED_FORM_FIELDS.NAME]: '',
        [CUSTOM_FEED_FORM_FIELDS.ICON]: DEFAULT_CUSTOM_FEED_ICON,
        [CUSTOM_FEED_FORM_FIELDS.REACH]: PubkyAppFeedReach.All,
        [CUSTOM_FEED_FORM_FIELDS.SORT]: PubkyAppFeedSort.Recent,
        [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: PubkyAppFeedLayout.Columns,
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_ALL,
        [CUSTOM_FEED_FORM_FIELDS.TAGS]: [],
        [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: [],
      });
    });

    it('seeds edit mode from the feed, mapping null content to the ALL sentinel', () => {
      const feed = createFeed({ content: null });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      expect(result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.NAME]: 'Bitcoin News',
        [CUSTOM_FEED_FORM_FIELDS.ICON]: 'mountain',
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_ALL,
        [CUSTOM_FEED_FORM_FIELDS.TAGS]: ['bitcoin'],
      });
    });

    it('keeps an icon name unknown to our Lucide set instead of coercing it', () => {
      const feed = createFeed({ icon: 'another-clients-icon' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.ICON)).toBe('another-clients-icon');
    });

    it('falls back to the default icon only when the feed has no icon at all', () => {
      const feed = createFeed({ icon: undefined });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.ICON)).toBe(DEFAULT_CUSTOM_FEED_ICON);
    });

    it('re-seeds from a changed feed while closed, but leaves an open form alone', async () => {
      const feed = createFeed({ name: 'Bitcoin News' });
      const { result, rerender } = renderHook(
        ({ open }: { open: boolean }) => useCustomFeedForm({ mode: 'edit', feed, open }),
        { initialProps: { open: true } },
      );

      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.NAME, 'In-progress edit');
      });
      // Still open — the user's typing survives a re-render.
      rerender({ open: true });
      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.NAME)).toBe('In-progress edit');

      // Closing re-seeds from the stored feed.
      rerender({ open: false });
      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.NAME)).toBe('Bitcoin News');
    });
  });

  describe('submit — create', () => {
    it('rejects an invalid form without calling the controller', async () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit();
      });

      expect(saved).toBe(false);
      expect(mocks.commitCreate).not.toHaveBeenCalled();
    });

    it('commits, toasts, and navigates to the new feed', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);

      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit();
      });

      expect(saved).toBe(true);
      expect(mocks.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Feed',
          icon: DEFAULT_CUSTOM_FEED_ICON,
          tags: ['bitcoin'],
          content: null,
        }),
      );
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed created: My Feed' });
      expect(mocks.push).toHaveBeenCalledWith(`${APP_ROUTES.FEED}/new-feed`);
    });

    it('ignores a second submit while one is in flight', async () => {
      let resolveCreate: ((value: { id: string; name: string }) => void) | undefined;
      mocks.commitCreate.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);

      let second: boolean | undefined;
      await act(async () => {
        const first = result.current.submit();
        // Fired from the same render's closure — the ref, not state, must gate it.
        second = await result.current.submit();
        await vi.waitFor(() => {
          if (!resolveCreate) throw new Error('first submit has not reached the controller yet');
        });
        resolveCreate?.({ id: 'new-feed', name: 'My Feed' });
        await first;
      });

      expect(second).toBe(false);
      expect(mocks.commitCreate).toHaveBeenCalledTimes(1);
    });

    it('maps a concrete content kind through instead of null', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, PubkyAppPostKind.Image);
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.commitCreate).toHaveBeenCalledWith(expect.objectContaining({ content: PubkyAppPostKind.Image }));
    });

    it('reports failure and toasts an error when the controller throws', async () => {
      mocks.commitCreate.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);

      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit();
      });

      expect(saved).toBe(false);
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not create feed. Try again.',
      });
      expect(mocks.push).not.toHaveBeenCalled();
    });
  });

  describe('submit — edit navigation', () => {
    it('redirects when the id changed and you are standing on the old route', async () => {
      const feed = createFeed({ id: 'old-id' });
      mocks.pathname = `${APP_ROUTES.FEED}/old-id`;
      mocks.commitUpdate.mockResolvedValue({ id: 'new-id', name: 'Bitcoin News' });

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.replace).toHaveBeenCalledWith(`${APP_ROUTES.FEED}/new-id`);
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('stays put when the id changed but you are reading a different feed', async () => {
      const feed = createFeed({ id: 'old-id' });
      mocks.pathname = `${APP_ROUTES.FEED}/some-other-feed`;
      mocks.commitUpdate.mockResolvedValue({ id: 'new-id', name: 'Bitcoin News' });

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it('round-trips a foreign icon through an unrelated edit unchanged', async () => {
      const feed = createFeed({ icon: 'another-clients-icon' });
      mocks.pathname = APP_ROUTES.HOME;
      mocks.commitUpdate.mockResolvedValue({ id: 'feed-abc123', name: 'Renamed' });

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.NAME, 'Renamed');
        await result.current.submit();
      });

      expect(mocks.commitUpdate).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: expect.objectContaining({ icon: 'another-clients-icon' }),
      });
    });

    it('stays put for a presentation-only edit that keeps the id', async () => {
      const feed = createFeed({ id: 'same-id' });
      mocks.pathname = `${APP_ROUTES.FEED}/same-id`;
      mocks.commitUpdate.mockResolvedValue({ id: 'same-id', name: 'Renamed' });

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.replace).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed updated: Renamed' });
    });
  });

  describe('deleteFeed', () => {
    it('is a no-op in create mode', async () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      let deleted: boolean | undefined;
      await act(async () => {
        deleted = await result.current.deleteFeed();
      });

      expect(deleted).toBe(false);
      expect(mocks.commitDelete).not.toHaveBeenCalled();
    });

    it('deletes and sends you home when you were on the deleted feed', async () => {
      const feed = createFeed({ id: 'feed-abc123' });
      mocks.pathname = `${APP_ROUTES.FEED}/feed-abc123`;
      mocks.commitDelete.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      let deleted: boolean | undefined;
      await act(async () => {
        deleted = await result.current.deleteFeed();
      });

      expect(deleted).toBe(true);
      expect(mocks.commitDelete).toHaveBeenCalledWith({ feedId: 'feed-abc123' });
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed deleted: Bitcoin News' });
      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    });

    it('does not navigate when you were reading a different feed', async () => {
      const feed = createFeed({ id: 'feed-abc123' });
      mocks.pathname = `${APP_ROUTES.FEED}/another-feed`;
      mocks.commitDelete.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        await result.current.deleteFeed();
      });

      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it('reports failure and toasts an error when the controller throws', async () => {
      const feed = createFeed();
      mocks.commitDelete.mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      let deleted: boolean | undefined;
      await act(async () => {
        deleted = await result.current.deleteFeed();
      });

      expect(deleted).toBe(false);
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not delete feed. Try again.',
      });
    });
  });
});

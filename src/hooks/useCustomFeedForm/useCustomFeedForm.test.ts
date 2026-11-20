import { act, renderHook } from '@testing-library/react';
import type { UseFormReturn } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { toast } from '@/molecules/Toaster/toast';
import { getResourceKindsTypes, toResourceFeedTypesValue } from '@/pipes/resource/resource.search';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useCustomResourceFeedStore } from '@/stores/customResourceFeed/customResourceFeed.store';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';
import { mockSession } from '@/test-utils/pubky';
import { useCustomFeedForm } from './useCustomFeedForm';
import {
  CUSTOM_FEED_CONTENT_ALL,
  CUSTOM_FEED_CONTENT_RESOURCES,
  CUSTOM_FEED_FORM_FIELDS,
  CUSTOM_FEED_RESOURCE_TYPES_ALL,
  type CustomFeedFormData,
  customFeedFormValuesFromFeed,
} from './useCustomFeedForm.types';

const mocks = vi.hoisted(() => ({
  commitCreate: vi.fn(),
  commitUpdate: vi.fn(),
  commitDelete: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/home' as string,
  search: '',
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
    commitUpdate: (...args: unknown[]) => mocks.commitUpdate(...args),
    commitDelete: (...args: unknown[]) => mocks.commitDelete(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast');

// Whether the configured Pinakes serves My network (`wot_2`)
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));
beforeEach(() => {
  reachSet.served = false;
});

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const createFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  icon: 'mountain',
  tags: ['bitcoin'],
  domain_tags: [],
  reach: 'all',
  sort: 'recent',
  layout: 'columns',
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
  it('preserves an open feed draft and blocks writes during account recovery', async () => {
    const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: createFeed(), open: true }));
    await fillValidForm(result.current.form);
    act(() => useAuthStore.setState({ restoreStatus: 'restoring' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    await act(async () => {
      expect(await result.current.deleteFeed()).toBe(false);
    });
    expect(mocks.commitUpdate).not.toHaveBeenCalled();
    expect(mocks.commitDelete).not.toHaveBeenCalled();
    expect(result.current.form.getValues('name')).toBe('My Feed');
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = APP_ROUTES.HOME;
    mocks.search = '';
    useCustomResourceFeedStore.getState().reset();
    useHomeStore.setState({ content: CONTENT.ALL });
    useAuthStore.setState({
      ...authInitialState,
      currentUserPubky: 'user',
      session: mockSession(),
      restoreStatus: 'ready',
    });
  });

  describe('the External resources filters on screen', () => {
    it('starts a feed created on Home with them, and saves them', async () => {
      mocks.search = 'kind=event&when=week&near=47.37,8.54&place=Z%C3%BCrich&sort=popular&q=x';
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      expect(result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_RESOURCES,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: 'Event',
        // Popular is the feed's own sort
        [CUSTOM_FEED_FORM_FIELDS.SORT]: 'popularity',
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: { when: 'week', near: '47.37,8.54', place: 'Zürich' },
      });
      await fillValidForm(result.current.form);
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'resources',
          resource_types: ['Event'],
          resource_filters: { when: 'week', near: '47.37,8.54', place: 'Zürich' },
        }),
      );
    });

    it('starts a feed created on Home’s External resources as one, with no filter in the URL', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      useHomeStore.setState({ content: CONTENT.RESOURCES });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      expect(result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_RESOURCES,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
      });
      await fillValidForm(result.current.form);
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'resources', content: null, resource_types: null, resource_filters: null }),
      );

      // Home's posts: a post feed
      useHomeStore.setState({ content: CONTENT.ALL });
      const posts = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      expect(posts.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.CONTENT)).toBe(CUSTOM_FEED_CONTENT_ALL);
    });

    it('starts a feed created on a custom resources feed’s page as one, with no filter in the URL', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const feed = createFeed({ target: 'resources', resource_types: null, resource_filters: null, tags: ['music'] });
      mocks.pathname = `${APP_ROUTES.FEED}/${feed.id}`;
      useCustomResourceFeedStore.getState().ready(feed.id);
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      expect(result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_RESOURCES,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
      });
      await fillValidForm(result.current.form);
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.commitCreate).toHaveBeenCalledWith(expect.objectContaining({ target: 'resources' }));

      // A post feed's page, also while another feed's filters are marked as in the URL: a post feed
      mocks.pathname = `${APP_ROUTES.FEED}/feed-posts`;
      const posts = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      expect(posts.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.CONTENT)).toBe(CUSTOM_FEED_CONTENT_ALL);
    });

    it('saves More kinds with All types as every type but the kinds’, not as every type', async () => {
      mocks.search = 'kind=more';
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      const kinds = toResourceFeedTypesValue(getResourceKindsTypes());
      expect(result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: { exclude_types: kinds },
      });
      await fillValidForm(result.current.form);
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'resources',
          resource_types: null,
          resource_filters: { exclude_types: kinds },
        }),
      );

      // A picked More kinds type is the feed's type
      mocks.search = 'kind=more&type=WebPage';
      const webPages = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      expect(webPages.result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: 'WebPage',
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
      });

      // On a feed of types no Kind stands for, More kinds picked on its panel saves More kinds
      const mixed = createFeed({ target: 'resources', resource_types: ['Book', 'Event'], tags: ['music'] });
      mocks.pathname = `${APP_ROUTES.FEED}/${mixed.id}`;
      useCustomResourceFeedStore.getState().ready(mixed.id);
      mocks.search = 'kind=more';
      const edited = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: mixed, open: true }));
      expect(edited.result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: { exclude_types: kinds },
      });

      // A feed of More kinds that saved other types to leave out keeps them through another change
      const older = createFeed({
        target: 'resources',
        resource_types: null,
        resource_filters: { exclude_types: 'Article,Event' },
        tags: ['music'],
      });
      mocks.pathname = `${APP_ROUTES.FEED}/${older.id}`;
      useCustomResourceFeedStore.getState().ready(older.id);
      mocks.search = 'kind=more&rows=links';
      const changed = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: older, open: true }));
      expect(changed.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({
        rows: 'links',
        exclude_types: 'Article,Event',
      });
      mocks.search = 'kind=more';
      const same = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: older, open: true }));
      expect(same.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({
        exclude_types: 'Article,Event',
      });
    });

    it('saves none of the filters the Kind on screen does not apply (a Home link with When, no Kind)', () => {
      mocks.search = 'when=week';
      const noKind = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      expect(noKind.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toBeNull();

      // Upcoming picked on Events, then Places
      mocks.search = 'kind=place&sort=upcoming&near=47.37,8.54';
      const places = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      expect(places.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({
        near: '47.37,8.54',
      });
    });

    it('edits a feed with them on its own page only, once its saved filters are in the URL', () => {
      const feed = createFeed({
        target: 'resources',
        resource_types: ['Event'],
        resource_filters: { when: 'week' },
        tags: ['music'],
      });
      mocks.search = 'kind=event&when=today';
      useCustomResourceFeedStore.getState().ready(feed.id);
      const onHome = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(onHome.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({ when: 'week' });

      mocks.pathname = `${APP_ROUTES.FEED}/${feed.id}`;
      const onPage = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(onPage.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({ when: 'today' });

      // Still being put in the URL: the feed as saved
      useCustomResourceFeedStore.getState().write(feed.id, 'kind=event&when=week');
      const seeding = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(seeding.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({ when: 'week' });
    });

    it('saves what the feed’s page shows: no Kind is every type, and no filter none', () => {
      const feed = createFeed({
        target: 'resources',
        resource_types: ['Event'],
        resource_filters: { when: 'week' },
        tags: ['music'],
      });
      mocks.pathname = `${APP_ROUTES.FEED}/${feed.id}`;
      useCustomResourceFeedStore.getState().ready(feed.id);

      mocks.search = 'rows=links';
      const noKind = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(noKind.result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: { rows: 'links' },
      });

      mocks.search = '';
      const cleared = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(cleared.result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
      });

      // Types of several kinds, which no Kind stands for: kept, as the panel lists them
      const mixed = createFeed({ ...feed, resource_types: ['Book', 'Event'] });
      useCustomResourceFeedStore.getState().ready(mixed.id);
      const kept = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: mixed, open: true }));
      expect(kept.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES)).toBe('Book,Event');
    });

    it('saves a new place name of the feed on screen and stays on its page, as the id is the same', async () => {
      const filters = { when: 'week', near: '47.37,8.54', place: 'Zürich' };
      const feed = createFeed({ target: 'resources', resource_types: ['Event'], resource_filters: filters });
      mocks.pathname = `${APP_ROUTES.FEED}/${feed.id}`;
      mocks.search = 'kind=event&when=week&near=47.37%2C8.54&place=Z%C3%BCrich+Altstadt';
      useCustomResourceFeedStore.getState().ready(feed.id);
      mocks.commitUpdate.mockResolvedValue({ ...feed, resource_filters: { ...filters, place: 'Zürich Altstadt' } });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.commitUpdate).toHaveBeenCalledWith({
        feedId: feed.id,
        changes: expect.objectContaining({ resource_filters: { ...filters, place: 'Zürich Altstadt' } }),
      });
      expect(mocks.commitDelete).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it('keeps the stored filters on a rename while the page shows them, values the panel spells otherwise included', async () => {
      // Another client's: a radius the panel has no option for, and the default Trending window
      const filters = {
        when: 'week',
        near: '47.37,8.54',
        radius: '25',
        place: 'Zürich',
        sort: 'trending',
        window: '7d',
      };
      const feed = createFeed({ target: 'resources', resource_types: ['Event'], resource_filters: filters });
      mocks.pathname = `${APP_ROUTES.FEED}/${feed.id}`;
      // The page as seeded from them
      mocks.search = 'kind=event&when=week&near=47.37%2C8.54&radius=25&place=Z%C3%BCrich&sort=trending&window=7d';
      useCustomResourceFeedStore.getState().ready(feed.id);
      mocks.commitUpdate.mockResolvedValue({ ...feed, name: 'Renamed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual(filters);

      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.NAME, 'Renamed');
        await result.current.submit();
      });
      expect(mocks.commitUpdate).toHaveBeenCalledWith({
        feedId: feed.id,
        changes: expect.objectContaining({ name: 'Renamed', resource_filters: filters }),
      });
      expect(mocks.replace).not.toHaveBeenCalled();

      // A filter changed on the page: what the page shows is saved, the 25 km the panel shows too
      mocks.search = 'kind=event&when=today&near=47.37%2C8.54&radius=25&place=Z%C3%BCrich&sort=trending&window=7d';
      const changed = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));
      expect(changed.result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS)).toEqual({
        when: 'today',
        near: '47.37,8.54',
        radius: '25',
        place: 'Zürich',
        sort: 'trending',
      });

      // Another Kind picked on the page of a feed of several kinds: none of the stored filters it does not apply
      const mixed = createFeed({
        ...feed,
        id: 'feed-mixed',
        resource_types: ['Book', 'Event'],
        resource_filters: { when: 'week' },
      });
      mocks.pathname = `${APP_ROUTES.FEED}/${mixed.id}`;
      mocks.search = 'kind=music';
      useCustomResourceFeedStore.getState().ready(mixed.id);
      const music = renderHook(() => useCustomFeedForm({ mode: 'edit', feed: mixed, open: true }));
      expect(music.result.current.form.getValues()).toMatchObject({
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: 'MusicGroup,MusicPlaylist,MusicRecording',
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
      });
    });

    it('leaves a post feed’s edit alone, and saves no filters on a post feed', async () => {
      mocks.pathname = `${APP_ROUTES.FEED}/feed-abc123`;
      mocks.search = 'kind=event&when=today';
      const feed = createFeed();
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      expect(result.current.form.getValues(CUSTOM_FEED_FORM_FIELDS.CONTENT)).toBe(CUSTOM_FEED_CONTENT_ALL);
      mocks.commitUpdate.mockResolvedValue({ id: 'feed-abc123', name: 'Renamed' });
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS, { when: 'week' });
        await result.current.submit();
      });
      expect(mocks.commitUpdate).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: expect.objectContaining({ target: 'posts', resource_filters: null }),
      });
    });
  });

  describe('form seeding', () => {
    it('starts create mode from the shared defaults', () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));

      expect(result.current.form.getValues()).toEqual({
        [CUSTOM_FEED_FORM_FIELDS.NAME]: '',
        [CUSTOM_FEED_FORM_FIELDS.ICON]: DEFAULT_CUSTOM_FEED_ICON,
        [CUSTOM_FEED_FORM_FIELDS.REACH]: 'all',
        [CUSTOM_FEED_FORM_FIELDS.SORT]: 'recent',
        [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: 'columns',
        [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_ALL,
        [CUSTOM_FEED_FORM_FIELDS.TAGS]: [],
        [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: [],
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
        [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
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
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed created' });
      expect(mocks.push).toHaveBeenCalledWith(`${APP_ROUTES.FEED}/new-feed`);
    });

    it('reports nothing when the account changed while the create waited for the sync lock', async () => {
      mocks.commitCreate.mockResolvedValue(null);
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);

      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit();
      });

      expect(saved).toBe(false);
      expect(mocks.commitCreate).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
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
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, 'image');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.commitCreate).toHaveBeenCalledWith(expect.objectContaining({ content: 'image' }));
    });

    it('stores External resources as the resources target with no content filter', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_RESOURCES);
        await result.current.form.trigger();
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: null,
          target: 'resources',
          resource_types: null,
          domain_tags: [],
          tags: ['bitcoin'],
        }),
      );
    });

    it('stores a post feed as posts, whatever its content', async () => {
      mocks.commitCreate.mockResolvedValue({ id: 'new-feed', name: 'My Feed' });
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);

      await act(async () => {
        await result.current.submit();
      });

      expect(mocks.commitCreate).toHaveBeenCalledWith(expect.objectContaining({ content: null, target: 'posts' }));
    });

    it('refuses External resources with a reach the resource search has none for', async () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_RESOURCES);
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.REACH, 'me');
        await result.current.form.trigger();
      });

      await act(async () => {
        expect(await result.current.submit()).toBe(false);
      });
      expect(mocks.commitCreate).not.toHaveBeenCalled();
    });

    it.each([
      [true, true],
      [false, false],
    ])('takes External resources in My network only where Pinakes serves it (served: %s)', async (served, valid) => {
      reachSet.served = served;
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_RESOURCES);
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.REACH, 'wot');
        await result.current.form.trigger();
      });

      await act(async () => {
        expect(await result.current.submit()).toBe(valid);
      });
    });

    it('refuses External resources with profile tags', async () => {
      const { result } = renderHook(() => useCustomFeedForm({ mode: 'create', open: true }));
      await fillValidForm(result.current.form);
      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_RESOURCES);
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS, ['dev']);
        await result.current.form.trigger();
      });

      await act(async () => {
        expect(await result.current.submit()).toBe(false);
      });
      expect(mocks.commitCreate).not.toHaveBeenCalled();
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

    it('reports nothing when the account changed while the update waited for the sync lock', async () => {
      const feed = createFeed({ id: 'old-id' });
      mocks.pathname = `${APP_ROUTES.FEED}/old-id`;
      mocks.commitUpdate.mockResolvedValue(null);

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit();
      });

      expect(saved).toBe(false);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
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
      useAuthStore.setState({
        ...authInitialState,
        currentUserPubky: 'user',
        session: mockSession(),
        restoreStatus: 'ready',
      });
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

    it('reopens a resources feed as External resources and keeps its target on an unrelated edit', async () => {
      const feed = createFeed({
        target: 'resources',
        resource_types: ['MusicRecording', 'MusicAlbum'],
        tags: ['music'],
        layout: 'cards',
      });
      expect(customFeedFormValuesFromFeed(feed)).toMatchObject({
        content: CUSTOM_FEED_CONTENT_RESOURCES,
        resource_types: 'MusicAlbum,MusicRecording',
        tags: ['music'],
        layout: 'cards',
        reach: 'all',
        sort: 'recent',
      });
      mocks.pathname = APP_ROUTES.HOME;
      useAuthStore.setState({
        ...authInitialState,
        currentUserPubky: 'user',
        session: mockSession(),
        restoreStatus: 'ready',
      });
      mocks.commitUpdate.mockResolvedValue({ id: 'feed-abc123', name: 'Renamed' });

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      await act(async () => {
        result.current.form.setValue(CUSTOM_FEED_FORM_FIELDS.NAME, 'Renamed');
        await result.current.submit();
      });

      expect(mocks.commitUpdate).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: expect.objectContaining({
          target: 'resources',
          resource_types: ['MusicAlbum', 'MusicRecording'],
          content: null,
          tags: ['music'],
          layout: 'cards',
        }),
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
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed updated' });
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
      mocks.commitDelete.mockResolvedValue(true);

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      let deleted: boolean | undefined;
      await act(async () => {
        deleted = await result.current.deleteFeed();
      });

      expect(deleted).toBe(true);
      expect(mocks.commitDelete).toHaveBeenCalledWith({ feedId: 'feed-abc123' });
      expect(vi.mocked(toast)).toHaveBeenCalledWith({ title: 'Feed deleted' });
      expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.HOME);
    });

    it('reports nothing when the account changed while the delete waited for the sync lock', async () => {
      const feed = createFeed({ id: 'feed-abc123' });
      mocks.pathname = `${APP_ROUTES.FEED}/feed-abc123`;
      mocks.commitDelete.mockResolvedValue(false);

      const { result } = renderHook(() => useCustomFeedForm({ mode: 'edit', feed, open: true }));

      let deleted: boolean | undefined;
      await act(async () => {
        deleted = await result.current.deleteFeed();
      });

      expect(deleted).toBe(false);
      expect(mocks.commitDelete).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it('does not navigate when you were reading a different feed', async () => {
      const feed = createFeed({ id: 'feed-abc123' });
      mocks.pathname = `${APP_ROUTES.FEED}/another-feed`;
      mocks.commitDelete.mockResolvedValue(true);

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

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { AuthStatus, type AuthStatusResult } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { PulseConsent } from '@/libs/observability/pulse-consent';
import { buildCompositeId } from '@/models/models.utils';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useContextualBannerStore } from '@/stores/contextualBanner/contextualBanner.store';
import { mockPubky, POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { useContextualBanner } from './useContextualBanner';
import { GENERIC_CONTEXTUAL_BANNER_COPY } from './useContextualBanner.utils';

// `dexie-react-hooks` is deliberately NOT mocked. The real `useLiveQuery` runs plain async queriers
// that never touch Dexie (the controllers below are mocked), schedules each read with a 0 ms
// `setTimeout` (driven here by fake timers, so a read only starts when the test advances time) and,
// like in production, KEEPS its previous result while the reads for new deps are pending. That
// retention is what the keyed-snapshot tests defend against, and the first test of that block pins it
// so those tests cannot pass vacuously if the library ever stops retaining. One copy test switches to
// real timers and the real local user read against fake-indexeddb, to prove the read stays live.
const mocks = vi.hoisted(() => ({
  pathname: vi.fn<() => string>(),
  authStatus: vi.fn<() => AuthStatusResult>(),
  pulseConsent: vi.fn<() => PulseConsent>(),
  keyboardVisible: vi.fn<() => boolean>(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname(),
}));

vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => mocks.authStatus(),
}));

vi.mock('@/hooks/usePulseConsent/usePulseConsent', () => ({
  usePulseConsent: () => ({ consent: mocks.pulseConsent(), choose: vi.fn(), saveFailed: false }),
}));

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => mocks.keyboardVisible(),
}));

// Local reads are the boundary under test; every network-owning method is a spy that must stay unused.
vi.mock('@/controllers/post/post', () => ({
  PostController: { getDetails: vi.fn(), fetch: vi.fn(), getOrFetch: vi.fn() },
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: vi.fn(),
    fetch: vi.fn(),
    fetchDetails: vi.fn(),
    getOrFetch: vi.fn(),
    getOrFetchDetails: vi.fn(),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mocks.logger,
}));

/** Product decision: the banner appears 10 s after a guest opens shared content (`CONTEXTUAL_BANNER_DELAY_MS`). */
const DELAY_MS = 10_000;

const ALICE = PUBKY_52_STAGING_FIXTURE;
const BOB = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_A = POST_ID_STAGING_FIXTURE;
const POST_B = '00353GZ1H40WH';
const REPLY_A = '00353GZ1H40WK';
const COLLECTION = '00353GZ1H40WJ';

const POST_A_ID = buildCompositeId({ pubky: ALICE, id: POST_A });
const POST_B_ID = buildCompositeId({ pubky: BOB, id: POST_B });
const REPLY_A_ID = buildCompositeId({ pubky: ALICE, id: REPLY_A });
const COLLECTION_ID = buildCompositeId({ pubky: ALICE, id: COLLECTION });

const POST_A_PATH = `/post/${ALICE}/${POST_A}`;
const POST_B_PATH = `/post/${BOB}/${POST_B}`;
const REPLY_A_PATH = `/post/${ALICE}/${REPLY_A}`;
const PROFILE_PATH = `/profile/${BOB}`;
const COLLECTION_PATH = `/collections/${ALICE}/${COLLECTION}`;
const MALFORMED_POST_PATH = '/post/not-a-pubky/x';

const ARTICLE_TITLE = 'How Lightning became more reliable';
const COLLECTION_NAME = 'AI & Robotics';

const GENERIC = GENERIC_CONTEXTUAL_BANNER_COPY;

const postCopy = (name: string) => ({
  headline: 'Join the conversation',
  body: `Join Pubky to reply to ${name}, tag this post, and share your perspective.`,
});
const articleCopy = (title: string, name: string) => ({
  headline: `Enjoying “${title}”?`,
  body: `Join Pubky to reply to ${name}, tag this article, and discover more great writing.`,
});
const profileCopy = (name: string) => ({
  headline: `Get to know ${name}`,
  body: `Join Pubky to follow ${name} and take part in the conversation.`,
});
const collectionCopy = (name: string) => ({
  headline: `Interested in ${name}?`,
  body: 'Join Pubky to follow this collection and discover more about this topic.',
});

const makePost = (compositeId: string, overrides: Partial<EnrichedPostDetails> = {}): EnrichedPostDetails => ({
  id: compositeId,
  content: 'Bitcoin brings people together.',
  indexed_at: 1_700_000_000_000,
  kind: 'short',
  uri: `pubky://${compositeId}`,
  attachments: null,
  lock: null,
  deleted: false,
  is_moderated: false,
  is_blurred: false,
  ...overrides,
});

const makeUser = (id: string, name: string): NexusUserDetails => ({
  id: mockPubky(id),
  name,
  bio: '',
  links: null,
  status: null,
  image: null,
  indexed_at: 1_700_000_000_000,
});

const shortPostA = makePost(POST_A_ID);
const articlePostA = makePost(POST_A_ID, {
  kind: 'long',
  content: JSON.stringify({ title: ARTICLE_TITLE, body: 'Lightning used to be fragile.' }),
});
const shortPostB = makePost(POST_B_ID);
const collectionPost = makePost(COLLECTION_ID, {
  kind: 'collection',
  content: JSON.stringify({ name: COLLECTION_NAME, description: 'Curated posts', items: [] }),
});
const alice = makeUser(ALICE, 'Alice');
const bob = makeUser(BOB, 'Bob');

type Row<T> = T | null | Promise<T | null>;

/** Serve `PostController.getDetails` from a table keyed by composite id (missing → `null`, like an empty Dexie). */
function servePosts(rows: Record<string, Row<EnrichedPostDetails>>) {
  vi.mocked(PostController.getDetails).mockImplementation(async ({ compositeId }) => rows[compositeId] ?? null);
}

/** Serve `UserController.getDetails` from a table keyed by pubky (missing → `null`). */
function serveUsers(rows: Record<string, Row<NexusUserDetails>>) {
  vi.mocked(UserController.getDetails).mockImplementation(async ({ userId }) => rows[userId] ?? null);
}

function setAuth(status: AuthStatus, isLoading = false) {
  mocks.authStatus.mockReturnValue({
    status,
    isLoading,
    hasKeypair: status !== AuthStatus.UNAUTHENTICATED,
    hasProfile: status === AuthStatus.UNAUTHENTICATED ? null : status === AuthStatus.AUTHENTICATED,
    isFullyAuthenticated: !isLoading && status === AuthStatus.AUTHENTICATED,
  });
}

function renderBanner(pathname = POST_A_PATH) {
  mocks.pathname.mockReturnValue(pathname);
  const rendered = renderHook(() => useContextualBanner());
  return {
    ...rendered,
    /** Client-side navigation: the root layout keeps the hook mounted and re-renders it. */
    navigate: (to: string) => {
      mocks.pathname.mockReturnValue(to);
      rendered.rerender();
    },
    /** Re-render after a mocked hook (auth, consent, keyboard) changed its value. */
    update: () => rendered.rerender(),
  };
}

/** Advance fake time and settle the promises it released, inside `act`. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Run the 0 ms timers `useLiveQuery` uses to start its reads, and settle them, without moving the clock. */
const settleReads = () => advance(0);

const storeVisible = () => useContextualBannerStore.getState().visible;

const appError = () =>
  new AppError({
    category: ErrorCategory.Database,
    code: DatabaseErrorCode.QUERY_FAILED,
    message: 'Failed to read details',
    service: ErrorService.Local,
    operation: 'getDetails',
  });

/** Calls to the network-owning controller methods so far, by method name (`{}` when there are none). */
function networkReadCalls() {
  const readers = {
    'PostController.fetch': PostController.fetch,
    'PostController.getOrFetch': PostController.getOrFetch,
    'UserController.fetch': UserController.fetch,
    'UserController.fetchDetails': UserController.fetchDetails,
    'UserController.getOrFetch': UserController.getOrFetch,
    'UserController.getOrFetchDetails': UserController.getOrFetchDetails,
  };
  return Object.fromEntries(
    Object.entries(readers).flatMap(([name, reader]) => {
      const { calls } = vi.mocked(reader).mock;
      return calls.length > 0 ? [[name, calls]] : [];
    }),
  );
}

describe('useContextualBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useContextualBannerStore.setState({ visible: false });
    setAuth(AuthStatus.UNAUTHENTICATED);
    mocks.pulseConsent.mockReturnValue('unavailable');
    mocks.keyboardVisible.mockReturnValue(false);
    servePosts({});
    serveUsers({});
  });

  afterEach(() => {
    vi.useRealTimers();
    // The banner only observes rows the page loads itself; it must never own a network read. Reset
    // before asserting: a throwing afterEach skips the setup file's cleanup and clearAllMocks, which
    // would leave this hook mounted and turn one failure into a failure of every later test.
    const networkCalls = networkReadCalls();
    cleanup();
    vi.clearAllMocks();
    expect(networkCalls).toEqual({});
  });

  describe('visibility', () => {
    it('reveals the banner to a guest 10 s after opening a post and mirrors it into the store', async () => {
      const { result, unmount } = renderBanner(POST_A_PATH);
      expect(result.current.visible).toBe(false);

      await advance(DELAY_MS - 1);
      expect(result.current.visible).toBe(false);
      expect(storeVisible()).toBe(false);

      await advance(1);
      expect(result.current.visible).toBe(true);
      expect(storeVisible()).toBe(true);

      unmount();
      expect(storeVisible()).toBe(false);
    });

    it.each([
      ['an authenticated user', AuthStatus.AUTHENTICATED, false],
      ['a user who still has to create a profile', AuthStatus.NEEDS_PROFILE_CREATION, false],
      ['a visitor whose auth status is still loading', AuthStatus.UNAUTHENTICATED, true],
    ])('never shows for %s on any shared page and issues no read', async (_who, status, isLoading) => {
      setAuth(status, isLoading);
      servePosts({ [POST_A_ID]: shortPostA, [COLLECTION_ID]: collectionPost });
      serveUsers({ [ALICE]: alice, [BOB]: bob });
      const { result, navigate } = renderBanner(POST_A_PATH);

      // Each shared page kind enables a different read (post + author, profile owner, collection).
      for (const pathname of [POST_A_PATH, PROFILE_PATH, COLLECTION_PATH]) {
        navigate(pathname);
        await advance(2 * DELAY_MS);

        expect(result.current.visible).toBe(false);
        expect(storeVisible()).toBe(false);
        expect(result.current.copy).toEqual(GENERIC);
      }
      expect(PostController.getDetails).not.toHaveBeenCalled();
      expect(UserController.getDetails).not.toHaveBeenCalled();
    });

    it('starts the delay once the auth status resolves to a guest', async () => {
      setAuth(AuthStatus.UNAUTHENTICATED, true);
      const { result, update } = renderBanner(POST_A_PATH);
      await advance(3_000);

      setAuth(AuthStatus.UNAUTHENTICATED);
      update();
      await advance(DELAY_MS - 1);
      expect(result.current.visible).toBe(false);

      await advance(1);
      expect(result.current.visible).toBe(true);
    });

    it('hides the banner and clears the store when the guest signs in', async () => {
      const { result, update } = renderBanner(POST_A_PATH);
      await advance(DELAY_MS);
      expect(result.current.visible).toBe(true);

      setAuth(AuthStatus.AUTHENTICATED);
      update();

      expect(result.current.visible).toBe(false);
      expect(storeVisible()).toBe(false);
    });

    it.each(['/home', '/shop', '/invite/code', `/profile/${ALICE}/followers`])(
      'never shows on %s and issues no read',
      async (pathname) => {
        const { result } = renderBanner(pathname);

        await advance(2 * DELAY_MS);

        expect(result.current.visible).toBe(false);
        expect(storeVisible()).toBe(false);
        expect(PostController.getDetails).not.toHaveBeenCalled();
        expect(UserController.getDetails).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['a profile', PROFILE_PATH],
      ['a collection', COLLECTION_PATH],
    ])('also reveals on %s', async (_kind, pathname) => {
      const { result } = renderBanner(pathname);

      await advance(DELAY_MS);

      expect(result.current.visible).toBe(true);
      expect(storeVisible()).toBe(true);
    });
  });

  describe('Pulse consent', () => {
    it('waits while the first-visit consent prompt is unanswered', async () => {
      mocks.pulseConsent.mockReturnValue(null);
      const { result } = renderBanner(POST_A_PATH);

      await advance(2 * DELAY_MS);

      expect(result.current.visible).toBe(false);
      expect(storeVisible()).toBe(false);
    });

    it.each<PulseConsent>(['declined', 'accepted'])(
      'appears immediately once the visitor answers %s after the delay',
      async (answer) => {
        mocks.pulseConsent.mockReturnValue(null);
        const { result, update } = renderBanner(POST_A_PATH);
        await advance(DELAY_MS);
        expect(result.current.visible).toBe(false);

        mocks.pulseConsent.mockReturnValue(answer);
        update();

        expect(result.current.visible).toBe(true);
        expect(storeVisible()).toBe(true);
      },
    );

    it('does not appear early when the visitor answers before the delay', async () => {
      mocks.pulseConsent.mockReturnValue(null);
      const { result, update } = renderBanner(POST_A_PATH);
      await advance(4_000);

      mocks.pulseConsent.mockReturnValue('declined');
      update();
      expect(result.current.visible).toBe(false);

      await advance(DELAY_MS - 4_000);
      expect(result.current.visible).toBe(true);
    });

    it('does not wait when Pulse is unavailable', async () => {
      mocks.pulseConsent.mockReturnValue('unavailable');
      const { result } = renderBanner(POST_A_PATH);

      await advance(DELAY_MS - 1);
      expect(result.current.visible).toBe(false);
      await advance(1);
      expect(result.current.visible).toBe(true);
    });
  });

  describe('soft keyboard', () => {
    it('hides while the keyboard is open and comes back when it closes', async () => {
      const { result, update } = renderBanner(POST_A_PATH);
      await advance(DELAY_MS);
      expect(result.current.visible).toBe(true);

      mocks.keyboardVisible.mockReturnValue(true);
      update();
      expect(result.current.visible).toBe(false);
      expect(storeVisible()).toBe(false);

      mocks.keyboardVisible.mockReturnValue(false);
      update();
      expect(result.current.visible).toBe(true);
      expect(storeVisible()).toBe(true);
    });

    it('stays hidden at the reveal while the keyboard is open', async () => {
      mocks.keyboardVisible.mockReturnValue(true);
      const { result, update } = renderBanner(POST_A_PATH);
      await advance(DELAY_MS);
      expect(result.current.visible).toBe(false);

      mocks.keyboardVisible.mockReturnValue(false);
      update();
      expect(result.current.visible).toBe(true);
    });
  });

  describe('reveal timer', () => {
    it('keeps the running delay when the guest moves between shared pages', async () => {
      const { result, navigate } = renderBanner(POST_A_PATH);
      await advance(6_000);

      navigate(PROFILE_PATH);
      await advance(DELAY_MS - 6_000 - 1);
      expect(result.current.visible).toBe(false);

      await advance(1);
      expect(result.current.visible).toBe(true);
    });

    it('cancels the delay when the guest leaves early and starts a fresh one on return', async () => {
      const { result, navigate } = renderBanner(POST_A_PATH);
      await advance(6_000);

      navigate('/home');
      await advance(DELAY_MS - 6_000);
      expect(result.current.visible).toBe(false);
      await advance(2 * DELAY_MS);
      expect(result.current.visible).toBe(false);

      navigate(POST_A_PATH);
      await advance(DELAY_MS - 1);
      expect(result.current.visible).toBe(false);
      await advance(1);
      expect(result.current.visible).toBe(true);
    });

    it('once revealed, hides off shared content and shows again immediately on return', async () => {
      const { result, navigate } = renderBanner(POST_A_PATH);
      await advance(DELAY_MS);
      expect(result.current.visible).toBe(true);

      navigate('/home');
      expect(result.current.visible).toBe(false);
      expect(storeVisible()).toBe(false);

      navigate(PROFILE_PATH);
      expect(result.current.visible).toBe(true);
      expect(storeVisible()).toBe(true);
    });
  });

  describe('copy', () => {
    it('is generic until the post and author reads settle, then contextual', async () => {
      const post = Promise.withResolvers<EnrichedPostDetails | null>();
      const user = Promise.withResolvers<NexusUserDetails | null>();
      servePosts({ [POST_A_ID]: post.promise });
      serveUsers({ [ALICE]: user.promise });
      const { result } = renderBanner(POST_A_PATH);
      expect(result.current.copy).toEqual(GENERIC);

      await settleReads();
      expect(PostController.getDetails).toHaveBeenCalledWith({ compositeId: POST_A_ID });
      expect(UserController.getDetails).toHaveBeenCalledWith({ userId: ALICE });
      expect(result.current.copy).toEqual(GENERIC);

      post.resolve(shortPostA);
      user.resolve(alice);
      await settleReads();
      expect(result.current.copy).toEqual(postCopy('Alice'));
    });

    it('stays generic when the rows are not in the local database', async () => {
      const { result } = renderBanner(POST_A_PATH);

      await settleReads();

      expect(PostController.getDetails).toHaveBeenCalledWith({ compositeId: POST_A_ID });
      expect(result.current.copy).toEqual(GENERIC);
    });

    it('reads only the profile owner on a profile route', async () => {
      serveUsers({ [BOB]: bob });
      const { result } = renderBanner(PROFILE_PATH);

      await settleReads();

      expect(UserController.getDetails).toHaveBeenCalledTimes(1);
      expect(UserController.getDetails).toHaveBeenCalledWith({ userId: BOB });
      expect(PostController.getDetails).not.toHaveBeenCalled();
      expect(result.current.copy).toEqual(profileCopy('Bob'));
    });

    it('reads only the collection post on a collection route', async () => {
      servePosts({ [COLLECTION_ID]: collectionPost });
      const { result } = renderBanner(COLLECTION_PATH);

      await settleReads();

      expect(PostController.getDetails).toHaveBeenCalledTimes(1);
      expect(PostController.getDetails).toHaveBeenCalledWith({ compositeId: COLLECTION_ID });
      expect(UserController.getDetails).not.toHaveBeenCalled();
      expect(result.current.copy).toEqual(collectionCopy(COLLECTION_NAME));
    });

    it('upgrades to contextual copy when the page saves the row after the first read', async () => {
      // Real timers, real Dexie (fake-indexeddb) and the real local read behind the mock: the banner
      // must keep observing the table, so a row the page's own fetch saves later reaches the copy
      // without another navigation. A one-shot read would stay generic here.
      vi.useRealTimers();
      const actual = await vi.importActual<typeof import('@/controllers/user/user')>('@/controllers/user/user');
      const reads: (NexusUserDetails | null)[] = [];
      vi.mocked(UserController.getDetails).mockImplementation(async (params) => {
        const row = await actual.UserController.getDetails(params);
        reads.push(row);
        return row;
      });
      const { result } = renderBanner(PROFILE_PATH);

      // The first read has settled on an empty table before the row is written.
      await waitFor(() => expect(reads).toEqual([null]));
      expect(result.current.copy).toEqual(GENERIC);

      await act(() => UserDetailsModel.table.put(bob));

      await waitFor(() => expect(result.current.copy).toEqual(profileCopy('Bob')));
      expect(reads).toEqual([null, expect.objectContaining({ id: BOB, name: 'Bob' })]);
    });
  });

  describe('keyed snapshots', () => {
    it('relies on useLiveQuery keeping its previous result while new deps load', async () => {
      const pendingB = Promise.withResolvers<string>();
      const { result, rerender } = renderHook(
        ({ key }: { key: string }) =>
          useLiveQuery(() => (key === 'a' ? Promise.resolve('a') : pendingB.promise), [key]),
        { initialProps: { key: 'a' } },
      );
      await settleReads();
      expect(result.current).toBe('a');

      rerender({ key: 'b' });
      await settleReads();
      expect(result.current).toBe('a');

      pendingB.resolve('b');
      await settleReads();
      expect(result.current).toBe('b');
    });

    it.each(['post', 'user'] as const)(
      'never shows post A data on post B while B loads (B %s read settles first)',
      async (first) => {
        const postB = Promise.withResolvers<EnrichedPostDetails | null>();
        const userB = Promise.withResolvers<NexusUserDetails | null>();
        servePosts({ [POST_A_ID]: articlePostA, [POST_B_ID]: postB.promise });
        serveUsers({ [ALICE]: alice, [BOB]: userB.promise });
        const { result, navigate } = renderBanner(POST_A_PATH);
        await settleReads();
        expect(result.current.copy).toEqual(articleCopy(ARTICLE_TITLE, 'Alice'));

        navigate(POST_B_PATH);
        expect(result.current.copy).toEqual(GENERIC);

        await settleReads();
        expect(PostController.getDetails).toHaveBeenLastCalledWith({ compositeId: POST_B_ID });
        expect(UserController.getDetails).toHaveBeenLastCalledWith({ userId: BOB });
        expect(result.current.copy).toEqual(GENERIC);

        // Joint readiness: one settled read for B must not meet A's retained row for the other.
        if (first === 'post') postB.resolve(shortPostB);
        else userB.resolve(bob);
        await settleReads();
        expect(result.current.copy).toEqual(GENERIC);

        if (first === 'post') userB.resolve(bob);
        else postB.resolve(shortPostB);
        await settleReads();
        expect(result.current.copy).toEqual(postCopy('Bob'));
      },
    );

    it('never shows post A data on another post by the same author while it loads', async () => {
      const replyA = Promise.withResolvers<EnrichedPostDetails | null>();
      servePosts({ [POST_A_ID]: articlePostA, [REPLY_A_ID]: replyA.promise });
      serveUsers({ [ALICE]: alice });
      const { result, navigate } = renderBanner(POST_A_PATH);
      await settleReads();
      expect(result.current.copy).toEqual(articleCopy(ARTICLE_TITLE, 'Alice'));

      // The author read keeps its key and stays settled; only the post read is pending, and the
      // retained article row must not lend its title to the reply.
      navigate(REPLY_A_PATH);
      expect(result.current.copy).toEqual(GENERIC);
      await settleReads();
      expect(PostController.getDetails).toHaveBeenLastCalledWith({ compositeId: REPLY_A_ID });
      expect(result.current.copy).toEqual(GENERIC);

      replyA.resolve(makePost(REPLY_A_ID));
      await settleReads();
      expect(result.current.copy).toEqual(postCopy('Alice'));
    });

    it('shows generic copy on a malformed post URL and never reads its id', async () => {
      servePosts({ [POST_A_ID]: articlePostA });
      serveUsers({ [ALICE]: alice });
      const { result, navigate } = renderBanner(POST_A_PATH);
      await settleReads();
      expect(result.current.copy).toEqual(articleCopy(ARTICLE_TITLE, 'Alice'));

      navigate(MALFORMED_POST_PATH);
      expect(result.current.copy).toEqual(GENERIC);
      await settleReads();
      expect(result.current.copy).toEqual(GENERIC);

      expect(PostController.getDetails).toHaveBeenCalledTimes(1);
      expect(PostController.getDetails).not.toHaveBeenCalledWith({
        compositeId: buildCompositeId({ pubky: 'not-a-pubky', id: 'x' }),
      });
      expect(UserController.getDetails).toHaveBeenCalledTimes(1);
      expect(UserController.getDetails).not.toHaveBeenCalledWith({ userId: 'not-a-pubky' });

      // A malformed post URL is still a guest-browsable page: the banner shows there with generic copy.
      await advance(DELAY_MS);
      expect(result.current.visible).toBe(true);
    });

    it('does not resurface a previous page when reads re-enable for a guest', async () => {
      const postB = Promise.withResolvers<EnrichedPostDetails | null>();
      const userB = Promise.withResolvers<NexusUserDetails | null>();
      servePosts({ [POST_A_ID]: articlePostA, [POST_B_ID]: postB.promise });
      serveUsers({ [ALICE]: alice, [BOB]: userB.promise });
      const { result, navigate, update } = renderBanner(POST_A_PATH);
      await settleReads();
      expect(result.current.copy).toEqual(articleCopy(ARTICLE_TITLE, 'Alice'));

      // Signed in on A, moved to B, signed out on B — with no read in between, so the live queries
      // still hold A's rows when the guest reads re-enable for B.
      setAuth(AuthStatus.AUTHENTICATED);
      update();
      expect(result.current.copy).toEqual(GENERIC);
      navigate(POST_B_PATH);
      setAuth(AuthStatus.UNAUTHENTICATED);
      update();
      expect(result.current.copy).toEqual(GENERIC);

      await settleReads();
      expect(result.current.copy).toEqual(GENERIC);

      postB.resolve(shortPostB);
      userB.resolve(bob);
      await settleReads();
      expect(result.current.copy).toEqual(postCopy('Bob'));
    });
  });

  describe('read failures', () => {
    const failures = [
      {
        reader: 'PostController.getDetails',
        pathname: POST_A_PATH,
        key: POST_A_ID,
        fail: (error: Error) => {
          vi.mocked(PostController.getDetails).mockRejectedValue(error);
          serveUsers({ [ALICE]: alice });
        },
      },
      {
        reader: 'UserController.getDetails (profile owner)',
        pathname: PROFILE_PATH,
        key: BOB,
        fail: (error: Error) => {
          vi.mocked(UserController.getDetails).mockRejectedValue(error);
        },
      },
      {
        reader: 'UserController.getDetails (post author)',
        pathname: POST_A_PATH,
        key: ALICE,
        fail: (error: Error) => {
          servePosts({ [POST_A_ID]: shortPostA });
          vi.mocked(UserController.getDetails).mockRejectedValue(error);
        },
      },
    ];

    it.each(failures)(
      '$reader rejecting with an AppError leaves generic copy and is not logged again',
      async ({ pathname, fail }) => {
        fail(appError());
        const { result } = renderBanner(pathname);

        await settleReads();
        expect(result.current.copy).toEqual(GENERIC);

        // The hook keeps rendering: the banner still reveals, with the generic copy.
        await advance(DELAY_MS);
        expect(result.current.visible).toBe(true);
        expect(result.current.copy).toEqual(GENERIC);
        expect(Logger.error).not.toHaveBeenCalled();
      },
    );

    it.each(failures)(
      '$reader rejecting with a plain Error leaves generic copy and logs it once',
      async ({ pathname, key, fail }) => {
        const error = new Error('IndexedDB went away');
        fail(error);
        const { result } = renderBanner(pathname);

        await settleReads();
        expect(result.current.copy).toEqual(GENERIC);

        await advance(DELAY_MS);
        expect(result.current.visible).toBe(true);
        expect(result.current.copy).toEqual(GENERIC);
        expect(Logger.error).toHaveBeenCalledTimes(1);
        expect(Logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ key, error }));
      },
    );
  });

  it('never calls a fetch controller method across a guest session', async () => {
    servePosts({ [POST_A_ID]: shortPostA, [COLLECTION_ID]: collectionPost });
    serveUsers({ [ALICE]: alice, [BOB]: bob });
    const { navigate } = renderBanner(POST_A_PATH);
    await advance(DELAY_MS);

    for (const pathname of [PROFILE_PATH, COLLECTION_PATH, POST_B_PATH, MALFORMED_POST_PATH, '/home']) {
      navigate(pathname);
      await advance(DELAY_MS);
    }

    expect(PostController.getDetails).toHaveBeenCalled();
    expect(UserController.getDetails).toHaveBeenCalled();
    expect(networkReadCalls()).toEqual({});
  });
});

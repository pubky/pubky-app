import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

/**
 * Re-locking an article through the real composer hooks (`usePostInput`, `usePost`, `usePostInputLock`)
 * and the real price dialog (`DialogLockContent`, `useLockContentForm`). The dialog's Apply goes through
 * react-hook-form's async `handleSubmit`, so `onApplied` empties the composer in a promise continuation,
 * outside React's click batch: that clear renders later, and the article body's 500 ms debounce can
 * fire in between (#3021). The debounce's own commit renders later too, so a switch or a Post click can
 * land after it fired and before the edited body reached the state (#3030).
 */

const mocks = vi.hoisted(() => ({
  fetchPaykitSetupStatus: vi.fn(),
  commitCreate: vi.fn(),
  applied: vi.fn(),
  // Handle into the stand-in editor, refreshed on every render. Null while no editor is mounted.
  editor: null as { markdown: string; change: (markdown: string) => void } | null,
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchPaykitSetupStatus: mocks.fetchPaykitSetupStatus, clearSession: vi.fn() },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: { commitCreate: mocks.commitCreate, getDetails: vi.fn() },
}));
vi.mock('@/stores/auth/auth.store', () => {
  const state = {
    currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    // Enough for `canActAsAccount`, so a Post reaches `commitCreate`
    session: { pubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' },
    isLoggingOut: false,
    restoreStatus: 'ready' as const,
    generation: 1,
    setShowSignInDialog: () => undefined,
  };
  const useAuthStore = Object.assign(
    (selector?: (authState: typeof state) => unknown) => (typeof selector === 'function' ? selector(state) : state),
    { getState: () => state },
  );
  return { useAuthStore };
});
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  // Null keeps PostHeader (db-backed) out of the render.
  useCurrentUserProfile: () => ({ currentUserPubky: null, userDetails: null }),
}));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({ useSessionNeedsUpgrade: () => false }));
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectIsLocksAuthenticated: () => true, selectIsPaykitConnected: () => true }),
  },
}));
vi.mock('@/config/network', () => ({
  getLockServer: () => 'lockpubky',
  getPaykitServerUrl: () => 'https://paykit.server',
}));
vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({ useBtcRate: () => ({ rate: null, status: 'ready' }) }));
vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: () => ({ lockFile: null, price: null }) }));
vi.mock('@/hooks/useMentionAutocomplete/useMentionAutocomplete', () => ({
  useMentionAutocomplete: () => ({
    users: [],
    isOpen: false,
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));

// Auth wrappers: pass straight through, always authenticated to pubky.app.
vi.mock('@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers', () => ({
  usePostInputAuthHandlers: (params: Record<string, (...args: never[]) => unknown>) => ({
    isAuthenticated: true,
    isWaiting: false,
    handleExpandWithAuth: params.handleExpand,
    handleSubmitWithAuth: params.handleSubmit,
    setTagsWithAuth: params.setTags,
    setAttachmentsWithAuth: params.setAttachments,
    handleChangeWithAuth: params.handleChange,
    handleFilesAddedWithAuth: params.handleFilesAdded,
    handleFileClickWithAuth: params.handleFileClick,
    handleEmojiSelectWithAuth: params.handleEmojiSelect,
    handlePasteWithAuth: params.handlePaste,
    handleDragEventWithAuth: vi.fn(),
    createKeyDownHandler: () => vi.fn(),
    handleArticleTitleChangeWithAuth: params.handleArticleTitleChange,
    handleArticleBodyChangeWithAuth: params.handleArticleBodyChange,
    handleArticleClickWithAuth: params.handleArticleClick,
  }),
}));

// The editor cannot run in jsdom. The stand-in reports changes the way rich text and markdown mode do.
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', async () => {
  const { useEffect } = await import('react');
  return {
    MarkdownEditor: (props: {
      markdown: string;
      onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
    }) => {
      mocks.editor = { markdown: props.markdown, change: (markdown) => props.onChange(markdown, false) };
      useEffect(
        () => () => {
          mocks.editor = null;
        },
        [],
      );
      return <div data-testid="editor">{props.markdown}</div>;
    },
  };
});

vi.mock('../PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: (props: {
    lockSwitch?: { checked: boolean; onCheckedChange: (checked: boolean) => void };
    onArticleClick: () => void;
    onSubmit?: () => void;
  }) => (
    <div>
      <button data-testid="article-button" onClick={props.onArticleClick} />
      <button data-testid="submit" onClick={() => props.onSubmit?.()} />
      {props.lockSwitch && (
        <button
          data-testid="lock-switch"
          onClick={() => props.lockSwitch?.onCheckedChange(!props.lockSwitch.checked)}
        />
      )}
    </div>
  ),
}));
// Pass-through spy on the real lock hook: tells the test the instant Apply reached the composer.
vi.mock('@/hooks/usePostInputLock/usePostInputLock', async (importActual) => {
  const actual = await importActual<typeof import('@/hooks/usePostInputLock/usePostInputLock')>();
  return {
    usePostInputLock: (...args: Parameters<typeof actual.usePostInputLock>) => {
      const lock = actual.usePostInputLock(...args);
      return {
        ...lock,
        handleLockApplied: (...applied: Parameters<typeof lock.handleLockApplied>) => {
          mocks.applied();
          return lock.handleLockApplied(...applied);
        },
      };
    },
  };
});
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({ DialogLocksAuth: () => null }));
vi.mock('@/molecules/LockedPostCard/LockedPostCard', () => ({ LockedPostCard: () => null }));
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({ PostInputAttachments: () => null }));
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({ PostPreviewCard: () => null }));
vi.mock('../PostHeader/PostHeader', () => ({ PostHeader: () => null }));

const DEBOUNCE_MS = 500;
const DRAFT_BODY = 'Draft article body';
const EDITED_BODY = 'The full article body, edited';

const reactAct = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
// Captured before the fake timers are installed: React's scheduler runs on real macrotasks.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const nextMacrotask = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0));

/** The public teaser: the composer textarea once the lock is applied. */
const teaser = () => (document.querySelector('[data-cy="post-input-textarea"]') as HTMLTextAreaElement | null)?.value;

const enterPrice = async (sats: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Bitcoin Amount', { selector: 'input' }), { target: { value: sats } });
  });
};

const clickApply = async () => {
  mocks.applied.mockClear();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
  });
  // react-hook-form validates asynchronously before calling `onApplied`
  for (let i = 0; i < 10 && mocks.applied.mock.calls.length === 0; i++) await act(async () => {});
  expect(mocks.applied).toHaveBeenCalledTimes(1);
};

/** Writes an article, locks it, then switches the lock off: the draft is back in the editor. */
const writeLockAndTurnOff = async () => {
  render(<PostInput variant={POST_INPUT_VARIANT.POST} expanded />);
  fireEvent.click(screen.getByTestId('article-button'));
  fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Essay' } });
  act(() => mocks.editor?.change(DRAFT_BODY));
  act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
  fireEvent.click(screen.getByTestId('lock-switch'));
  await enterPrice('1000');
  await clickApply();
  expect(mocks.editor).toBeNull();
  expect(teaser()).toBe('');

  fireEvent.click(screen.getByTestId('lock-switch'));
  expect(mocks.editor?.markdown).toBe(DRAFT_BODY);
};

/**
 * Edits the body, switches the lock on and clicks Apply `msBeforeApply` after the edit. The click runs
 * outside `act`, so React renders Apply's clear on a later macrotask, as in a browser. `beforeRender`
 * runs as soon as Apply has reached the composer.
 */
const editAndReapply = async (msBeforeApply: number, beforeRender: () => void) => {
  act(() => mocks.editor?.change(EDITED_BODY));
  act(() => vi.advanceTimersByTime(msBeforeApply));
  fireEvent.click(screen.getByTestId('lock-switch'));
  await enterPrice('2000');
  mocks.applied.mockClear();

  reactAct.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    (screen.getByRole('button', { name: 'Apply Lock' }) as HTMLButtonElement).click();
    for (let i = 0; i < 100 && mocks.applied.mock.calls.length === 0; i++) await Promise.resolve();
    expect(mocks.applied).toHaveBeenCalledTimes(1);
    beforeRender();
    // The editor unmounts in the same commit whose effects drop the pending article values
    for (let i = 0; i < 50 && mocks.editor; i++) await nextMacrotask();
  } finally {
    reactAct.IS_REACT_ACT_ENVIRONMENT = true;
  }
  expect(mocks.editor).toBeNull();
  // Any commit still on its timer fires now
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
  });
};

/** Switching the lock off puts the locked draft back in the editor. */
const lockedBody = () => {
  fireEvent.click(screen.getByTestId('lock-switch'));
  return mocks.editor?.markdown;
};

/**
 * Edits the body, fires its debounce and clicks `testId` in the same turn: React has not rendered the
 * debounce's `setContent` yet.
 */
const clickBeforeBodyCommitRenders = async (testId: string) => {
  act(() => mocks.editor?.change(EDITED_BODY));
  reactAct.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    vi.advanceTimersByTime(DEBOUNCE_MS);
    (screen.getByTestId(testId) as HTMLButtonElement).click();
  } finally {
    reactAct.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await act(async () => {});
};

describe('PostInput - re-locking an article right after editing its body (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPaykitSetupStatus.mockResolvedValue('ready');
    mocks.commitCreate.mockResolvedValue('created-post-id');
    mocks.editor = null;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    reactAct.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('keeps the edited body out of the teaser when its debounce fires before Apply has rendered', async () => {
    await writeLockAndTurnOff();
    // The debounce is due 50 ms after Apply, and fires while Apply's clear is still unrendered
    await editAndReapply(DEBOUNCE_MS - 50, () => vi.advanceTimersByTime(100));

    expect(teaser()).toBe('');
    expect(lockedBody()).toBe(EDITED_BODY);
  });

  it('keeps the teaser empty when the debounce fired before Apply', async () => {
    await writeLockAndTurnOff();
    await editAndReapply(DEBOUNCE_MS + 200, () => {});

    expect(teaser()).toBe('');
    expect(lockedBody()).toBe(EDITED_BODY);
  });

  it('keeps the teaser empty when the debounce is due only after Apply has rendered', async () => {
    await writeLockAndTurnOff();
    await editAndReapply(DEBOUNCE_MS - 50, () => {});

    expect(teaser()).toBe('');
    expect(lockedBody()).toBe(EDITED_BODY);
  });

  describe('clicked after the body debounce fired, before its commit rendered (#3030)', () => {
    it('locks the edited body when the switch is turned on', async () => {
      await writeLockAndTurnOff();
      await clickBeforeBodyCommitRenders('lock-switch');

      expect(lockedBody()).toBe(EDITED_BODY);
    });

    it('publishes the edited body when Post is clicked with the lock off', async () => {
      await writeLockAndTurnOff();
      await clickBeforeBodyCommitRenders('submit');

      expect(mocks.commitCreate).toHaveBeenCalledTimes(1);
      const content = String(mocks.commitCreate.mock.calls[0]?.[0]?.content);
      expect(content).toContain(EDITED_BODY);
      expect(content).not.toContain(DRAFT_BODY);
    });
  });
});

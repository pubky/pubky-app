import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

/**
 * Repro for the lock-on debounce window suspected after the #3025 e2e failure
 * (run 41451114951): the body debounce has cleared `pendingArticleBodyRef` and
 * called `setContent`, but React has not committed that update, so
 * `captureComposer` / `handleSubmit` read `pending ?? content` as the previous
 * body.
 *
 * The #3021 control is the same sequence as PR #3022's relock test: Apply
 * empties the composer, and the body debounce fires before that clear renders.
 * These tests assert the behaviour a creator should see. They are not a fix.
 */

const mocks = vi.hoisted(() => ({
  fetchPaykitSetupStatus: vi.fn(),
  commitCreate: vi.fn(),
  applied: vi.fn(),
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
    // Enough for `canActAsAccount`, so a submit in the window reaches `commitCreate`.
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
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
  });
  for (let i = 0; i < 10 && mocks.editor; i++) await act(async () => {});
};

/** Writes an article and lets the title and body debounces commit. */
const writeArticle = () => {
  render(<PostInput variant={POST_INPUT_VARIANT.POST} expanded />);
  fireEvent.click(screen.getByTestId('article-button'));
  fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Essay' } });
  act(() => mocks.editor?.change(DRAFT_BODY));
  act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
};

/** Writes an article, locks it, then switches the lock off: the draft is back in the editor. */
const writeLockAndTurnOff = async () => {
  writeArticle();
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
 * runs once Apply has reached the composer and before React rendered it.
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
    expect(mocks.editor).not.toBeNull();
    beforeRender();
    for (let i = 0; i < 50 && mocks.editor; i++) await nextMacrotask();
  } finally {
    reactAct.IS_REACT_ACT_ENVIRONMENT = true;
  }
  expect(mocks.editor).toBeNull();
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
 * Runs the body debounce callback and, still in that same turn, performs `action`
 * before React's scheduled render. `setContent` from the callback is queued as a
 * microtask (`scheduleMicrotask` in react-dom); it does not run until this turn ends.
 */
const actInUncommittedDebounceWindow = (action: () => void) => {
  act(() => mocks.editor?.change(EDITED_BODY));
  vi.advanceTimersByTime(DEBOUNCE_MS);
  action();
};

describe('PostInput article lock capture around the body debounce', () => {
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

  describe('control: re-locking inside the body debounce (#3021)', () => {
    it('keeps the edited body out of the teaser when its debounce fires before Apply has rendered', async () => {
      await writeLockAndTurnOff();
      await editAndReapply(DEBOUNCE_MS - 50, () => vi.advanceTimersByTime(100));

      expect(teaser()).toBe('');
      expect(lockedBody()).toBe(EDITED_BODY);
    });
  });

  describe('hypothesis: debounce callback has run, setContent has not committed', () => {
    it('captures the edited body when the lock is turned on in that window', async () => {
      const captured: Array<string | undefined> = [];
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await writeLockAndTurnOff();
        actInUncommittedDebounceWindow(() => {
          (screen.getByTestId('lock-switch') as HTMLButtonElement).click();
        });
        await act(async () => {});
        captured.push(lockedBody());
        cleanup();
      }

      expect(captured, `captured bodies: ${captured.join(' | ')}`).toEqual(Array(10).fill(EDITED_BODY));
    });

    it('submits the edited body when Post is clicked in that window', async () => {
      writeArticle();
      actInUncommittedDebounceWindow(() => {
        (screen.getByTestId('submit') as HTMLButtonElement).click();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(mocks.commitCreate).toHaveBeenCalled();
      const content = String(mocks.commitCreate.mock.calls[0]?.[0]?.content);
      expect(content, `submitted content: ${content}`).toContain(EDITED_BODY);
      expect(content).not.toContain(DRAFT_BODY);
    });
  });

  describe('windows on either side of the hypothesis', () => {
    it('captures the edited body when the lock is turned on before the debounce fires', async () => {
      await writeLockAndTurnOff();
      act(() => mocks.editor?.change(EDITED_BODY));
      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(lockedBody()).toBe(EDITED_BODY);
    });

    it('captures the edited body when the debounce has committed before the lock is turned on', async () => {
      await writeLockAndTurnOff();
      act(() => mocks.editor?.change(EDITED_BODY));
      act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
      expect(mocks.editor?.markdown).toBe(EDITED_BODY);
      fireEvent.click(screen.getByTestId('lock-switch'));

      expect(lockedBody()).toBe(EDITED_BODY);
    });
  });
});

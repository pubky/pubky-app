import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClipboardEvent, mockDragEvent, mockKeyboardEvent } from '@/test-utils/react-events';
import { usePostInputAuthHandlers } from './usePostInputAuthHandlers';
import type { UsePostInputAuthHandlersOptions } from './usePostInputAuthHandlers.types';

const mockCurrentUserPubky = vi.hoisted(() => ({ value: null as string | null }));
const mockSetShowSignInDialog = vi.hoisted(() => vi.fn());

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string | null }) => unknown) =>
      selector({ currentUserPubky: mockCurrentUserPubky.value }),
    {
      getState: () => ({
        currentUserPubky: mockCurrentUserPubky.value,
        setShowSignInDialog: mockSetShowSignInDialog,
      }),
    },
  ),
}));

function createOptions(overrides: Partial<UsePostInputAuthHandlersOptions> = {}): UsePostInputAuthHandlersOptions {
  return {
    handleExpand: vi.fn(),
    handleSubmit: vi.fn(async () => {}),
    setTags: vi.fn(),
    setAttachments: vi.fn(),
    handleChange: vi.fn(),
    handleFilesAdded: vi.fn(),
    handleFileClick: vi.fn(),
    handleEmojiSelect: vi.fn(),
    handlePaste: vi.fn(),
    ...overrides,
  };
}

describe('usePostInputAuthHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky.value = null;
  });

  describe('guarded handlers (setters / params)', () => {
    it('blocks the handler and opens the sign-in dialog for guests', () => {
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.setTagsWithAuth(['tag']);
      });

      expect(options.setTags).not.toHaveBeenCalled();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });

    it('calls the handler and does not open the dialog when authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.setTagsWithAuth(['tag']);
      });

      expect(options.setTags).toHaveBeenCalledWith(['tag']);
      expect(mockSetShowSignInDialog).not.toHaveBeenCalled();
    });
  });

  describe('void actions (requireAuth)', () => {
    it('runs the underlying action when authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.handleSubmitWithAuth();
      });

      expect(options.handleSubmit).toHaveBeenCalledTimes(1);
      expect(mockSetShowSignInDialog).not.toHaveBeenCalled();
    });

    it('opens the sign-in dialog for guests', () => {
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.handleSubmitWithAuth();
      });

      expect(options.handleSubmit).not.toHaveBeenCalled();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('handlePasteWithAuth', () => {
    it('prevents default and opens the dialog for guests', () => {
      const preventDefault = vi.fn();
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.handlePasteWithAuth(mockClipboardEvent({ preventDefault }));
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(options.handlePaste).not.toHaveBeenCalled();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });

    it('calls the underlying paste handler when authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const preventDefault = vi.fn();
      const options = createOptions();
      const { result } = renderHook(() => usePostInputAuthHandlers(options));

      act(() => {
        result.current.handlePasteWithAuth(mockClipboardEvent({ preventDefault }));
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(options.handlePaste).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleDragEventWithAuth', () => {
    it('prevents default, stops propagation and opens the dialog for guests', () => {
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const handler = vi.fn();
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));

      act(() => {
        result.current.handleDragEventWithAuth(mockDragEvent({ preventDefault, stopPropagation }), handler);
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(handler).not.toHaveBeenCalled();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });

    it('delegates to the provided handler when authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const handler = vi.fn();
      const event = mockDragEvent();
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));

      act(() => {
        result.current.handleDragEventWithAuth(event, handler);
      });

      expect(handler).toHaveBeenCalledWith(event);
      expect(mockSetShowSignInDialog).not.toHaveBeenCalled();
    });
  });

  describe('createKeyDownHandler', () => {
    it('prevents default and opens the dialog for guests', () => {
      const preventDefault = vi.fn();
      const handleMentionKeyDown = vi.fn(() => false);
      const enterSubmitHandler = vi.fn();
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));
      const onKeyDown = result.current.createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

      act(() => {
        onKeyDown(mockKeyboardEvent<HTMLTextAreaElement>({ preventDefault }));
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(handleMentionKeyDown).not.toHaveBeenCalled();
      expect(enterSubmitHandler).not.toHaveBeenCalled();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });

    it('lets the mention popover consume the event before enter-submit', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const handleMentionKeyDown = vi.fn(() => true);
      const enterSubmitHandler = vi.fn();
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));
      const onKeyDown = result.current.createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

      act(() => {
        onKeyDown(mockKeyboardEvent<HTMLTextAreaElement>());
      });

      expect(handleMentionKeyDown).toHaveBeenCalledTimes(1);
      expect(enterSubmitHandler).not.toHaveBeenCalled();
    });

    it('falls through to enter-submit when the mention popover does not consume', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const handleMentionKeyDown = vi.fn(() => false);
      const enterSubmitHandler = vi.fn();
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));
      const onKeyDown = result.current.createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

      act(() => {
        onKeyDown(mockKeyboardEvent<HTMLTextAreaElement>());
      });

      expect(handleMentionKeyDown).toHaveBeenCalledTimes(1);
      expect(enterSubmitHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('article wrappers', () => {
    it('are omitted when the article handlers are not provided', () => {
      const { result } = renderHook(() => usePostInputAuthHandlers(createOptions()));

      expect(result.current.handleArticleTitleChangeWithAuth).toBeUndefined();
      expect(result.current.handleArticleBodyChangeWithAuth).toBeUndefined();
      expect(result.current.handleArticleClickWithAuth).toBeUndefined();
    });

    it('are present and guarded when the article handlers are provided', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const handleArticleClick = vi.fn();
      const handleArticleTitleChange = vi.fn();
      const handleArticleBodyChange = vi.fn();
      const { result } = renderHook(() =>
        usePostInputAuthHandlers(
          createOptions({ handleArticleClick, handleArticleTitleChange, handleArticleBodyChange }),
        ),
      );

      expect(result.current.handleArticleTitleChangeWithAuth).toBeDefined();
      expect(result.current.handleArticleBodyChangeWithAuth).toBeDefined();

      act(() => {
        result.current.handleArticleClickWithAuth?.();
      });

      expect(handleArticleClick).toHaveBeenCalledTimes(1);
    });
  });
});

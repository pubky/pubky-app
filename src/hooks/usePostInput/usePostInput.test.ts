import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePostInput } from './usePostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import {
  POST_MAX_CHARACTER_LENGTH,
  ARTICLE_TITLE_MAX_CHARACTER_LENGTH,
  POST_ATTACHMENT_MAX_FILES,
  ARTICLE_ATTACHMENT_MAX_FILES,
} from '@/config';

// next-intl is mocked globally in src/config/test.ts
// Real placeholders from messages/en.json for test assertions
const REAL_PLACEHOLDERS = {
  reply: 'Write a reply...',
  post: "What's on your mind?",
  repost: 'Optional comment',
  edit: 'Edit post',
};

// Mock usePost hook
const mockSetContent = vi.fn();
const mockSetTags = vi.fn();
const mockSetAttachments = vi.fn();
const mockSetIsArticle = vi.fn();
const mockSetArticleTitle = vi.fn();
const mockReply = vi.fn();
const mockPost = vi.fn();
const mockRepost = vi.fn();
const mockEdit = vi.fn();
let mockContent = '';
let mockTags: string[] = [];
let mockAttachments: File[] = [];
let mockIsArticle = false;
let mockArticleTitle = '';
let mockIsSubmitting = false;

const mockDeletePost = vi.fn();

vi.mock('@/hooks', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    currentUserPubky: 'test-user-pubky',
  })),
  usePost: vi.fn(() => ({
    content: mockContent,
    setContent: mockSetContent,
    tags: mockTags,
    setTags: mockSetTags,
    attachments: mockAttachments,
    setAttachments: mockSetAttachments,
    isArticle: mockIsArticle,
    setIsArticle: mockSetIsArticle,
    articleTitle: mockArticleTitle,
    setArticleTitle: mockSetArticleTitle,
    reply: mockReply,
    post: mockPost,
    repost: mockRepost,
    edit: mockEdit,
    isSubmitting: mockIsSubmitting,
  })),
  useEmojiInsert: vi.fn(() => vi.fn()),
  useUserDetails: vi.fn(() => ({
    userDetails: { name: 'Test Author' },
    isLoading: false,
  })),
  useDeletePost: vi.fn(() => ({
    deletePost: mockDeletePost,
    isDeleting: false,
  })),
}));

// Mock TimelineFeed context
const mockPrependPosts = vi.fn();
vi.mock('@/organisms/TimelineFeed/TimelineFeed', () => ({
  useTimelineFeedContext: vi.fn(() => ({
    prependPosts: mockPrependPosts,
    removePosts: vi.fn(),
  })),
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: vi.fn(() => ({
    toast: mockToast,
  })),
}));

describe('usePostInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContent = '';
    mockTags = [];
    mockAttachments = [];
    mockIsArticle = false;
    mockArticleTitle = '';
    mockIsSubmitting = false;
    mockRepost.mockClear();
    mockEdit.mockClear();
  });

  describe('initial state', () => {
    it('returns initial state with collapsed mode by default', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.isExpanded).toBe(false);
      expect(result.current.showEmojiPicker).toBe(false);
      expect(result.current.hasContent).toBe(false);
      expect(result.current.isDragging).toBe(false);
      expect(result.current.currentUserPubky).toBe('test-user-pubky');
    });

    it('returns initial state with expanded mode when expanded=true', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: true,
        }),
      );

      expect(result.current.isExpanded).toBe(true);
    });

    it('returns correct refs', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.textareaRef).toBeDefined();
      expect(result.current.markdownEditorRef).toBeDefined();
      expect(result.current.containerRef).toBeDefined();
      expect(result.current.fileInputRef).toBeDefined();
      expect(result.current.textareaRef.current).toBeNull();
      expect(result.current.markdownEditorRef.current).toBeNull();
      expect(result.current.containerRef.current).toBeNull();
      expect(result.current.fileInputRef.current).toBeNull();
    });
  });

  describe('displayPlaceholder', () => {
    it('uses default placeholder for post variant', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.displayPlaceholder).toBe(REAL_PLACEHOLDERS[POST_INPUT_VARIANT.POST]);
    });

    it('uses default placeholder for reply variant', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'reply',
          postId: 'test-post-id',
        }),
      );

      expect(result.current.displayPlaceholder).toBe(REAL_PLACEHOLDERS[POST_INPUT_VARIANT.REPLY]);
    });

    it('uses default placeholder for repost variant', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'repost',
          originalPostId: 'test-post-id',
        }),
      );

      expect(result.current.displayPlaceholder).toBe(REAL_PLACEHOLDERS[POST_INPUT_VARIANT.REPOST]);
    });

    it('uses custom placeholder when provided', () => {
      const customPlaceholder = 'Custom placeholder text';
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          placeholder: customPlaceholder,
        }),
      );

      expect(result.current.displayPlaceholder).toBe(customPlaceholder);
    });
  });

  describe('handleExpand', () => {
    it('expands when not already expanded', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.isExpanded).toBe(false);

      act(() => {
        result.current.handleExpand();
      });

      expect(result.current.isExpanded).toBe(true);
    });

    it('does not change state when already expanded', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: true,
        }),
      );

      expect(result.current.isExpanded).toBe(true);

      act(() => {
        result.current.handleExpand();
      });

      expect(result.current.isExpanded).toBe(true);
    });
  });

  describe('handleChange', () => {
    it('calls setContent when value is within character limit', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const mockEvent = {
        target: { value: 'Hello world' },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleChange(mockEvent);
      });

      expect(mockSetContent).toHaveBeenCalledWith('Hello world');
    });

    it('does not call setContent when value exceeds character limit', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a string longer than POST_MAX_CHARACTER_LENGTH
      const longText = 'a'.repeat(POST_MAX_CHARACTER_LENGTH + 1);
      const mockEvent = {
        target: { value: longText },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleChange(mockEvent);
      });

      expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('allows exactly at the character limit', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a string exactly at POST_MAX_CHARACTER_LENGTH
      const exactLimitText = 'a'.repeat(POST_MAX_CHARACTER_LENGTH);
      const mockEvent = {
        target: { value: exactLimitText },
      } as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleChange(mockEvent);
      });

      expect(mockSetContent).toHaveBeenCalledWith(exactLimitText);
    });
  });

  describe('handleSubmit', () => {
    it('calls post method for post variant', async () => {
      mockContent = 'Test post content';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).toHaveBeenCalledWith({
        onSuccess: expect.any(Function),
      });
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('calls reply method for reply variant with postId', async () => {
      mockContent = 'Test reply content';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'reply',
          postId: 'parent-post-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockReply).toHaveBeenCalledWith({
        postId: 'parent-post-id',
        onSuccess: expect.any(Function),
      });
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockRepost).not.toHaveBeenCalled();
    });

    it('calls repost method for repost variant with originalPostId', async () => {
      mockContent = 'Test repost content';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'repost',
          originalPostId: 'original-post-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockRepost).toHaveBeenCalledWith({
        originalPostId: 'original-post-id',
        originalAuthorName: 'Test Author',
        onSuccess: expect.any(Function),
        onUndo: expect.any(Function),
      });
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockReply).not.toHaveBeenCalled();
      expect(mockEdit).not.toHaveBeenCalled();
    });

    it('calls edit method for edit variant with editPostId', async () => {
      mockContent = 'Updated post content';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'edit',
          editPostId: 'post-to-edit-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockEdit).toHaveBeenCalledWith({
        editPostId: 'post-to-edit-id',
        onSuccess: expect.any(Function),
      });
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockReply).not.toHaveBeenCalled();
      expect(mockRepost).not.toHaveBeenCalled();
    });

    it('does not submit edit when content is empty', async () => {
      mockContent = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'edit',
          editPostId: 'post-to-edit-id',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockEdit).not.toHaveBeenCalled();
    });

    it('does not submit edit when content is only whitespace', async () => {
      mockContent = '   \n\t  ';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'edit',
          editPostId: 'post-to-edit-id',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockEdit).not.toHaveBeenCalled();
    });

    it('allows repost with empty content', async () => {
      mockContent = '';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'repost',
          originalPostId: 'original-post-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockRepost).toHaveBeenCalledWith({
        originalPostId: 'original-post-id',
        originalAuthorName: 'Test Author',
        onSuccess: expect.any(Function),
        onUndo: expect.any(Function),
      });
    });

    it('does not submit when content is empty (for post variant)', async () => {
      mockContent = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
      expect(mockReply).not.toHaveBeenCalled();
    });

    it('does not submit when content is only whitespace', async () => {
      mockContent = '   \n\t  ';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does not submit when already submitting', async () => {
      mockContent = 'Test content';
      mockIsSubmitting = true;

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does not submit article when content is empty', async () => {
      mockContent = '';
      mockIsArticle = true;
      mockArticleTitle = 'Test Title';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does not submit article when title is empty', async () => {
      mockContent = 'Test content';
      mockIsArticle = true;
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does not submit article when title is only whitespace', async () => {
      mockContent = 'Test content';
      mockIsArticle = true;
      mockArticleTitle = '   \n\t  ';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('submits article when both content and title are provided', async () => {
      mockContent = 'Test content';
      mockIsArticle = true;
      mockArticleTitle = 'Test Title';

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPost).toHaveBeenCalledWith({
        onSuccess: expect.any(Function),
      });
    });

    it('calls onSuccess and prependPosts when submission succeeds for post variant', async () => {
      mockContent = 'Test content';
      mockPost.mockImplementation(async ({ onSuccess }) => {
        onSuccess('created-post-id');
      });

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPrependPosts).toHaveBeenCalledWith('created-post-id');
      expect(mockOnSuccess).toHaveBeenCalledWith('created-post-id');
    });

    it('calls onSuccess and prependPosts when submission succeeds for repost variant', async () => {
      mockContent = 'Test repost content';
      mockRepost.mockImplementation(async ({ onSuccess }) => {
        onSuccess('created-repost-id');
      });

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'repost',
          originalPostId: 'original-post-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockPrependPosts).toHaveBeenCalledWith('created-repost-id');
      expect(mockOnSuccess).toHaveBeenCalledWith('created-repost-id');
    });

    it('calls onSuccess but does NOT prependPosts for reply variant', async () => {
      mockContent = 'Test reply content';
      mockReply.mockImplementation(async ({ onSuccess }) => {
        onSuccess('created-reply-id');
      });

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'reply',
          postId: 'parent-post-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      // Reply should NOT prepend to timeline (fix for issue #601)
      expect(mockPrependPosts).not.toHaveBeenCalled();
      // But onSuccess should still be called
      expect(mockOnSuccess).toHaveBeenCalledWith('created-reply-id');
    });

    it('calls onSuccess but does NOT prependPosts for edit variant', async () => {
      mockContent = 'Updated post content';
      mockEdit.mockImplementation(async ({ onSuccess }) => {
        onSuccess('edited-post-id');
      });

      const mockOnSuccess = vi.fn();
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'edit',
          editPostId: 'post-to-edit-id',
          onSuccess: mockOnSuccess,
        }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      // Edit should NOT prepend to timeline
      expect(mockPrependPosts).not.toHaveBeenCalled();
      // But onSuccess should still be called
      expect(mockOnSuccess).toHaveBeenCalledWith('edited-post-id');
    });
  });

  describe('onContentChange callback', () => {
    it('calls onContentChange when content changes', () => {
      const mockOnContentChange = vi.fn();

      renderHook(() =>
        usePostInput({
          variant: 'post',
          onContentChange: mockOnContentChange,
        }),
      );

      // The effect runs on mount with initial content, tags, attachments, and articleTitle
      expect(mockOnContentChange).toHaveBeenCalledWith('', [], [], '');
    });

    it('calls onContentChange with updated content, tags, attachments, and articleTitle', () => {
      const mockOnContentChange = vi.fn();
      mockContent = 'Updated content';
      mockTags = ['tag1', 'tag2'];
      mockAttachments = [new File(['test'], 'test.png', { type: 'image/png' })];
      mockArticleTitle = 'Test Article Title';

      renderHook(() =>
        usePostInput({
          variant: 'post',
          onContentChange: mockOnContentChange,
        }),
      );

      expect(mockOnContentChange).toHaveBeenCalledWith(
        'Updated content',
        ['tag1', 'tag2'],
        mockAttachments,
        'Test Article Title',
      );
    });

    it('does not throw when onContentChange is not provided', () => {
      expect(() => {
        renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );
      }).not.toThrow();
    });
  });

  describe('onArticleModeChange callback', () => {
    it('calls onArticleModeChange when article mode changes', () => {
      const mockOnArticleModeChange = vi.fn();
      mockIsArticle = false;

      renderHook(() =>
        usePostInput({
          variant: 'post',
          onArticleModeChange: mockOnArticleModeChange,
        }),
      );

      // The effect runs on mount with initial isArticle value
      expect(mockOnArticleModeChange).toHaveBeenCalledWith(false);
    });

    it('calls onArticleModeChange with true when in article mode', () => {
      const mockOnArticleModeChange = vi.fn();
      mockIsArticle = true;

      renderHook(() =>
        usePostInput({
          variant: 'post',
          onArticleModeChange: mockOnArticleModeChange,
        }),
      );

      expect(mockOnArticleModeChange).toHaveBeenCalledWith(true);
    });

    it('does not throw when onArticleModeChange is not provided', () => {
      expect(() => {
        renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );
      }).not.toThrow();
    });
  });

  describe('hasContent derived value', () => {
    it('returns false when content is empty', () => {
      mockContent = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.hasContent).toBe(false);
    });

    it('returns false when content is only whitespace', () => {
      mockContent = '   \n\t  ';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.hasContent).toBe(false);
    });

    it('returns true when content has non-whitespace characters', () => {
      mockContent = 'Hello';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.hasContent).toBe(true);
    });
  });

  describe('showEmojiPicker state', () => {
    it('can toggle emoji picker visibility', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.showEmojiPicker).toBe(false);

      act(() => {
        result.current.setShowEmojiPicker(true);
      });

      expect(result.current.showEmojiPicker).toBe(true);

      act(() => {
        result.current.setShowEmojiPicker(false);
      });

      expect(result.current.showEmojiPicker).toBe(false);
    });
  });

  describe('click outside collapse behavior', () => {
    it('adds event listener when expanded prop is false', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('does not add event listener when expanded prop is true', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: true,
        }),
      );

      // Should not have mousedown listener for click outside
      const mousedownCalls = addEventListenerSpy.mock.calls.filter((call) => call[0] === 'mousedown');
      expect(mousedownCalls).toHaveLength(0);

      addEventListenerSpy.mockRestore();
    });

    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('collapses when clicking outside with no content', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside by dispatching mousedown event
      // The containerRef is null in tests, so any click is "outside"
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      expect(result.current.isExpanded).toBe(false);
    });

    it('does not collapse when clicking outside with content', () => {
      mockContent = 'Some content';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because there's content
      expect(result.current.isExpanded).toBe(true);
    });

    it('does not collapse when clicking outside with tags', () => {
      mockContent = '';
      mockTags = ['tag1'];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because there are tags
      expect(result.current.isExpanded).toBe(true);
    });

    it('does not collapse when clicking outside with attachments', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [new File(['test'], 'test.png', { type: 'image/png' })];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because there are attachments
      expect(result.current.isExpanded).toBe(true);
    });

    it('does not collapse when clicking outside with article title', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = 'My Article Title';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because there's an article title
      expect(result.current.isExpanded).toBe(true);
    });

    it('does not collapse when clicking outside with only whitespace content', () => {
      mockContent = '   \n\t  ';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      // Should collapse because whitespace-only content is treated as empty
      expect(result.current.isExpanded).toBe(false);
    });

    it('calls setIsArticle(false) when collapsing', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });

      // Reset mock to track calls after expand
      mockSetIsArticle.mockClear();

      // Simulate click outside
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        document.dispatchEvent(mousedownEvent);
      });

      expect(result.current.isExpanded).toBe(false);
      expect(mockSetIsArticle).toHaveBeenCalledWith(false);
    });

    it('does not collapse when clicking inside the container', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Create an element and set it as the container
      const container = document.createElement('div');
      const clickTarget = document.createElement('button');
      container.appendChild(clickTarget);
      document.body.appendChild(container);

      // Manually set the containerRef
      Object.defineProperty(result.current.containerRef, 'current', {
        value: container,
        writable: true,
      });

      // Simulate click inside the container
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        Object.defineProperty(mousedownEvent, 'target', { value: clickTarget });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because click is inside container
      expect(result.current.isExpanded).toBe(true);

      // Cleanup
      document.body.removeChild(container);
    });

    it('does not collapse when clicking inside MDXEditor popup', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Create MDXEditor popup element
      const mdxPopup = document.createElement('div');
      mdxPopup.className = 'mdxeditor-popup-container';
      const clickTarget = document.createElement('button');
      mdxPopup.appendChild(clickTarget);
      document.body.appendChild(mdxPopup);

      // Simulate click inside the MDXEditor popup
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        Object.defineProperty(mousedownEvent, 'target', { value: clickTarget });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because click is inside MDXEditor popup
      expect(result.current.isExpanded).toBe(true);

      // Cleanup
      document.body.removeChild(mdxPopup);
    });

    it('does not collapse when clicking inside a dialog', () => {
      mockContent = '';
      mockTags = [];
      mockAttachments = [];
      mockArticleTitle = '';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
          expanded: false,
        }),
      );

      // First expand
      act(() => {
        result.current.handleExpand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Create dialog element with data-slot attribute
      const dialog = document.createElement('div');
      dialog.setAttribute('data-slot', 'dialog-content');
      const clickTarget = document.createElement('button');
      dialog.appendChild(clickTarget);
      document.body.appendChild(dialog);

      // Simulate click inside the dialog
      act(() => {
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true });
        Object.defineProperty(mousedownEvent, 'target', { value: clickTarget });
        document.dispatchEvent(mousedownEvent);
      });

      // Should NOT collapse because click is inside dialog
      expect(result.current.isExpanded).toBe(true);

      // Cleanup
      document.body.removeChild(dialog);
    });
  });

  describe('setTags passthrough', () => {
    it('exposes setTags from usePost', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.setTags).toBe(mockSetTags);
    });
  });

  describe('attachments state', () => {
    it('exposes attachments from usePost', () => {
      mockAttachments = [new File(['test'], 'test.png', { type: 'image/png' })];

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.attachments).toBe(mockAttachments);
    });

    it('exposes setAttachments from usePost', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.setAttachments).toBe(mockSetAttachments);
    });
  });

  describe('article state', () => {
    it('exposes isArticle from usePost', () => {
      mockIsArticle = true;

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.isArticle).toBe(true);
    });

    it('exposes articleTitle from usePost', () => {
      mockArticleTitle = 'Test Article Title';

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      expect(result.current.articleTitle).toBe('Test Article Title');
    });
  });

  describe('handleArticleClick', () => {
    it('calls setIsArticle with true', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      act(() => {
        result.current.handleArticleClick();
      });

      expect(mockSetIsArticle).toHaveBeenCalledWith(true);
    });
  });

  describe('handleArticleTitleChange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls setArticleTitle when value is within character limit (after debounce)', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const mockEvent = {
        target: { value: 'Test Title' },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleArticleTitleChange(mockEvent);
      });

      // Should not be called immediately due to debounce
      expect(mockSetArticleTitle).not.toHaveBeenCalled();

      // Advance timers by 500ms to trigger debounced callback
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSetArticleTitle).toHaveBeenCalledWith('Test Title');
    });

    it('does not call setArticleTitle when value exceeds character limit', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a string longer than ARTICLE_TITLE_MAX_CHARACTER_LENGTH
      const longText = 'a'.repeat(ARTICLE_TITLE_MAX_CHARACTER_LENGTH + 1);
      const mockEvent = {
        target: { value: longText },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleArticleTitleChange(mockEvent);
      });

      // Advance timers by 500ms to trigger debounced callback
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSetArticleTitle).not.toHaveBeenCalled();
    });

    it('allows exactly at the character limit', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a string exactly at ARTICLE_TITLE_MAX_CHARACTER_LENGTH
      const exactLimitText = 'a'.repeat(ARTICLE_TITLE_MAX_CHARACTER_LENGTH);
      const mockEvent = {
        target: { value: exactLimitText },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleArticleTitleChange(mockEvent);
      });

      // Advance timers by 500ms to trigger debounced callback
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSetArticleTitle).toHaveBeenCalledWith(exactLimitText);
    });
  });

  describe('handleArticleBodyChange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls setContent with markdown value (after debounce)', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      act(() => {
        // MDXEditor onChange expects (markdown: string, initialMarkdownNormalize: boolean)
        result.current.handleArticleBodyChange('# Heading\n\nSome content', false);
      });

      // Should not be called immediately due to debounce
      expect(mockSetContent).not.toHaveBeenCalled();

      // Advance timers by 500ms to trigger debounced callback
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSetContent).toHaveBeenCalledWith('# Heading\n\nSome content');
    });
  });

  describe('handleFilesAdded', () => {
    it('does not process files when submitting', () => {
      mockIsSubmitting = true;

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
    });

    it('does not process empty file array', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      act(() => {
        result.current.handleFilesAdded([]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
    });

    it('adds valid image files', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('adds valid video files', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('adds valid audio files', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.mp3', { type: 'audio/mpeg' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('adds valid PDF files', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('rejects files with invalid types and shows toast', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: expect.stringContaining('has unsupported type'),
      });
    });

    it('rejects images exceeding 5MB and shows toast', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a file object with size > 5MB
      const largeFile = new File(['test'], 'large.png', { type: 'image/png' });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });

      act(() => {
        result.current.handleFilesAdded([largeFile]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: expect.stringContaining('exceeds the maximum size of 5MB'),
      });
    });

    it('rejects non-image files exceeding 20MB and shows toast', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Create a video file with size > 20MB
      const largeFile = new File(['test'], 'large.mp4', { type: 'video/mp4' });
      Object.defineProperty(largeFile, 'size', { value: 21 * 1024 * 1024 });

      act(() => {
        result.current.handleFilesAdded([largeFile]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: expect.stringContaining('exceeds the maximum size of 20MB'),
      });
    });

    it('shows toast when maximum files limit reached', () => {
      // Set up POST_ATTACHMENT_MAX_FILES existing attachments
      mockAttachments = Array.from(
        { length: POST_ATTACHMENT_MAX_FILES },
        (_, i) => new File([`${i}`], `${i}.png`, { type: 'image/png' }),
      );

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const newFile = new File(['test'], 'test.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([newFile]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: `Maximum of ${POST_ATTACHMENT_MAX_FILES} files allowed`,
      });
    });

    it('limits files added when approaching maximum', () => {
      // Set up POST_ATTACHMENT_MAX_FILES - 1 existing attachments
      mockAttachments = Array.from(
        { length: POST_ATTACHMENT_MAX_FILES - 1 },
        (_, i) => new File([`${i}`], `${i}.png`, { type: 'image/png' }),
      );

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Try to add 2 files when only 1 slot is available
      const file1 = new File(['test1'], 'test1.png', { type: 'image/png' });
      const file2 = new File(['test2'], 'test2.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([file1, file2]);
      });

      // Should add only 1 file and show error for the rest
      expect(mockSetAttachments).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: expect.stringContaining(`Maximum of ${POST_ATTACHMENT_MAX_FILES} files allowed`),
      });
    });

    it('shows multiple errors with "Errors" title', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
      const largeFile = new File(['test'], 'large.png', { type: 'image/png' });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });

      act(() => {
        result.current.handleFilesAdded([invalidFile, largeFile]);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Errors',
        description: expect.any(String),
      });
    });
  });

  describe('drag and drop handlers', () => {
    const createMockDragEvent = (type: string, hasFiles = true): React.DragEvent => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: hasFiles ? ['Files'] : [],
          items: [],
        },
      } as unknown as React.DragEvent;
      return event;
    };

    describe('handleDragEnter', () => {
      it('sets isDragging to true when files are being dragged', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        expect(result.current.isDragging).toBe(false);

        const mockEvent = createMockDragEvent('dragenter', true);

        act(() => {
          result.current.handleDragEnter(mockEvent);
        });

        expect(result.current.isDragging).toBe(true);
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.stopPropagation).toHaveBeenCalled();
      });

      it('does not set isDragging when no files are being dragged', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const mockEvent = createMockDragEvent('dragenter', false);

        act(() => {
          result.current.handleDragEnter(mockEvent);
        });

        expect(result.current.isDragging).toBe(false);
      });

      it('auto-expands when dragging files over collapsed component', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
            expanded: false,
          }),
        );

        expect(result.current.isExpanded).toBe(false);

        const mockEvent = createMockDragEvent('dragenter', true);

        act(() => {
          result.current.handleDragEnter(mockEvent);
        });

        expect(result.current.isExpanded).toBe(true);
      });
    });

    describe('handleDragLeave', () => {
      it('sets isDragging to false when all nested elements are left', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        // First enter
        const enterEvent = createMockDragEvent('dragenter', true);
        act(() => {
          result.current.handleDragEnter(enterEvent);
        });

        expect(result.current.isDragging).toBe(true);

        // Then leave
        const leaveEvent = createMockDragEvent('dragleave', true);
        act(() => {
          result.current.handleDragLeave(leaveEvent);
        });

        expect(result.current.isDragging).toBe(false);
        expect(leaveEvent.preventDefault).toHaveBeenCalled();
        expect(leaveEvent.stopPropagation).toHaveBeenCalled();
      });

      it('keeps isDragging true when leaving nested element but still inside container', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        // Enter twice (container + nested element)
        const enterEvent1 = createMockDragEvent('dragenter', true);
        const enterEvent2 = createMockDragEvent('dragenter', true);

        act(() => {
          result.current.handleDragEnter(enterEvent1);
          result.current.handleDragEnter(enterEvent2);
        });

        expect(result.current.isDragging).toBe(true);

        // Leave once (leaving nested element)
        const leaveEvent = createMockDragEvent('dragleave', true);
        act(() => {
          result.current.handleDragLeave(leaveEvent);
        });

        // Should still be dragging since we're still inside container
        expect(result.current.isDragging).toBe(true);
      });
    });

    describe('handleDragOver', () => {
      it('prevents default and stops propagation', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const mockEvent = createMockDragEvent('dragover', true);

        act(() => {
          result.current.handleDragOver(mockEvent);
        });

        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.stopPropagation).toHaveBeenCalled();
      });
    });

    describe('handleDrop', () => {
      it('resets isDragging to false on drop', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        // First set isDragging to true
        const enterEvent = createMockDragEvent('dragenter', true);
        act(() => {
          result.current.handleDragEnter(enterEvent);
        });

        expect(result.current.isDragging).toBe(true);

        // Then drop
        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: {
            items: [],
          },
        } as unknown as React.DragEvent;

        act(() => {
          result.current.handleDrop(dropEvent);
        });

        expect(result.current.isDragging).toBe(false);
        expect(dropEvent.preventDefault).toHaveBeenCalled();
        expect(dropEvent.stopPropagation).toHaveBeenCalled();
      });

      it('extracts files from dataTransfer and calls handleFilesAdded', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: {
            items: [
              {
                kind: 'file',
                getAsFile: () => mockFile,
              },
            ],
          },
        } as unknown as React.DragEvent;

        act(() => {
          result.current.handleDrop(dropEvent);
        });

        expect(mockSetAttachments).toHaveBeenCalled();
      });

      it('ignores non-file items in dataTransfer', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: {
            items: [
              {
                kind: 'string',
                getAsFile: () => null,
              },
            ],
          },
        } as unknown as React.DragEvent;

        act(() => {
          result.current.handleDrop(dropEvent);
        });

        expect(mockSetAttachments).not.toHaveBeenCalled();
      });

      it('handles null dataTransfer gracefully', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: null,
        } as unknown as React.DragEvent;

        expect(() => {
          act(() => {
            result.current.handleDrop(dropEvent);
          });
        }).not.toThrow();

        expect(mockSetAttachments).not.toHaveBeenCalled();
      });

      it('handles null file from getAsFile gracefully', () => {
        const { result } = renderHook(() =>
          usePostInput({
            variant: 'post',
          }),
        );

        const dropEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          dataTransfer: {
            items: [
              {
                kind: 'file',
                getAsFile: () => null,
              },
            ],
          },
        } as unknown as React.DragEvent;

        act(() => {
          result.current.handleDrop(dropEvent);
        });

        expect(mockSetAttachments).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleFilesAdded with article mode', () => {
    it('uses article-specific file limits when in article mode', () => {
      mockIsArticle = true;
      // Set up ARTICLE_ATTACHMENT_MAX_FILES existing attachments (article max)
      mockAttachments = Array.from(
        { length: ARTICLE_ATTACHMENT_MAX_FILES },
        (_, i) => new File([`${i}`], `${i}.png`, { type: 'image/png' }),
      );

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const newFile = new File(['test'], 'test.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([newFile]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: `Maximum of ${ARTICLE_ATTACHMENT_MAX_FILES} files allowed`,
      });
    });

    it('rejects non-image files in article mode', () => {
      mockIsArticle = true;

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      // Video files are not allowed in article mode
      const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: expect.stringContaining('has unsupported type'),
      });
    });

    it('accepts image files in article mode', () => {
      mockIsArticle = true;

      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.png', { type: 'image/png' });

      act(() => {
        result.current.handleFilesAdded([file]);
      });

      expect(mockSetAttachments).toHaveBeenCalled();
    });
  });

  describe('handlePaste', () => {
    it('extracts files from clipboard and adds them as attachments', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const pasteEvent = {
        clipboardData: {
          items: [{ kind: 'file', getAsFile: () => file }],
        },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      act(() => {
        result.current.handlePaste(pasteEvent);
      });

      expect(pasteEvent.preventDefault).toHaveBeenCalled();
      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('does not prevent default when pasting text (no files)', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const pasteEvent = {
        clipboardData: {
          items: [{ kind: 'string', getAsFile: () => null }],
        },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      act(() => {
        result.current.handlePaste(pasteEvent);
      });

      expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockSetAttachments).not.toHaveBeenCalled();
    });

    it('handles multiple files from clipboard', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const file1 = new File(['test1'], 'test1.png', { type: 'image/png' });
      const file2 = new File(['test2'], 'test2.jpg', { type: 'image/jpeg' });
      const pasteEvent = {
        clipboardData: {
          items: [
            { kind: 'file', getAsFile: () => file1 },
            { kind: 'file', getAsFile: () => file2 },
          ],
        },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      act(() => {
        result.current.handlePaste(pasteEvent);
      });

      expect(pasteEvent.preventDefault).toHaveBeenCalled();
      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('handles null clipboardData gracefully', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const pasteEvent = {
        clipboardData: null,
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      expect(() => {
        act(() => {
          result.current.handlePaste(pasteEvent);
        });
      }).not.toThrow();

      expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('handles null items gracefully', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const pasteEvent = {
        clipboardData: {
          items: null,
        },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      expect(() => {
        act(() => {
          result.current.handlePaste(pasteEvent);
        });
      }).not.toThrow();

      expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('ignores items where getAsFile returns null', () => {
      const { result } = renderHook(() =>
        usePostInput({
          variant: 'post',
        }),
      );

      const pasteEvent = {
        clipboardData: {
          items: [{ kind: 'file', getAsFile: () => null }],
        },
        preventDefault: vi.fn(),
      } as unknown as React.ClipboardEvent;

      act(() => {
        result.current.handlePaste(pasteEvent);
      });

      expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockSetAttachments).not.toHaveBeenCalled();
    });
  });
});

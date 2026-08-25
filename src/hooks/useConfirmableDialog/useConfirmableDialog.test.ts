import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmableDialog } from './useConfirmableDialog';

describe('useConfirmableDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with dialog hidden and resetKey at 0', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    expect(result.current.showConfirmDialog).toBe(false);
    expect(result.current.resetKey).toBe(0);
  });

  it('closes dialog directly when no content exists', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('shows confirm dialog when closing with unsaved content', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('Some content', [], [], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('shows confirm dialog when closing with tags only', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('', ['tag1', 'tag2'], [], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('does not show confirm dialog for whitespace-only content', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('   ', [], [], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('shows confirm dialog when closing with attachments only', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });

    act(() => {
      result.current.handleContentChange('', [], [mockFile], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('shows confirm dialog when closing with existing attachments only (edit)', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('', [], [], '', [{ uri: 'pubky://user/pub/pubky.app/files/F1' }]);
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('treats omitted existingAttachments as empty', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    // 5th argument omitted — legacy 4-arg callers must still close directly
    act(() => {
      result.current.handleContentChange('', [], [], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('resets existing attachments tracking when dialog opens', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('', [], [], '', [{ uri: 'pubky://user/pub/pubky.app/files/F1' }]);
    });

    // Open dialog (simulates re-opening) — clears the tracked existing attachments
    act(() => {
      result.current.handleOpenChange(true);
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('shows confirm dialog when closing with article title only', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('', [], [], 'My Article Title');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('does not show confirm dialog for whitespace-only article title', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    act(() => {
      result.current.handleContentChange('', [], [], '   ');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('resets content state when dialog opens', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    // Add content
    act(() => {
      result.current.handleContentChange('Some content', ['tag'], [], '');
    });

    // Open dialog (simulates re-opening)
    act(() => {
      result.current.handleOpenChange(true);
    });

    // Now try to close - should close directly since content was reset
    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('handleDiscard increments resetKey, hides confirm dialog, and calls onClose', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    // Set up state as if confirm dialog is showing
    act(() => {
      result.current.handleContentChange('Content', [], [], '');
    });
    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(result.current.showConfirmDialog).toBe(true);
    expect(result.current.resetKey).toBe(0);

    act(() => {
      result.current.handleDiscard();
    });

    expect(result.current.resetKey).toBe(1);
    expect(result.current.showConfirmDialog).toBe(false);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('setShowConfirmDialog manually controls confirm dialog visibility', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    expect(result.current.showConfirmDialog).toBe(false);

    act(() => {
      result.current.setShowConfirmDialog(true);
    });

    expect(result.current.showConfirmDialog).toBe(true);

    act(() => {
      result.current.setShowConfirmDialog(false);
    });

    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('increments resetKey on each discard', () => {
    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
      }),
    );

    expect(result.current.resetKey).toBe(0);

    act(() => {
      result.current.handleDiscard();
    });
    expect(result.current.resetKey).toBe(1);

    act(() => {
      result.current.handleDiscard();
    });
    expect(result.current.resetKey).toBe(2);

    act(() => {
      result.current.handleDiscard();
    });
    expect(result.current.resetKey).toBe(3);
  });
});

describe('useConfirmableDialog with external hasContent', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses external hasContent callback instead of internal tracking', () => {
    const externalHasContent = vi.fn(() => true);

    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
        hasContent: externalHasContent,
      }),
    );

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(externalHasContent).toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(result.current.showConfirmDialog).toBe(true);
  });

  it('closes directly when external hasContent returns false', () => {
    const externalHasContent = vi.fn(() => false);

    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
        hasContent: externalHasContent,
      }),
    );

    act(() => {
      result.current.handleOpenChange(false);
    });

    expect(externalHasContent).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('ignores internal content tracking when external hasContent is provided', () => {
    const externalHasContent = vi.fn(() => false);

    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
        hasContent: externalHasContent,
      }),
    );

    // Add content via internal tracking — should be ignored
    act(() => {
      result.current.handleContentChange('Some content', ['tag'], [], '');
    });

    act(() => {
      result.current.handleOpenChange(false);
    });

    // External says no content, so should close directly
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it('handleDiscard works the same with external hasContent', () => {
    const externalHasContent = vi.fn(() => true);

    const { result } = renderHook(() =>
      useConfirmableDialog({
        onClose: mockOnClose,
        hasContent: externalHasContent,
      }),
    );

    // Trigger confirm dialog
    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(result.current.showConfirmDialog).toBe(true);

    // Discard
    act(() => {
      result.current.handleDiscard();
    });

    expect(result.current.showConfirmDialog).toBe(false);
    expect(result.current.resetKey).toBe(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

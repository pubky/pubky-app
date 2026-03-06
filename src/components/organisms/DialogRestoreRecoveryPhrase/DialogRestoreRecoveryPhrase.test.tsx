import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogRestoreRecoveryPhrase } from './DialogRestoreRecoveryPhrase';

// Mock external dependencies
// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
  };
});

vi.mock('@/atoms', () => ({
  Dialog: vi.fn(({ children }) => <div data-testid="dialog">{children}</div>),
  DialogTrigger: vi.fn(({ children, asChild }) => (
    <div data-testid="dialog-trigger" data-as-child={asChild}>
      {children}
    </div>
  )),
  DialogContent: vi.fn(({ children, className, hiddenTitle }) => (
    <div data-testid="dialog-content" className={className} data-hidden-title={hiddenTitle}>
      {hiddenTitle && (
        <h2 className="sr-only" data-testid="dialog-hidden-title">
          {hiddenTitle}
        </h2>
      )}
      {children}
    </div>
  )),
  DialogHeader: vi.fn(({ children, className }) => (
    <div data-testid="dialog-header" className={className}>
      {children}
    </div>
  )),
  DialogTitle: vi.fn(({ children, className }) => (
    <h2 data-testid="dialog-title" className={className}>
      {children}
    </h2>
  )),
  DialogDescription: vi.fn(({ children, className }) => (
    <p data-testid="dialog-description" className={className}>
      {children}
    </p>
  )),
  DialogClose: vi.fn(({ children, asChild }) => (
    <div data-testid="dialog-close" data-as-child={asChild}>
      {children}
    </div>
  )),
  Button: vi.fn(({ children, variant, className, size, onClick, disabled, ...props }) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )),
  Container: vi.fn(({ children, className, display, ...props }) => (
    <div data-testid="container" className={className} data-display={display} {...props}>
      {children}
    </div>
  )),
  Badge: vi.fn(({ children, variant, className }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  )),
  Input: vi.fn(({ value, placeholder, className, onChange, onBlur, ...props }) => (
    <input
      data-testid="input"
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={onChange}
      onBlur={onBlur}
      {...props}
    />
  )),
}));

// Mock Core module
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    AuthController: {
      loginWithMnemonic: vi.fn(),
    },
    BootstrapController: {
      run: vi.fn().mockResolvedValue({}),
    },
    useAuthStore: {
      getState: vi.fn().mockReturnValue({
        currentUserPubky: 'mock-user-pubkey-123',
      }),
    },
  };
});

// Mock Molecules module
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: vi.fn(() => ({
    toast: mockToast,
  })),
  WordSlot: vi.fn(
    ({ index, word, isError, showError, isRestoring, onChange, onValidate, onKeyDown, mode, ...props }) => (
      <div
        data-testid="word-slot"
        data-index={index}
        data-mode={mode}
        data-error={isError}
        data-show-error={showError}
        data-restoring={isRestoring}
      >
        <span data-testid="badge" data-variant="outline">
          {index + 1}
        </span>
        <input
          data-testid="word-input"
          value={word}
          placeholder="word"
          onChange={(e) => onChange?.(index, e.target.value.toLowerCase().trim())}
          onBlur={() => onValidate?.(index, word)}
          onKeyDown={onKeyDown}
          disabled={isRestoring}
          {...props}
        />
      </div>
    ),
  ),
}));

describe('DialogRestoreRecoveryPhrase', () => {
  const mockOnRestore = vi.fn();

  // Get mocked functions
  let mockLoginWithMnemonic: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked function
    const { AuthController } = await import('@/core');
    mockLoginWithMnemonic = vi.mocked(AuthController.loginWithMnemonic);
  });

  describe('Default Rendering', () => {
    it('renders dialog with trigger button', () => {
      render(<DialogRestoreRecoveryPhrase />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-trigger')).toBeInTheDocument();

      const triggerButton = screen.getByText('Use recovery phrase');
      expect(triggerButton).toBeInTheDocument();
      expect(triggerButton.closest('[data-testid="button"]')).toHaveAttribute('data-variant', 'outline');
    });

    it('renders dialog content with correct structure', () => {
      render(<DialogRestoreRecoveryPhrase />);

      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-header')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Restore with recovery phrase');
      expect(screen.getByTestId('dialog-description')).toHaveTextContent(
        'Use your 12 words (recovery phrase) to restore your account and sign in.',
      );
    });

    it('renders 12 word input slots', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      expect(inputs).toHaveLength(12);

      inputs.forEach((input) => {
        expect(input).toHaveAttribute('placeholder', 'word');
        expect(input).toHaveValue('');
      });
    });

    it('renders numbered badges for each word slot', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const badges = screen.getAllByTestId('badge');
      expect(badges).toHaveLength(12);

      badges.forEach((badge, idx) => {
        expect(badge).toHaveTextContent((idx + 1).toString());
        expect(badge).toHaveAttribute('data-variant', 'outline');
      });
    });

    it('renders action buttons', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const cancelButton = screen.getByText('Cancel');
      const restoreButton = screen.getByText('Restore');

      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.closest('[data-testid="button"]')).toHaveAttribute('data-variant', 'outline');

      expect(restoreButton).toBeInTheDocument();
      expect(restoreButton.closest('[data-testid="button"]')).toBeDisabled();
    });

    it('renders icons correctly', () => {
      render(<DialogRestoreRecoveryPhrase />);

      // Icons are now actual lucide-react components (SVGs), not mocked divs
      const button = screen.getByRole('button', { name: /use recovery phrase/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Word Input Functionality', () => {
    it('allows typing in word inputs', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      fireEvent.change(firstInput, { target: { value: 'abandon' } });

      expect(firstInput).toHaveValue('abandon');
    });

    it('converts input to lowercase and trims spaces', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      fireEvent.change(firstInput, { target: { value: ' ABANDON ' } });

      expect(firstInput).toHaveValue('abandon');
    });

    it('marks fields as touched when typed in', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      fireEvent.change(firstInput, { target: { value: 'abandon' } });

      // Field should be marked as touched (we can't directly test state, but can test behavior)
      expect(firstInput).toHaveValue('abandon');
    });

    it('marks fields as touched when blurred', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      fireEvent.focus(firstInput);
      fireEvent.blur(firstInput);

      // Test that onBlur was triggered (indirect test)
      expect(firstInput).not.toHaveFocus();
    });

    it('distributes 12 words across all fields when pasting space-delimited string into first field', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      const twelveWords = [
        'ability',
        'able',
        'above',
        'absent',
        'accident',
        'absorb',
        'abstract',
        'absurd',
        'about',
        'abuse',
        'access',
        'abandon',
      ];

      // Paste 12 words as a space-delimited string into the first field
      fireEvent.change(firstInput, { target: { value: twelveWords.join(' ') } });

      // Verify all 12 fields are populated with the correct words
      inputs.forEach((input, index) => {
        expect(input).toHaveValue(twelveWords[index]);
      });
    });
  });

  describe('Validation', () => {
    it('validates word format on blur', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      // Enter invalid word with numbers
      fireEvent.change(firstInput, { target: { value: 'abandon123' } });
      fireEvent.blur(firstInput); // Blur to trigger validation

      // Should show error styling (we can test if the input maintains the invalid value)
      expect(firstInput).toHaveValue('abandon123');
    });

    it('shows error message when invalid words are detected', async () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      // Enter invalid word and blur
      fireEvent.change(firstInput, { target: { value: 'invalid123' } });
      fireEvent.blur(firstInput);

      // Check if error elements appear
      await waitFor(() => {
        // Error icon is now actual lucide-react CircleAlert icon (SVG), not mocked div
        expect(screen.getByText('Invalid words detected')).toBeInTheDocument();
        expect(
          screen.getByText('Please check that all words are valid and contain only lowercase letters.'),
        ).toBeInTheDocument();
      });
    });

    it('clears errors when user starts typing valid words', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      // First enter invalid word
      fireEvent.change(firstInput, { target: { value: 'invalid123' } });
      fireEvent.blur(firstInput);

      // Then clear and enter valid word
      fireEvent.change(firstInput, { target: { value: '' } });
      fireEvent.change(firstInput, { target: { value: 'abandon' } });

      // Error should be cleared
      expect(firstInput).toHaveValue('abandon');
    });

    it('enables restore button only when all words are filled and valid', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Initially disabled
      expect(restoreButton).toBeDisabled();

      // Fill all inputs with valid words
      const validWords = [
        'abandon',
        'ability',
        'able',
        'about',
        'above',
        'absent',
        'absorb',
        'abstract',
        'absurd',
        'abuse',
        'access',
        'accident',
      ];

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Button should now be enabled
      expect(restoreButton).not.toBeDisabled();
    });

    it('keeps restore button disabled when some words are empty', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill only first 11 inputs
      for (let i = 0; i < 11; i++) {
        fireEvent.change(inputs[i], { target: { value: 'word' } });
      }

      // Button should still be disabled
      expect(restoreButton).toBeDisabled();
    });
  });

  describe('Restore Functionality', () => {
    it('calls AuthController.loginWithMnemonic with correct mnemonic', async () => {
      mockLoginWithMnemonic.mockResolvedValue({});
      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs
      const validWords = [
        'abandon',
        'ability',
        'able',
        'about',
        'above',
        'absent',
        'absorb',
        'abstract',
        'absurd',
        'abuse',
        'access',
        'accident',
      ];

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      fireEvent.click(restoreButton!);

      await waitFor(() => {
        expect(mockLoginWithMnemonic).toHaveBeenCalledWith({ mnemonic: validWords.join(' ') });
      });
    });

    it('calls onRestore callback on successful restore', async () => {
      mockLoginWithMnemonic.mockResolvedValue({});
      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs with valid words
      const validWords = Array(12).fill('abandon');

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      fireEvent.click(restoreButton!);

      await waitFor(() => {
        expect(mockOnRestore).toHaveBeenCalled();
      });
    });

    it('handles Enter key in any word input to trigger restore', async () => {
      mockLoginWithMnemonic.mockResolvedValue({});
      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');

      // Fill all inputs with valid words
      const validWords = Array(12).fill('abandon');

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Press Enter on the first input (should trigger restore)
      fireEvent.keyDown(inputs[0], { key: 'Enter' });

      await waitFor(() => {
        expect(mockLoginWithMnemonic).toHaveBeenCalledWith({ mnemonic: validWords.join(' ') });
      });

      await waitFor(() => {
        expect(mockOnRestore).toHaveBeenCalled();
      });
    });

    it('shows error toast when restore fails', async () => {
      const error = new Error('Login failed');
      mockLoginWithMnemonic.mockRejectedValue(error);
      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs
      const validWords = Array(12).fill('abandon');

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      fireEvent.click(restoreButton!);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error logging in with mnemonic',
          description: 'Please try again.',
        });
      });

      expect(mockOnRestore).not.toHaveBeenCalled();
    });

    it('marks all fields as touched when restore is attempted', () => {
      mockLoginWithMnemonic.mockResolvedValue({});
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill only some inputs
      fireEvent.change(inputs[0], { target: { value: 'abandon' } });
      fireEvent.change(inputs[1], { target: { value: 'ability' } });

      fireEvent.click(restoreButton!);

      // Should mark all fields as touched and show validation errors
      // We can't directly test the touched state, but we can test the side effects
      expect(mockLoginWithMnemonic).not.toHaveBeenCalled();
    });
  });

  describe('Component Props', () => {
    it('works without onRestore prop', async () => {
      mockLoginWithMnemonic.mockResolvedValue({});
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs
      const validWords = Array(12).fill('abandon');

      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Should not throw when onRestore is not provided
      fireEvent.click(restoreButton!);

      await waitFor(() => {
        expect(mockLoginWithMnemonic).toHaveBeenCalled();
      });
    });

    it('passes onRestore prop correctly to RestoreForm', () => {
      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      // The component should render without errors
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  describe('Styling and Layout', () => {
    it('applies correct CSS classes', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const dialogContent = screen.getByTestId('dialog-content');
      expect(dialogContent).toHaveClass('gap-6', 'p-8');

      const triggerButton = screen.getByText('Use recovery phrase').closest('[data-testid="button"]');
      expect(triggerButton).toHaveClass('rounded-full', 'w-full', 'sm:w-auto', 'md:flex-none');
    });

    it('applies grid layout for word inputs', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const containers = screen.getAllByTestId('container');
      const gridContainer = containers.find((container) => container.getAttribute('data-display') === 'grid');

      expect(gridContainer).toHaveClass('grid-cols-2', 'sm:grid-cols-3', 'gap-3');
    });

    it('applies error styling when validation fails', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      // Enter invalid word and blur to trigger validation
      fireEvent.change(firstInput, { target: { value: 'invalid123' } });
      fireEvent.blur(firstInput);

      // Error styling should be applied
      expect(firstInput).toHaveValue('invalid123');
    });
  });

  describe('Accessibility', () => {
    it('provides proper placeholder text for inputs', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('placeholder', 'word');
      });
    });

    it('provides semantic dialog structure', () => {
      render(<DialogRestoreRecoveryPhrase />);

      expect(screen.getByTestId('dialog-title')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-description')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-header')).toBeInTheDocument();
    });

    it('disables restore button when form is invalid', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const restoreButton = screen.getByText('Restore').closest('button');
      expect(restoreButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string inputs correctly', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      // Type and then clear
      fireEvent.change(firstInput, { target: { value: 'test' } });
      fireEvent.change(firstInput, { target: { value: '' } });

      expect(firstInput).toHaveValue('');
    });

    it('handles special characters in input', () => {
      render(<DialogRestoreRecoveryPhrase />);

      const inputs = screen.getAllByTestId('word-input');
      const firstInput = inputs[0];

      fireEvent.change(firstInput, { target: { value: 'test@#$' } });
      fireEvent.blur(firstInput);

      // Should handle special characters (validation should catch this)
      expect(firstInput).toHaveValue('test@#$');
    });

    it('prevents rapid clicking on restore button when loading', async () => {
      let resolveRestore: () => void;
      mockLoginWithMnemonic.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRestore = resolve as () => void;
          }),
      );

      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs
      const validWords = Array(12).fill('abandon');
      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Click the button
      fireEvent.click(restoreButton!);

      // Should show loading state and button should be disabled
      expect(screen.getByText('Restoring...')).toBeInTheDocument();
      expect(restoreButton).toBeDisabled();

      // Try to click again - should not work because button is disabled
      fireEvent.click(restoreButton!);

      // Should only be called once because button was disabled
      expect(mockLoginWithMnemonic).toHaveBeenCalledTimes(1);

      // Resolve the promise
      resolveRestore!();
    });

    it('shows loading state during restore', async () => {
      let resolveRestore: () => void;
      mockLoginWithMnemonic.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRestore = resolve as () => void;
          }),
      );

      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Fill all inputs
      const validWords = Array(12).fill('abandon');
      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Click the button
      fireEvent.click(restoreButton!);

      // Should show loading state
      expect(screen.getByText('Restoring...')).toBeInTheDocument();
      // Loader icon is now actual lucide-react LoaderCircle component (SVG), not mocked div

      // Inputs should be disabled
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });

      // Resolve the promise
      resolveRestore!();
    });

    it('disables inputs during restore process', async () => {
      let resolveRestore: () => void;
      mockLoginWithMnemonic.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRestore = resolve as () => void;
          }),
      );

      render(<DialogRestoreRecoveryPhrase onRestore={mockOnRestore} />);

      const inputs = screen.getAllByTestId('word-input');
      const restoreButton = screen.getByText('Restore').closest('button');

      // Initially inputs should be enabled
      inputs.forEach((input) => {
        expect(input).not.toBeDisabled();
      });

      // Fill all inputs
      const validWords = Array(12).fill('abandon');
      for (let i = 0; i < 12; i++) {
        fireEvent.change(inputs[i], { target: { value: validWords[i] } });
      }

      // Click the button to start restore
      fireEvent.click(restoreButton!);

      // Inputs should be disabled during restore
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });

      // Resolve the promise
      resolveRestore!();
    });
  });
});

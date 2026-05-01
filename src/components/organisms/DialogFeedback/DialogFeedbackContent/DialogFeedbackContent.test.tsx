import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogFeedbackContent } from './DialogFeedbackContent';
vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p data-testid="dialog-description" className={className}>
        {children}
      </p>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: vi.fn(
      ({ postId, characterLimit }: { postId: string; characterLimit?: { count: number; max: number } }) => (
        <div
          data-testid="post-header"
          data-post-id={postId}
          data-character-count={characterLimit?.count}
          data-max-length={characterLimit?.max}
        >
          PostHeader
        </div>
      ),
    ),
  };
});

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      className,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button
        data-testid="button"
        data-variant={variant}
        data-size={size}
        className={className}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Textarea/Textarea', () => {
  return {
    Textarea: ({
      placeholder,
      value,
      onChange,
      disabled,
      maxLength,
      className,
    }: {
      ref?: React.Ref<HTMLTextAreaElement>;
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      disabled?: boolean;
      maxLength?: number;
      className?: string;
    }) => (
      <textarea
        data-testid="textarea"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        maxLength={maxLength}
        className={className}
      />
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as: _as,
      size,
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      size?: string;
      className?: string;
    }) => (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    ),
  };
});

describe('DialogFeedbackContent', () => {
  const mockHandleChange = vi.fn();
  const mockSubmit = vi.fn();
  const defaultProps = {
    feedback: '',
    handleChange: mockHandleChange,
    submit: mockSubmit,
    isSubmitting: false,
    hasContent: false,
    currentUserPubky: 'test-user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with required props', () => {
    render(<DialogFeedbackContent {...defaultProps} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Provide Feedback');
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
  });

  it('renders textarea with correct props', () => {
    render(<DialogFeedbackContent {...defaultProps} feedback="Test feedback" />);

    const textarea = screen.getByTestId('textarea');
    expect(textarea).toHaveValue('Test feedback');
    expect(textarea).toHaveAttribute('placeholder', 'What do you think about Pubky? Any suggestions?');
  });

  it('calls handleChange when textarea value changes', () => {
    render(<DialogFeedbackContent {...defaultProps} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.change(textarea, { target: { value: 'New feedback' } });

    expect(mockHandleChange).toHaveBeenCalled();
  });

  it('shows Send button when hasContent is true', () => {
    render(<DialogFeedbackContent {...defaultProps} hasContent={true} />);

    const buttons = screen.getAllByTestId('button');
    const sendButton = buttons.find((btn) => btn.textContent?.includes('Send'));
    expect(sendButton).toBeInTheDocument();
  });

  it('hides Send button when hasContent is false', () => {
    render(<DialogFeedbackContent {...defaultProps} hasContent={false} />);

    const buttons = screen.queryAllByTestId('button');
    const sendButton = buttons.find((btn) => btn.textContent?.includes('Send'));
    expect(sendButton).toBeDefined();
    const container = sendButton?.closest('[data-testid="container"]');
    expect(container).toHaveClass('opacity-0');
  });

  it('calls submit when Send button is clicked', () => {
    render(<DialogFeedbackContent {...defaultProps} hasContent={true} />);

    const buttons = screen.getAllByTestId('button');
    const sendButton = buttons.find((btn) => btn.textContent?.includes('Send'));
    fireEvent.click(sendButton!);

    expect(mockSubmit).toHaveBeenCalled();
  });

  it('disables Send button when isSubmitting is true', () => {
    render(<DialogFeedbackContent {...defaultProps} hasContent={true} isSubmitting={true} />);

    const buttons = screen.getAllByTestId('button');
    const sendButton = buttons.find(
      (btn) => btn.getAttribute('data-variant') === 'secondary' && (btn as HTMLButtonElement).disabled,
    );
    expect(sendButton).toBeDefined();
    expect(sendButton).toBeDisabled();
  });

  it('disables textarea when isSubmitting is true', () => {
    render(<DialogFeedbackContent {...defaultProps} isSubmitting={true} />);

    const textarea = screen.getByTestId('textarea');
    expect(textarea).toBeDisabled();
  });

  it('shows loader icon when isSubmitting is true', () => {
    const { container } = render(<DialogFeedbackContent {...defaultProps} hasContent={true} isSubmitting={true} />);

    expect(container.querySelector('.lucide-loader-circle')).toBeInTheDocument();
  });

  it('shows send icon when not submitting', () => {
    const { container } = render(<DialogFeedbackContent {...defaultProps} hasContent={true} isSubmitting={false} />);

    expect(container.querySelector('.lucide-send')).toBeInTheDocument();
  });

  it('passes characterCount to PostHeader when feedback has content', () => {
    render(<DialogFeedbackContent {...defaultProps} feedback="Test" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).toHaveAttribute('data-character-count', '4');
  });

  it('does not pass characterCount to PostHeader when feedback is empty', () => {
    render(<DialogFeedbackContent {...defaultProps} feedback="" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).not.toHaveAttribute('data-character-count');
  });
});

describe('DialogFeedbackContent - Snapshots', () => {
  const mockHandleChange = vi.fn();
  const mockSubmit = vi.fn();
  const defaultProps = {
    feedback: '',
    handleChange: mockHandleChange,
    submit: mockSubmit,
    isSubmitting: false,
    hasContent: false,
    currentUserPubky: 'test-user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for default state', () => {
    const { container } = render(<DialogFeedbackContent {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with feedback content', () => {
    const { container } = render(
      <DialogFeedbackContent {...defaultProps} feedback="This is test feedback" hasContent={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when submitting', () => {
    const { container } = render(
      <DialogFeedbackContent
        {...defaultProps}
        feedback="This is test feedback"
        hasContent={true}
        isSubmitting={true}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with content but not submitting', () => {
    const { container } = render(
      <DialogFeedbackContent {...defaultProps} feedback="Feedback text" hasContent={true} isSubmitting={false} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogReportPost } from './DialogReportPost';
import { REPORT_POST_STEPS } from '@/hooks/useReportPost';
import { REPORT_ISSUE_TYPES } from '@/core/pipes/report';

// Mock @/libs - use actual implementations and only stub cn helper
vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return {
    ...actual,
    cn: (...inputs: (string | undefined | null | false)[]) => inputs.filter(Boolean).join(' '),
  };
});

// Mock hooks
const mockUseCurrentUserProfile = vi.fn();
const mockUseReportPost = vi.fn();

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useCurrentUserProfile: () => mockUseCurrentUserProfile(),
    useReportPost: () => mockUseReportPost(),
  };
});

// Mock sub-components
vi.mock('./DialogReportPostIssueStep', () => ({
  DialogReportPostIssueStep: ({ onSelectIssueType }: { onSelectIssueType: (type: string) => void }) => (
    <div
      data-testid="dialog-report-post-issue-step"
      onClick={() => onSelectIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO)}
    >
      DialogReportPostIssueStep
    </div>
  ),
}));

vi.mock('./DialogReportPostReasonStep', () => ({
  DialogReportPostReasonStep: ({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: () => void }) => (
    <div data-testid="dialog-report-post-reason-step">
      <button data-testid="back-button" onClick={onCancel}>
        Back
      </button>
      <button data-testid="submit-button" onClick={onSubmit}>
        Submit
      </button>
      DialogReportPostReasonStep
    </div>
  ),
}));

vi.mock('./DialogReportPostSuccess', () => ({
  DialogReportPostSuccess: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div data-testid="dialog-report-post-success" onClick={() => onOpenChange(false)}>
      DialogReportPostSuccess
    </div>
  ),
}));

const TEST_POST_ID = 'author-pubky-456:post-id-789';

describe('DialogReportPost', () => {
  const mockOnOpenChange = vi.fn();
  const mockReset = vi.fn();
  const mockSelectIssueType = vi.fn();
  const mockHandleReasonChange = vi.fn();
  const mockSubmit = vi.fn();

  const defaultUseReportPostReturn = {
    step: REPORT_POST_STEPS.ISSUE_SELECTION,
    selectedIssueType: null,
    reason: '',
    isSubmitting: false,
    isSuccess: false,
    hasContent: false,
    selectIssueType: mockSelectIssueType,
    handleReasonChange: mockHandleReasonChange,
    submit: mockSubmit,
    reset: mockReset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
    mockUseReportPost.mockReturnValue(defaultUseReportPostReturn);
  });

  it('renders with required props', () => {
    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders issue selection step when step is ISSUE_SELECTION', () => {
    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    expect(screen.getByTestId('dialog-report-post-issue-step')).toBeInTheDocument();
  });

  it('renders reason step when step is REASON_INPUT', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      step: REPORT_POST_STEPS.REASON_INPUT,
      selectedIssueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    expect(screen.getByTestId('dialog-report-post-reason-step')).toBeInTheDocument();
  });

  it('renders success state when isSuccess is true', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      isSuccess: true,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    expect(screen.getByTestId('dialog-report-post-success')).toBeInTheDocument();
  });

  it('calls reset when dialog closes', () => {
    const { rerender } = render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    rerender(<DialogReportPost open={false} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    expect(mockReset).toHaveBeenCalled();
  });

  it('renders reason step with correct props', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      step: REPORT_POST_STEPS.REASON_INPUT,
      selectedIssueType: REPORT_ISSUE_TYPES.HATE_SPEECH,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    const reasonStep = screen.getByTestId('dialog-report-post-reason-step');
    expect(reasonStep).toBeInTheDocument();
  });

  it('calls onOpenChange when success close button is clicked', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      isSuccess: true,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    const successComponent = screen.getByTestId('dialog-report-post-success');
    fireEvent.click(successComponent);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('applies correct className to DialogContent', () => {
    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('w-xl');
  });
});

describe('DialogReportPost - Snapshots', () => {
  const mockOnOpenChange = vi.fn();
  const mockReset = vi.fn();
  const mockSelectIssueType = vi.fn();
  const mockHandleReasonChange = vi.fn();
  const mockSubmit = vi.fn();

  const defaultUseReportPostReturn = {
    step: REPORT_POST_STEPS.ISSUE_SELECTION,
    selectedIssueType: null,
    reason: '',
    isSubmitting: false,
    isSuccess: false,
    hasContent: false,
    selectIssueType: mockSelectIssueType,
    handleReasonChange: mockHandleReasonChange,
    submit: mockSubmit,
    reset: mockReset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
  });

  it('matches snapshot for issue selection step', () => {
    mockUseReportPost.mockReturnValue(defaultUseReportPostReturn);

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for reason step', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      step: REPORT_POST_STEPS.REASON_INPUT,
      selectedIssueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for success state', () => {
    mockUseReportPost.mockReturnValue({
      ...defaultUseReportPostReturn,
      isSuccess: true,
    });

    render(<DialogReportPost open={true} onOpenChange={mockOnOpenChange} postId={TEST_POST_ID} />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.parentElement).toMatchSnapshot();
  });
});

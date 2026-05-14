import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import { REPORT_REASON_MAX_LENGTH } from '@/pipes/report/report.constants';
import { DialogReportPostReasonStep } from './DialogReportPostReasonStep';

// Mock hooks
const mockUseCurrentUserProfile = vi.fn();

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => mockUseCurrentUserProfile(),
}));

// Mock organisms
vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: ({
      postId,
      characterLimit,
    }: {
      postId: string;
      isReplyInput?: boolean;
      characterLimit?: { count: number; max: number };
    }) => (
      <div
        data-testid="post-header"
        data-post-id={postId}
        data-character-count={characterLimit?.count}
        data-max-length={characterLimit?.max}
      >
        PostHeader
      </div>
    ),
  };
});

const renderWithDialog = (component: React.ReactElement) => {
  return render(
    <Dialog open={true}>
      <DialogContent>{component}</DialogContent>
    </Dialog>,
  );
};

describe('DialogReportPostReasonStep', () => {
  const mockOnReasonChange = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnSubmit = vi.fn();

  const defaultProps = {
    reason: '',
    hasContent: false,
    isSubmitting: false,
    onReasonChange: mockOnReasonChange,
    onCancel: mockOnCancel,
    onSubmit: mockOnSubmit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
  });

  it('renders with correct title', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} />);

    const title = screen.getByRole('heading', { name: 'Report Post' });
    expect(title).toBeInTheDocument();
  });

  it('displays PostHeader when currentUserPubky is available', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} />);

    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toHaveAttribute('data-post-id', 'test-user-123');
  });

  it('calls onCancel when cancel button is clicked', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel report' });
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('calls onReasonChange when textarea value changes', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} />);

    const textarea = screen.getByLabelText('Report reason');
    fireEvent.change(textarea, { target: { value: 'Some reason' } });

    expect(mockOnReasonChange).toHaveBeenCalled();
  });

  it('displays character count in PostHeader', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} reason="Hello" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).toHaveAttribute('data-character-count', '5');
    expect(postHeader).toHaveAttribute('data-max-length', String(REPORT_REASON_MAX_LENGTH));
  });

  it('disables submit button when hasContent is false', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} hasContent={false} />);

    const submitButton = screen.getByRole('button', { name: 'Submit report' });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when hasContent is true', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} hasContent={true} />);

    const submitButton = screen.getByRole('button', { name: 'Submit report' });
    expect(submitButton).not.toBeDisabled();
  });

  it('calls onSubmit when submit button is clicked', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} hasContent={true} />);

    const submitButton = screen.getByRole('button', { name: 'Submit report' });
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalled();
  });

  it('shows loader when isSubmitting is true', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} isSubmitting={true} hasContent={true} />);

    const submitButton = screen.getByRole('button', { name: 'Submitting report' });
    expect(submitButton).toBeInTheDocument();
  });

  it('disables textarea when isSubmitting is true', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} isSubmitting={true} />);

    const textarea = screen.getByLabelText('Report reason');
    expect(textarea).toBeDisabled();
  });

  it('disables cancel button when isSubmitting is true', () => {
    renderWithDialog(<DialogReportPostReasonStep {...defaultProps} isSubmitting={true} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel report' });
    expect(cancelButton).toBeDisabled();
  });
});

describe('DialogReportPostReasonStep - Snapshots', () => {
  const mockOnReasonChange = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnSubmit = vi.fn();

  const defaultProps = {
    reason: '',
    hasContent: false,
    isSubmitting: false,
    onReasonChange: mockOnReasonChange,
    onCancel: mockOnCancel,
    onSubmit: mockOnSubmit,
  };

  beforeEach(() => {
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
  });

  it('matches snapshot for default state', () => {
    const { container } = renderWithDialog(<DialogReportPostReasonStep {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with reason content', () => {
    const { container } = renderWithDialog(
      <DialogReportPostReasonStep {...defaultProps} reason="This is a test reason" hasContent={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when submitting', () => {
    const { container } = renderWithDialog(
      <DialogReportPostReasonStep {...defaultProps} isSubmitting={true} hasContent={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

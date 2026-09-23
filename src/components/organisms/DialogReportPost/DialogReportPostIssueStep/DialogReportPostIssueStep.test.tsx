import { useRouter } from 'next/navigation';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import { REPORT_ISSUE_LABELS, REPORT_ISSUE_TYPES } from '@/pipes/report/report.constants';
import { DialogReportPostIssueStep } from './DialogReportPostIssueStep';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const renderWithDialog = (component: React.ReactElement) => {
  return render(
    <Dialog open={true}>
      <DialogContent>{component}</DialogContent>
    </Dialog>,
  );
};

describe('DialogReportPostIssueStep', () => {
  const mockOnSelectIssueType = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      bfcacheId: '',
    } as ReturnType<typeof useRouter>);
  });

  it('renders with correct title and description', () => {
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    expect(screen.getByText('Report Post')).toBeInTheDocument();
    expect(screen.getByText('What sort of issue are you reporting?')).toBeInTheDocument();
  });

  it('renders all issue type options', () => {
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    Object.values(REPORT_ISSUE_TYPES).forEach((issueType) => {
      const label = REPORT_ISSUE_LABELS[issueType];
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('option')).toHaveLength(9);
  });

  it('requires one selection and continues with the most recently selected issue', async () => {
    const user = userEvent.setup();
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    const personalInfo = screen.getByRole('option', { name: REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.PERSONAL_INFO] });
    const hateSpeech = screen.getByRole('option', { name: REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.HATE_SPEECH] });
    expect(continueButton).toBeDisabled();

    await user.click(personalInfo);
    expect(continueButton).toBeEnabled();
    expect(personalInfo).toHaveAttribute('aria-selected', 'true');
    await user.click(hateSpeech);
    expect(personalInfo).toHaveAttribute('aria-selected', 'false');
    expect(hateSpeech).toHaveAttribute('aria-selected', 'true');
    expect(mockOnSelectIssueType).not.toHaveBeenCalled();

    await user.click(continueButton);
    expect(mockOnSelectIssueType).toHaveBeenCalledExactlyOnceWith(REPORT_ISSUE_TYPES.HATE_SPEECH);
  });

  it('renders the footer as a primary Continue action and an outline Cancel action', () => {
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(continueButton).toHaveAttribute('data-variant', 'default');
    expect(cancelButton).toHaveAttribute('data-variant', 'outline');
    // Match the mobile design's Cancel-first column and the desktop's trailing Continue action.
    expect(cancelButton.nextElementSibling).toBe(continueButton);
    expect(cancelButton.className).not.toMatch(/\border-/);
    expect(continueButton.className).not.toMatch(/\border-/);
  });

  it('calls onSelectIssueType with correct issue type when Continue button is clicked after selecting issue', async () => {
    const user = userEvent.setup();
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    // First select an issue type
    const firstIssueButton = screen.getByLabelText(REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.PERSONAL_INFO]);
    await user.click(firstIssueButton);

    // Then click the Continue action
    const nextButton = screen.getByRole('button', { name: 'Continue' });
    await user.click(nextButton);

    expect(mockOnSelectIssueType).toHaveBeenCalledWith(REPORT_ISSUE_TYPES.PERSONAL_INFO);
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);

    // Cancel button (translated to "Cancel" from common.cancel)
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('redirects to /copyright and closes dialog when copyright infringement is selected and Continue is clicked', async () => {
    const user = userEvent.setup();
    renderWithDialog(
      <DialogReportPostIssueStep
        onSelectIssueType={mockOnSelectIssueType}
        onCancel={mockOnCancel}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // Select copyright infringement
    const copyrightButton = screen.getByLabelText(REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.COPYRIGHT]);
    await user.click(copyrightButton);

    // Click the Continue action
    const nextButton = screen.getByRole('button', { name: 'Continue' });
    await user.click(nextButton);

    // Should close dialog and redirect to /copyright
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockPush).toHaveBeenCalledWith('/copyright');
    // Should NOT call onSelectIssueType for copyright
    expect(mockOnSelectIssueType).not.toHaveBeenCalled();
  });

  it('does not redirect when non-copyright issue is selected', async () => {
    const user = userEvent.setup();
    renderWithDialog(
      <DialogReportPostIssueStep
        onSelectIssueType={mockOnSelectIssueType}
        onCancel={mockOnCancel}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // Select a non-copyright issue
    const personalInfoButton = screen.getByLabelText(REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.PERSONAL_INFO]);
    await user.click(personalInfoButton);

    // Click the Continue action
    const nextButton = screen.getByRole('button', { name: 'Continue' });
    await user.click(nextButton);

    // Should call onSelectIssueType normally
    expect(mockOnSelectIssueType).toHaveBeenCalledWith(REPORT_ISSUE_TYPES.PERSONAL_INFO);
    // Should NOT redirect or close dialog
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });
});

describe('DialogReportPostIssueStep - Snapshots', () => {
  const mockOnSelectIssueType = vi.fn();
  const mockOnCancel = vi.fn();

  it('matches the issue selection snapshot', () => {
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);
    expect(screen.getByRole('dialog')).toMatchSnapshot();
  });

  it('matches the selected issue snapshot', async () => {
    const user = userEvent.setup();
    renderWithDialog(<DialogReportPostIssueStep onSelectIssueType={mockOnSelectIssueType} onCancel={mockOnCancel} />);
    await user.click(screen.getByRole('option', { name: REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.HATE_SPEECH] }));
    expect(screen.getByRole('dialog')).toMatchSnapshot();
  });
});

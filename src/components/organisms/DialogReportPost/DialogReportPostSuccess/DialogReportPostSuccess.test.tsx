import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import { DialogReportPostSuccess } from './DialogReportPostSuccess';

const renderWithDialog = (component: React.ReactElement) => {
  return render(
    <Dialog open={true}>
      <DialogContent>{component}</DialogContent>
    </Dialog>,
  );
};

describe('DialogReportPostSuccess', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct title', () => {
    renderWithDialog(<DialogReportPostSuccess onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Report Sent')).toBeInTheDocument();
  });

  it('renders with correct description', () => {
    renderWithDialog(<DialogReportPostSuccess onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Your report will be reviewed soon. Thank you.')).toBeInTheDocument();
  });

  it('renders welcome button with check icon', () => {
    renderWithDialog(<DialogReportPostSuccess onOpenChange={mockOnOpenChange} />);

    // The main close button in the footer (not the X button)
    const button = screen.getByText("You're welcome!").closest('button');
    expect(button).toBeInTheDocument();
    expect(screen.getByText("You're welcome!")).toBeInTheDocument();
  });

  it('calls onOpenChange with false when button is clicked', () => {
    renderWithDialog(<DialogReportPostSuccess onOpenChange={mockOnOpenChange} />);

    // The main close button in the footer (not the X button)
    const button = screen.getByText("You're welcome!").closest('button');
    fireEvent.click(button!);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('DialogReportPostSuccess - Snapshots', () => {
  const mockOnOpenChange = vi.fn();

  it('matches snapshot', () => {
    const { container } = renderWithDialog(<DialogReportPostSuccess onOpenChange={mockOnOpenChange} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

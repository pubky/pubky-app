import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogConfirmBackup } from './DialogConfirmBackup';

const mockClearSecrets = vi.fn();

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn(() => ({
    clearSecrets: mockClearSecrets,
  })),
}));

vi.mock('@/organisms/DialogBackup/DialogBackup', () => {
  return {
    DialogBackup: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <div data-testid="dialog-backup" data-open={open.toString()}>
        DialogBackup
      </div>
    ),
  };
});

describe('DialogConfirmBackup', () => {
  it('renders the Done trigger', () => {
    render(<DialogConfirmBackup />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('opens the confirm dialog and clears secrets on confirm', () => {
    const onConfirm = vi.fn();
    render(<DialogConfirmBackup onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('All backed up?');
    expect(screen.getByText(/your seed will be deleted from the browser/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm \(delete seed\)/i }));
    expect(mockClearSecrets).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dialog-title')).not.toBeInTheDocument();
  });

  it('hands off to the backup methods dialog without clearing secrets', () => {
    render(<DialogConfirmBackup />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('dialog-backup')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Backup methods/i }));

    expect(screen.getByTestId('dialog-backup')).toHaveAttribute('data-open', 'true');
    expect(screen.queryByTestId('dialog-title')).not.toBeInTheDocument();
    expect(mockClearSecrets).not.toHaveBeenCalled();
  });
});

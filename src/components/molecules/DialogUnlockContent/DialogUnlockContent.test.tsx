import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogUnlockContent } from './DialogUnlockContent';

const setup = (override?: Partial<React.ComponentProps<typeof DialogUnlockContent>>) => {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <DialogUnlockContent
      open
      onOpenChange={onOpenChange}
      lockTitle="Private Key Management"
      onSubmit={onSubmit}
      {...override}
    />,
  );
  return { onOpenChange, onSubmit };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DialogUnlockContent', () => {
  it('renders the title and the lock title', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
    expect(screen.getByText('Private Key Management')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps View Content disabled until a password is entered', () => {
    setup();
    const viewContent = screen.getByRole('button', { name: 'View Content' });
    expect(viewContent).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'anything' } });
    expect(viewContent).toBeEnabled();
  });

  it('submits the entered password when View Content is clicked (Phase 1 accepts any value)', () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    expect(onSubmit).toHaveBeenCalledWith('hunter2');
  });

  it('requests close when Cancel is clicked', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables the action and does not submit while loading', () => {
    const { onSubmit } = setup({ loading: true });
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'anything' } });

    const action = screen.getByRole('button', { name: 'Loading' });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the typed password when the dialog is dismissed', () => {
    setup();
    const password = screen.getByLabelText('Password', { selector: 'input' });
    fireEvent.change(password, { target: { value: 'hunter2' } });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(password).toHaveValue('');
  });

  it('shows an error message when the unlock failed', () => {
    setup({ error: true });
    expect(screen.getByText(/Couldn't unlock/i)).toBeInTheDocument();
  });
});

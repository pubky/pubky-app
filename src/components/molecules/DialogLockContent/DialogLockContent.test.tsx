import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogLockContent } from './DialogLockContent';

vi.mock('@/atoms/Dialog/Dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const setup = (override?: Partial<React.ComponentProps<typeof DialogLockContent>>) => {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn();
  render(<DialogLockContent open onOpenChange={onOpenChange} onApplied={onApplied} {...override} />);
  return { onOpenChange, onApplied };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DialogLockContent', () => {
  it('renders Password and Payment tabs, Password active by default', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Password' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Payment' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByLabelText('Password', { selector: 'input' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('keeps Apply Lock disabled until the password meets the policy and matches', () => {
    setup();
    const apply = screen.getByRole('button', { name: 'Apply Lock' });
    const password = screen.getByLabelText('Password', { selector: 'input' });
    const repeat = screen.getByLabelText('Repeat Password', { selector: 'input' });

    fireEvent.change(password, { target: { value: 'abcd1234' } }); // no special char
    fireEvent.change(repeat, { target: { value: 'abcd1234' } });
    expect(apply).toBeDisabled();

    fireEvent.change(password, { target: { value: 'Secret12!' } });
    fireEvent.change(repeat, { target: { value: 'Secret12!' } });
    expect(apply).toBeEnabled();
  });

  it('shows a mismatch message when passwords differ', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
      target: { value: 'Other99#' },
    });
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('hides password rules by default and shows only the unmet ones while typing', () => {
    setup();
    expect(screen.queryByText('At least 1 number')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'abcdefgh' } });
    expect(screen.getByText('At least 1 number')).toBeInTheDocument();
    expect(screen.getByText('At least 1 special character')).toBeInTheDocument();
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    expect(screen.queryByText('At least 1 number')).not.toBeInTheDocument();
  });

  it('passes the password to onApplied on Apply Lock', () => {
    const { onApplied } = setup();
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
      target: { value: 'Secret12!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));

    expect(onApplied).toHaveBeenCalledWith('Secret12!');
  });

  it('closes without applying on Cancel', () => {
    const { onOpenChange, onApplied } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

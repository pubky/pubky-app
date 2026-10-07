import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { DialogInlineTrigger } from './DialogInlineTrigger';

describe('DialogInlineTrigger', () => {
  it('renders with default props', () => {
    render(<DialogInlineTrigger>Terms of Service</DialogInlineTrigger>);

    const trigger = screen.getByRole('button', { name: 'Terms of Service' });
    expect(trigger.tagName).toBe('SPAN');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveClass('cursor-pointer', 'font-medium', 'text-brand');
  });

  it.each(['Enter', ' '])('clicks itself on the "%s" key', (key) => {
    const handleClick = vi.fn();
    render(<DialogInlineTrigger onClick={handleClick}>Terms of Service</DialogInlineTrigger>);

    const trigger = screen.getByRole('button', { name: 'Terms of Service' });
    const keyDown = fireEvent.keyDown(trigger, { key });

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(keyDown).toBe(false);
  });

  it('ignores other keys', () => {
    const handleClick = vi.fn();
    render(<DialogInlineTrigger onClick={handleClick}>Terms of Service</DialogInlineTrigger>);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Terms of Service' }), { key: 'a' });

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('forwards a consumer onKeyDown before activating', () => {
    const handleKeyDown = vi.fn();
    render(<DialogInlineTrigger onKeyDown={handleKeyDown}>Terms of Service</DialogInlineTrigger>);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Terms of Service' }), { key: 'Enter' });

    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });

  it('opens a Radix dialog from the keyboard when used as its trigger', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <DialogInlineTrigger>Open</DialogInlineTrigger>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Inline dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard(' ');

    expect(screen.getByRole('dialog', { name: 'Inline dialog' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('DialogInlineTrigger - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<DialogInlineTrigger>Terms of Service</DialogInlineTrigger>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with a custom className', () => {
    const { container } = render(<DialogInlineTrigger className="text-foreground">Privacy Policy</DialogInlineTrigger>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

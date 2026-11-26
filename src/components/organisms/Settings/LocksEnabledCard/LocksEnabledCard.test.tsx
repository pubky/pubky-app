import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocksEnabledCard } from './LocksEnabledCard';

const renderCard = () => {
  const onRecheck = vi.fn();
  render(<LocksEnabledCard onRecheck={onRecheck} />);
  return { onRecheck };
};

describe('LocksEnabledCard', () => {
  it('lists the Lock Server and the Bitkit wallet as set up', () => {
    renderCard();

    expect(
      within(screen.getByTestId('locks-access-lock-server')).getByText('Authorized the Locks server'),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('locks-access-bitkit')).getByText('Linked Bitkit wallet to enable payments'),
    ).toBeVisible();
  });

  it.each([
    ['Revoke access', 'Revoke Locks server access', /open Pubky Ring, select your pubky, tap locks\.paykit\.app/],
    [
      'Disconnect Bitkit',
      'Disconnect Bitkit?',
      /open Bitkit, go to your profile, tap edit, scroll down, and tap 'Unlink Profile'/,
    ],
  ])('"%s" only explains where to do it, then checks again on OK', (action, title, text) => {
    const { onRecheck } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: action }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    expect(within(dialog).getByText(text)).toBeInTheDocument();
    expect(onRecheck).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));

    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('does not check again when the dialog is closed without OK', () => {
    const { onRecheck } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onRecheck).not.toHaveBeenCalled();
  });
});

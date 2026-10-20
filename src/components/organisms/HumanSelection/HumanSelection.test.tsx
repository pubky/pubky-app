import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HumanSelection } from './HumanSelection';

vi.mock('@/molecules/HumanFooter/HumanFooter', () => {
  return {
    HumanFooter: () => <div data-testid="mock-human-footer">Human Footer</div>,
  };
});

vi.mock('@/molecules/HumanSmsCard/HumanSmsCard', () => {
  return {
    HumanSmsCard: () => <div data-testid="mock-sms-card">SMS Verification Card</div>,
  };
});

vi.mock('@/organisms/HumanBitcoinCard/HumanBitcoinCard', () => {
  return {
    HumanBitcoinCard: () => <div data-testid="mock-bitcoin-card">Bitcoin Payment Card</div>,
  };
});

describe('HumanSelection', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders all three verification options', () => {
    render(<HumanSelection onClick={() => {}} onInviteCodeClick={() => {}} onDevMode={() => {}} />);

    expect(screen.getByTestId('mock-sms-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-bitcoin-card')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('human-verification-cards')).getByTestId('invite-code-option-card'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('mock-human-footer')).toBeInTheDocument();
  });

  it('opens invite code entry from its own verification card', () => {
    const onInviteCodeClick = vi.fn();
    const onClick = vi.fn();
    render(<HumanSelection onClick={onClick} onInviteCodeClick={onInviteCodeClick} onDevMode={() => {}} />);

    const card = within(screen.getByTestId('invite-code-option-card'));
    expect(card.getByRole('heading', { name: 'Invite Code' })).toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: 'Enter invite code' }));
    expect(onInviteCodeClick).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HumanSelection } from './HumanSelection';

vi.mock('@/molecules', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/molecules');

  return {
    ...actual,
    HumanSmsCard: () => <div data-testid="mock-sms-card">SMS Verification Card</div>,
    HumanFooter: () => <div data-testid="mock-human-footer">Human Footer</div>,
  };
});

vi.mock('@/organisms', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/organisms');

  return {
    ...actual,
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

  it('renders both verification cards', () => {
    render(<HumanSelection onClick={() => {}} onInviteCodeClick={() => {}} onDevMode={() => {}} />);

    expect(screen.getByTestId('mock-sms-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-bitcoin-card')).toBeInTheDocument();
    expect(screen.getByTestId('mock-human-footer')).toBeInTheDocument();
  });

  it('renders invite code link in subtitle', () => {
    render(<HumanSelection onClick={() => {}} onInviteCodeClick={() => {}} onDevMode={() => {}} />);

    expect(screen.getByTestId('invite-code-link')).toBeInTheDocument();
    expect(screen.getByText('invite code.')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <HumanSelection onClick={() => {}} onInviteCodeClick={() => {}} onDevMode={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });
});

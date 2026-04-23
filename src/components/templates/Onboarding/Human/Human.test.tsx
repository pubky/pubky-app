import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Human } from './Human';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/organisms', async () => {
  const actual = await vi.importActual('@/organisms');
  return {
    ...actual,
    HumanSelection: () => <div data-testid="human-selection">Human Selection</div>,
    HumanPhoneInput: () => <div data-testid="human-phone-input">Human Phone Input</div>,
    HumanPhoneCode: () => <div data-testid="human-phone-code">Human Phone Code</div>,
    HumanLightningPayment: () => <div data-testid="human-lightning-payment">Human Lightning Payment</div>,
    HumanInviteCode: () => <div data-testid="human-invite-code">Human Invite Code</div>,
  };
});

describe('Human template', () => {
  it('renders all main components', () => {
    render(<Human />);

    expect(screen.getByTestId('human-selection')).toBeInTheDocument();
  });
});
describe('Human template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Human />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Human } from './Human';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/organisms/HumanInviteCode/HumanInviteCode', () => {
  return {
    HumanInviteCode: () => <div data-testid="human-invite-code">Human Invite Code</div>,
  };
});

vi.mock('@/organisms/HumanLightningPayment/HumanLightningPayment', () => {
  return {
    HumanLightningPayment: () => <div data-testid="human-lightning-payment">Human Lightning Payment</div>,
  };
});

vi.mock('@/organisms/HumanPhoneCode/HumanPhoneCode', () => {
  return {
    HumanPhoneCode: () => <div data-testid="human-phone-code">Human Phone Code</div>,
  };
});

vi.mock('@/organisms/HumanPhoneInput/HumanPhoneInput', () => {
  return {
    HumanPhoneInput: () => <div data-testid="human-phone-input">Human Phone Input</div>,
  };
});

vi.mock('@/organisms/HumanSelection/HumanSelection', () => {
  return {
    HumanSelection: () => <div data-testid="human-selection">Human Selection</div>,
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

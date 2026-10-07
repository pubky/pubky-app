import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Join } from './Join';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

const passportMocks = vi.hoisted(() => ({
  eligibility: 'enabled' as 'pending' | 'enabled' | 'disabled',
  isPending: false,
  startPassportAuth: vi.fn(),
}));
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => passportMocks.eligibility,
}));
vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({ startPassportAuth: passportMocks.startPassportAuth, isPending: passportMocks.isPending }),
}));
vi.mock('@/molecules/HumanFooter/HumanFooter', () => ({
  HumanFooter: () => <div data-testid="mock-human-footer">Human Footer</div>,
}));

describe('Join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passportMocks.eligibility = 'enabled';
    passportMocks.isPending = false;
  });

  it('renders both methods (desktop cards and mobile sections) when Passport is enabled', () => {
    const { container } = render(<Join />);

    expect(screen.getByText('How would you like to create your pubky?')).toBeInTheDocument();
    expect(screen.getByTestId('join-sovereign-card')).toBeInTheDocument();
    expect(screen.getByTestId('passport-method-card')).toBeInTheDocument();
    expect(screen.getByTestId('passport-method-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('join-manage-own-keys')).toHaveLength(2);
    expect(screen.getByTestId('mock-human-footer')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(container).toMatchSnapshot();
  });

  it('routes "Manage your own keys" to the fair-access step', () => {
    render(<Join />);

    fireEvent.click(screen.getAllByTestId('join-manage-own-keys')[0]!);
    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
  });

  it('starts a Passport attempt from Continue with Google', () => {
    render(<Join />);

    fireEvent.click(screen.getAllByTestId('continue-with-google')[0]!);
    expect(passportMocks.startPassportAuth).toHaveBeenCalledTimes(1);
  });

  it('disables both methods while a Passport attempt is pending', () => {
    passportMocks.isPending = true;
    render(<Join />);

    for (const button of screen.getAllByTestId('join-manage-own-keys')) expect(button).toBeDisabled();
    for (const button of screen.getAllByTestId('continue-with-google')) expect(button).toBeDisabled();
  });

  it('renders the shell without the Google option while eligibility is pending and does not redirect', () => {
    passportMocks.eligibility = 'pending';
    render(<Join />);

    expect(screen.getByTestId('join-sovereign-card')).toBeInTheDocument();
    expect(screen.queryByTestId('passport-method-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('passport-method-section')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces itself with the fair-access step once eligibility resolves to disabled', () => {
    passportMocks.eligibility = 'disabled';
    render(<Join />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
  });
});

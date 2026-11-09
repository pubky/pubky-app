import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassportMethodCard, PassportMethodSection } from './PassportMethodCard';

const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/config/network', () => ({ isPassportAppleEnabled: mockAppleEnabled }));
beforeEach(() => mockAppleEnabled.mockReturnValue(false));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('PassportMethodCard', () => {
  it('renders the Quick & Easy card with the cloud illustration and forwards the click', () => {
    const onContinue = vi.fn();
    render(<PassportMethodCard onContinue={onContinue} isPending={false} />);

    expect(screen.getByTestId('passport-method-card')).toBeInTheDocument();
    expect(screen.getByText('Quick & Easy')).toBeInTheDocument();
    expect(screen.getByText('Use your existing sign-in methods.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/images/passport-cloud.webp');

    fireEvent.click(screen.getByTestId('continue-with-google'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('disables the button while pending', () => {
    render(<PassportMethodCard onContinue={vi.fn()} isPending />);

    expect(screen.getByTestId('continue-with-google')).toBeDisabled();
  });
});

describe('PassportMethodSection', () => {
  it('renders the uppercase label and button for the mobile layout', () => {
    const onContinue = vi.fn();
    render(<PassportMethodSection onContinue={onContinue} isPending={false} />);

    expect(screen.getByTestId('passport-method-section')).toBeInTheDocument();
    expect(screen.getByText('Quick & Easy')).toHaveClass('uppercase');

    fireEvent.click(screen.getByTestId('continue-with-google'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe.each([PassportMethodCard, PassportMethodSection])('Passport method flag wiring', (Component) => {
  it.each([false, true])('uses the runtime-selected label for Apple flag=%s', (enabled) => {
    mockAppleEnabled.mockReturnValue(enabled);
    render(<Component onContinue={vi.fn()} isPending={false} />);
    expect(screen.getByTestId('continue-with-google')).toHaveAccessibleName(
      enabled ? 'Continue with Google or Apple' : 'Continue with Google',
    );
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { ContextualBanner } from './ContextualBanner';
import type { ContextualBannerProps } from './ContextualBanner.types';

const HEADLINE = 'Get to know Satoshi';
const BODY = 'Join Pubky to follow Satoshi and take part in the conversation.';

function renderBanner(overrides: Partial<ContextualBannerProps> = {}) {
  return render(
    <ContextualBanner
      headline={HEADLINE}
      body={BODY}
      joinHref={ONBOARDING_ROUTES.JOIN}
      signInHref={AUTH_ROUTES.SIGN_IN}
      {...overrides}
    />,
  );
}

describe('ContextualBanner', () => {
  it('renders a region named "Join Pubky" with the headline and body', () => {
    renderBanner();

    const region = screen.getByRole('region', { name: 'Join Pubky' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveAttribute('data-testid', 'contextual-banner');
    const headline = screen.getByText(HEADLINE);
    const body = screen.getByText(BODY);
    expect(region).toContainElement(headline);
    expect(region).toContainElement(body);
    // The headline leads; the body follows it.
    expect(headline.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links "Join Pubky" to joinHref and "Sign in" to signInHref', () => {
    renderBanner({ joinHref: ONBOARDING_ROUTES.HUMAN, signInHref: '/custom-sign-in' });

    const joinLink = screen.getByRole('link', { name: 'Join Pubky' });
    const signInLink = screen.getByRole('link', { name: 'Sign in' });

    expect(joinLink).toHaveAttribute('href', ONBOARDING_ROUTES.HUMAN);
    expect(signInLink).toHaveAttribute('href', '/custom-sign-in');
    // Both are the dark outline pills from the Button atom, rendered as links (asChild).
    expect(joinLink).toHaveAttribute('data-variant', 'dark-outline');
    expect(signInLink).toHaveAttribute('data-variant', 'dark-outline');
  });

  it('renders neither the Google button nor its divider without onContinueWithGoogle', () => {
    renderBanner();

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('contextual-banner-google')).not.toBeInTheDocument();
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    // "Sign in" is the last action: no divider follows it.
    expect(screen.getByRole('link', { name: 'Sign in' }).nextElementSibling).toBeNull();
  });

  it('renders "Continue with Google" after a divider and calls the handler on click', () => {
    const onContinueWithGoogle = vi.fn();
    renderBanner({ onContinueWithGoogle });

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton).toHaveAttribute('type', 'button');
    expect(googleButton).toHaveAttribute('data-variant', 'dark');
    expect(googleButton).toBeEnabled();
    expect(googleButton).toHaveAttribute('aria-busy', 'false');
    // Icon-only below `sm`, where the text label is display:none: the aria-label carries the name.
    // jsdom applies no CSS, so the role query alone would also match on the text content.
    expect(googleButton).toHaveAttribute('aria-label', 'Continue with Google');
    // Visible label from `sm`.
    expect(googleButton).toHaveTextContent('Continue with Google');

    const divider = screen.getByRole('link', { name: 'Sign in' }).nextElementSibling;
    expect(divider?.tagName).toBe('SPAN');
    expect(divider).toHaveAttribute('aria-hidden', 'true');
    expect(divider?.nextElementSibling).toBe(googleButton);

    fireEvent.click(googleButton);

    expect(onContinueWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows the Google icon, not the spinner, while idle', () => {
    renderBanner({ onContinueWithGoogle: vi.fn() });

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton.querySelector('svg.animate-spin')).toBeNull();
    expect(googleButton.querySelector('svg')).not.toBeNull();
  });

  it('disables the Google button while pending and does not call the handler', () => {
    const onContinueWithGoogle = vi.fn();
    renderBanner({ onContinueWithGoogle, isGooglePending: true });

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();

    const googleButton = screen.getByRole('button', { name: 'Waiting for Passport...' });
    expect(googleButton).toBeDisabled();
    expect(googleButton).toHaveAttribute('aria-busy', 'true');
    expect(googleButton).toHaveAttribute('aria-label', 'Waiting for Passport...');
    expect(googleButton).toHaveTextContent('Waiting for Passport...');
    expect(googleButton.querySelector('svg.animate-spin')).not.toBeNull();

    fireEvent.click(googleButton);

    expect(onContinueWithGoogle).not.toHaveBeenCalled();
  });

  it('ignores isGooglePending when there is no Google handler', () => {
    renderBanner({ isGooglePending: true });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for Passport...')).not.toBeInTheDocument();
  });

  it('takes pointer input only on the bar, so the scrim never blocks the page under it', () => {
    renderBanner();

    const region = screen.getByRole('region', { name: 'Join Pubky' });
    // The slot the global scroll-padding rule keys on to keep focus clear of the banner.
    expect(region).toHaveAttribute('data-slot', 'contextual-banner');
    expect(region).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('contextual-banner-bar')).toHaveClass('pointer-events-auto');
  });

  it('gives every action the dark focus ring that stays visible on lime', () => {
    renderBanner({ onContinueWithGoogle: vi.fn() });

    for (const action of [
      screen.getByRole('link', { name: 'Join Pubky' }),
      screen.getByRole('link', { name: 'Sign in' }),
      screen.getByRole('button', { name: 'Continue with Google' }),
    ]) {
      expect(action).toHaveClass('focus-visible:ring-primary-foreground');
    }
  });

  it('merges className onto the section', () => {
    renderBanner({ className: 'custom-banner-class' });

    const region = screen.getByRole('region', { name: 'Join Pubky' });
    expect(region).toHaveClass('custom-banner-class');
    expect(region).toHaveClass('fixed', 'inset-x-0', 'z-40');
  });
});

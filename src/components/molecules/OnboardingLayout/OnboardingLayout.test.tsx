import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingLayout } from './OnboardingLayout';

describe('OnboardingLayout', () => {
  it('renders children correctly', () => {
    render(
      <OnboardingLayout testId="test-content">
        <div>Test Content</div>
      </OnboardingLayout>,
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders with navigation when provided', () => {
    render(
      <OnboardingLayout testId="with-nav" navigation={<button>Next</button>}>
        <div>Content</div>
      </OnboardingLayout>,
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('renders without navigation when not provided', () => {
    const { container } = render(
      <OnboardingLayout testId="no-nav">
        <div>Content</div>
      </OnboardingLayout>,
    );

    const navContainer = container.querySelector('.onboarding-nav');
    expect(navContainer).not.toBeInTheDocument();
  });

  it('applies the shared content gutter (16px mobile, 24px at lg, none at xl)', () => {
    render(
      <OnboardingLayout testId="default-gutter">
        <div>Content</div>
      </OnboardingLayout>,
    );

    const root = screen.getByTestId('default-gutter').parentElement;
    expect(root).toHaveClass('px-4', 'lg:px-6', 'xl:px-0');
    expect(root).not.toHaveClass('px-6');
  });

  it('merges a caller className into the root container', () => {
    render(
      <OnboardingLayout testId="custom-gutter" className="px-0 lg:px-0">
        <div>Content</div>
      </OnboardingLayout>,
    );

    const root = screen.getByTestId('custom-gutter').parentElement;
    expect(root).toHaveClass('px-0', 'lg:px-0');
    expect(root).not.toHaveClass('px-4', 'lg:px-6');
  });

  it('keeps navigation close to content when bottom pinning is disabled', () => {
    const { container } = render(
      <OnboardingLayout testId="unpinned-nav" navigation={<button>Next</button>} pinNavigationToBottom={false}>
        <div>Content</div>
      </OnboardingLayout>,
    );

    expect(screen.getByTestId('unpinned-nav')).toHaveClass('flex-none');
    const navContainer = container.querySelector('.onboarding-nav');
    expect(navContainer).toHaveClass('mt-3');
    expect(navContainer).not.toHaveClass('mt-auto');
  });
});

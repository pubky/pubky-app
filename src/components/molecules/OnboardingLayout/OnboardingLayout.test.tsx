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
});

describe('OnboardingLayout - Snapshots', () => {
  it('matches snapshot with only content', () => {
    const { container } = render(
      <OnboardingLayout testId="content-only">
        <div>Simple Content</div>
      </OnboardingLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with content and navigation', () => {
    const { container } = render(
      <OnboardingLayout testId="with-navigation" navigation={<button>Next Step</button>}>
        <div>Content with Navigation</div>
      </OnboardingLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple children', () => {
    const { container } = render(
      <OnboardingLayout testId="multiple-children">
        <header>Header</header>
        <main>Main Content</main>
        <footer>Footer</footer>
      </OnboardingLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex navigation', () => {
    const { container } = render(
      <OnboardingLayout
        testId="complex-nav"
        navigation={
          <div className="flex gap-4">
            <button>Back</button>
            <button>Next</button>
          </div>
        }
      >
        <div>Content</div>
      </OnboardingLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

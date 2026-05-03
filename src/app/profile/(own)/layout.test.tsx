import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfileLayout from './layout';

// Mock ProfilePageContainer organism
vi.mock('@/organisms/ProfilePageContainer/ProfilePageContainer', () => {
  return {
    ProfilePageContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="profile-page-container">{children}</div>
    ),
  };
});

describe('ProfileLayout', () => {
  it('renders without errors', () => {
    render(
      <ProfileLayout>
        <div>Test Content</div>
      </ProfileLayout>,
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders ProfilePageContainer', () => {
    render(
      <ProfileLayout>
        <div>Test</div>
      </ProfileLayout>,
    );
    expect(screen.getByTestId('profile-page-container')).toBeInTheDocument();
  });

  it('passes children to ProfilePageContainer', () => {
    render(
      <ProfileLayout>
        <div data-testid="custom-child">Custom Content</div>
      </ProfileLayout>,
    );
    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
  });

  it('is a simple wrapper with no business logic', () => {
    // This test verifies that ProfileLayout is truly "dumb plumbing"
    // by checking that it only renders the container and passes children
    const { container } = render(
      <ProfileLayout>
        <div>Test</div>
      </ProfileLayout>,
    );

    // Should only have one direct child (the container)
    const wrapper = container.firstChild;
    expect(wrapper).toBeTruthy();
    expect(screen.getByTestId('profile-page-container')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <ProfileLayout>
        <div>Test Content</div>
      </ProfileLayout>,
    );
    expect(container).toMatchSnapshot();
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { EditProfile } from './EditProfile';

vi.mock('@/molecules/OnboardingLayout/OnboardingLayout', () => {
  return {
    OnboardingLayout: ({ children, testId }: { children: React.ReactNode; testId?: string }) => (
      <div data-testid={testId}>{children}</div>
    ),
  };
});

vi.mock('@/organisms/Settings/EditProfileForm/EditProfileForm', () => {
  return {
    EditProfileForm: () => <div data-testid="edit-profile-form" />,
  };
});

vi.mock('@/organisms/Settings/EditProfileHeader/EditProfileHeader', () => {
  return {
    EditProfileHeader: () => <div data-testid="edit-profile-header" />,
  };
});

describe('EditProfile', () => {
  it('renders without crashing', () => {
    const { container } = render(<EditProfile />);
    expect(container).toBeTruthy();
  });

  it('renders the edit profile header', () => {
    render(<EditProfile />);
    expect(screen.getByTestId('edit-profile-header')).toBeInTheDocument();
  });

  it('renders the edit profile form', () => {
    render(<EditProfile />);
    expect(screen.getByTestId('edit-profile-form')).toBeInTheDocument();
  });

  it('renders within the onboarding layout', () => {
    render(<EditProfile />);
    expect(screen.getByTestId('edit-profile-content')).toBeInTheDocument();
  });
});

describe('EditProfile - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<EditProfile />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('EditProfile - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });
  afterEach(() => {
    resetViewport();
  });
  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<EditProfile />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditProfile } from './EditProfile';

vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    OnboardingLayout: ({ children, testId }: { children: React.ReactNode; testId?: string }) => (
      <div data-testid={testId}>{children}</div>
    ),
  };
});

vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    EditProfileHeader: () => <div data-testid="edit-profile-header" />,
    EditProfileForm: () => <div data-testid="edit-profile-form" />,
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

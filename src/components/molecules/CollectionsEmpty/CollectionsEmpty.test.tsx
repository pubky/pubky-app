import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionsEmpty } from './CollectionsEmpty';

const mocks = vi.hoisted(() => ({
  isOwnProfile: true,
}));

vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: () => ({
    pubky: 'test-pubky',
    isOwnProfile: mocks.isOwnProfile,
    isLoading: false,
  }),
}));

// Trigger mode: the dialog wraps its `children` as the click target.
vi.mock('@/organisms/Collections/DialogNewCollection/DialogNewCollection', () => ({
  DialogNewCollection: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-new-collection">{children}</div>
  ),
}));

vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => {
  return {
    IllustratedEmptyState: ({
      imageSrc,
      imageAlt,
      icon: Icon,
      title,
      subtitle,
      children,
    }: {
      imageSrc: string;
      imageAlt: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      title: string;
      subtitle: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid="empty-state">
        <div data-testid="image" data-src={imageSrc} data-alt={imageAlt} />
        <Icon data-testid="library-icon" />
        <h3>{title}</h3>
        <p>{subtitle}</p>
        {children}
      </div>
    ),
  };
});

describe('CollectionsEmpty', () => {
  beforeEach(() => {
    mocks.isOwnProfile = true;
  });

  it('renders title', () => {
    render(<CollectionsEmpty />);
    expect(screen.getByText(/No collections yet/i)).toBeInTheDocument();
  });

  it('renders own-profile subtitle and a Create Collection CTA wired as the dialog trigger', () => {
    render(<CollectionsEmpty />);
    expect(screen.getByText(/Curate ideas, filter signal from noise, and share what matters\./i)).toBeInTheDocument();

    const dialog = screen.getByTestId('dialog-new-collection');
    expect(within(dialog).getByRole('button', { name: /Create Collection/i })).toBeInTheDocument();
  });

  it('renders Library icon and background image', () => {
    render(<CollectionsEmpty />);
    expect(screen.getByTestId('library-icon')).toBeInTheDocument();
    const image = screen.getByTestId('image');
    expect(image).toHaveAttribute('data-src', '/images/notifications-empty-state.webp');
    expect(image).toHaveAttribute('data-alt', 'Collections - Empty state');
  });

  it('hides the CTA and dialog and uses visitor copy on another user profile', () => {
    mocks.isOwnProfile = false;
    render(<CollectionsEmpty />);

    expect(screen.getByText(/No collections yet/i)).toBeInTheDocument();
    expect(screen.getByText(/This user hasn't created any collections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Collection/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dialog-new-collection')).not.toBeInTheDocument();
  });
});

describe('CollectionsEmpty - Snapshots', () => {
  beforeEach(() => {
    mocks.isOwnProfile = true;
  });

  it('matches snapshot on own profile', () => {
    const { container } = render(<CollectionsEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot on another user profile', () => {
    mocks.isOwnProfile = false;
    const { container } = render(<CollectionsEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

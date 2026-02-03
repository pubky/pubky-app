import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationsEmpty } from './NotificationsEmpty';

// Mock ProfilePageEmptyState
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    ProfilePageEmptyState: ({
      imageSrc,
      imageAlt,
      icon: Icon,
      title,
      subtitle,
    }: {
      imageSrc: string;
      imageAlt: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      title: string;
      subtitle: string;
    }) => (
      <div data-testid="empty-state">
        <div data-testid="image" data-src={imageSrc} data-alt={imageAlt} />
        <Icon data-testid="frown-icon" />
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    ),
  };
});

describe('NotificationsEmpty', () => {
  it('renders title', () => {
    render(<NotificationsEmpty />);
    expect(screen.getByText(/Nothing to see here yet/i)).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<NotificationsEmpty />);
    expect(
      screen.getByText(/Tags, follows, reposts and account information will be displayed here/i),
    ).toBeInTheDocument();
  });

  it('renders Frown icon', () => {
    render(<NotificationsEmpty />);
    expect(screen.getByTestId('frown-icon')).toBeInTheDocument();
  });

  it('renders background image', () => {
    render(<NotificationsEmpty />);
    const image = screen.getByTestId('image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('data-src', '/images/notifications-empty-state.webp');
    expect(image).toHaveAttribute('data-alt', 'Notifications - Empty state');
  });
});

describe('NotificationsEmpty - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<NotificationsEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

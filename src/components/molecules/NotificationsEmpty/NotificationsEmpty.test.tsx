import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsEmpty } from './NotificationsEmpty';

// Mock IllustratedEmptyState
vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => {
  return {
    IllustratedEmptyState: ({
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
        <Icon data-testid="bell-icon" />
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    ),
  };
});

describe('NotificationsEmpty', () => {
  it('renders title', () => {
    render(<NotificationsEmpty />);
    expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<NotificationsEmpty />);
    expect(
      screen.getByText(/Tags, follows, reposts and account information will be displayed here/i),
    ).toBeInTheDocument();
  });

  it('renders Bell icon', () => {
    render(<NotificationsEmpty />);
    expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
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

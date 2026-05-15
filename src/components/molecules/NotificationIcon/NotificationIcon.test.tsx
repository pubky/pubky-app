import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationIcon } from './NotificationIcon';

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      style,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      style?: React.CSSProperties;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} style={style} data-override={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

describe('NotificationIcon', () => {
  it('renders Follow icon for Follow notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders NewFriend icon for NewFriend notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.NewFriend} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders Tag icon for TagPost notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.TagPost} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders Tag icon for TagProfile notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.TagProfile} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders Reply icon for Reply notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Reply} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders Repost icon for Repost notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Repost} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders Mention icon for Mention notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Mention} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders PostDeleted icon for PostDeleted notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.PostDeleted} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders PostEdited icon for PostEdited notification type', () => {
    const { container } = render(<NotificationIcon type={NotificationType.PostEdited} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders icon with correct size', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={false} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('height', '24');
  });

  it('renders badge when showBadge is true', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={true} />);
    const badge = container.querySelector('[style*="width: 11px"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ width: '11px', height: '11px' });
  });

  it('does not render badge when showBadge is false', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={false} />);
    const badge = container.querySelector('[style*="width: 11px"]');
    expect(badge).not.toBeInTheDocument();
  });

  it('renders container with correct size', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={false} />);
    const mainContainer = container.firstChild as HTMLElement;
    expect(mainContainer).toHaveStyle({ width: '24px', height: '24px' });
  });

  it('applies brand color to badge class', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={true} />);
    const badge = container.querySelector('[style*="width: 11px"]') as HTMLElement;
    expect(badge).toHaveClass('bg-brand');
  });
});

describe('NotificationIcon - Snapshots', () => {
  it('matches snapshot for Follow notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Follow notification with badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Follow} showBadge={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for NewFriend notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.NewFriend} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for TagPost notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.TagPost} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for TagProfile notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.TagProfile} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Reply notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Reply} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Repost notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Repost} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Mention notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.Mention} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PostDeleted notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.PostDeleted} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PostEdited notification without badge', () => {
    const { container } = render(<NotificationIcon type={NotificationType.PostEdited} showBadge={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

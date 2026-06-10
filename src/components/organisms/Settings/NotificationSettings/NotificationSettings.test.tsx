import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultNotificationPreferences } from '@/stores/settings/settings.types';
import { NotificationSettings } from './NotificationSettings';

// Mock settings store and hook
const mockSetNotificationPreference = vi.fn();
const mockUseSettingsStore = vi.fn();

vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: () => mockUseSettingsStore(),
}));

vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => ({
  useSettingsActions: () => ({
    setNotificationPreference: mockSetNotificationPreference,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSettingsStore.mockReturnValue({
    notifications: defaultNotificationPreferences,
  });
});

describe('NotificationSettings', () => {
  it('renders all notification switches', () => {
    render(<NotificationSettings />);

    expect(screen.getByText('New follower')).toBeInTheDocument();
    expect(screen.getByText('New friend')).toBeInTheDocument();
    expect(screen.getByText('Someone tagged your post')).toBeInTheDocument();
    expect(screen.getByText('Someone tagged your profile')).toBeInTheDocument();
    expect(screen.getByText('Someone mentioned your profile')).toBeInTheDocument();
    expect(screen.getByText('New reply to your post')).toBeInTheDocument();
    expect(screen.getByText('New repost to your post')).toBeInTheDocument();
    expect(screen.getByText('Someone deleted the post you interacted with')).toBeInTheDocument();
    expect(screen.getByText('Someone edited the post you interacted with')).toBeInTheDocument();
  });

  it('calls setNotificationPreference when toggling a switch', () => {
    const { container } = render(<NotificationSettings />);

    const followSwitch = container.querySelector('#notification-switch-follow');
    fireEvent.click(followSwitch!);

    expect(mockSetNotificationPreference).toHaveBeenCalledWith('follow', false);
  });

  it('renders switches with correct checked state', () => {
    mockUseSettingsStore.mockReturnValue({
      notifications: {
        ...defaultNotificationPreferences,
        follow: false,
        reply: false,
      },
    });

    const { container } = render(<NotificationSettings />);

    const followSwitch = container.querySelector('#notification-switch-follow');
    const replySwitch = container.querySelector('#notification-switch-reply');
    const mentionSwitch = container.querySelector('#notification-switch-mention');

    expect(followSwitch).toHaveAttribute('aria-checked', 'false');
    expect(replySwitch).toHaveAttribute('aria-checked', 'false');
    expect(mentionSwitch).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles from false to true correctly', () => {
    mockUseSettingsStore.mockReturnValue({
      notifications: {
        ...defaultNotificationPreferences,
        follow: false,
      },
    });

    const { container } = render(<NotificationSettings />);

    const followSwitch = container.querySelector('#notification-switch-follow');
    fireEvent.click(followSwitch!);

    expect(mockSetNotificationPreference).toHaveBeenCalledWith('follow', true);
  });
});

describe('NotificationSettings - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<NotificationSettings />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

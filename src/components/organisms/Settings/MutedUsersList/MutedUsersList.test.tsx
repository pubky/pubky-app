import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MutedUsersList } from './MutedUsersList';

const { mockUseMutedUsers, mockUseBulkUserAvatars, mockUseMuteUser, mockToast } = vi.hoisted(() => ({
  mockUseMutedUsers: vi.fn(),
  mockUseBulkUserAvatars: vi.fn(),
  mockUseMuteUser: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useMutedUsers: () => mockUseMutedUsers(),
  useBulkUserAvatars: (ids: string[]) => mockUseBulkUserAvatars(ids),
  useMuteUser: () => mockUseMuteUser(),
}));

vi.mock('@/molecules', () => ({
  toast: (props: unknown) => mockToast(props),
}));

describe('MutedUsersList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap: new Map(),
      isLoading: false,
    });
    mockUseMuteUser.mockReturnValue({
      toggleMute: vi.fn(),
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });
  });

  it('renders empty state when no muted users', () => {
    render(<MutedUsersList />);
    expect(screen.getByText('No muted users yet')).toBeInTheDocument();
  });

  it('renders muted user with unmute button', () => {
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-123'],
      mutedUserIdSet: new Set(['user-123']),
      isMuted: vi.fn((id: string) => id === 'user-123'),
      isLoading: false,
    });

    render(<MutedUsersList />);
    expect(screen.getByText('Unknown User')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('Unmute')).toBeInTheDocument();
  });

  it('calls toggleMute when clicking unmute', () => {
    const toggleMute = vi.fn();
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-123'],
      mutedUserIdSet: new Set(['user-123']),
      isMuted: vi.fn((id: string) => id === 'user-123'),
      isLoading: false,
    });
    mockUseMuteUser.mockReturnValue({
      toggleMute,
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });

    render(<MutedUsersList />);
    const unmuteButton = screen.getByText('Unmute');
    fireEvent.click(unmuteButton);

    expect(toggleMute).toHaveBeenCalledWith('user-123', true);
  });

  it('calls toggleMute for each user when clicking unmute all', async () => {
    const toggleMute = vi.fn().mockResolvedValue(undefined);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1', 'user-2'],
      mutedUserIdSet: new Set(['user-1', 'user-2']),
      isMuted: vi.fn((id: string) => id === 'user-1' || id === 'user-2'),
      isLoading: false,
    });
    mockUseMuteUser.mockReturnValue({
      toggleMute,
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });

    render(<MutedUsersList />);
    const unmuteAllButton = screen.getByText('Unmute all users');
    await act(async () => {
      fireEvent.click(unmuteAllButton);
    });

    await waitFor(() => {
      expect(toggleMute).toHaveBeenCalledWith('user-1', true);
      expect(toggleMute).toHaveBeenCalledWith('user-2', true);
    });
  });
});

describe('MutedUsersList - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap: new Map(),
      isLoading: false,
    });
    mockUseMuteUser.mockReturnValue({
      toggleMute: vi.fn(),
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });
  });

  it('matches snapshot - empty state', () => {
    const { container } = render(<MutedUsersList />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot - with muted users', () => {
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1', 'user-2', 'user-3'],
      mutedUserIdSet: new Set(['user-1', 'user-2', 'user-3']),
      isMuted: vi.fn(() => true),
      isLoading: false,
    });

    const { container } = render(<MutedUsersList />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MutedUsers } from './MutedUsers';

const { mockUseMutedUsers, mockUseBulkUserAvatars, mockUseMuteUser, mockUseIsMobile } = vi.hoisted(() => ({
  mockUseMutedUsers: vi.fn(),
  mockUseBulkUserAvatars: vi.fn(),
  mockUseMuteUser: vi.fn(),
  mockUseIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: mockUseMutedUsers,
}));

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: mockUseBulkUserAvatars,
}));

vi.mock('@/hooks/useMuteUser/useMuteUser', () => ({
  useMuteUser: mockUseMuteUser,
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

describe('MutedUsers', () => {
  const mockToggleMute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleMute.mockResolvedValue(undefined);
    mockUseIsMobile.mockReturnValue(false);
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
      toggleMute: mockToggleMute,
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });
  });

  it('renders with default props', () => {
    render(<MutedUsers />);
    expect(screen.getByText('Muted users')).toBeInTheDocument();
  });

  it('wraps muted users content in section card on desktop', () => {
    const { container } = render(<MutedUsers />);
    const mutedUsersRoot = container.querySelector('[data-cy="muted-users-root"]');

    expect(mutedUsersRoot).toBeInTheDocument();
    expect(mutedUsersRoot?.closest('.border.border-border.p-6')).toBeInTheDocument();
  });

  it('does not wrap muted users content in section card on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { container } = render(<MutedUsers />);
    const mutedUsersRoot = container.querySelector('[data-cy="muted-users-root"]');

    expect(mutedUsersRoot).toBeInTheDocument();
    expect(mutedUsersRoot?.closest('.border.border-border.p-6')).not.toBeInTheDocument();
  });

  it('renders empty state when no muted users', () => {
    render(<MutedUsers />);
    expect(screen.getByText('No muted users yet')).toBeInTheDocument();
  });

  it('renders loading state with skeletons', () => {
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: true,
    });
    render(<MutedUsers />);
    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
  });

  it('renders muted users list', () => {
    const usersMap = new Map([
      ['user-1', { name: 'Test User 1', avatarUrl: 'https://example.com/avatar1.jpg' }],
      ['user-2', { name: 'Test User 2', avatarUrl: 'https://example.com/avatar2.jpg' }],
    ]);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1', 'user-2'],
      mutedUserIdSet: new Set(['user-1', 'user-2']),
      isMuted: vi.fn((id) => ['user-1', 'user-2'].includes(id)),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap,
      isLoading: false,
    });

    render(<MutedUsers />);
    expect(screen.getByText('Test User 1')).toBeInTheDocument();
    expect(screen.getByText('Test User 2')).toBeInTheDocument();
    expect(screen.getAllByText('Unmute')).toHaveLength(2);
    expect(screen.getByText('Unmute all users')).toBeInTheDocument();
  });

  it('calls toggleMute when unmute button is clicked', async () => {
    const usersMap = new Map([['user-1', { name: 'Test User 1', avatarUrl: null }]]);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1'],
      mutedUserIdSet: new Set(['user-1']),
      isMuted: vi.fn(() => true),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap,
      isLoading: false,
    });

    render(<MutedUsers />);
    fireEvent.click(screen.getByText('Unmute'));

    await waitFor(() => {
      expect(mockToggleMute).toHaveBeenCalledWith('user-1', true);
    });
  });

  it('calls toggleMute for all users when unmute all is clicked', async () => {
    const usersMap = new Map([
      ['user-1', { name: 'Test User 1', avatarUrl: null }],
      ['user-2', { name: 'Test User 2', avatarUrl: null }],
    ]);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1', 'user-2'],
      mutedUserIdSet: new Set(['user-1', 'user-2']),
      isMuted: vi.fn(() => true),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap,
      isLoading: false,
    });

    render(<MutedUsers />);
    fireEvent.click(screen.getByText('Unmute all users'));

    await waitFor(() => {
      expect(mockToggleMute).toHaveBeenCalledTimes(2);
      expect(mockToggleMute).toHaveBeenCalledWith('user-1', true);
      expect(mockToggleMute).toHaveBeenCalledWith('user-2', true);
    });
  });

  it('does not show unmute all button for single muted user', () => {
    const usersMap = new Map([['user-1', { name: 'Test User 1', avatarUrl: null }]]);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1'],
      mutedUserIdSet: new Set(['user-1']),
      isMuted: vi.fn(() => true),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap,
      isLoading: false,
    });

    render(<MutedUsers />);
    expect(screen.queryByText('Unmute all users')).not.toBeInTheDocument();
  });
});

describe('MutedUsers - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUseMuteUser.mockReturnValue({
      toggleMute: vi.fn(),
      isLoading: false,
      isUserLoading: vi.fn(() => false),
      error: null,
    });
  });

  it('matches snapshot with no muted users', () => {
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
    const { container } = render(<MutedUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loading state', () => {
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: true,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap: new Map(),
      isLoading: false,
    });
    const { container } = render(<MutedUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with muted users', () => {
    const usersMap = new Map([
      ['user-1', { name: 'Test User 1', avatarUrl: 'https://example.com/avatar1.jpg' }],
      ['user-2', { name: 'Test User 2', avatarUrl: null }],
    ]);
    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: ['user-1', 'user-2'],
      mutedUserIdSet: new Set(['user-1', 'user-2']),
      isMuted: vi.fn(() => true),
      isLoading: false,
    });
    mockUseBulkUserAvatars.mockReturnValue({
      usersMap,
      isLoading: false,
    });
    const { container } = render(<MutedUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockRingSession, mockSession } from '@/test-utils/pubky';
import { LocksPermissionNotice } from './LocksPermissionNotice';

vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyring://authorize?token=upgrade',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    onAuthorizeClick: vi.fn(),
  }),
}));

const narrowSession = () => mockRingSession(['/pub/pubky.app/:rw'], 'reader-pubky');

describe('LocksPermissionNotice', () => {
  beforeEach(() => {
    useAuthStore.setState({ ...authInitialState, currentUserPubky: 'reader-pubky', session: narrowSession() });
  });

  it('opens the Ring approval when the button is clicked', () => {
    render(<LocksPermissionNotice />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Authorize with Pubky Ring' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Enable Locks')).toBeInTheDocument();
    expect(screen.getByTestId('session-upgrade-qr')).toBeInTheDocument();
  });

  // In a feed the notice renders inside the post card's click target, which navigates away and
  // unmounts the dialog the click just opened.
  it('does not let the button click reach the surrounding post card', () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick} role="presentation">
        <LocksPermissionNotice />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Authorize with Pubky Ring' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('closes the approval once the session no longer needs upgrading', async () => {
    render(<LocksPermissionNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Authorize with Pubky Ring' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => useAuthStore.setState({ session: mockSession() }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('LocksPermissionNotice - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<LocksPermissionNotice />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

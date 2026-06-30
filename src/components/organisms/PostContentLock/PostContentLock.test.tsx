import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostLock } from '@/hooks/usePostLock/usePostLock';
import { VerifierType } from '@/services/locks/locks.types';
import { PostContentLock } from './PostContentLock';

vi.mock('@/hooks/usePostLock/usePostLock', () => ({ usePostLock: vi.fn() }));
// Stub the shared teaser-body renderer — it has its own tests. This keeps the
// focus on PostContentLock's own wiring (PostBody props) + the lock card.
vi.mock('../PostBody/PostBody', () => ({
  PostBody: ({ content, attachments }: { content: string; attachments: string[] | null }) => (
    <div data-testid="post-body" data-content={content} data-attachments-count={attachments?.length ?? 0} />
  ),
}));

const LOCK_URL = 'pubky://hs/pub/locks/lock.json';

const LOCK_CONTENT = JSON.stringify({
  lock_title: 'Private Key Management',
  teaser_description: 'Something, something, not your cheese.',
});

const PARSED_CONTENT = {
  lock_title: 'Private Key Management',
  teaser_description: 'Something, something, not your cheese.',
};

describe('PostContentLock', () => {
  beforeEach(() => {
    vi.mocked(usePostLock).mockReturnValue({
      lockContent: PARSED_CONTENT,
      verifierType: VerifierType.PASSWORD,
      hasError: false,
    });
  });

  it('renders the lock title and unlock control', () => {
    render(<PostContentLock content={LOCK_CONTENT} lock={LOCK_URL} />);

    expect(screen.getByText('Private Key Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  it('renders the teaser body (PostBody) with the teaser description and attachments', () => {
    render(<PostContentLock content={LOCK_CONTENT} lock={LOCK_URL} attachments={['pubky://author/files/a.png']} />);

    const body = screen.getByTestId('post-body');
    expect(body).toHaveAttribute('data-content', 'Something, something, not your cheese.');
    expect(body).toHaveAttribute('data-attachments-count', '1');
  });

  it('reads the lock data from usePostLock(content, lock)', () => {
    render(<PostContentLock content={LOCK_CONTENT} lock={LOCK_URL} />);
    expect(usePostLock).toHaveBeenCalledWith({ content: LOCK_CONTENT, lock: LOCK_URL });
  });

  it('renders nothing when the content is not a valid lock', () => {
    vi.mocked(usePostLock).mockReturnValue({ lockContent: null, verifierType: null, hasError: false });

    const { container } = render(<PostContentLock content="not json" lock={LOCK_URL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an unavailable message and hides the unlock control on error', () => {
    vi.mocked(usePostLock).mockReturnValue({ lockContent: PARSED_CONTENT, verifierType: null, hasError: true });

    render(<PostContentLock content={LOCK_CONTENT} lock={LOCK_URL} />);

    expect(screen.getByText('Lock content is not available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });
});

describe('PostContentLock - Snapshots', () => {
  beforeEach(() => {
    vi.mocked(usePostLock).mockReturnValue({
      lockContent: PARSED_CONTENT,
      verifierType: VerifierType.PASSWORD,
      hasError: false,
    });
  });

  it('matches snapshot for a password lock', () => {
    const { container } = render(<PostContentLock content={LOCK_CONTENT} lock={LOCK_URL} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

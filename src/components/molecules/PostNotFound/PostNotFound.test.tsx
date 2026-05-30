import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { PostNotFound } from './PostNotFound';

const mockPush = vi.fn();
const VALID_COMPOSITE = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;
const INVALID_AUTHOR_COMPOSITE = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

describe('PostNotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the message and three actions', () => {
    render(<PostNotFound postId={VALID_COMPOSITE} />);

    expect(screen.getByText('post.notFound.title')).toBeInTheDocument();
    const textBlock = screen.getByText('post.notFound.title').parentElement;
    expect(textBlock).toHaveTextContent('post.notFound.subtitle1');
    expect(textBlock).toHaveTextContent('post.notFound.subtitle2');
    expect(screen.getByRole('button', { name: 'post.notFound.backToFeed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'post.notFound.viewProfile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'post.notFound.exploreTags' })).toBeInTheDocument();
  });

  it('hides View profile when postId does not contain a valid author pubky', () => {
    render(<PostNotFound postId={INVALID_AUTHOR_COMPOSITE} />);

    expect(screen.queryByRole('button', { name: 'post.notFound.viewProfile' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'post.notFound.backToFeed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'post.notFound.exploreTags' })).toBeInTheDocument();
  });

  it('navigates home, profile, and hot when buttons are clicked', async () => {
    const user = userEvent.setup();
    render(<PostNotFound postId={VALID_COMPOSITE} />);

    await user.click(screen.getByRole('button', { name: 'post.notFound.backToFeed' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);

    await user.click(screen.getByRole('button', { name: 'post.notFound.viewProfile' }));
    expect(mockPush).toHaveBeenCalledWith(getProfileRoute(PROFILE_ROUTES.PROFILE, PUBKY_52_STAGING_FIXTURE));

    await user.click(screen.getByRole('button', { name: 'post.notFound.exploreTags' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });

  describe('Snapshots', () => {
    it('matches snapshot with View profile', () => {
      const { container } = render(<PostNotFound postId={VALID_COMPOSITE} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot without View profile', () => {
      const { container } = render(<PostNotFound postId={INVALID_AUTHOR_COMPOSITE} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { UserNotFound } from './UserNotFound';

const mockPush = vi.fn();

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

describe('UserNotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the user not found message and actions', () => {
    render(<UserNotFound />);

    expect(screen.getByText('profile.notFound.title')).toBeInTheDocument();
    expect(screen.getByText('profile.notFound.subtitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'profile.notFound.backToFeed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'profile.notFound.exploreTags' })).toBeInTheDocument();
  });

  it('renders the background image with correct alt text', () => {
    render(<UserNotFound />);

    const image = screen.getByAltText('profile.notFound.imageAlt');
    expect(image).toBeInTheDocument();
  });

  it('navigates home and hot when buttons are clicked', async () => {
    const user = userEvent.setup();
    render(<UserNotFound />);

    await user.click(screen.getByRole('button', { name: 'profile.notFound.backToFeed' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);

    await user.click(screen.getByRole('button', { name: 'profile.notFound.exploreTags' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });

  describe('Snapshots', () => {
    it('matches snapshot', () => {
      const { container } = render(<UserNotFound />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

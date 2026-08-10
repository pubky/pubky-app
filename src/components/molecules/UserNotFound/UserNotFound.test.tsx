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
describe('UserNotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the user not found message and actions', () => {
    render(<UserNotFound />);

    expect(screen.getByText('User Not Found')).toBeInTheDocument();
    expect(screen.getByText("The user you're looking for doesn't exist or may have been removed.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore Tags' })).toBeInTheDocument();
  });

  it('renders the background image with correct alt text', () => {
    render(<UserNotFound />);

    const image = screen.getByAltText('User Not Found');
    expect(image).toBeInTheDocument();
  });

  it('navigates home and hot when buttons are clicked', async () => {
    const user = userEvent.setup();
    render(<UserNotFound />);

    await user.click(screen.getByRole('button', { name: 'Back to Feed' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);

    await user.click(screen.getByRole('button', { name: 'Explore Tags' }));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });

  describe('Snapshots', () => {
    it('matches snapshot', () => {
      const { container } = render(<UserNotFound />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

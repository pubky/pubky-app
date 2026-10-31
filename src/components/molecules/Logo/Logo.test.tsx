import { usePathname } from 'next/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPYRIGHT_ROUTES, LEGAL_ROUTES, LOGO_LANDING_ROUTES } from '@/app/routes';
import { FORCE_FEED_SCROLL_TOP_KEY } from '@/config/feed';
import { useAuthStore } from '@/stores/auth/auth.store';
import { Logo } from './Logo';

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => <img src={src} alt={alt} width={width} height={height} className={className} data-testid="logo-image" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const createSessionStorageMock = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
});

describe('Logo', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createSessionStorageMock(),
    });
  });

  it('renders dark and light wordmarks, toggled by the .light class via CSS', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    render(<Logo />);

    const [darkImage, lightImage] = screen.getAllByTestId('logo-image');

    expect(darkImage.parentElement).toBeInTheDocument();
    expect(darkImage).toHaveAttribute('src', '/pubky-logo.svg');
    expect(darkImage).toHaveClass('[.light_&]:hidden');
    expect(lightImage).toHaveAttribute('src', '/pubky-logo-on-light.svg');
    expect(lightImage).toHaveClass('hidden', '[.light_&]:block');
  });

  it('scrolls to top when clicking logo on /home', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

    render(<Logo />);
    const link = screen.getAllByTestId('logo-image')[0].closest('a');
    expect(link).toBeTruthy();

    fireEvent.click(link!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('scrolls to top when clicking logo on a custom feed', () => {
    vi.mocked(usePathname).mockReturnValue('/feed/feed-abc123');

    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

    render(<Logo />);
    const link = screen.getAllByTestId('logo-image')[0].closest('a');
    expect(link).toBeTruthy();

    fireEvent.click(link!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it.each(['/hot', '/feed', '/feed/feed-abc123/extra', '/home/missing'])(
    'navigates home instead of scrolling on %s',
    (pathname) => {
      vi.mocked(usePathname).mockReturnValue(pathname);

      Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
      const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

      render(<Logo />);
      const link = screen.getAllByTestId('logo-image')[0].closest('a');
      expect(link).toHaveAttribute('href', '/home');

      fireEvent.click(link!);
      expect(window.scrollTo).not.toHaveBeenCalled();
      expect(setItemSpy).toHaveBeenCalledWith(FORCE_FEED_SCROLL_TOP_KEY, '1');
    },
  );

  it.each(LOGO_LANDING_ROUTES)('links to the landing page on %s', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<Logo />);

    expect(screen.getAllByTestId('logo-image')[0].closest('a')).toHaveAttribute('href', '/');
  });

  it.each(LOGO_LANDING_ROUTES)('does not set home scroll intent when clicking logo on %s', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

    render(<Logo />);
    fireEvent.click(screen.getAllByTestId('logo-image')[0].closest('a')!);

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

describe('Logo on the public documents', () => {
  const PUBLIC_DOCUMENT_ROUTES = [...Object.values(LEGAL_ROUTES), COPYRIGHT_ROUTES.COPYRIGHT];

  afterEach(() => {
    useAuthStore.setState({ currentUserPubky: null, restoreStatus: 'idle' });
  });

  it.each(PUBLIC_DOCUMENT_ROUTES)('takes a member to /home on %s, not to the landing page', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    useAuthStore.setState({ currentUserPubky: 'account', restoreStatus: 'ready' });

    render(<Logo />);

    expect(screen.getAllByTestId('logo-image')[0].closest('a')).toHaveAttribute('href', '/home');
  });

  it.each(PUBLIC_DOCUMENT_ROUTES)('takes a guest to the landing page on %s', (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<Logo />);

    expect(screen.getAllByTestId('logo-image')[0].closest('a')).toHaveAttribute('href', '/');
  });

  it('takes a guest whose key step generated a pubky without a session to the landing page (#2882)', () => {
    vi.mocked(usePathname).mockReturnValue(COPYRIGHT_ROUTES.COPYRIGHT);
    useAuthStore.setState({
      currentUserPubky: 'generated-key',
      session: null,
      sessionReference: null,
      restoreStatus: 'idle',
    });

    render(<Logo />);

    expect(screen.getAllByTestId('logo-image')[0].closest('a')).toHaveAttribute('href', '/');
  });

  it('keeps the landing link for a member on the other landing routes', () => {
    vi.mocked(usePathname).mockReturnValue('/sign-in');
    useAuthStore.setState({ currentUserPubky: 'account', restoreStatus: 'ready' });

    render(<Logo />);

    expect(screen.getAllByTestId('logo-image')[0].closest('a')).toHaveAttribute('href', '/');
  });
});

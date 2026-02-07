import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePathname } from 'next/navigation';
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

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

describe('Logo', () => {
  it('renders with default src', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    render(<Logo />);

    const container = screen.getByTestId('logo-image').parentElement;
    const image = screen.getByTestId('logo-image');

    expect(container).toBeInTheDocument();
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/pubky-logo.svg');
  });

  it('scrolls to top when clicking logo on /home', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

    render(<Logo />);
    const link = screen.getByTestId('logo-image').closest('a');
    expect(link).toBeTruthy();

    fireEvent.click(link!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('does not scroll to top when clicking logo on other pages', () => {
    vi.mocked(usePathname).mockReturnValue('/hot');

    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<Logo />);
    const link = screen.getByTestId('logo-image').closest('a');
    expect(link).toBeTruthy();

    fireEvent.click(link!);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalledWith(FORCE_HOME_SCROLL_TOP_KEY, '1');
  });
});

describe('Logo - Snapshots', () => {
  it('matches snapshot for default Logo', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    const { container } = render(<Logo />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Logo with custom dimensions', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    const { container } = render(<Logo width={200} height={80} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Logo with custom className', () => {
    vi.mocked(usePathname).mockReturnValue('/home');

    const { container } = render(<Logo className="custom-logo-style" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { usePathname } from 'next/navigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { LANDING_HERO_SECTION_ID } from '@/templates/Public/Landing/Landing.constants';
import { HeaderHome } from './HeaderHome';

const mockPush = vi.fn();
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let mockIntersectionCallback: IntersectionObserverCallback | undefined;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: vi.fn(),
}));

class MockIntersectionObserver implements IntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    mockIntersectionCallback = callback;
  }

  readonly root: Element | Document | null = null;
  readonly rootMargin = '-30% 0px -35% 0px';
  readonly thresholds: ReadonlyArray<number> = [0];

  observe = mockObserve;
  unobserve = vi.fn();
  disconnect = mockDisconnect;
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const createIntersectionEntry = (target: Element, isIntersecting: boolean): IntersectionObserverEntry => ({
  boundingClientRect: target.getBoundingClientRect(),
  intersectionRatio: isIntersecting ? 1 : 0,
  intersectionRect: isIntersecting ? target.getBoundingClientRect() : new DOMRectReadOnly(),
  isIntersecting,
  rootBounds: null,
  target,
  time: 0,
});

// Mock molecules
vi.mock('@/molecules/Header/Header', () => {
  return {
    HeaderSocialLinks: () => <div data-testid="header-social-links">Social Links</div>,
  };
});

vi.mock('@/molecules/HeaderButtonSignIn/HeaderButtonSignIn', () => {
  return {
    HeaderButtonSignIn: () => <button data-testid="header-button-sign-in">Sign in</button>,
  };
});

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
  };
});

describe('HeaderHome', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/');
    mockIntersectionCallback = undefined;
    document.body.innerHTML = '';

    globalThis.IntersectionObserver = MockIntersectionObserver;
    window.IntersectionObserver = MockIntersectionObserver;
  });

  it('renders social links and sign in button', () => {
    render(<HeaderHome />);

    expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
    expect(screen.getByTestId('header-button-sign-in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('does not render the landing join button when the landing hero is absent', () => {
    render(<HeaderHome />);

    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('renders the landing join button after the hero leaves the viewport', () => {
    const heroSection = document.createElement('section');
    heroSection.id = LANDING_HERO_SECTION_ID;
    document.body.appendChild(heroSection);

    render(<HeaderHome />);

    act(() => {
      mockIntersectionCallback?.([createIntersectionEntry(heroSection, false)], {} as IntersectionObserver);
    });

    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
  });

  it('navigates to onboarding when the landing join button is clicked', () => {
    const heroSection = document.createElement('section');
    heroSection.id = LANDING_HERO_SECTION_ID;
    document.body.appendChild(heroSection);

    render(<HeaderHome />);

    act(() => {
      mockIntersectionCallback?.([createIntersectionEntry(heroSection, false)], {} as IntersectionObserver);
    });

    fireEvent.click(screen.getByRole('button', { name: /join/i }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
  });

  it('does not observe the landing hero outside the homepage', () => {
    vi.mocked(usePathname).mockReturnValue('/home');
    const heroSection = document.createElement('section');
    heroSection.id = LANDING_HERO_SECTION_ID;
    document.body.appendChild(heroSection);

    render(<HeaderHome />);

    expect(mockObserve).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('applies correct container classes', () => {
    const { container } = render(<HeaderHome />);
    const containerElement = container.firstChild as HTMLElement;

    expect(containerElement).toHaveClass('flex-1', 'flex-row', 'items-center', 'justify-end');
  });

  it('passes through additional props', () => {
    render(<HeaderHome data-testid="custom-header-home" className="custom-class" />);

    const container = screen.getByTestId('custom-header-home');
    expect(container).toHaveClass('custom-class');
  });
});

describe('HeaderHome - Snapshots', () => {
  it('matches snapshot for default HeaderHome', () => {
    const { container } = render(<HeaderHome />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<HeaderHome className="custom-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

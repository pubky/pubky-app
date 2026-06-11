import { fireEvent, render, screen } from '@testing-library/react';
import type { ElementType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { HomeActions, HomeFooter, HomePageHeading, HomeSectionTitle } from './Home';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock molecules
vi.mock('@/molecules/ActionButtons/ActionButtons', () => {
  return {
    ActionButtons: ({ onCreateAccount, onExplore }: { onCreateAccount: () => void; onExplore?: () => void }) => (
      <div data-testid="action-buttons">
        <button data-testid="create-account-button" onClick={onCreateAccount}>
          Create Account
        </button>
        <button data-testid="explore-button" onClick={onExplore}>
          Explore
        </button>
      </div>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms/DialogAge/DialogAge', () => {
  return {
    DialogAge: () => <span data-testid="dialog-age">over 18 years old</span>,
  };
});

vi.mock('@/organisms/DialogPrivacy/DialogPrivacy', () => {
  return {
    DialogPrivacy: () => <span data-testid="dialog-privacy">Privacy Policy</span>,
  };
});

vi.mock('@/organisms/DialogTerms/DialogTerms', () => {
  return {
    DialogTerms: () => <span data-testid="dialog-terms">Terms of Service</span>,
  };
});

// Mock config
vi.mock('@/config/externalLinks', () => ({
  PUBKY_CORE_URL: 'https://github.com/pubky/pubky-core',
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/FooterLinks/FooterLinks', () => {
  return {
    FooterLinks: ({ children }: { children: React.ReactNode }) => <div data-testid="footer-links">{children}</div>,
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({ children, level, size }: { children: React.ReactNode; level: number; size?: string }) => (
      <div data-testid={`heading-${level}`} data-size={size}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) => (
      <img data-testid="image" src={src} alt={alt} width={width} height={height} />
    ),
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      target,
      className,
    }: {
      children: React.ReactNode;
      href: string;
      target?: string;
      className?: string;
    }) => (
      <a data-testid="link" href={href} target={target} className={className}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as,
      size,
      className,
    }: {
      children: React.ReactNode;
      as?: ElementType;
      size?: string;
      className?: string;
    }) => {
      const Tag = (as ?? 'p') as ElementType;
      return (
        <Tag data-testid="typography" data-size={size} className={className}>
          {children}
        </Tag>
      );
    },
  };
});

describe('HomeActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders action buttons', () => {
    render(<HomeActions />);

    expect(screen.getByTestId('action-buttons')).toBeInTheDocument();
    expect(screen.getByTestId('create-account-button')).toBeInTheDocument();
    expect(screen.getByTestId('explore-button')).toBeInTheDocument();
  });

  it('handles create account button click', () => {
    render(<HomeActions />);

    const createAccountButton = screen.getByTestId('create-account-button');
    fireEvent.click(createAccountButton);

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
  });

  it('handles explore button click', () => {
    render(<HomeActions />);

    const exploreButton = screen.getByTestId('explore-button');
    fireEvent.click(exploreButton);

    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);
  });
});

describe('HomeFooter', () => {
  it('renders footer with Synonym and Tether branding images', () => {
    render(<HomeFooter />);

    expect(screen.getByAltText('Synonym')).toBeInTheDocument();
    expect(screen.getByAltText('tether.')).toBeInTheDocument();
  });

  it('renders branding text and copyright', () => {
    render(<HomeFooter />);

    expect(screen.getByText(/company/)).toBeInTheDocument();
    expect(screen.getByText(/Synonym Software, S\.A\. DE C\.V\./)).toBeInTheDocument();
  });

  it('renders terms, privacy and age agreement text', () => {
    render(<HomeFooter />);

    expect(screen.getByTestId('dialog-terms')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-privacy')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-age')).toBeInTheDocument();
  });

  it('renders Synonym logo as a link', () => {
    render(<HomeFooter />);

    const synonymLink = screen.getByAltText('Synonym').closest('a');
    expect(synonymLink).toHaveAttribute('href', 'https://synonym.to');
  });
});

describe('HomeSectionTitle', () => {
  it('renders section title with typography', () => {
    render(<HomeSectionTitle />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(screen.getByTestId('typography')).toBeInTheDocument();
  });
});

describe('HomePageHeading', () => {
  it('renders heading with correct text', () => {
    render(<HomePageHeading />);

    expect(screen.getByTestId('heading-1')).toBeInTheDocument();
  });
});

describe('Home - Snapshots', () => {
  it('matches snapshot for HomeActions with default props', () => {
    const { container } = render(<HomeActions />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HomeFooter with default props', () => {
    const { container } = render(<HomeFooter />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HomeSectionTitle with default props', () => {
    const { container } = render(<HomeSectionTitle />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HomePageHeading with default props', () => {
    const { container } = render(<HomePageHeading />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

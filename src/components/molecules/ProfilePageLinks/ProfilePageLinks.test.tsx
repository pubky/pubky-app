import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePageLinks } from './ProfilePageLinks';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { defaultPrivacyPreferences } from '@/stores/settings/settings.types';
// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  DialogCheckLink: ({
    open,
    onOpenChangeAction,
    linkUrl,
  }: {
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
    linkUrl: string;
  }) => (
    <div data-testid="dialog-check-link" data-open={open} data-link-url={linkUrl}>
      <button data-testid="dialog-close" onClick={() => onOpenChangeAction(false)}>
        Close
      </button>
    </div>
  ),
}));

// Mock settings store
const mockUseSettingsStore = vi.fn();
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: () => mockUseSettingsStore(),
}));

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

const defaultLinks: NexusUserDetails['links'] = [
  { title: 'bitcoin.org', url: 'https://bitcoin.org' },
  { title: 'twitter.com/test', url: 'https://twitter.com/test' },
  { title: 'github.com/test', url: 'https://github.com/test' },
];

describe('ProfilePageLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: checkLink enabled (showConfirm: true)
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true,
      },
    });
  });

  it('renders heading correctly', () => {
    render(<ProfilePageLinks links={defaultLinks} />);
    expect(screen.getByText('Links')).toBeInTheDocument();
  });

  it('renders links with correct href attributes', () => {
    render(<ProfilePageLinks links={defaultLinks} />);
    defaultLinks?.forEach((link) => {
      const linkElement = screen.getByText(link.title).closest('a');
      expect(linkElement).toHaveAttribute('href', link.url);
    });
  });

  it('renders with custom links', () => {
    const customLinks: NexusUserDetails['links'] = [{ title: 'Example', url: 'https://example.com' }];
    render(<ProfilePageLinks links={customLinks} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('Example').closest('a')).toHaveAttribute('href', 'https://example.com');
  });

  it('renders no links message when links array is empty', () => {
    render(<ProfilePageLinks links={[]} />);
    expect(screen.getByText('No links added yet.')).toBeInTheDocument();
  });

  it('does not render Add Link button when isOwnProfile is false', () => {
    render(<ProfilePageLinks links={defaultLinks} isOwnProfile={false} />);
    expect(screen.queryByText('Add Link')).not.toBeInTheDocument();
  });

  it('renders Add Link button when isOwnProfile is true', () => {
    render(<ProfilePageLinks links={defaultLinks} isOwnProfile={true} />);
    expect(screen.getByText('Add Link')).toBeInTheDocument();
  });

  it('Add Link button navigates to settings edit page when clicked', () => {
    render(<ProfilePageLinks links={defaultLinks} isOwnProfile={true} />);
    const addLinkButton = screen.getByText('Add Link').closest('button');
    fireEvent.click(addLinkButton!);
    expect(mockPush).toHaveBeenCalledWith('/settings/edit');
  });

  it('Add Link button has correct styling', () => {
    render(<ProfilePageLinks links={defaultLinks} isOwnProfile={true} />);
    const addLinkButton = screen.getByText('Add Link').closest('button');
    expect(addLinkButton).toHaveClass('border', 'border-border', 'bg-foreground/5');
  });
});

describe('ProfilePageLinks - Link Click Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens dialog when clicking link and checkLink is enabled (default)', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true,
      },
    });
    render(<ProfilePageLinks links={defaultLinks} />);

    const linkElement = screen.getByText('bitcoin.org').closest('a');
    fireEvent.click(linkElement!);

    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'true');
    expect(dialog).toHaveAttribute('data-link-url', 'https://bitcoin.org');
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('opens link directly when checkLink is disabled', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: false,
      },
    });
    render(<ProfilePageLinks links={defaultLinks} />);

    const linkElement = screen.getByText('bitcoin.org').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).toHaveBeenCalledWith('https://bitcoin.org', '_blank', 'noopener,noreferrer');
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'false');
  });

  it('opens mailto links directly without dialog', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true, // checkLink enabled
      },
    });
    const linksWithEmail: NexusUserDetails['links'] = [{ title: 'Email', url: 'mailto:test@example.com' }];
    render(<ProfilePageLinks links={linksWithEmail} />);

    const linkElement = screen.getByText('Email').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).toHaveBeenCalledWith('mailto:test@example.com', '_blank', 'noopener,noreferrer');
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'false');
  });

  it('opens tel links directly without dialog', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true, // checkLink enabled
      },
    });
    const linksWithPhone: NexusUserDetails['links'] = [{ title: 'Phone', url: 'tel:+1234567890' }];
    render(<ProfilePageLinks links={linksWithPhone} />);

    const linkElement = screen.getByText('Phone').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).toHaveBeenCalledWith('tel:+1234567890', '_blank', 'noopener,noreferrer');
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'false');
  });

  it('opens same-domain links directly without dialog even when checkLink is enabled', () => {
    // Mock window.location.hostname
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { hostname: 'example.com' },
    });

    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true, // checkLink enabled
      },
    });
    const sameDomainLinks: NexusUserDetails['links'] = [{ title: 'Same Domain', url: 'https://example.com/page' }];
    render(<ProfilePageLinks links={sameDomainLinks} />);

    const linkElement = screen.getByText('Same Domain').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'false');
  });

  it('opens same-domain links with www prefix directly without dialog', () => {
    // Mock window.location.hostname
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { hostname: 'www.example.com' },
    });

    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true, // checkLink enabled
      },
    });
    const sameDomainLinks: NexusUserDetails['links'] = [{ title: 'Same Domain', url: 'https://example.com/page' }];
    render(<ProfilePageLinks links={sameDomainLinks} />);

    const linkElement = screen.getByText('Same Domain').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'false');
  });

  it('shows dialog for different domain links even when checkLink is enabled', () => {
    // Mock window.location.hostname
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { hostname: 'example.com' },
    });

    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true, // checkLink enabled
      },
    });
    const differentDomainLinks: NexusUserDetails['links'] = [
      { title: 'Different Domain', url: 'https://other-domain.com/page' },
    ];
    render(<ProfilePageLinks links={differentDomainLinks} />);

    const linkElement = screen.getByText('Different Domain').closest('a');
    fireEvent.click(linkElement!);

    expect(mockWindowOpen).not.toHaveBeenCalled();
    const dialog = screen.getByTestId('dialog-check-link');
    expect(dialog).toHaveAttribute('data-open', 'true');
    expect(dialog).toHaveAttribute('data-link-url', 'https://other-domain.com/page');
  });
});

describe('ProfilePageLinks - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: true,
      },
    });
  });

  it('matches snapshot with links', () => {
    const { container } = render(<ProfilePageLinks links={defaultLinks} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom links', () => {
    const customLinks: NexusUserDetails['links'] = [{ title: 'Example', url: 'https://example.com' }];
    const { container } = render(<ProfilePageLinks links={customLinks} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty links', () => {
    const { container } = render(<ProfilePageLinks links={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with undefined links', () => {
    const { container } = render(<ProfilePageLinks />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mailto link', () => {
    const linksWithEmail: NexusUserDetails['links'] = [{ title: 'Contact', url: 'mailto:hello@example.com' }];
    const { container } = render(<ProfilePageLinks links={linksWithEmail} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tel link', () => {
    const linksWithPhone: NexusUserDetails['links'] = [{ title: 'Call Us', url: 'tel:+1234567890' }];
    const { container } = render(<ProfilePageLinks links={linksWithPhone} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isOwnProfile true', () => {
    const { container } = render(<ProfilePageLinks links={defaultLinks} isOwnProfile={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty links and isOwnProfile true', () => {
    const { container } = render(<ProfilePageLinks links={[]} isOwnProfile={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

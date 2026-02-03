import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogoutContent, LogoutHeader, LogoutNavigation } from './Logout';
import * as App from '@/app';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => (
    <img src={src} alt={alt} width={width} height={height} data-testid="next-image" />
  ),
}));

// Mock the atoms and molecules
vi.mock('@/atoms', () => ({
  Container: ({ children, className, size }: { children: React.ReactNode; className?: string; size?: string }) => (
    <div className={className} data-size={size}>
      {children}
    </div>
  ),
  PageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  PageSubtitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/molecules', () => ({
  ContentCard: ({ children, layout }: { children: React.ReactNode; layout?: string }) => (
    <div data-layout={layout}>{children}</div>
  ),
  PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => <h1 data-size={size}>{children}</h1>,
  ButtonsNavigation: ({
    backText,
    continueText,
    onHandleBackButton,
    onHandleContinueButton,
  }: {
    backText: string;
    continueText: string;
    onHandleBackButton: () => void;
    onHandleContinueButton: () => void;
  }) => (
    <div>
      <button onClick={onHandleBackButton}>{backText}</button>
      <button onClick={onHandleContinueButton}>{continueText}</button>
    </div>
  ),
}));

describe('LogoutContent', () => {
  it('renders without errors', () => {
    render(<LogoutContent />);
    expect(screen.getByTestId('next-image')).toBeInTheDocument();
  });

  it('displays the tag image correctly', () => {
    render(<LogoutContent />);
    const image = screen.getByTestId('next-image');
    expect(image).toHaveAttribute('src', '/images/tag.webp');
    expect(image).toHaveAttribute('alt', 'Pubky Ring');
    expect(image).toHaveAttribute('width', '192');
    expect(image).toHaveAttribute('height', '192');
  });

  it('renders LogoutHeader component', () => {
    render(<LogoutContent />);
    expect(screen.getByText(/see you/i)).toBeInTheDocument();
  });
});

describe('LogoutHeader', () => {
  it('renders title with brand styling', () => {
    render(<LogoutHeader />);
    const title = screen.getByText('See you');
    expect(title).toBeInTheDocument();
    expect(screen.getByText('soon!')).toBeInTheDocument();
  });

  it('renders subtitle correctly', () => {
    render(<LogoutHeader />);
    expect(screen.getByText('You have securely signed out.')).toBeInTheDocument();
  });
});

describe('LogoutNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders navigation buttons correctly', () => {
    render(<LogoutNavigation />);
    expect(screen.getByText('Homepage')).toBeInTheDocument();
    expect(screen.getByText('Sign back in')).toBeInTheDocument();
  });

  it('navigates to install page when back button is clicked', () => {
    render(<LogoutNavigation />);
    const backButton = screen.getByText('Homepage');
    fireEvent.click(backButton);
    expect(mockPush).toHaveBeenCalledWith(App.ROOT_ROUTES);
  });

  it('navigates to sign-in page when continue button is clicked', () => {
    render(<LogoutNavigation />);
    const continueButton = screen.getByText('Sign back in');
    fireEvent.click(continueButton);
    expect(mockPush).toHaveBeenCalledWith(App.AUTH_ROUTES.SIGN_IN);
  });
});

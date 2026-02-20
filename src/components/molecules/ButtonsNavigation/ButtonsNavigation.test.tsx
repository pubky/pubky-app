import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ButtonsNavigation } from './ButtonsNavigation';

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

// Mock UI components
vi.mock('@/components/ui', () => ({
  Button: ({
    children,
    variant,
    className,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button data-slot="button" data-variant={variant} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

describe('ButtonsNavigation', () => {
  it('renders with default props', () => {
    render(<ButtonsNavigation />);

    const backButton = screen.getByRole('button', { name: /back/i });
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(backButton).toBeInTheDocument();
    expect(continueButton).toBeInTheDocument();
    expect(backButton).toHaveTextContent('Back');
    expect(continueButton).toHaveTextContent('Continue');
  });

  it('renders with custom text props', () => {
    render(<ButtonsNavigation backText="Go Back" continueText="Next Step" />);

    const backButton = screen.getByRole('button', { name: /go back/i });
    const continueButton = screen.getByRole('button', { name: /next step/i });

    expect(backButton).toHaveTextContent('Go Back');
    expect(continueButton).toHaveTextContent('Next Step');
  });

  it('handles back button click', () => {
    const handleBackButton = vi.fn();
    render(<ButtonsNavigation onHandleBackButton={handleBackButton} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backButton);

    expect(handleBackButton).toHaveBeenCalledTimes(1);
  });

  it('handles continue button click', () => {
    const handleContinueButton = vi.fn();
    render(<ButtonsNavigation onHandleContinueButton={handleContinueButton} />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);

    expect(handleContinueButton).toHaveBeenCalledTimes(1);
  });

  it('disables back button when backButtonDisabled is true', () => {
    render(<ButtonsNavigation backButtonDisabled={true} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeDisabled();
  });

  it('disables continue button when continueButtonDisabled is true', () => {
    render(<ButtonsNavigation continueButtonDisabled={true} />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();
  });

  it('buttons stretch full width on mobile and size to content on desktop', () => {
    render(<ButtonsNavigation />);

    const container = screen.getByTestId('container');
    // flex-col stretches children to full width on mobile
    expect(container.className).toContain('flex-col');
    // md:flex-row makes children size to content on desktop
    expect(container.className).toContain('md:flex-row');

    // buttons should not be forced to full width on desktop
    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton.className).not.toContain('w-full');

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton.className).not.toContain('w-full');
  });
});

describe('ButtonsNavigation - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ButtonsNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom text', () => {
    const { container } = render(<ButtonsNavigation backText="Go Back" continueText="Next Step" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ButtonsNavigation className="custom-navigation-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with back button disabled', () => {
    const { container } = render(<ButtonsNavigation backButtonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with continue button disabled', () => {
    const { container } = render(<ButtonsNavigation continueButtonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both buttons disabled', () => {
    const { container } = render(<ButtonsNavigation backButtonDisabled={true} continueButtonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both callbacks', () => {
    const mockBackHandler = vi.fn();
    const mockContinueHandler = vi.fn();

    const { container } = render(
      <ButtonsNavigation onHandleBackButton={mockBackHandler} onHandleContinueButton={mockContinueHandler} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with back callback only', () => {
    const mockBackHandler = vi.fn();

    const { container } = render(<ButtonsNavigation onHandleBackButton={mockBackHandler} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with continue callback only', () => {
    const mockContinueHandler = vi.fn();

    const { container } = render(<ButtonsNavigation onHandleContinueButton={mockContinueHandler} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

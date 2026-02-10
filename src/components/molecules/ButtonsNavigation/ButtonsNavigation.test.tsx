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

  it('applies custom className to back button', () => {
    const customClass = 'custom-back-button-class';
    render(<ButtonsNavigation backButtonClassName={customClass} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toHaveClass(customClass);
  });

  it('applies custom className to continue button', () => {
    const customClass = 'custom-continue-button-class';
    render(<ButtonsNavigation continueButtonClassName={customClass} />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toHaveClass(customClass);
  });

  it('applies custom classNames to both buttons', () => {
    const backCustomClass = 'custom-back-class';
    const continueCustomClass = 'custom-continue-class';
    render(<ButtonsNavigation backButtonClassName={backCustomClass} continueButtonClassName={continueCustomClass} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(backButton).toHaveClass(backCustomClass);
    expect(continueButton).toHaveClass(continueCustomClass);
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

  it('matches snapshot with custom backButtonClassName', () => {
    const { container } = render(<ButtonsNavigation backButtonClassName="custom-back-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom continueButtonClassName', () => {
    const { container } = render(<ButtonsNavigation continueButtonClassName="custom-continue-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both custom button classNames', () => {
    const { container } = render(
      <ButtonsNavigation backButtonClassName="custom-back-class" continueButtonClassName="custom-continue-class" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

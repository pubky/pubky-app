import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ButtonsNavigation } from './ButtonsNavigation';

describe('ButtonsNavigation', () => {
  it('renders with default props', () => {
    render(<ButtonsNavigation id="test-navigation" />);

    const backButton = screen.getByRole('button', { name: /back/i });
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(backButton).toBeInTheDocument();
    expect(continueButton).toBeInTheDocument();
  });

  it('renders with custom text props', () => {
    render(<ButtonsNavigation id="test-navigation" backText="Go Back" continueText="Next Step" />);

    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next step/i })).toBeInTheDocument();
  });

  it('handles back button click', () => {
    const handleBackButton = vi.fn();
    render(<ButtonsNavigation id="test-navigation" onHandleBackButton={handleBackButton} />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(handleBackButton).toHaveBeenCalledTimes(1);
  });

  it('handles continue button click', () => {
    const handleContinueButton = vi.fn();
    render(<ButtonsNavigation id="test-navigation" onHandleContinueButton={handleContinueButton} />);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(handleContinueButton).toHaveBeenCalledTimes(1);
  });

  it('disables back button when backButtonDisabled is true', () => {
    render(<ButtonsNavigation id="test-navigation" backButtonDisabled={true} />);

    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('disables continue button when continueButtonDisabled is true', () => {
    render(<ButtonsNavigation id="test-navigation" continueButtonDisabled={true} />);

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('hides back button when hiddenBackButton is true', () => {
    render(<ButtonsNavigation id="test-navigation" hiddenBackButton={true} />);

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('hides continue button when hiddenContinueButton is true', () => {
    render(<ButtonsNavigation id="test-navigation" hiddenContinueButton={true} />);

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('disables continue button when loadingContinueButton is true', () => {
    render(<ButtonsNavigation id="test-navigation" loadingContinueButton={true} />);

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('buttons stretch full width on mobile and size to content on desktop', () => {
    render(<ButtonsNavigation id="test-navigation" />);

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

  it('applies custom className to back button', () => {
    const customClass = 'custom-back-button-class';
    render(<ButtonsNavigation id="test-nav-back-class" backButtonClassName={customClass} />);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toHaveClass(customClass);
  });

  it('applies custom className to continue button', () => {
    const customClass = 'custom-continue-button-class';
    render(<ButtonsNavigation id="test-nav-continue-class" continueButtonClassName={customClass} />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toHaveClass(customClass);
  });

  it('applies custom classNames to both buttons', () => {
    const backCustomClass = 'custom-back-class';
    const continueCustomClass = 'custom-continue-class';
    render(
      <ButtonsNavigation
        id="test-nav-both-class"
        backButtonClassName={backCustomClass}
        continueButtonClassName={continueCustomClass}
      />,
    );

    const backButton = screen.getByRole('button', { name: /back/i });
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(backButton).toHaveClass(backCustomClass);
    expect(continueButton).toHaveClass(continueCustomClass);
  });
});

describe('ButtonsNavigation - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom text', () => {
    const { container } = render(
      <ButtonsNavigation id="test-navigation" backText="Go Back" continueText="Next Step" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" className="custom-navigation-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<ButtonsNavigation id="signup" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with back button disabled', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" backButtonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with continue button disabled', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" continueButtonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both buttons disabled', () => {
    const { container } = render(
      <ButtonsNavigation id="test-navigation" backButtonDisabled={true} continueButtonDisabled={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with hidden back button', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" hiddenBackButton={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with hidden continue button', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" hiddenContinueButton={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loading continue button', () => {
    const { container } = render(<ButtonsNavigation id="test-navigation" loadingContinueButton={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom backButtonClassName', () => {
    const { container } = render(
      <ButtonsNavigation id="test-nav-snapshot-back-class" backButtonClassName="custom-back-class" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom continueButtonClassName', () => {
    const { container } = render(
      <ButtonsNavigation id="test-nav-snapshot-continue-class" continueButtonClassName="custom-continue-class" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both custom button classNames', () => {
    const { container } = render(
      <ButtonsNavigation
        id="test-nav-snapshot-both-class"
        backButtonClassName="custom-back-class"
        continueButtonClassName="custom-continue-class"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PassportMethodCard, PassportMethodSection } from './PassportMethodCard';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('PassportMethodCard', () => {
  it('renders the Quick & Easy card with the cloud illustration and forwards the click', () => {
    const onContinue = vi.fn();
    const { container } = render(<PassportMethodCard onContinue={onContinue} isPending={false} />);

    expect(screen.getByTestId('passport-method-card')).toBeInTheDocument();
    expect(screen.getByText('Quick & Easy')).toBeInTheDocument();
    expect(screen.getByText('Use your existing sign-in methods.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/images/passport-cloud.webp');

    fireEvent.click(screen.getByTestId('continue-with-google'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(container).toMatchSnapshot();
  });

  it('disables the button while pending', () => {
    render(<PassportMethodCard onContinue={vi.fn()} isPending />);

    expect(screen.getByTestId('continue-with-google')).toBeDisabled();
  });
});

describe('PassportMethodSection', () => {
  it('renders the uppercase label and button for the mobile layout', () => {
    const onContinue = vi.fn();
    const { container } = render(<PassportMethodSection onContinue={onContinue} isPending={false} />);

    expect(screen.getByTestId('passport-method-section')).toBeInTheDocument();
    expect(screen.getByText('Quick & Easy')).toHaveClass('uppercase');

    fireEvent.click(screen.getByTestId('continue-with-google'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(container).toMatchSnapshot();
  });
});

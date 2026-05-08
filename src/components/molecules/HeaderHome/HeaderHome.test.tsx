import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderHome } from './HeaderHome';

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
  it('renders social links and sign in button', () => {
    render(<HeaderHome />);

    expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
    expect(screen.getByTestId('header-button-sign-in')).toBeInTheDocument();
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

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders correctly', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toBeInTheDocument();
  });

  it('applies default size (md) classes', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveClass('h-8', 'w-8');
  });

  it('applies sm size classes', () => {
    const { container } = render(<Spinner size="sm" />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('applies lg size classes', () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveClass('h-12', 'w-12');
  });

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom-class" />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveClass('custom-class');
  });

  it('applies spinner animation classes', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveClass('animate-spin', 'rounded-full', 'border-b-2', 'border-brand');
  });

  it('has accessible role and label', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('[data-testid="spinner"]');
    expect(spinner).toHaveAttribute('role', 'status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('matches snapshot', () => {
    const { container } = render(<Spinner />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with sm size', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with lg size', () => {
    const { container } = render(<Spinner size="lg" />);
    expect(container).toMatchSnapshot();
  });
});

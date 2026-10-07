import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heading } from './Heading';

describe('Heading', () => {
  it('renders with default props as h1', () => {
    render(<Heading>Default Heading</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Default Heading');
  });

  it.each([1, 2, 3, 4, 5, 6] as const)('renders heading level %s', (level) => {
    render(<Heading level={level}>Level {level}</Heading>);
    expect(screen.getByRole('heading', { level })).toBeInTheDocument();
    expect(screen.getByTestId(`heading-${level}`).tagName).toBe(`H${level}`);
  });

  it.each([
    ['sm', 'text-lg'],
    ['md', 'text-xl'],
    ['lg', 'text-2xl'],
  ] as const)('applies size=%s class', (size, className) => {
    render(<Heading size={size}>Sized heading</Heading>);
    expect(screen.getByRole('heading')).toHaveClass(className);
  });
});

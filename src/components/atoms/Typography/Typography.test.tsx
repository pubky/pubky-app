import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Typography } from './Typography';

describe('Typography', () => {
  it('renders with default props as a paragraph', () => {
    render(<Typography>Default text</Typography>);
    expect(screen.getByTestId('typography').tagName).toBe('P');
    expect(screen.getByText('Default text')).toBeInTheDocument();
  });

  it.each(['h1', 'h2', 'span', 'strong', 'em'] as const)('renders as %s when requested', (as) => {
    render(<Typography as={as}>Typed text</Typography>);
    expect(screen.getByText('Typed text').tagName).toBe(as.toUpperCase());
  });

  it('applies the md size class by default', () => {
    render(<Typography>Default size</Typography>);
    expect(screen.getByTestId('typography')).toHaveClass('text-base', 'font-medium', 'text-foreground');
  });

  it.each([
    ['xs', 'text-xs'],
    ['sm', 'text-sm'],
    ['md', 'text-base'],
    ['lg', 'text-2xl'],
    ['xl', 'text-4xl'],
    ['2xl', 'text-6xl'],
  ] as const)('applies size=%s class', (size, className) => {
    render(<Typography size={size}>Sized text</Typography>);
    expect(screen.getByTestId('typography')).toHaveClass(className);
  });

  it('drops the default classes when overrideDefaults is set', () => {
    render(
      <Typography overrideDefaults className="custom-class">
        Override
      </Typography>,
    );
    const element = screen.getByTestId('typography');
    expect(element).toHaveClass('custom-class');
    expect(element).not.toHaveClass('text-base', 'text-foreground');
  });
});

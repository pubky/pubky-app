import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSubtitle } from './PageSubtitle';

describe('PageSubtitle', () => {
  it('renders with default props as h2', () => {
    render(<PageSubtitle>Test subtitle</PageSubtitle>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test subtitle');
  });

  it.each(['h2', 'h5', 'p'] as const)('renders as %s when requested', (as) => {
    render(<PageSubtitle as={as}>Subtitle</PageSubtitle>);
    expect(screen.getByText('Subtitle').tagName).toBe(as.toUpperCase());
  });

  it('uses title prop when provided', () => {
    render(<PageSubtitle title="Title prop" />);
    expect(screen.getByText('Title prop')).toBeInTheDocument();
  });

  it('applies className, id, and data-testid', () => {
    render(
      <PageSubtitle className="custom-subtitle" id="subtitle" data-testid="page-subtitle">
        Subtitle
      </PageSubtitle>,
    );
    const subtitle = screen.getByTestId('page-subtitle');
    expect(subtitle).toHaveClass('custom-subtitle');
    expect(subtitle).toHaveAttribute('id', 'subtitle');
  });
});

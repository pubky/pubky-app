import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders children', () => {
    render(<PageHeader>Header content</PageHeader>);
    expect(screen.getByText('Header content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<PageHeader className="custom-header">Custom header</PageHeader>);
    expect(screen.getByTestId('container')).toHaveClass('custom-header');
  });

  it('passes id and data-testid', () => {
    render(
      <PageHeader id="page-header" data-testid="page-header">
        Header
      </PageHeader>,
    );
    const header = screen.getByTestId('page-header');
    expect(header).toHaveAttribute('id', 'page-header');
  });
});

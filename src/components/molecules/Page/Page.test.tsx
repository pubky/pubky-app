import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageContainer, PageTitle } from './Page';

describe('PageContainer', () => {
  it('renders children', () => {
    render(
      <PageContainer>
        <div>Test content</div>
      </PageContainer>,
    );
    expect(screen.getByTestId('page-container')).toHaveTextContent('Test content');
  });

  it('renders as main when as="main"', () => {
    render(
      <PageContainer as="main">
        <p>Main content</p>
      </PageContainer>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('applies narrow size and className', () => {
    render(
      <PageContainer size="narrow" className="custom-page">
        <p>Content</p>
      </PageContainer>,
    );
    const container = screen.getByTestId('page-container');
    expect(container).toHaveClass('max-w-[588px]');
    expect(container).toHaveClass('custom-page');
  });
});

describe('PageTitle', () => {
  it('renders children as a heading', () => {
    render(<PageTitle>Default Title</PageTitle>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Default Title');
  });

  it('applies medium size class', () => {
    render(
      <PageTitle size="medium" className="custom-title">
        Medium Title
      </PageTitle>,
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveClass('text-4xl');
    expect(title).toHaveClass('custom-title');
  });
});

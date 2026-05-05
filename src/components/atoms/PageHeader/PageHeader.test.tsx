import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders with default props', () => {
    render(<PageHeader>Header content</PageHeader>);
    const pageHeader = screen.getByText('Header content');
    expect(pageHeader).toBeInTheDocument();
  });
});

describe('PageHeader - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PageHeader>Header content</PageHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<PageHeader className="custom-header">Custom header</PageHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with simple content', () => {
    const { container } = render(<PageHeader>Simple content</PageHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <PageHeader>
        <h1>Page Title</h1>
        <p>Page Subtitle</p>
      </PageHeader>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with nested children', () => {
    const { container } = render(
      <PageHeader>
        <div>
          <span>
            Complex <strong>Title</strong>
          </span>
          <span>
            Complex <em>Subtitle</em>
          </span>
        </div>
      </PageHeader>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<PageHeader id="header-id">Header with ID</PageHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<PageHeader data-testid="page-header">Header with test ID</PageHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSubtitle } from './PageSubtitle';

describe('PageSubtitle', () => {
  it('renders with default props', () => {
    render(<PageSubtitle>Test subtitle</PageSubtitle>);
    const pageSubtitle = screen.getByText('Test subtitle');
    expect(pageSubtitle).toBeInTheDocument();
  });
});

describe('PageSubtitle - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PageSubtitle>Test subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h2 element', () => {
    const { container } = render(<PageSubtitle as="h2">H2 subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h5 element', () => {
    const { container } = render(<PageSubtitle as="h5">H5 subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for p element', () => {
    const { container } = render(<PageSubtitle as="p">P subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<PageSubtitle className="custom-subtitle">Custom subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with title prop', () => {
    const { container } = render(<PageSubtitle title="Title prop subtitle" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with simple content', () => {
    const { container } = render(<PageSubtitle>Simple subtitle</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <PageSubtitle>
        <span>Complex</span> <strong>subtitle</strong> content
      </PageSubtitle>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<PageSubtitle id="subtitle-id">Subtitle with ID</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<PageSubtitle data-testid="page-subtitle">Subtitle with test ID</PageSubtitle>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

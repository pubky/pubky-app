import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createReplyConnectorPath } from '@/libs/svg/svg';
import { ReplyLine } from './ReplyLine';

describe('ReplyLine', () => {
  it('renders with required height prop', () => {
    render(<ReplyLine height={100} data-testid="reply-line" />);
    const svg = screen.getByTestId('reply-line');

    expect(svg).toBeInTheDocument();
    expect(svg.tagName).toBe('svg');
  });

  it('does not render tail path when isLast is true', () => {
    render(<ReplyLine height={100} isLast={true} data-testid="reply-line" />);
    const svg = screen.getByTestId('reply-line');
    const paths = svg.querySelectorAll('path');

    expect(paths).toHaveLength(1);
  });

  it('handles different height values', () => {
    const { rerender } = render(<ReplyLine height={50} data-testid="reply-line" />);
    let svg = screen.getByTestId('reply-line');
    expect(svg).toBeInTheDocument();

    rerender(<ReplyLine height={200} data-testid="reply-line" />);
    svg = screen.getByTestId('reply-line');
    expect(svg).toBeInTheDocument();

    rerender(<ReplyLine height={0} data-testid="reply-line" />);
    svg = screen.getByTestId('reply-line');
    expect(svg).toBeInTheDocument();
  });

  it('renders with correct dimensions and path data based on createReplyConnectorPath', () => {
    const height = 150;
    const isLast = false;
    const result = createReplyConnectorPath(height, isLast);

    render(<ReplyLine height={height} isLast={isLast} data-testid="reply-line" />);
    const svg = screen.getByTestId('reply-line');
    const mainPath = svg.querySelector('path:first-of-type');
    const tailPath = svg.querySelector('path:last-of-type');

    expect(svg).toHaveAttribute('width', result.width.toString());
    expect(svg).toHaveAttribute('height', result.height.toString());
    expect(svg).toHaveAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
    expect(mainPath).toHaveAttribute('d', result.path);
    expect(tailPath).toHaveAttribute('d', result.tailPath);
  });
});

describe('ReplyLine - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ReplyLine height={100} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isLast true', () => {
    const { container } = render(<ReplyLine height={100} isLast={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isLast false', () => {
    const { container } = render(<ReplyLine height={100} isLast={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom strokeColor', () => {
    const { container } = render(<ReplyLine height={100} strokeColor="#ff0000" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom strokeWidth', () => {
    const { container } = render(<ReplyLine height={100} strokeWidth={4} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with small height', () => {
    const { container } = render(<ReplyLine height={50} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with large height', () => {
    const { container } = render(<ReplyLine height={300} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with zero height', () => {
    const { container } = render(<ReplyLine height={0} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all custom props', () => {
    const { container } = render(<ReplyLine height={200} isLast={false} strokeColor="#00ff00" strokeWidth={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isLast true and custom styling', () => {
    const { container } = render(<ReplyLine height={150} isLast={true} strokeColor="#0000ff" strokeWidth={1} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

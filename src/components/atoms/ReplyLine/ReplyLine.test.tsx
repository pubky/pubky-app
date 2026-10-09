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

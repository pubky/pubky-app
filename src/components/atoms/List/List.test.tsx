import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { List } from './List';

describe('List', () => {
  it('renders as ul by default with disc markers', () => {
    render(
      <List>
        <li>Item 1</li>
      </List>,
    );
    const list = screen.getByTestId('list');
    expect(list.tagName).toBe('UL');
    expect(list).toHaveClass('list-disc');
  });

  it('renders as ol when requested', () => {
    render(
      <List as="ol">
        <li>Item 1</li>
      </List>,
    );
    expect(screen.getByTestId('list').tagName).toBe('OL');
  });

  it.each([
    ['default', 'list-disc'],
    ['decimal', 'list-decimal'],
    ['none', 'list-none'],
  ] as const)('applies variant=%s', (variant, className) => {
    render(
      <List variant={variant}>
        <li>Item</li>
      </List>,
    );
    expect(screen.getByTestId('list')).toHaveClass(className);
  });

  it('passes className and data-testid', () => {
    render(
      <List className="custom-list" data-testid="custom-list">
        <li>Item</li>
      </List>,
    );
    const list = screen.getByTestId('custom-list');
    expect(list).toHaveClass('custom-list');
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepostText } from './RepostText';
import { NAME_TOKEN } from './RepostText.types';

describe('RepostText', () => {
  it('renders with name in the middle of template', () => {
    render(<RepostText template={`${NAME_TOKEN} reposted`} name="John" />);
    expect(screen.getByTestId('repost-text-name')).toHaveTextContent('John');
  });

  it('renders prefix before name', () => {
    const { container } = render(<RepostText template={`By ${NAME_TOKEN} reposted`} name="John" />);
    expect(container.textContent).toBe('By Johnreposted');
    expect(screen.getByTestId('repost-text-name')).toHaveTextContent('John');
  });

  it('renders suffix after name', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN} and others`} name="John" />);
    expect(container.textContent).toContain('and others');
  });

  it('trims leading whitespace from suffix', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN}   and others`} name="John" />);
    // Should trim the leading spaces from suffix
    expect(container.textContent).toBe('Johnand others');
  });

  it('adds non-breaking space when preserveSpace is true', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN} and others`} name="John" preserveSpace />);
    // \u00A0 is non-breaking space
    expect(container.textContent).toBe('John\u00A0and others');
  });

  it('handles template without NAME_TOKEN', () => {
    const { container } = render(<RepostText template="No token here" name="John" />);
    // When no token, prefix is empty and suffix is the whole template
    expect(container.textContent).toBe('No token hereJohn');
  });

  it('handles empty prefix', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN}, others reposted`} name="Jane" />);
    expect(container.textContent).toBe('Jane, others reposted');
  });

  it('applies truncate class to name element', () => {
    render(<RepostText template={`${NAME_TOKEN} reposted`} name="VeryLongUsername" />);
    const nameElement = screen.getByTestId('repost-text-name');
    expect(nameElement).toHaveClass('truncate');
    expect(nameElement).toHaveClass('min-w-0');
  });
});

describe('RepostText - Snapshots', () => {
  it('matches snapshot for simple repost', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN} reposted`} name="Alice" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for mobile format with comma', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN}, others reposted`} name="Bob" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for desktop format with preserveSpace', () => {
    const { container } = render(
      <RepostText template={`${NAME_TOKEN} and 3 others reposted this`} name="Charlie" preserveSpace />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with long name', () => {
    const { container } = render(<RepostText template={`${NAME_TOKEN} reposted`} name="VeryLongUsernameT..." />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with "You" as name', () => {
    const { container } = render(
      <RepostText template={`${NAME_TOKEN} and 2 others reposted this`} name="You" preserveSpace />,
    );
    expect(container).toMatchSnapshot();
  });
});

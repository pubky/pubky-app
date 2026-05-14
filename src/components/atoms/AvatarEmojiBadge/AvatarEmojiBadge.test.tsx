import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarEmojiBadge } from './AvatarEmojiBadge';

describe('AvatarEmojiBadge', () => {
  it('renders emoji correctly', () => {
    render(<AvatarEmojiBadge emoji="🌴" />);
    expect(screen.getByText('🌴')).toBeInTheDocument();
  });

  it('renders different emoji', () => {
    render(<AvatarEmojiBadge emoji="🚀" />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<AvatarEmojiBadge emoji="🌴" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

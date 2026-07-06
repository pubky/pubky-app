import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroOwner } from './HeroOwner';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    fallbackSeed,
    size,
    alt,
  }: {
    avatarUrl?: string;
    name: string;
    fallbackSeed?: string;
    size?: string;
    alt?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl ?? ''}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
      data-alt={alt}
    >
      {name}
    </div>
  ),
}));

describe('HeroOwner', () => {
  it('renders the avatar and the name once the profile resolves', () => {
    render(
      <HeroOwner name="Alice" fallbackSeed="alice-pubky" avatarUrl="https://example.com/a.png" isResolved size="sm" />,
    );

    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'Alice');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/a.png');
    expect(avatar).toHaveAttribute('data-fallback-seed', 'alice-pubky');
    expect(avatar).toHaveAttribute('data-alt', 'Alice');
    expect(screen.getByText('Alice', { selector: 'span' })).toBeInTheDocument();
  });

  it('renders a skeleton in place of the name while the profile is unresolved', () => {
    render(<HeroOwner name="Alice" fallbackSeed="alice-pubky" isResolved={false} size="sm" />);

    // The avatar still renders, but the name text must not appear yet.
    expect(screen.getByTestId('avatar-with-fallback')).toBeInTheDocument();
    expect(screen.queryByText('Alice', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('passes the caller-provided avatar size through', () => {
    const { rerender } = render(<HeroOwner name="Alice" fallbackSeed="alice-pubky" isResolved size="sm" />);
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-size', 'sm');

    rerender(<HeroOwner name="Alice" fallbackSeed="alice-pubky" isResolved size="md" />);
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-size', 'md');
  });

  it('merges a caller-provided gap class onto the row container', () => {
    const { container } = render(
      <HeroOwner name="Alice" fallbackSeed="alice-pubky" isResolved size="sm" className="gap-2" />,
    );

    expect(container.firstChild).toHaveClass('gap-2');
    expect(container.firstChild).not.toHaveClass('gap-3');
  });
});

describe('HeroOwner - Snapshots', () => {
  it('matches the snapshot for the resolved state', () => {
    const { container } = render(
      <HeroOwner name="Alice" fallbackSeed="alice-pubky" avatarUrl="https://example.com/a.png" isResolved size="sm" />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the unresolved (skeleton) state', () => {
    const { container } = render(<HeroOwner name="Alice" fallbackSeed="alice-pubky" isResolved={false} size="md" />);

    expect(container.firstChild).toMatchSnapshot();
  });
});

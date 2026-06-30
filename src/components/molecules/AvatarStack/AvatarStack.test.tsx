import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UserProfile, useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { formatPublicKey } from '@/libs/utils/utils';
import { AvatarStack } from '@/molecules/AvatarStack/AvatarStack';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

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

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const mockUseUserProfile = vi.mocked(useUserProfile);

const PUBKYS_7 = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'gggggggggggggggggggggggggggggggggggggggggggggggggggg',
];

/**
 * Default mock: deterministic per-pubky profile.
 */
function setDeterministicProfiles() {
  mockUseUserProfile.mockImplementation((pubky: string) => ({
    profile: {
      name: `User-${pubky.slice(0, 4)}`,
      bio: '',
      publicKey: pubky,
      emoji: '',
      status: '',
      avatarUrl: `https://example.com/${pubky.slice(0, 4)}.png`,
      link: '',
      links: null,
    } satisfies UserProfile,
    isLoading: false,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setDeterministicProfiles();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AvatarStack', () => {
  it('returns null when pubkys is empty', () => {
    const { container } = render(<AvatarStack pubkys={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders exactly pubkys.length avatars and no overflow chip when under the cap', () => {
    render(<AvatarStack pubkys={PUBKYS_7.slice(0, 3)} />);

    expect(screen.getAllByTestId('avatar-with-fallback')).toHaveLength(3);
    expect(screen.queryByTestId('avatar-stack-overflow')).not.toBeInTheDocument();
  });

  it('renders max avatars + overflow chip with +N when over the cap (default max=5)', () => {
    render(<AvatarStack pubkys={PUBKYS_7} />);

    expect(screen.getAllByTestId('avatar-with-fallback')).toHaveLength(5);
    const overflow = screen.getByTestId('avatar-stack-overflow');
    expect(overflow).toHaveTextContent('+2');
  });

  it('honors a custom max prop', () => {
    render(<AvatarStack pubkys={PUBKYS_7} max={3} />);

    expect(screen.getAllByTestId('avatar-with-fallback')).toHaveLength(3);
    expect(screen.getByTestId('avatar-stack-overflow')).toHaveTextContent('+4');
  });

  it('passes size prop through to each AvatarWithFallback slot', () => {
    render(<AvatarStack pubkys={PUBKYS_7.slice(0, 3)} size="lg" />);

    const avatars = screen.getAllByTestId('avatar-with-fallback');
    avatars.forEach((avatar) => {
      expect(avatar).toHaveAttribute('data-size', 'lg');
    });
  });

  it('sets data-name from useUserProfile and data-fallback-seed to the pubky', () => {
    const pubkys = PUBKYS_7.slice(0, 3);
    render(<AvatarStack pubkys={pubkys} />);

    const avatars = screen.getAllByTestId('avatar-with-fallback');
    pubkys.forEach((pubky, i) => {
      expect(avatars[i]).toHaveAttribute('data-name', `User-${pubky.slice(0, 4)}`);
      expect(avatars[i]).toHaveAttribute('data-fallback-seed', pubky);
    });
  });

  it('falls back to formatPublicKey when profile is null', () => {
    const [first, second] = PUBKYS_7;
    mockUseUserProfile.mockImplementation((pubky: string) => {
      if (pubky === first) {
        return { profile: null, isLoading: false };
      }
      return {
        profile: {
          name: `User-${pubky.slice(0, 4)}`,
          bio: '',
          publicKey: pubky,
          emoji: '',
          status: '',
          avatarUrl: undefined,
          link: '',
          links: null,
        } satisfies UserProfile,
        isLoading: false,
      };
    });

    render(<AvatarStack pubkys={[first, second]} />);

    const avatars = screen.getAllByTestId('avatar-with-fallback');
    expect(avatars[0]).toHaveAttribute('data-name', formatPublicKey({ key: first }));
    expect(avatars[1]).toHaveAttribute('data-name', `User-${second.slice(0, 4)}`);
  });

  it('honors a custom data-testid on the outer container', () => {
    render(<AvatarStack pubkys={PUBKYS_7.slice(0, 2)} data-testid="my-stack" />);

    expect(screen.getByTestId('my-stack')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-stack')).not.toBeInTheDocument();
  });

  it('defaults data-testid to "avatar-stack"', () => {
    render(<AvatarStack pubkys={PUBKYS_7.slice(0, 2)} />);

    expect(screen.getByTestId('avatar-stack')).toBeInTheDocument();
  });
});

describe('AvatarStack - Snapshots', () => {
  it('matches snapshot for a typical 3-pubky case', () => {
    const { container } = render(<AvatarStack pubkys={PUBKYS_7.slice(0, 3)} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an overflow case (7 pubkys, default cap 5)', () => {
    const { container } = render(<AvatarStack pubkys={PUBKYS_7} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

import type * as Atoms from '@/atoms';

export interface AvatarWithFallbackProps {
  avatarUrl?: string;
  name: string;
  fallbackSeed?: string;
  size?: Atoms.AvatarSize;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
  'data-testid'?: string;
}

export interface ResolveAvatarFallbackSeedProps {
  fallbackSeed?: string | null;
  userId?: string | null;
  name?: string | null;
  defaultSeed?: string;
}

export interface ResolveAvatarFallbackInitialProps {
  name?: string | null;
  seed?: string | null;
  defaultInitial?: string;
}

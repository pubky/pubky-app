// Consumed by VRT test harness (src/test-utils/vrt.tsx and Home.vrt.test.tsx).
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';

// `fakeOwner(1)` … `fakeOwner(8)` from `pubky-social-specs/testing`, spelled out so the fixture stays a
// plain value (`profiles.test.ts` keeps them in step). Social v1 refuses any reference whose owner is
// not a well-formed public key.
export const VRT_AUTHOR_PUBKYS = {
  alice: '5kjj6uydjfsg1ojd83urbsos7omkosi5pmpa13hqec4ye5okhody' as Pubky,
  bran: 'ajqyiyd8gkzct4ncoqzg48tye7k5mtba7aogkh8wpuct7tjk7gny' as Pubky,
  cleo: '3emxro3id6h55wz7agg9j64x4wx9oxschoo1o63uhjxskac6od3y' as Pubky,
  dion: '6xek5rdncwb9uk1eih4w3qjzgt5ekqd5sbxr3shw4dd4ii9eofyy' as Pubky,
  eira: '9qpfkw3ojyke3r837wmpkznawa6ctowxzjxodwnum3y7nh4h7y5y' as Pubky,
  fynn: 'hpkcb84wgxmn4qcskdxxtgdqbi97kzyc841q5t3jqgsczsdhhs4y' as Pubky,
  glen: '7cxdozygd5yioy38nm6sn9ebuh43tjzag114bu8q9himy9getuby' as Pubky,
  hana: '1dfhdxgg6w76hc3p5wmsfcg4jcyds7jkwhjz4nnmmy69qmtoewxy' as Pubky,
} as const;

// No uploaded avatar images in VRT — every profile renders the pubky/name-derived
// FacehashAvatar fallback (same path as the signed-in header avatar).
export const VRT_AUTHOR_PROFILES: Record<Pubky, NexusUserDetails> = {
  [VRT_AUTHOR_PUBKYS.alice]: {
    id: VRT_AUTHOR_PUBKYS.alice,
    name: 'Alice Mercado',
    bio: 'Designing local-first social tools. Probably outside.',
    image: null,
    links: [{ title: 'Site', url: 'https://example.com/alice' }],
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 30 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.bran]: {
    id: VRT_AUTHOR_PUBKYS.bran,
    name: 'Bran Ó Conaill',
    bio: 'Distributed systems / Bitcoin / cold-brew enthusiast.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 24 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.cleo]: {
    id: VRT_AUTHOR_PUBKYS.cleo,
    name: 'Cleo Ramirez',
    bio: 'Photographer. Sunlight, skylines, slow shutters.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 18 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.dion]: {
    id: VRT_AUTHOR_PUBKYS.dion,
    name: 'Dion Park',
    bio: 'Reading list maximalist. Notes app at full health.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 14 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.eira]: {
    id: VRT_AUTHOR_PUBKYS.eira,
    name: 'Eira Hauksson',
    bio: 'Building protocols for human-scale networks.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 9 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.fynn]: {
    id: VRT_AUTHOR_PUBKYS.fynn,
    name: 'Fynn Aldridge',
    bio: 'Music, mostly. Mixing engineer by day.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 6 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.glen]: {
    id: VRT_AUTHOR_PUBKYS.glen,
    name: 'Glen Iwobi',
    bio: 'Cycling, kettles, and key-value stores.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 3 * 24 * HOUR_MS,
  },
  [VRT_AUTHOR_PUBKYS.hana]: {
    id: VRT_AUTHOR_PUBKYS.hana,
    name: 'Hana Voss',
    bio: 'Type-setter. Long walks. Longer footnotes.',
    image: null,
    links: null,
    status: null,
    indexed_at: VRT_FROZEN_NOW_MS - 30 * MINUTE_MS,
  },
};

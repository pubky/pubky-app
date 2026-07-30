// Consumed by VRT test harness (src/test-utils/vrt.tsx and Home.vrt.test.tsx).
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';

export const VRT_AUTHOR_PUBKYS = {
  alice: 'vrt000000000000000000000000000000000000000000alice01' as Pubky,
  bran: 'vrt0000000000000000000000000000000000000000000bran02' as Pubky,
  cleo: 'vrt0000000000000000000000000000000000000000000cleo03' as Pubky,
  dion: 'vrt0000000000000000000000000000000000000000000dion04' as Pubky,
  eira: 'vrt0000000000000000000000000000000000000000000eira05' as Pubky,
  fynn: 'vrt0000000000000000000000000000000000000000000fynn06' as Pubky,
  glen: 'vrt0000000000000000000000000000000000000000000glen07' as Pubky,
  hana: 'vrt0000000000000000000000000000000000000000000hana08' as Pubky,
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

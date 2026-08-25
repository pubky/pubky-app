// Consumed by `Profile.vrt.test.tsx` for the Profile Tagged tab and
// the other-user profile sidebar (`useTagged`).
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { VRT_AUTHOR_PROFILES, VRT_AUTHOR_PUBKYS } from '../feed/profiles';

function tagger(pubky: keyof typeof VRT_AUTHOR_PUBKYS): TagWithAvatars['taggers'][number] {
  const id = VRT_AUTHOR_PUBKYS[pubky];
  return { id, name: VRT_AUTHOR_PROFILES[id].name };
}

/** Tags other users have applied to Alice's profile, richest tag first. */
export const VRT_PROFILE_TAGGED_TAGS: readonly TagWithAvatars[] = [
  {
    label: 'localfirst',
    taggers: [tagger('bran'), tagger('eira'), tagger('cleo'), tagger('dion')],
    taggers_count: 4,
    relationship: false,
  },
  {
    label: 'pubky',
    taggers: [tagger('eira'), tagger('glen'), tagger('hana')],
    taggers_count: 3,
    relationship: true,
  },
  {
    label: 'design',
    taggers: [tagger('hana'), tagger('cleo')],
    taggers_count: 2,
    relationship: false,
  },
  {
    label: 'engineering',
    taggers: [tagger('bran'), tagger('glen')],
    taggers_count: 2,
    relationship: false,
  },
  {
    label: 'reading',
    taggers: [tagger('dion')],
    taggers_count: 1,
    relationship: false,
  },
  {
    label: 'mentor',
    taggers: [tagger('fynn')],
    taggers_count: 1,
    relationship: false,
  },
];

/** Tags applied to Bran's profile — sidebar on the other-user Posts tab. */
export const VRT_OTHER_PROFILE_TAGGED_TAGS: readonly TagWithAvatars[] = [
  {
    label: 'distsys',
    taggers: [tagger('alice'), tagger('eira'), tagger('glen')],
    taggers_count: 3,
    relationship: true,
  },
  {
    label: 'bitcoin',
    taggers: [tagger('alice'), tagger('cleo')],
    taggers_count: 2,
    relationship: false,
  },
  {
    label: 'coldbrew',
    taggers: [tagger('fynn')],
    taggers_count: 1,
    relationship: false,
  },
];

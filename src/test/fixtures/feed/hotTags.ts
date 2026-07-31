// Consumed by Hot VRT (`Hot.vrt.test.tsx`) via the `useHotTags` mock.
import type { NexusHotTag } from '@/services/nexus/nexus.types';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const { alice, bran, cleo, dion, eira, fynn, glen, hana } = VRT_AUTHOR_PUBKYS;

function tag(label: string, tagged_count: number, taggers_id: (typeof alice)[]): NexusHotTag {
  return {
    label,
    tagged_count,
    taggers_count: taggers_id.length,
    taggers_id,
  };
}

/**
 * Ordered hot tags for the Hot page snapshot.
 * First three are featured cards; the rest fill the tags overview grid.
 */
export const VRT_HOT_TAGS: readonly NexusHotTag[] = [
  tag('pubky', 128, [alice, bran, cleo, dion, eira, fynn]),
  tag('design', 96, [hana, alice, bran, glen]),
  tag('photography', 74, [cleo, fynn, eira, hana]),
  tag('bitcoin', 61, [bran, dion, glen]),
  tag('protocols', 54, [eira, alice, bran]),
  tag('music', 48, [fynn, glen, cleo]),
  tag('typography', 41, [hana, alice]),
  tag('localfirst', 37, [alice, eira, bran]),
  tag('research', 33, [dion, bran]),
  tag('cycling', 29, [glen, fynn]),
  tag('mixing', 26, [fynn, hana]),
  tag('iceland', 22, [eira, cleo]),
  tag('reading', 19, [dion, hana, alice]),
  tag('goldenhour', 17, [cleo, fynn]),
  tag('databases', 14, [glen, bran, dion]),
  tag('footnotes', 12, [hana, alice]),
  tag('skylines', 11, [cleo, eira]),
  tag('coldbrew', 9, [bran, glen]),
  tag('keychain', 8, [alice, fynn, dion]),
  tag('slowshutters', 7, [cleo, hana]),
];

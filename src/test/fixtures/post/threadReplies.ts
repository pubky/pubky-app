// Consumed by `SinglePost.vrt.test.tsx` for the Level-1 reply tree under
// `VRT_SINGLE_POST` (Bran's hot-take). Oldest first; at most 3 are shown.
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import { MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_SINGLE_POST } from '../feed/posts';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';

interface VRTSinglePostReplyFixture {
  compositeId: string;
  postId: string;
  details: NexusPostDetails;
  counts: NexusPostCounts;
  relationships: NexusPostRelationships;
  tags: NexusTag[];
}

function post(input: {
  author: Pubky;
  postId: string;
  content: string;
  agoMs: number;
  replied: string;
}): VRTSinglePostReplyFixture {
  const { author, postId, content, agoMs, replied } = input;
  return {
    compositeId: buildCompositeId({ pubky: author, id: postId }),
    postId,
    details: {
      id: postId,
      author,
      content,
      indexed_at: VRT_FROZEN_NOW_MS - agoMs,
      kind: 'short',
      uri: `${PUBKY_BASE_URI}${author}${POST_PATH}${postId}`,
      attachments: null,
    },
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
    relationships: { replied, reposted: null, mentioned: [] },
    tags: [],
  };
}

export const VRT_SINGLE_POST_THREAD_REPLIES: readonly VRTSinglePostReplyFixture[] = [
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTSINGLEREPLY001',
    content: 'Corner timestamps win on desktop. On a phone they fight the avatar.',
    agoMs: 90 * MINUTE_MS,
    replied: VRT_SINGLE_POST.details.uri,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.cleo,
    postId: '0VRTSINGLEREPLY002',
    content: 'I want the time next to the name. Scanning a grid of photos, I never look at the corner.',
    agoMs: 70 * MINUTE_MS,
    replied: VRT_SINGLE_POST.details.uri,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.dion,
    postId: '0VRTSINGLEREPLY003',
    content: 'Hierarchy is a reading-order problem. If the timestamp is content, put it in the content column.',
    agoMs: 50 * MINUTE_MS,
    replied: VRT_SINGLE_POST.details.uri,
  }),
];

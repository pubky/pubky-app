import { MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_SINGLE_POST } from './posts';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const author = VRT_AUTHOR_PUBKYS.alice;
const repostId = '0VRTREPOSTALICE001';
const quoteId = '0VRTQUOTE0ALICE001';

/** Same original, distinct repost counts/tags so body-target regressions are visible. */
export const VRT_PLAIN_REPOST = {
  ...VRT_SINGLE_POST,
  compositeId: `${author}:${repostId}`,
  postId: repostId,
  details: {
    ...VRT_SINGLE_POST.details,
    id: repostId,
    author,
    uri: `pubky://${author}/pub/pubky.app/posts/${repostId}`,
    content: '',
    indexed_at: VRT_FROZEN_NOW_MS - 12 * MINUTE_MS,
  },
  relationships: { replied: null, reposted: VRT_SINGLE_POST.details.uri, mentioned: [] },
  counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
  tags: [],
};

export const VRT_QUOTE_REPOST = {
  ...VRT_PLAIN_REPOST,
  compositeId: `${author}:${quoteId}`,
  postId: quoteId,
  details: {
    ...VRT_PLAIN_REPOST.details,
    id: quoteId,
    uri: `pubky://${author}/pub/pubky.app/posts/${quoteId}`,
    content: 'A useful distinction: simple reposts show the original; quotes keep their own context.',
  },
};

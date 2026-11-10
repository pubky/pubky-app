'use client';

import { Container } from '@/atoms/Container/Container';
import type { UseResourceRepliesResult } from '@/hooks/useResourceReplies/useResourceReplies';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { ThreadTreeView } from '@/organisms/ThreadTree/ThreadTree';

interface ResourceRepliesProps {
  /** The link the replies answer, exactly as written: a new reply's `parent`. */
  uri: string;
  /** The page's read of the replies (`useResourceReplies(uri)`), shared with the Reply button's count. */
  replies: UseResourceRepliesResult;
}

/**
 * The resource page's thread, where a post's page has its replies (`SinglePostContent`): the quick
 * reply under the card, then the posts replying to the link in the post page's thread
 * (`ThreadTreeView`), each with its own nested replies. A link the app cannot write as a `parent`
 * (`isExternalParentUri`) gets the replies without the composer.
 */
export function ResourceReplies({ uri, replies }: ResourceRepliesProps) {
  return (
    <Container overrideDefaults data-testid="resource-replies" className="flex">
      <Container className="w-full min-w-0 flex-1 gap-0 overflow-hidden">
        <Container overrideDefaults className="ml-3">
          <ThreadTreeView
            key={uri}
            replies={replies}
            quickReply={isExternalParentUri(uri) ? { parentUri: uri } : null}
            onReplySubmitted={replies.addReply}
          />
        </Container>
      </Container>
    </Container>
  );
}

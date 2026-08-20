import { NextResponse } from 'next/server';
import { POST_ROUTES } from '@/app/routes';
import { AppError } from '@/libs/error/error';
import { ErrorCategory } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { fetchPostDetailsForServer, fetchPostViewForServer } from '@/libs/post/postMetadata';
import { type MarkdownQuotedPost, postToMarkdown } from '@/libs/post/postToMarkdown';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';

/**
 * Internal handler for `/post/:userId/:postId.md` (rewritten in next.config).
 * Returns the post as a markdown document — errors stay text/plain, not JSON.
 */

const MARKDOWN_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
/** Nexus rejects post ids that are not exactly 13 characters. */
const NEXUS_POST_ID_LENGTH = 13;

type MarkdownRouteContext = {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
};

function plain(status: number, body: string): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function GET(_request: Request, { params }: MarkdownRouteContext) {
  const { userId, postId } = await params;
  if (!isPubkyIdentifier(userId) || postId.length !== NEXUS_POST_ID_LENGTH) {
    return plain(HttpStatusCode.BAD_REQUEST, 'Invalid post');
  }

  try {
    const view = await fetchPostViewForServer(userId, postId);
    if (!view) {
      return plain(HttpStatusCode.NOT_FOUND, 'Not found');
    }

    const markdown = postToMarkdown({
      ...view.details,
      quoted: await loadQuotedPost(view.relationships.reposted),
      replyHref: markdownHrefForPostUri(view.relationships.replied),
    });
    if (markdown === null) {
      return plain(HttpStatusCode.NOT_FOUND, 'Not found');
    }

    return new NextResponse(markdown, {
      status: HttpStatusCode.OK,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `inline; filename="${postId}.md"`,
        'Cache-Control': MARKDOWN_CACHE_CONTROL,
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.category === ErrorCategory.Client) {
      const status = error.context?.statusCode;
      if (status === HttpStatusCode.BAD_REQUEST) {
        return plain(HttpStatusCode.BAD_REQUEST, 'Invalid post');
      }
      return plain(HttpStatusCode.NOT_FOUND, 'Not found');
    }
    return plain(HttpStatusCode.BAD_GATEWAY, 'Post unavailable');
  }
}

function parsePostUri(uri: string | null | undefined): { userId: string; postId: string } | null {
  if (!uri) return null;
  const compositeId = buildCompositeIdFromPubkyUri({ uri: uri as Pubky, domain: CompositeIdDomain.POSTS });
  if (!compositeId) return null;
  try {
    const { pubky, id } = parseCompositeId(compositeId);
    return { userId: pubky, postId: id };
  } catch {
    return null;
  }
}

function markdownHrefForPostUri(uri: string | null | undefined): string | null {
  const parsed = parsePostUri(uri);
  if (!parsed) return null;
  return `${POST_ROUTES.POST}/${parsed.userId}/${parsed.postId}.md`;
}

async function loadQuotedPost(repostedUri: string | null): Promise<MarkdownQuotedPost | undefined> {
  const parsed = parsePostUri(repostedUri);
  if (!parsed) return undefined;
  try {
    const post = await fetchPostDetailsForServer(parsed.userId, parsed.postId);
    if (!post) return undefined;
    return {
      kind: post.kind,
      content: post.content,
      attachments: post.attachments,
      href: `${POST_ROUTES.POST}/${parsed.userId}/${parsed.postId}.md`,
    };
  } catch {
    // Quote lookup is optional. A Nexus blip on the original must not 502 the current post.
    return undefined;
  }
}

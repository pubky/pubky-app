import { resolvePostAttachmentUrl } from '@/libs/file/resolvePostAttachmentUrl';
import { isPostDeleted } from '@/libs/utils/utils';
import { FileVariant } from '@/services/nexus/file/file.types';
import { parseArticleContent } from './articleContent';
import { parseCollectionContent } from './collectionContent';

export type MarkdownQuotedPost = {
  kind: string;
  content: string;
  attachments?: string[] | null;
  href: string;
};

type MarkdownPost = {
  kind: string;
  content: string;
  attachments?: string[] | null;
  quoted?: MarkdownQuotedPost;
  replyHref?: string | null;
};

/**
 * Turns stored post details into the body for `/{postId}.md`.
 * Returns `null` for tombstones so the route can 404 instead of emitting `[DELETED]`.
 * Homeserver file attachments are appended as markdown image or link syntax
 * pointing at the CDN `main` variant — they are not part of `content`.
 * Quoted/reposted originals are a blockquote (depth 1). Replies get a link, not the parent body.
 */
export function postToMarkdown(post: MarkdownPost): string | null {
  if (isPostDeleted(post.content)) return null;

  const reply = post.replyHref ? `In reply to: ${post.replyHref}` : '';
  const body = contentToMarkdown(post);
  const media = attachmentsToMarkdown(post.attachments, post.kind);
  const quoted = post.quoted ? quotedToMarkdown(post.quoted) : '';
  return [reply, body, media, quoted].filter((section) => section.length > 0).join('\n\n');
}

function contentToMarkdown(post: MarkdownPost): string {
  if (post.kind === 'long') {
    const article = parseArticleContent(post.content);
    if (article) return `# ${article.title}\n\n${article.body}`;
  }

  if (post.kind === 'collection') {
    const collection = parseCollectionContent(post.content);
    if (collection) {
      return [`# ${collection.name}`, collection.description].filter(Boolean).join('\n\n');
    }
  }

  return post.content;
}

function attachmentsToMarkdown(uris: string[] | null | undefined, kind: string): string {
  if (!uris?.length) return '';

  const lines: string[] = [];
  for (const uri of uris) {
    const url = resolvePostAttachmentUrl(uri, FileVariant.MAIN);
    if (!url) continue;
    lines.push(embedForKind(url, kind));
  }
  return lines.join('\n\n');
}

function embedForKind(url: string, kind: string): string {
  if (kind === 'video') return `[video](${url})`;
  if (kind === 'file') return `[file](${url})`;
  return `![](${url})`;
}

function quotedToMarkdown(quoted: MarkdownQuotedPost): string {
  const inner = postToMarkdown({
    kind: quoted.kind,
    content: quoted.content,
    attachments: quoted.attachments,
  });
  if (!inner) return '';
  return `${asBlockquote(inner)}\n>\n> — ${quoted.href}`;
}

function asBlockquote(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n');
}

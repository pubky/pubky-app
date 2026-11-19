/**
 * The article envelope as this client reads it from a post's `content`: the stored spelling
 * (`cover_image`), tolerant of the 0.x envelope that has no cover member.
 */
export interface ArticleContent {
  title: string;
  body: string;
  /** The cover's URI, from the v1 envelope; null when absent (a 0.x article, or an article with none). */
  cover_image: string | null;
}

export function parseArticleContent(raw: string | null | undefined): ArticleContent | null {
  if (!raw) return null;

  let content: Partial<ArticleContent>;
  try {
    content = JSON.parse(raw) as Partial<ArticleContent>;
  } catch {
    return null;
  }

  if (!content || typeof content !== 'object') return null;
  if (typeof content.title !== 'string') return null;
  if (typeof content.body !== 'string') return null;

  return {
    title: content.title,
    body: content.body,
    cover_image: typeof content.cover_image === 'string' && content.cover_image ? content.cover_image : null,
  };
}

export function isArticleContent(raw: string | null | undefined): boolean {
  return parseArticleContent(raw) !== null;
}

/**
 * The composer form of an article's `content`: the title and the body, as `PostNormalizer`
 * takes it. The stored envelope (with its cover) is spelled by the data model, never here.
 */
export function buildArticleContent(title: string, body: string): string {
  return JSON.stringify({ title: title.trim(), body: body.trim() });
}

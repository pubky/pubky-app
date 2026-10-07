interface ArticleContent {
  title: string;
  body: string;
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
  };
}

export function isArticleContent(raw: string | null | undefined): boolean {
  return parseArticleContent(raw) !== null;
}

/** The `content` of a `kind: long` post. The one producer `parseArticleContent` round-trips with. */
export function buildArticleContent(title: string, body: string): string {
  return JSON.stringify({ title: title.trim(), body: body.trim() });
}

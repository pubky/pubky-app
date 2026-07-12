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

export function normalizeTagList(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];
}

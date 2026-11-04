export type AppSnapshotTarget = {
  kind: 'post' | 'user';
  uri: string;
};

export type AppSnapshotSource = {
  author?: unknown;
  content?: unknown;
  kind?: unknown;
  name?: unknown;
  bio?: unknown;
} | null;

function pubkyFromUri(uri: string): string {
  return /^pubky:\/\/([^/]+)\//.exec(uri)?.[1] ?? '';
}

export function projectTargetSnapshot(
  target: AppSnapshotTarget,
  source: AppSnapshotSource,
): Record<string, string | null> {
  return target.kind === 'post'
    ? {
        kind: 'post',
        uri: target.uri,
        author: pubkyFromUri(target.uri),
        content: typeof source?.content === 'string' ? source.content : '',
        post_kind: typeof source?.kind === 'string' ? source.kind : '',
      }
    : {
        kind: 'user',
        uri: target.uri,
        pubky: pubkyFromUri(target.uri),
        name: typeof source?.name === 'string' ? source.name : '',
        bio: typeof source?.bio === 'string' ? source.bio : null,
      };
}

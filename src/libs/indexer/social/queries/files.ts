import { idMicros } from 'pubky-social-specs';
import type { SocialFile, SocialView } from '../social.view';
import { InvalidQueryError } from './queries.errors';
import { type Answer, exact, type FileDetailsJson, type MoreHint, scoped, withMore } from './queries.types';

export interface FilesByIdsParams {
  uris: readonly string[];
}

const MAX_URIS = 100;
const PUBKY_URI = /^pubky:\/\/([^/]+)(\/.+)$/i;

/** The author and path a `pubky://` URI names, `null` for any other text. */
function locationOf(uri: string): { author: string; path: string } | null {
  const match = PUBKY_URI.exec(uri.trim());
  return match === null ? null : { author: match[1], path: match[2] };
}

function fileDetailsJson({ author, path, fileId, data }: SocialFile): FileDetailsJson {
  return {
    id: fileId,
    uri: `pubky://${author}${path}`,
    owner_id: author,
    indexed_at: Math.floor(idMicros(fileId) / 1000),
    created_at: data.createdAt,
    src: data.src,
    name: data.name,
    size: data.size,
    content_type: data.contentType,
    // The app builds every media URL itself; this keeps the field's form.
    urls: JSON.stringify({ main: `${author}/${fileId}/main` }),
    metadata: null,
  };
}

/**
 * The file records the URIs name, in the order asked; the rest are left out, as the central indexer drops missing
 * ones. A tree that keeps no record beside a file (social v1, whose file name says its type) has none to give. Each
 * URI the view holds nothing at is listed in `more`, to load and ask again.
 */
export function filesByIds(view: SocialView, { uris }: FilesByIdsParams): Answer<FileDetailsJson[]> {
  if (uris.length > MAX_URIS) throw new InvalidQueryError('files/by_ids', 'uris', `takes at most ${MAX_URIS}`);
  const more: MoreHint[] = [];
  const files = uris.flatMap((uri) => {
    const at = locationOf(uri);
    if (at === null) return [];
    const file = view.file(at.author, at.path);
    if (file !== null) return [fileDetailsJson(file)];
    more.push({ kind: 'file', author: at.author, path: at.path });
    return [];
  });
  return more.length === 0 ? exact(files) : withMore(scoped(files, 'not loaded yet'), more);
}

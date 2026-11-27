import { buildPost } from 'pubky-social-specs';
import { encodeJson } from '../../fakeNetwork';
import { ALICE, at } from '../social.fixtures';
import { LEGACY_ROOT } from './legacyTree';

// Test-only: records of the older tree, written as its own writer wrote them.

export const legacyPath = {
  profile: `${LEGACY_ROOT}profile.json`,
  follow: (followee: string) => `${LEGACY_ROOT}follows/${followee}`,
  post: (postId: string) => `${LEGACY_ROOT}posts/${postId}`,
  tag: (tagId: string) => `${LEGACY_ROOT}tags/${tagId}`,
  file: (fileId: string) => `${LEGACY_ROOT}files/${fileId}`,
  blob: (blobId: string) => `${LEGACY_ROOT}blobs/${blobId}`,
};

export const legacyPostUri = (author: string, postId: string) => `pubky://${author}${legacyPath.post(postId)}`;
export const legacyUserUri = (author: string) => `pubky://${author}${legacyPath.profile}`;
export const legacyFileUriOf = (author: string, fileId: string) => `pubky://${author}${legacyPath.file(fileId)}`;
export const legacyBlobUri = (author: string, blobId: string) => `pubky://${author}${legacyPath.blob(blobId)}`;

/** A timestamp id of `minute` minutes after the fixtures' clock origin, as the older writer made post ids. */
export const legacyId = (minute: number): string => at(minute, () => buildPost(ALICE, { content: 'id' }).id);

export const legacyProfile = (name: string, extra: Record<string, unknown> = {}) =>
  encodeJson({ name, bio: null, image: null, links: null, status: null, ...extra });

export const legacyFollow = () => encodeJson({ created_at: 1 });

export interface LegacyPostInput {
  content?: string;
  kind?: string;
  parent?: string;
  embed?: string;
  attachments?: string[];
}

export const legacyPost = ({ content = '', kind = 'short', parent, embed, attachments }: LegacyPostInput = {}) =>
  encodeJson({
    content,
    kind,
    parent: parent ?? null,
    embed: embed === undefined ? null : { kind: 'short', uri: embed },
    attachments: attachments ?? null,
  });

export const legacyTag = (uri: string, label: string) => encodeJson({ uri, label, created_at: 1 });

export const legacyFileRecord = (src: string, extra: Record<string, unknown> = {}) =>
  encodeJson({ name: 'cat.png', created_at: 1_790_000_000_000_000, src, content_type: 'image/png', size: 3, ...extra });

import { buildUri, decodeObject, hashMedia, listPrefix } from 'pubky-social-specs';
import type { FilesListParams, TMediaFile } from '@/application/file/file.types';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import type { TGetFileUrlParams, TGetMetadataParams, TUploadFileParams } from '@/controllers/file/file.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  getImageUploadSizeLimitKind,
  IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY,
} from '@/libs/image/imageUploadSizeLimit';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri, isV1MediaUri, parseCompositeId } from '@/models/models.utils';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { pickListedPostIds } from '@/pipes/post/post.head';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { NexusFileService } from '@/services/nexus/file/file';
import { filesApi } from '@/services/nexus/file/file.api';
import type { NexusFileDetails, NexusFileUrls } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';

/**
 * File Application
 *
 * Orchestrates media uploads and reads. Media is content addressed (`files/{hash}.{ext}`, the id
 * being the BLAKE3 hash of the bytes): two uploads of the same bytes name one file, so no
 * per-upload id has to be minted or guarded, and a re-PUT is idempotent.
 */
export class FileApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Cleans the picked file (image metadata stripped), hashes it a chunk at a time so a large file
   * does not freeze the page, and names where it goes. No IO beyond reading the file.
   */
  static async toFileAttachment({ file, pubky }: TUploadFileParams): Promise<TFileAttachmentResult> {
    let sanitizedFile: File;
    try {
      sanitizedFile = await stripImageMetadata(file);
    } catch (error) {
      // Tag size-limit failures so UI can show the kind-specific toast (GIF/animated
      // WebP/SVG cannot be compressed under the homeserver cap).
      const sizeLimitKind = getImageUploadSizeLimitKind(error);
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: error,
        context: sizeLimitKind ? { [IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY]: sizeLimitKind } : undefined,
      });
    }
    let blobData: Uint8Array;
    let mediaId: string;
    try {
      [blobData, mediaId] = await Promise.all([
        sanitizedFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        hashMedia(sanitizedFile),
      ]);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to read file content', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: error,
      });
    }
    return FileNormalizer.toFileAttachment({ file: sanitizedFile, mediaId, blobData, pubky });
  }

  /**
   * Uploads media to the homeserver and persists its metadata locally. v1 media is one
   * content-addressed file: there is no metadata record to write. A file the homeserver already
   * holds (the same bytes referenced by another post) is marked `preexisting` before the PUT, so
   * a rollback of this upload leaves it in place.
   */
  static async commitCreate({ fileAttachments }: FilesListParams) {
    // allSettled, not all: on a partial failure the callers roll back the whole
    // batch (`commitDeleteUploaded`) — rejecting early would start that sweep
    // while sibling uploads are still in flight, letting a late PUT recreate a
    // file the sweep already deleted, or finish after it and orphan.
    // Waiting for every upload to settle before throwing keeps rollback safe.
    const results = await Promise.allSettled(
      fileAttachments.map(async (fileAttachment) => {
        fileAttachment.preexisting = await HomeserverService.exists(fileAttachment.media.url);
        await HomeserverService.putBlob({ url: fileAttachment.media.url, blob: fileAttachment.bytes });
        await LocalFileService.create(fileAttachment);
      }),
    );

    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (firstFailure) {
      throw firstFailure.reason;
    }
  }

  /**
   * Deletes media a deleted post gave up (or a discarded composer session uploaded), but only a
   * file nothing else of its owner references. Media is content addressed: identical bytes name
   * one file, so an avatar, several posts and a collection cover can share it (the migrator
   * dedupes blobs, and two identical uploads collapse to one URI). A file goes only when every
   * check says it is unreferenced:
   *
   * 1. the local cache: another cached post's attachments or content (an article's or a
   *    collection's `cover_image`), or the owner's cached profile image;
   * 2. the owner's published `profile.json`, read fresh: its `image`;
   * 3. every public post of the owner, as a fresh Nexus view (`by_ids`) of the posts a LIST of
   *    the owner's `posts/` directory names: their attachments and content.
   *
   * A check that fails, or a Nexus view that misses a listed post (indexing lag, an author Nexus
   * has not indexed), keeps the file and logs a warning: an orphan is the safe failure, a deleted
   * shared file breaks every object that still points at it. Private trees are not checked: this
   * app writes no private object that references public media. A 0.x file URI (`files/{tsid}`, a File object
   * naming a blob) is left alone: its blob is named by the object this client no longer reads,
   * and the 0.x tree's sunset is a separate task. Every homeserver delete is idempotent (404 =
   * already gone = success).
   *
   * Edits never call this: an earlier version of the post still references what an edit removed.
   *
   * @param fileUris - The media URIs to delete
   * @param excludePostId - The post giving them up, whose own references do not count
   */
  static async commitDelete(fileUris: string[], excludePostId?: string) {
    const locallyUnreferenced = await this.filterLocallyUnreferenced(fileUris, excludePostId);
    if (locallyUnreferenced.length === 0) return;

    const byOwner = new Map<Pubky, TMediaFile[]>();
    for (const file of locallyUnreferenced) {
      const { pubky: owner } = parseCompositeId(file.fileId);
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), file]);
    }
    const unreferenced = await Promise.all(
      [...byOwner].map(([owner, files]) => this.filterRemotelyUnreferenced(owner, files, excludePostId)),
    );
    await this.deleteMedia(unreferenced.flat());
  }

  /**
   * Deletes freshly uploaded media during a rollback: the files this batch put on the homeserver,
   * never one it found there already (`preexisting`), which another post may reference. Identical
   * bytes within the batch share one URI. Only the local reference check applies: a file that was
   * not on the homeserver before this upload can have no other referencer there.
   */
  static async commitDeleteUploaded(fileAttachments: TFileAttachmentResult[]) {
    await this.deleteMedia(
      await this.filterLocallyUnreferenced(
        fileAttachments.filter((attachment) => !attachment.preexisting).map((attachment) => attachment.media.url),
      ),
    );
  }

  /** The v1 media files among `fileUris`, once each, that no cached object other than `excludePostId` references. */
  private static async filterLocallyUnreferenced(fileUris: string[], excludePostId?: string): Promise<TMediaFile[]> {
    const candidates = [...new Set(fileUris)].flatMap((uri) => {
      const fileId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
      return fileId && isV1MediaUri(uri) ? [{ uri, fileId }] : [];
    });
    const referenced = await Promise.all(
      candidates.map(({ uri }) => LocalFileService.isReferencedElsewhere({ uri, excludePostId })),
    );
    return candidates.filter(({ uri }, index) => {
      if (referenced[index]) Logger.debug('[FileApplication] Skipping deletion of shared media', { fileUri: uri });
      return !referenced[index];
    });
  }

  /**
   * The files among `files` (all `owner`'s) that neither the owner's published profile nor any of
   * the owner's public posts references, read fresh from the homeserver and Nexus. Empty when a
   * check fails or Nexus has not indexed every listed post: the files stay, with a warning.
   */
  private static async filterRemotelyUnreferenced(
    owner: Pubky,
    files: TMediaFile[],
    excludePostId?: string,
  ): Promise<TMediaFile[]> {
    const fileUris = files.map(({ uri }) => uri);
    try {
      const profileUrl = buildUri(owner, 'user');
      const profile = decodeObject(profileUrl, await HomeserverService.getFreshBytes(profileUrl), 'user');
      let remaining = files.filter(({ uri }) => uri !== profile.image);
      if (remaining.length === 0) return [];

      const listing = await HomeserverService.listAll({ baseDirectory: `${listPrefix(owner, 'public')}posts/` });
      const postIds = pickListedPostIds(listing)
        .map((id) => buildCompositeId({ pubky: owner, id }))
        .filter((postId) => postId !== excludePostId);
      // One batch at a time: `by_ids` is rate limited, and a reference found early ends the scan.
      for (let start = 0; start < postIds.length && remaining.length > 0; start += NEXUS_STREAM_MAX_LIMIT) {
        const batch = postIds.slice(start, start + NEXUS_STREAM_MAX_LIMIT);
        const posts = await NexusPostStreamService.fetchByIds({
          post_ids: batch,
          include_attachment_metadata: false,
          force: true,
        });
        const served = new Set(posts.map(({ details }) => buildCompositeId({ pubky: details.author, id: details.id })));
        const unindexed = batch.filter((postId) => !served.has(postId));
        if (unindexed.length > 0) {
          Logger.warn('[FileApplication] Kept media: Nexus has not indexed every post of the owner', {
            owner,
            fileUris,
            unindexed,
          });
          return [];
        }
        remaining = remaining.filter(
          ({ uri }) =>
            !posts.some(({ details }) => details.attachments?.includes(uri) || details.content.includes(uri)),
        );
      }
      return remaining;
    } catch (error) {
      Logger.warn('[FileApplication] Kept media whose references could not be checked', { owner, fileUris, error });
      return [];
    }
  }

  /** Deletes each media file on the homeserver, then its local row. */
  private static async deleteMedia(files: TMediaFile[]) {
    await Promise.all(
      files.map(async ({ uri, fileId }) => {
        await HomeserverService.deleteIdempotent(uri);
        await LocalFileService.deleteById(fileId);
      }),
    );
  }

  /**
   * Gets the metadata for a list of file attachments.
   * @param fileAttachments - The file attachments to get the metadata for
   * @returns The metadata for the file attachments
   */
  static async getMetadata({ fileAttachments }: TGetMetadataParams) {
    const compositeFileIds = fileAttachments.flatMap((uri) => {
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
      return compositeId ? [compositeId] : [];
    });
    const files = await LocalFileService.findByIds(compositeFileIds);
    return files;
  }

  /**
   * Gets the avatar URL for a user.
   * @param pubky - The user's public key
   * @param version - Optional version string/number for cache busting
   * @returns The avatar URL
   */
  static getAvatarUrl(pubky: Pubky, version?: string | number): string {
    return filesApi.getAvatarUrl(pubky, version);
  }

  /**
   * Gets the CDN URL for a file: `files/{owner}/{id}/{variant}`, the id being the v1 media hash
   * (or a 0.x file id) the composite id carries.
   * @param fileId - The composite file id, `owner:id`
   * @param variant - The variant of the file
   * @returns The file URL
   */
  static getFileUrl({ fileId, variant }: TGetFileUrlParams): string {
    const { pubky, id } = parseCompositeId(fileId);
    return filesApi.getFileUrl({ pubky, file_id: id, variant });
  }

  /**
   * Transforms and persists file metadata to the local database.
   * Builds composite IDs from URIs, parses URL fields, and saves them locally.
   *
   * @param fileAttachments - Array of file metadata objects already available (no HTTP fetch needed)
   */
  static async persistFiles(fileAttachments: NexusFileDetails[]) {
    if (fileAttachments.length === 0) {
      return;
    }

    const filesWithCompositeIds = fileAttachments.flatMap((file) => {
      const compositeId = buildCompositeIdFromPubkyUri({
        uri: file?.uri,
        domain: CompositeIdDomain.FILES,
      });
      // A malformed remote record must not prevent valid peers from refreshing.
      if (!compositeId) {
        Logger.warn('Ignoring file metadata with an invalid URI');
        return [];
      }
      let urls: NexusFileUrls;
      try {
        urls = typeof file.urls === 'string' ? (JSON.parse(file.urls) as NexusFileUrls) : file.urls;
      } catch {
        Logger.warn('Ignoring file metadata with malformed URL JSON', { fileId: compositeId });
        return [];
      }
      return [
        {
          ...file,
          urls,
          id: compositeId,
        },
      ];
    });

    if (filesWithCompositeIds.length) await LocalFileService.createMany({ files: filesWithCompositeIds });
  }

  /**
   * Fetches file metadata from nexus by URIs and persists them locally.
   * Used by bootstrap where file metadata is not available inline.
   *
   * @param fileUris - Array of file URIs to fetch and persist
   */
  static async fetchFiles(fileUris: string[]) {
    if (fileUris.length === 0) {
      return;
    }

    const nexusFiles = await NexusFileService.fetchFiles(fileUris);
    await this.persistFiles(nexusFiles);
  }
}

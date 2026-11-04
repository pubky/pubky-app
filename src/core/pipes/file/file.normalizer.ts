import { buildFile, limits, validMimeTypes } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, mediaFilenameFromUri, parseCompositeId } from '@/models/models.utils';
import type { TFileAttachmentResult, TFileAttachmentWithDataParams } from '@/pipes/file/file.types';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';

/** Any valid owner and media id: the table below reads only the extension `buildFile` picks for a type. */
const TABLE_OWNER = '8kkppkmiubfq4pxn6f73nqrhhhgkb5xyfprntc9si3np9ydbotto';
const TABLE_MEDIA_ID = '7BKXG1FPF2D680NCPW5D82BAGM';

const extensionOf = (filename: string): string => filename.slice(filename.lastIndexOf('.') + 1);

/**
 * Media extension → declared type: the reverse of the data model's table, which the package only
 * exposes through `buildFile`. Types sharing an extension give the first one listed
 * (`application/xml` for `.xml`, `application/octet-stream` for `.bin`), hence the reverse walk.
 */
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  [...validMimeTypes]
    .reverse()
    .map((type) => [extensionOf(buildFile(TABLE_OWNER, { id: TABLE_MEDIA_ID, type }).path), type]),
);

export class FileNormalizer {
  private constructor() {}

  /**
   * What the URI alone says about v1 media, as a file row: the type from the extension and the
   * filename as its name. Nexus keeps no metadata for v1 files, so the size and dimensions stay
   * unknown (the renderer probes the dimensions) and no timestamps exist; nothing reads a row's
   * `urls` (`FileController.getFileUrl` builds them). Null for anything but v1 public media.
   */
  static toV1FileDetails(uri: string): NexusFileDetails | null {
    const filename = mediaFilenameFromUri(uri);
    const id = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
    if (!filename || !id) return null;
    return {
      id,
      name: filename,
      src: uri,
      uri,
      content_type: TYPE_BY_EXTENSION.get(extensionOf(filename)) ?? 'application/octet-stream',
      size: 0,
      created_at: 0,
      indexed_at: 0,
      metadata: {},
      owner_id: parseCompositeId(id).pubky,
      urls: { main: '', feed: '', small: '' },
    };
  }

  /**
   * Where the media goes: `files/{hash}.{ext}` under the author's public tree, the hash being the
   * id `hashMedia` computed from the bytes and the extension picked by the declared type. The
   * bytes themselves are the body to PUT; nothing else is stored for a file.
   */
  static toFileAttachment({ file, mediaId, blobData, pubky }: TFileAttachmentWithDataParams): TFileAttachmentResult {
    // With an id the builder never sees the bytes, so the size cap is checked here.
    if (blobData.length === 0 || blobData.length > limits.maxFileSizeBytes) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'File is empty or over the size limit', {
        service: ErrorService.SocialSpecs,
        operation: 'toFileAttachment',
        context: { size: blobData.length, limit: limits.maxFileSizeBytes, pubky },
      });
    }
    try {
      const media = buildFile(pubky, { id: mediaId, type: file.type });
      return { media, bytes: blobData, name: file.name, contentType: file.type };
    } catch (error) {
      throw toSpecsValidationError(error, 'buildFile', { name: file.name, type: file.type, pubky });
    }
  }
}

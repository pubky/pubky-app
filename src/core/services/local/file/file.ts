import { FileDetailsModel } from '@/models/file/fileDetails';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { TPersistFilesParams } from '@/services/local/file/file.types';
import { buildUrls } from '@/services/local/file/file.utils';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';

export class LocalFileService {
  private constructor() {} // Prevent instantiation

  static async createMany({ files }: TPersistFilesParams) {
    await FileDetailsModel.bulkSave(files);
  }

  static async read(compositeFileId: string): Promise<NexusFileDetails | null> {
    return await FileDetailsModel.findById(compositeFileId);
  }

  static async findByIds(compositeFileIds: string[]): Promise<NexusFileDetails[]> {
    return await FileDetailsModel.findByIds(compositeFileIds);
  }

  static async deleteById(compositeFileId: string) {
    await FileDetailsModel.deleteById(compositeFileId);
  }

  /**
   * Whether a cached post other than `excludePostId` still references the media `uri`, as an
   * attachment or a collection cover. Local-only knowledge: posts never cached on this device are
   * not seen (the complete fix is homeserver-side ref-counting, tracked as a follow-up).
   */
  static async isReferencedElsewhere({
    uri,
    excludePostId,
  }: {
    uri: string;
    excludePostId?: string;
  }): Promise<boolean> {
    const other = await PostDetailsModel.table
      .filter((post) => post.id !== excludePostId && (post.attachments?.includes(uri) || post.content.includes(uri)))
      .first();
    return other !== undefined;
  }

  /**
   * Creates the media record in the local database right away instead of waiting for Nexus,
   * hardcoding the urls. v1 media has no metadata object: the name and type come from the upload.
   */
  static async create({ media, bytes, name, contentType }: TFileAttachmentResult) {
    const uri = media.url;
    const fileCompositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

    if (fileCompositeId) {
      const now = Date.now();
      const file: NexusFileDetails = {
        id: fileCompositeId,
        name,
        src: uri,
        uri,
        content_type: contentType,
        size: bytes.length,
        created_at: now,
        indexed_at: now,
        metadata: {},
        owner_id: fileCompositeId.split(':')[0],
        urls: buildUrls(fileCompositeId),
      };
      await FileDetailsModel.create(file);
    }
  }
}

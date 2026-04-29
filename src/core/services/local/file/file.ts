import { FileDetailsModel } from '@/models/file/fileDetails';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
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
   * Creates a new file record in the local database.
   * Instead of wait nexus to index the file, we create the file record immediately hardcoding the urls.
   * NOTE: In the future, if we store the files in another server, the urls might be different,
   * and we might need to query nexus before persisting the file record.
   *
   * @param blobResult - Blob result
   * @param fileResult - File result
   */
  static async create({ blobResult, fileResult }: TFileAttachmentResult) {
    const uri = fileResult.meta.url;
    const fileCompositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

    if (fileCompositeId) {
      const file: NexusFileDetails = {
        id: fileCompositeId,
        name: fileResult.file.name,
        src: blobResult.meta.url,
        uri: fileResult.meta.url,
        content_type: fileResult.file.content_type,
        size: fileResult.file.size,
        created_at: Number(fileResult.file.created_at),
        indexed_at: Number(fileResult.file.created_at),
        metadata: {},
        owner_id: fileCompositeId.split(':')[0],
        urls: buildUrls(fileCompositeId),
      };
      await FileDetailsModel.create(file);
    }
  }
}

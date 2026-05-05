import { Logger } from '@/libs/logger/logger';
import { HotTagsModel } from '@/models/hot/hot';
import type { NexusHotTag } from '@/services/nexus/nexus.types';

/**
 * Local Hot Service
 *
 * Manages hot tags storage in IndexedDB.
 * Stores arrays of NexusHotTag objects with composite ID (timeframe:reach).
 */
export class LocalHotService {
  private constructor() {}

  /**
   * Save or update hot tags
   * @param id - Composite ID: 'timeframe:reach' (e.g., 'today:all', 'month:friends')
   * @param tags - Array of hot tags to store
   */
  static async upsert(id: string, tags: NexusHotTag[]): Promise<void> {
    await HotTagsModel.upsert({ id, tags });
  }

  /**
   * Retrieve hot tags from cache
   * @param id - Composite ID
   * @returns HotTagsModel containing cached hot tags or null if not found
   */
  static async findById(id: string): Promise<HotTagsModel | null> {
    return await HotTagsModel.findById(id);
  }

  /**
   * Delete hot tags from cache
   * @param id - Composite ID to delete
   */
  static async deleteById(id: string): Promise<void> {
    await HotTagsModel.deleteById(id);
  }

  /**
   * Clear all cached hot tags
   */
  static async clear(): Promise<void> {
    await HotTagsModel.clear();
    Logger.info('Cleared all hot tags from cache');
  }
}

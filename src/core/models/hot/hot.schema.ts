import type { NexusHotTag } from '@/services/nexus/nexus.types';
/**
 * Hot Tags Model Schema
 * Stores cached hot/trending tags with composite ID based on timeframe and reach
 */
export interface HotTagsModelSchema {
  /** Composite ID: 'timeframe:reach' (e.g., 'today:all', 'this_month:friends') */
  id: string;
  /** Array of hot tags */
  tags: NexusHotTag[];
}

// Schema for Dexie table
export const hotTagsTableSchema = '&id';

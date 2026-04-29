import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultPostStream } from './postStream.helper';
import { PostStreamModel } from './tables/postStream';
import { PostStreamTypes, PostStreamId } from './postStream.types';
import { db } from '@/database/franky/franky';
describe('PostStreamModel', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  describe('constructor', () => {
    it('should create a post stream with all properties', () => {
      const streamData = createDefaultPostStream(PostStreamTypes.TIMELINE_ALL_ALL, ['post1', 'post2']);
      const streamModel = new PostStreamModel(streamData);

      expect(streamModel.id).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
      expect(streamModel.stream).toEqual(['post1', 'post2']);
    });
  });

  describe('database operations', () => {
    it('should return null when stream not found', async () => {
      const foundStream = await PostStreamModel.findById('non-existent' as PostStreamId);

      expect(foundStream).toBeNull();
    });
  });
});

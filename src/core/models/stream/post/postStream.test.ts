import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import { createDefaultPostStream } from './postStream.helper';
import { PostStreamId, PostStreamTypes } from './postStream.types';
import { PostStreamModel } from './tables/postStream';

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

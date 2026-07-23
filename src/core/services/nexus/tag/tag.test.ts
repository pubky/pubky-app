import { describe, expect, it } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import { UserStreamReach } from '@/services/nexus/nexus.types';
import { tagApi } from './tag.api';
import { TTagHotParams, TTagTaggersParams, TTagViewParams } from './tag.types';

const testTaggerId = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const testTagId = 'test_tag';

describe('Tag API', () => {
  describe('tagApi.view', () => {
    it('should generate correct URL for tag view', () => {
      const params: TTagViewParams = {
        taggerId: testTaggerId,
        tagId: testTagId,
      };

      const result = tagApi.view(params);
      expect(result).toBe(`${getNexusUrl()}/v0/tags/${testTaggerId}/${testTagId}`);
    });

    it('should handle different parameters', () => {
      const params: TTagViewParams = {
        taggerId: testTaggerId,
        tagId: 'differentTag',
      };

      const result = tagApi.view(params);
      expect(result).toBe(`${getNexusUrl()}/v0/tags/${testTaggerId}/differentTag`);
    });
  });

  describe('tagApi.hot', () => {
    it('should generate correct URL', () => {
      const params: TTagHotParams = {
        user_id: 'test_user',
        reach: UserStreamReach.FOLLOWERS,
        limit: 20,
      };
      const result = tagApi.hot(params);
      expect(result).toBe(`${getNexusUrl()}/v0/tags/hot?user_id=test_user&reach=followers&limit=20`);
    });
  });

  describe('tagApi.taggers', () => {
    it('should generate correct URL', () => {
      const params: TTagTaggersParams = {
        label: 'test_label',
        reach: UserStreamReach.FRIENDS,
        limit: 30,
      };
      const result = tagApi.taggers(params);
      expect(result).toBe(`${getNexusUrl()}/v0/tags/taggers/test_label?reach=friends&limit=30`);
    });
  });

  describe('Path segment encoding for special characters', () => {
    describe('tagApi.view', () => {
      it('should encode spaces in tagId', () => {
        const result = tagApi.view({ taggerId: testTaggerId, tagId: 'my tag' });
        expect(result).toContain('/tags/' + testTaggerId + '/my%20tag');
        expect(result).not.toContain('my tag');
      });

      it('should encode hash (#) in tagId', () => {
        const result = tagApi.view({ taggerId: testTaggerId, tagId: 'tag#123' });
        expect(result).toContain('/tags/' + testTaggerId + '/tag%23123');
      });

      it('should encode forward slash (/) in tagId', () => {
        const result = tagApi.view({ taggerId: testTaggerId, tagId: 'tag/subtag' });
        expect(result).toContain('/tags/' + testTaggerId + '/tag%2Fsubtag');
        expect(result).not.toContain('/tag/subtag');
      });

      it('should encode special characters in taggerId', () => {
        const result = tagApi.view({ taggerId: 'tagger/id#123', tagId: testTagId });
        expect(result).toContain('/tags/tagger%2Fid%23123/');
      });
    });

    describe('tagApi.taggers', () => {
      it('should encode spaces in label', () => {
        const result = tagApi.taggers({ label: 'my label', limit: 10 });
        expect(result).toContain('/taggers/my%20label?');
        expect(result).not.toContain('/taggers/my label');
      });

      it('should encode hash (#) in label', () => {
        const result = tagApi.taggers({ label: 'label#123', limit: 10 });
        expect(result).toContain('/taggers/label%23123?');
      });

      it('should encode forward slash (/) in label', () => {
        const result = tagApi.taggers({ label: 'label/sublabel', limit: 10 });
        expect(result).toContain('/taggers/label%2Fsublabel?');
      });

      it('should encode percent (%) in label', () => {
        const result = tagApi.taggers({ label: '100%', limit: 10 });
        expect(result).toContain('/taggers/100%25?');
      });
    });
  });

  describe('TagApiEndpoint type', () => {
    it('should have exactly 3 endpoints', () => {
      const endpointKeys = Object.keys(tagApi);
      expect(endpointKeys).toHaveLength(3);
      expect(endpointKeys).toContain('view');
      expect(endpointKeys).toContain('hot');
      expect(endpointKeys).toContain('taggers');
    });
  });
});

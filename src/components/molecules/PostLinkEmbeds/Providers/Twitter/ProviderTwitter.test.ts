import { describe, expect, it } from 'vitest';
import { Twitter } from './ProviderTwitter';

describe('ProviderTwitter', () => {
  describe('domains', () => {
    it('exposes list of supported Twitter/X domains', () => {
      expect(Twitter.domains).toBeDefined();
      expect(Twitter.domains.length).toBeGreaterThan(0);
      expect(Twitter.domains).toContain('twitter.com');
      expect(Twitter.domains).toContain('www.twitter.com');
      expect(Twitter.domains).toContain('x.com');
      expect(Twitter.domains).toContain('www.x.com');
      expect(Twitter.domains).toContain('mobile.twitter.com');
      expect(Twitter.domains).toContain('mobile.x.com');
    });

    it('has all domains in lowercase', () => {
      Twitter.domains.forEach((domain) => {
        expect(domain).toBe(domain.toLowerCase());
      });
    });
  });

  describe('parseEmbed', () => {
    describe('valid Twitter URLs', () => {
      it('parses standard twitter.com status URL', () => {
        const result = Twitter.parseEmbed('https://twitter.com/jack/status/20');
        expect(result).toEqual({
          type: 'id',
          value: '20',
        });
      });

      it('parses standard x.com status URL', () => {
        const result = Twitter.parseEmbed('https://x.com/elonmusk/status/1234567890123456789');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890123456789',
        });
      });

      it('parses www.twitter.com URL', () => {
        const result = Twitter.parseEmbed('https://www.twitter.com/user/status/9876543210');
        expect(result).toEqual({
          type: 'id',
          value: '9876543210',
        });
      });

      it('parses www.x.com URL', () => {
        const result = Twitter.parseEmbed('https://www.x.com/user/status/9876543210');
        expect(result).toEqual({
          type: 'id',
          value: '9876543210',
        });
      });

      it('parses mobile.twitter.com URL', () => {
        const result = Twitter.parseEmbed('https://mobile.twitter.com/twitter/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses mobile.x.com URL', () => {
        const result = Twitter.parseEmbed('https://mobile.x.com/user/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URL with query parameters', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890?s=20&t=abc123');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URL with hash fragment', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890#reply');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URL with trailing slash', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890/');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URL with whitespace at end', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890 ');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });
    });

    describe('invalid URLs', () => {
      it('returns null for tweet ID with non-numeric characters', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/123abc456');
        expect(result).toBeNull();
      });

      it('returns null for tweet ID with letters', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/abcdefghij');
        expect(result).toBeNull();
      });

      it('returns null for URL without status segment', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/1234567890');
        expect(result).toBeNull();
      });

      it('returns null for URL without tweet ID', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/');
        expect(result).toBeNull();
      });

      it('returns null for profile URL', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user');
        expect(result).toBeNull();
      });

      it('returns null for non-Twitter URL', () => {
        const result = Twitter.parseEmbed('https://facebook.com/user/posts/123456');
        expect(result).toBeNull();
      });

      it('returns null for tweet ID with special characters', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/123-456-789');
        expect(result).toBeNull();
      });

      it('returns null for tweet ID with underscore', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/123_456_789');
        expect(result).toBeNull();
      });
    });

    describe('malformed URLs', () => {
      it('handles malformed URLs gracefully without crashing', () => {
        const malformedUrls = [
          'not-a-url-at-all',
          'ht!tp://invalid',
          'javascript:alert(1)',
          'data:text/html,<script>alert(1)</script>',
          '://missing-protocol',
          'https://',
          'https://twitter.com/user/status/',
          'twitter.com/user/status/<script>alert(1)</script>',
        ];

        malformedUrls.forEach((url) => {
          expect(() => Twitter.parseEmbed(url)).not.toThrow();
          const result = Twitter.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('handles URLs with invalid status paths', () => {
        const invalidPaths = [
          'https://twitter.com/status/1234567890',
          'https://twitter.com//status/1234567890',
          'https://twitter.com/user//status/1234567890',
          'https://twitter.com/user/statuses/1234567890',
        ];

        invalidPaths.forEach((url) => {
          expect(() => Twitter.parseEmbed(url)).not.toThrow();
        });
      });
    });

    describe('security: XSS attempts', () => {
      it('rejects tweet IDs containing script tags', () => {
        const xssAttempts = [
          'https://twitter.com/user/status/<script>alert(1)</script>',
          'https://x.com/user/status/<script>',
          'https://twitter.com/user/status/"><script>alert(1)</script>',
        ];

        xssAttempts.forEach((url) => {
          const result = Twitter.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('rejects tweet IDs containing HTML entities', () => {
        const htmlEntityAttempts = [
          'https://twitter.com/user/status/&lt;script&gt;',
          'https://twitter.com/user/status/&quot;&gt;&lt;',
        ];

        htmlEntityAttempts.forEach((url) => {
          const result = Twitter.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('only accepts numeric characters in tweet IDs', () => {
        const validId = '1234567890123456789';
        expect(Twitter.parseEmbed(`https://twitter.com/user/status/${validId}`)).not.toBeNull();

        // Characters that are valid boundaries will allow the numeric prefix to be extracted
        const validBoundaries = [
          { url: 'https://twitter.com/user/status/1234567890?param=value', expected: '1234567890' },
          { url: 'https://twitter.com/user/status/1234567890&other=test', expected: '1234567890' },
          { url: 'https://twitter.com/user/status/1234567890#anchor', expected: '1234567890' },
          { url: 'https://twitter.com/user/status/1234567890/photo/1', expected: '1234567890' },
          { url: 'https://twitter.com/user/status/1234567890 ', expected: '1234567890' },
        ];

        validBoundaries.forEach(({ url, expected }) => {
          const result = Twitter.parseEmbed(url);
          expect(result).toEqual({ type: 'id', value: expected });
        });

        // Characters that are NOT valid boundaries will cause the match to fail
        const invalidBoundaries = [
          'https://twitter.com/user/status/1234567890abc',
          'https://twitter.com/user/status/1234567890<script>',
          'https://twitter.com/user/status/1234567890-test',
          'https://twitter.com/user/status/1234567890_test',
        ];

        invalidBoundaries.forEach((url) => {
          const result = Twitter.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('rejects malicious content after valid numeric IDs', () => {
        // These have invalid boundary characters, so the entire match fails
        const maliciousAttempts = [
          'https://twitter.com/user/status/123<script>alert(1)</script>',
          'https://twitter.com/user/status/123javascript:void(0)',
          'https://twitter.com/user/status/123onload=alert(1)',
        ];

        maliciousAttempts.forEach((url) => {
          const result = Twitter.parseEmbed(url);
          expect(result).toBeNull();
        });
      });
    });

    describe('edge cases', () => {
      it('handles very long tweet IDs (19 digits - Twitter Snowflake max)', () => {
        const longId = '1234567890123456789';
        const result = Twitter.parseEmbed(`https://twitter.com/user/status/${longId}`);
        expect(result).toEqual({
          type: 'id',
          value: longId,
        });
      });

      it('handles very short tweet IDs (single digit)', () => {
        const shortId = '1';
        const result = Twitter.parseEmbed(`https://twitter.com/user/status/${shortId}`);
        expect(result).toEqual({
          type: 'id',
          value: shortId,
        });
      });

      it('handles usernames with special characters', () => {
        // Username can have underscores, but ID must still be numeric
        const result = Twitter.parseEmbed('https://twitter.com/user_name_123/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('handles URLs with both query params and fragments', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890?s=20&t=abc#reply');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('handles URLs with photo/video suffixes', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890/photo/1');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('handles URLs with video suffixes', () => {
        const result = Twitter.parseEmbed('https://twitter.com/user/status/1234567890/video/1');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });
    });

    describe('concurrent/rapid changes', () => {
      it('handles multiple rapid parseEmbed calls consistently', () => {
        const url = 'https://twitter.com/user/status/1234567890';
        const results = Array.from({ length: 100 }, () => Twitter.parseEmbed(url));

        // All results should be identical
        results.forEach((result) => {
          expect(result).toEqual({
            type: 'id',
            value: '1234567890',
          });
        });
      });

      it('handles alternating valid/invalid URLs consistently', () => {
        const validUrl = 'https://twitter.com/user/status/1234567890';
        const invalidUrl = 'https://twitter.com/user/status/invalid';

        for (let i = 0; i < 50; i++) {
          const validResult = Twitter.parseEmbed(validUrl);
          const invalidResult = Twitter.parseEmbed(invalidUrl);

          expect(validResult).toEqual({
            type: 'id',
            value: '1234567890',
          });
          expect(invalidResult).toBeNull();
        }
      });

      it('parseEmbed is stateless and returns consistent results', () => {
        const url1 = 'https://twitter.com/user1/status/1234567890';
        const url2 = 'https://x.com/user2/status/9876543210';

        const result1a = Twitter.parseEmbed(url1);
        const result2 = Twitter.parseEmbed(url2);
        const result1b = Twitter.parseEmbed(url1);

        // Results should not be affected by previous calls
        expect(result1a).toEqual(result1b);
        expect(result1a).toEqual({
          type: 'id',
          value: '1234567890',
        });
        expect(result2).toEqual({
          type: 'id',
          value: '9876543210',
        });
      });

      it('handles mixed twitter.com and x.com URLs consistently', () => {
        const twitterUrl = 'https://twitter.com/user/status/1111111111';
        const xUrl = 'https://x.com/user/status/2222222222';

        for (let i = 0; i < 25; i++) {
          const twitterResult = Twitter.parseEmbed(twitterUrl);
          const xResult = Twitter.parseEmbed(xUrl);

          expect(twitterResult).toEqual({ type: 'id', value: '1111111111' });
          expect(xResult).toEqual({ type: 'id', value: '2222222222' });
        }
      });
    });

    describe('URL protocol variations', () => {
      it('parses http URLs', () => {
        const result = Twitter.parseEmbed('http://twitter.com/user/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URLs without protocol', () => {
        const result = Twitter.parseEmbed('twitter.com/user/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });

      it('parses URLs with www prefix without protocol', () => {
        const result = Twitter.parseEmbed('www.twitter.com/user/status/1234567890');
        expect(result).toEqual({
          type: 'id',
          value: '1234567890',
        });
      });
    });
  });
});

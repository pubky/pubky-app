import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VIDEO_EMBED_PROPS } from '../Provider.constants';
import { Vimeo } from './ProviderVimeo';

describe('ProviderVimeo', () => {
  describe('domains', () => {
    it('exposes list of supported Vimeo domains', () => {
      expect(Vimeo.domains).toBeDefined();
      expect(Vimeo.domains.length).toBeGreaterThan(0);
      expect(Vimeo.domains).toContain('vimeo.com');
      expect(Vimeo.domains).toContain('www.vimeo.com');
      expect(Vimeo.domains).toContain('player.vimeo.com');
    });

    it('has all domains in lowercase', () => {
      Vimeo.domains.forEach((domain) => {
        expect(domain).toBe(domain.toLowerCase());
      });
    });
  });

  describe('parseEmbed', () => {
    describe('valid Vimeo URLs', () => {
      it('parses standard vimeo.com URL', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses www.vimeo.com URL', () => {
        const result = Vimeo.parseEmbed('https://www.vimeo.com/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses player.vimeo.com URL', () => {
        const result = Vimeo.parseEmbed('https://player.vimeo.com/video/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses channels URL', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/channels/staffpicks/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses groups URL', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/groups/shortfilms/videos/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses album URL', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/album/987654/video/123456789');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
      });

      it('parses short video IDs (6 digits)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456',
        });
      });

      it('parses long video IDs (10+ digits)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/1234567890');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/1234567890',
        });
      });
    });

    describe('timestamps', () => {
      it('parses timestamp in seconds format (30s)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=30s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=30s',
        });
      });

      it('parses timestamp in h/m/s format (1h2m3s)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=1h2m3s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=3723s',
        });
      });

      it('parses timestamp in partial h/m/s format (2m30s)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=2m30s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=150s',
        });
      });

      it('parses timestamp with minutes only (5m)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=5m');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=300s',
        });
      });

      it('parses timestamp with hours only (1h)', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=1h');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=3600s',
        });
      });

      it('parses timestamp without seconds suffix (30)', () => {
        // Vimeo format allows plain numbers to be interpreted as seconds
        const result = Vimeo.parseEmbed('https://vimeo.com/123456789#t=30');
        expect(result).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789#t=30s',
        });
      });

      it('rejects malformed timestamps with duplicate suffixes', () => {
        const malformedTimestamps = [
          'https://vimeo.com/123456789#t=30ss',
          'https://vimeo.com/123456789#t=1hh',
          'https://vimeo.com/123456789#t=2mm',
          'https://vimeo.com/123456789#t=1h2m3ss',
        ];

        malformedTimestamps.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          // Should return video URL without timestamp due to malformed format
          expect(result).toEqual({
            type: 'url',
            value: 'https://player.vimeo.com/video/123456789',
          });
        });
      });

      it('accepts valid timestamps with each unit appearing once', () => {
        const validTimestamps = [
          { url: 'https://vimeo.com/123456789#t=1h', expected: 3600 },
          { url: 'https://vimeo.com/123456789#t=5m', expected: 300 },
          { url: 'https://vimeo.com/123456789#t=30s', expected: 30 },
          { url: 'https://vimeo.com/123456789#t=30', expected: 30 },
          { url: 'https://vimeo.com/123456789#t=1h30m', expected: 5400 },
          { url: 'https://vimeo.com/123456789#t=2m15s', expected: 135 },
          { url: 'https://vimeo.com/123456789#t=1h2m3s', expected: 3723 },
        ];

        validTimestamps.forEach(({ url, expected }) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toEqual({
            type: 'url',
            value: `https://player.vimeo.com/video/123456789#t=${expected}s`,
          });
        });
      });
    });

    describe('invalid URLs', () => {
      it('returns null for video ID with non-numeric characters', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/abc123def');
        expect(result).toBeNull();
      });

      it('returns null for URL without video ID', () => {
        const result = Vimeo.parseEmbed('https://vimeo.com/about');
        expect(result).toBeNull();
      });

      it('returns null for non-Vimeo URL', () => {
        const result = Vimeo.parseEmbed('https://youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toBeNull();
      });

      it('returns null for URLs with video ID followed by path segments', () => {
        // These are valid Vimeo page URLs but not embeddable video URLs
        const urlsWithExtraPaths = [
          'https://vimeo.com/123456789/comments',
          'https://vimeo.com/123456789/likes',
          'https://vimeo.com/123456789/privacy',
          'https://vimeo.com/123456789/share',
          'https://vimeo.com/123456789/settings',
        ];

        urlsWithExtraPaths.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toBeNull();
        });
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
          'https://vimeo.com/',
          'vimeo.com/<script>alert(1)</script>',
        ];

        malformedUrls.forEach((url) => {
          expect(() => Vimeo.parseEmbed(url)).not.toThrow();
          const result = Vimeo.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('handles URLs with invalid timestamp formats gracefully', () => {
        const invalidTimestamps = [
          'https://vimeo.com/123456789#t=invalid',
          'https://vimeo.com/123456789#t=',
          'https://vimeo.com/123456789#t=hms',
          'https://vimeo.com/123456789#t=-123',
          'https://vimeo.com/123456789#t=30ss', // double 's' should be rejected
          'https://vimeo.com/123456789#t=1hh2m', // double 'h' should be rejected
          'https://vimeo.com/123456789#t=5mm', // double 'm' should be rejected
        ];

        invalidTimestamps.forEach((url) => {
          expect(() => Vimeo.parseEmbed(url)).not.toThrow();
          const result = Vimeo.parseEmbed(url);
          // Should still return valid embed URL without timestamp
          expect(result).toEqual({
            type: 'url',
            value: 'https://player.vimeo.com/video/123456789',
          });
        });
      });
    });

    describe('security: XSS attempts', () => {
      it('rejects video IDs containing script tags', () => {
        const xssAttempts = [
          'https://vimeo.com/<script>alert(1)</script>',
          'https://vimeo.com/"><script>alert(1)</script>',
          'https://player.vimeo.com/video/<script>',
        ];

        xssAttempts.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('rejects video IDs containing HTML entities', () => {
        const htmlEntityAttempts = ['https://vimeo.com/&lt;script&gt;', 'https://vimeo.com/&quot;&gt;&lt;'];

        htmlEntityAttempts.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('only accepts numeric characters in video IDs', () => {
        const validId = '123456789';
        expect(Vimeo.parseEmbed(`https://vimeo.com/${validId}`)).not.toBeNull();

        // Non-numeric IDs should be rejected
        const invalidIds = ['abc123def', 'notanumber', '!@#$%', ''];
        invalidIds.forEach((id) => {
          const result = Vimeo.parseEmbed(`https://vimeo.com/${id}`);
          expect(result).toBeNull();
        });
      });
    });

    describe('concurrent/rapid changes', () => {
      it('handles multiple rapid parseEmbed calls consistently', () => {
        const url = 'https://vimeo.com/123456789';
        const results = Array.from({ length: 100 }, () => Vimeo.parseEmbed(url));

        // All results should be identical
        results.forEach((result) => {
          expect(result).toEqual({
            type: 'url',
            value: 'https://player.vimeo.com/video/123456789',
          });
        });
      });

      it('handles alternating valid/invalid URLs consistently', () => {
        const validUrl = 'https://vimeo.com/123456789';
        const invalidUrl = 'https://vimeo.com/invalid';

        for (let i = 0; i < 50; i++) {
          const validResult = Vimeo.parseEmbed(validUrl);
          const invalidResult = Vimeo.parseEmbed(invalidUrl);

          expect(validResult).toEqual({
            type: 'url',
            value: 'https://player.vimeo.com/video/123456789',
          });
          expect(invalidResult).toBeNull();
        }
      });

      it('parseEmbed is stateless and returns consistent results', () => {
        const url1 = 'https://vimeo.com/123456789';
        const url2 = 'https://vimeo.com/987654321';

        const result1a = Vimeo.parseEmbed(url1);
        const result2 = Vimeo.parseEmbed(url2);
        const result1b = Vimeo.parseEmbed(url1);

        // Results should not be affected by previous calls
        expect(result1a).toEqual(result1b);
        expect(result1a).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        });
        expect(result2).toEqual({
          type: 'url',
          value: 'https://player.vimeo.com/video/987654321',
        });
      });
    });

    describe('regex catastrophic backtracking prevention', () => {
      it('handles malicious input with many non-slash characters efficiently', () => {
        const startTime = Date.now();

        // Attempt potential ReDoS attack with excessive characters
        const maliciousUrls = [
          `https://vimeo.com/channels/${'a'.repeat(1000)}/123456`,
          `https://vimeo.com/groups/${'b'.repeat(1000)}/videos/123456`,
          `https://vimeo.com/channels/${'c-'.repeat(500)}/123456`,
          `https://vimeo.com/groups/${'d_'.repeat(500)}/videos/123456`,
        ];

        maliciousUrls.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          // Should return null due to 100-character limit on channel/group names
          expect(result).toBeNull();
        });

        const duration = Date.now() - startTime;
        // Should complete in under 100ms even with malicious input
        expect(duration).toBeLessThan(100);
      });

      it('accepts valid channel/group names within length limit', () => {
        const validUrls = [
          'https://vimeo.com/channels/staffpicks/123456',
          'https://vimeo.com/channels/shortfilms/123456',
          'https://vimeo.com/groups/documentary/videos/123456',
          'https://vimeo.com/groups/animation-101/videos/123456',
          `https://vimeo.com/channels/${'a'.repeat(100)}/123456`,
          `https://vimeo.com/groups/${'b'.repeat(100)}/videos/123456`,
        ];

        validUrls.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toEqual({
            type: 'url',
            value: 'https://player.vimeo.com/video/123456',
          });
        });
      });

      it('rejects channel/group names exceeding 100 characters', () => {
        const invalidUrls = [
          `https://vimeo.com/channels/${'a'.repeat(101)}/123456`,
          `https://vimeo.com/groups/${'b'.repeat(101)}/videos/123456`,
          `https://vimeo.com/channels/${'c'.repeat(200)}/123456`,
        ];

        invalidUrls.forEach((url) => {
          const result = Vimeo.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('handles URLs with query strings and fragments correctly', () => {
        const urlsWithBoundaries = [
          'https://vimeo.com/123456?quality=hd',
          'https://vimeo.com/123456#t=30s',
          'https://vimeo.com/123456 ',
          'https://player.vimeo.com/video/123456?autoplay=1',
          'https://vimeo.com/channels/staff/123456?embed=true',
          'https://vimeo.com/groups/docs/videos/123456#share',
        ];

        urlsWithBoundaries.forEach((url) => {
          const result = Vimeo.parseEmbed(url.trim());
          expect(result).toBeDefined();
          expect(result && 'value' in result ? result.value : '').toContain('123456');
        });
      });

      it('completes parsing within reasonable time for edge cases', () => {
        const edgeCases = [
          'https://vimeo.com/' + '1'.repeat(100),
          'https://vimeo.com/channels//' + '2'.repeat(50),
          'https://vimeo.com/groups//videos/' + '3'.repeat(50),
          'https://vimeo.com/album//' + '4'.repeat(50),
        ];

        const startTime = Date.now();

        edgeCases.forEach((url) => {
          expect(() => Vimeo.parseEmbed(url)).not.toThrow();
        });

        const duration = Date.now() - startTime;
        // Should complete quickly even with edge cases
        expect(duration).toBeLessThan(50);
      });
    });
  });

  describe('renderEmbed', () => {
    it('adds allow-popups-to-escape-sandbox to iframe sandbox', () => {
      render(
        Vimeo.renderEmbed({
          type: 'url',
          value: 'https://player.vimeo.com/video/123456789',
        }),
      );

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toHaveAttribute('sandbox', `${VIDEO_EMBED_PROPS.sandbox} allow-popups-to-escape-sandbox`);
    });
  });
});

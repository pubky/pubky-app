import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VIDEO_EMBED_PROPS } from '../Provider.constants';
import { Youtube } from './ProviderYoutube';

describe('ProviderYoutube', () => {
  describe('domains', () => {
    it('exposes list of supported YouTube domains', () => {
      expect(Youtube.domains).toBeDefined();
      expect(Youtube.domains.length).toBeGreaterThan(0);
      expect(Youtube.domains).toContain('youtube.com');
      expect(Youtube.domains).toContain('www.youtube.com');
      expect(Youtube.domains).toContain('youtu.be');
      expect(Youtube.domains).toContain('m.youtube.com');
      expect(Youtube.domains).toContain('music.youtube.com');
      expect(Youtube.domains).toContain('youtube-nocookie.com');
      expect(Youtube.domains).toContain('www.youtube-nocookie.com');
    });

    it('has all domains in lowercase', () => {
      Youtube.domains.forEach((domain) => {
        expect(domain).toBe(domain.toLowerCase());
      });
    });
  });

  describe('parseEmbed', () => {
    describe('valid YouTube URLs', () => {
      it('parses standard watch URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses youtu.be short URL', () => {
        const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses shorts URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses live stream URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/live/dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses embed URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses mobile URL', () => {
        const result = Youtube.parseEmbed('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses music subdomain URL', () => {
        const result = Youtube.parseEmbed('https://music.youtube.com/watch?v=UTD5buLHoR4');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/UTD5buLHoR4',
        });
      });

      it('parses legacy /v/ URL format', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/v/dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses URL with additional query parameters', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&list=PLxyz');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses URL with hash fragment', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ#section');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });

      it('parses URL with both timestamp and other query params', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123&feature=share');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123',
        });
      });
    });

    describe('timestamps', () => {
      it('parses timestamp in seconds format (123s)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123',
        });
      });

      it('parses timestamp in h/m/s format (1h2m3s)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3723',
        });
      });

      it('parses timestamp as plain number', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
        });
      });

      it('parses timestamp in partial h/m/s format (2m30s)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m30s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=150',
        });
      });
      it('handles timestamp with only hours (1h)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3600',
        });
      });

      it('handles timestamp with only minutes (30m)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30m');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=1800',
        });
      });

      it('handles timestamp with only seconds (45s)', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=45',
        });
      });

      it('handles zero timestamp gracefully', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });
      it('parses timestamp on youtu.be URL', () => {
        const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ?t=123');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123',
        });
      });

      it('parses timestamp on music.youtube.com URL', () => {
        const result = Youtube.parseEmbed('https://music.youtube.com/watch?v=UTD5buLHoR4&t=45');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/UTD5buLHoR4?start=45',
        });
      });

      it('parses timestamp on legacy /v/ URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/v/dQw4w9WgXcQ?t=60');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=60',
        });
      });
    });

    describe('invalid URLs', () => {
      it('returns null for video ID shorter than 11 characters', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXc');
        expect(result).toBeNull();
      });

      it('returns null for video ID longer than 11 characters', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQQ');
        expect(result).toBeNull();
      });

      it('returns null for video ID with invalid characters', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgX@!');
        expect(result).toBeNull();
      });

      it('returns null for URL without video ID', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/channel/UC123');
        expect(result).toBeNull();
      });

      it('returns null for non-YouTube URL', () => {
        const result = Youtube.parseEmbed('https://vimeo.com/123456789');
        expect(result).toBeNull();
      });

      it('returns null for YouTube playlist URL without video ID', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/playlist?list=PLxyz');
        expect(result).toBeNull();
      });

      it('returns null for YouTube channel URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/@channelname');
        expect(result).toBeNull();
      });

      it('returns null for YouTube user URL', () => {
        const result = Youtube.parseEmbed('https://www.youtube.com/user/username');
        expect(result).toBeNull();
      });
    });

    describe('malformed URLs', () => {
      it('handles malformed URLs gracefully without crashing', () => {
        // These should not crash, even if URL parser fails
        const malformedUrls = [
          'not-a-url-at-all',
          'ht!tp://invalid',
          'javascript:alert(1)',
          'data:text/html,<script>alert(1)</script>',
          '://missing-protocol',
          'https://',
          'https://youtube.com/watch?v=',
          'youtube.com/watch?v=<script>alert(1)</script>',
        ];

        malformedUrls.forEach((url) => {
          expect(() => Youtube.parseEmbed(url)).not.toThrow();
          const result = Youtube.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('handles URLs with invalid timestamp formats gracefully', () => {
        const invalidTimestamps = [
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=invalid',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=hms',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=-123',
        ];

        invalidTimestamps.forEach((url) => {
          expect(() => Youtube.parseEmbed(url)).not.toThrow();
          const result = Youtube.parseEmbed(url);
          // Should still return valid embed URL without timestamp
          expect(result).toEqual({
            type: 'url',
            value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          });
        });
      });
    });

    describe('security: XSS attempts', () => {
      it('rejects video IDs containing script tags', () => {
        const xssAttempts = [
          'https://www.youtube.com/watch?v=<script>alert(1)</script>',
          'https://youtu.be/<script>',
          'https://www.youtube.com/watch?v="><script>alert(1)</script>',
        ];

        xssAttempts.forEach((url) => {
          const result = Youtube.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('rejects video IDs containing HTML entities', () => {
        const htmlEntityAttempts = [
          'https://www.youtube.com/watch?v=&lt;script&gt;',
          'https://www.youtube.com/watch?v=&quot;&gt;&lt;',
        ];

        htmlEntityAttempts.forEach((url) => {
          const result = Youtube.parseEmbed(url);
          expect(result).toBeNull();
        });
      });

      it('only accepts alphanumeric, dash, and underscore in video IDs', () => {
        const validId = 'dQw4w9WgXcQ';
        const validWithDash = 'dQw4w9WgX-Q';
        const validWithUnderscore = 'dQw4w9WgX_Q';

        expect(Youtube.parseEmbed(`https://www.youtube.com/watch?v=${validId}`)).not.toBeNull();
        expect(Youtube.parseEmbed(`https://www.youtube.com/watch?v=${validWithDash}`)).not.toBeNull();
        expect(Youtube.parseEmbed(`https://www.youtube.com/watch?v=${validWithUnderscore}`)).not.toBeNull();

        // Invalid characters should be rejected
        const invalidChars = ['<', '>', '"', "'", '&', ';', '(', ')', '{', '}', '[', ']'];
        invalidChars.forEach((char) => {
          const maliciousId = `dQw4w9WgXc${char}`;
          const result = Youtube.parseEmbed(`https://www.youtube.com/watch?v=${maliciousId}`);
          expect(result).toBeNull();
        });
      });
    });

    describe('concurrent/rapid changes', () => {
      it('handles multiple rapid parseEmbed calls consistently', () => {
        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const results = Array.from({ length: 100 }, () => Youtube.parseEmbed(url));

        // All results should be identical
        results.forEach((result) => {
          expect(result).toEqual({
            type: 'url',
            value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          });
        });
      });

      it('handles alternating valid/invalid URLs consistently', () => {
        const validUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const invalidUrl = 'https://www.youtube.com/watch?v=invalid';

        for (let i = 0; i < 50; i++) {
          const validResult = Youtube.parseEmbed(validUrl);
          const invalidResult = Youtube.parseEmbed(invalidUrl);

          expect(validResult).toEqual({
            type: 'url',
            value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          });
          expect(invalidResult).toBeNull();
        }
      });

      it('parseEmbed is stateless and returns consistent results', () => {
        const url1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const url2 = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

        const result1a = Youtube.parseEmbed(url1);
        const result2 = Youtube.parseEmbed(url2);
        const result1b = Youtube.parseEmbed(url1);

        // Results should not be affected by previous calls
        expect(result1a).toEqual(result1b);
        expect(result1a).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
        expect(result2).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw',
        });
      });
    });

    describe('case sensitivity and domain variations', () => {
      it('handles uppercase domains gracefully', () => {
        const result = Youtube.parseEmbed('https://WWW.YOUTUBE.COM/WATCH?V=dQw4w9WgXcQ');
        expect(result).toEqual({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        });
      });
    });
  });

  describe('URL boundary conditions', () => {
    it('handles video ID followed by whitespace (copy-paste tolerance)', () => {
      // Users may accidentally include trailing whitespace when copying YouTube URLs
      // The regex uses (?:[?&\\s]|$) to gracefully handle this common mistake
      const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ ');
      expect(result).toEqual({
        type: 'url',
        value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      });
    });

    it('handles video ID followed by tab character (copy-paste tolerance)', () => {
      const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ\t');
      expect(result).toEqual({
        type: 'url',
        value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      });
    });

    it('handles video ID followed by newline (copy-paste tolerance)', () => {
      const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ\n');
      expect(result).toEqual({
        type: 'url',
        value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      });
    });

    it('handles video ID with multiple trailing whitespace characters (copy-paste tolerance)', () => {
      const result = Youtube.parseEmbed('https://youtu.be/dQw4w9WgXcQ  \t\n');
      expect(result).toEqual({
        type: 'url',
        value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      });
    });
  });

  describe('renderEmbed', () => {
    it('adds allow-popups-to-escape-sandbox to iframe sandbox', () => {
      render(
        Youtube.renderEmbed({
          type: 'url',
          value: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        }),
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toHaveAttribute('sandbox', `${VIDEO_EMBED_PROPS.sandbox} allow-popups-to-escape-sandbox`);
    });
  });
});

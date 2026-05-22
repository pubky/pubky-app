import { describe, expect, it } from 'vitest';
import { extractFromHtml, OG_PATTERNS } from './html';

describe('html', () => {
  describe('OG_PATTERNS', () => {
    it('exports TITLE patterns', () => {
      expect(OG_PATTERNS.TITLE).toBeDefined();
      expect(Array.isArray(OG_PATTERNS.TITLE)).toBe(true);
      expect(OG_PATTERNS.TITLE.length).toBeGreaterThan(0);
    });

    it('exports TITLE_TAG pattern', () => {
      expect(OG_PATTERNS.TITLE_TAG).toBeDefined();
      expect(OG_PATTERNS.TITLE_TAG).toBeInstanceOf(RegExp);
    });

    it('exports IMAGE patterns', () => {
      expect(OG_PATTERNS.IMAGE).toBeDefined();
      expect(Array.isArray(OG_PATTERNS.IMAGE)).toBe(true);
      expect(OG_PATTERNS.IMAGE.length).toBeGreaterThan(0);
    });
  });

  describe('extractFromHtml', () => {
    describe('og:title extraction', () => {
      it('extracts og:title with property attribute first', () => {
        const html = '<meta property="og:title" content="Test Title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('extracts og:title with name attribute first', () => {
        const html = '<meta name="og:title" content="Test Title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('extracts og:title with content attribute first', () => {
        const html = '<meta content="Test Title" property="og:title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('extracts og:title with content before name', () => {
        const html = '<meta content="Test Title" name="og:title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('handles single quotes', () => {
        const html = "<meta property='og:title' content='Test Title' />";
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('handles mixed quotes', () => {
        const html = '<meta property="og:title" content=\'Test Title\' />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('extracts title with special characters', () => {
        const html = '<meta property="og:title" content="Test & Title - Example.com" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test & Title - Example.com');
      });

      it('extracts title with unicode characters', () => {
        const html = '<meta property="og:title" content="Test 测试 Title 🎉" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test 测试 Title 🎉');
      });

      it('extracts first matching title when multiple exist', () => {
        const html = `
          <meta property="og:title" content="First Title" />
          <meta property="og:title" content="Second Title" />
        `;
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('First Title');
      });
    });

    describe('HTML title tag extraction', () => {
      it('extracts content from <title> tag', () => {
        const html = '<title>Page Title</title>';
        const result = extractFromHtml(html, [OG_PATTERNS.TITLE_TAG]);
        expect(result).toBe('Page Title');
      });

      it('extracts title with whitespace', () => {
        const html = '<title>  Page Title  </title>';
        const result = extractFromHtml(html, [OG_PATTERNS.TITLE_TAG]);
        expect(result).toBe('  Page Title  ');
      });

      it('extracts title with attributes on tag', () => {
        const html = '<title lang="en">Page Title</title>';
        const result = extractFromHtml(html, [OG_PATTERNS.TITLE_TAG]);
        expect(result).toBe('Page Title');
      });

      it('handles title with special characters', () => {
        const html = '<title>Test & Title - Example.com</title>';
        const result = extractFromHtml(html, [OG_PATTERNS.TITLE_TAG]);
        expect(result).toBe('Test & Title - Example.com');
      });

      it('extracts first title when multiple exist', () => {
        const html = '<title>First</title><title>Second</title>';
        const result = extractFromHtml(html, [OG_PATTERNS.TITLE_TAG]);
        expect(result).toBe('First');
      });
    });

    describe('og:image extraction', () => {
      it('extracts og:image with property attribute first', () => {
        const html = '<meta property="og:image" content="https://example.com/image.jpg" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('https://example.com/image.jpg');
      });

      it('extracts og:image with name attribute first', () => {
        const html = '<meta name="og:image" content="https://example.com/image.jpg" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('https://example.com/image.jpg');
      });

      it('extracts og:image with content attribute first', () => {
        const html = '<meta content="https://example.com/image.jpg" property="og:image" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('https://example.com/image.jpg');
      });

      it('extracts og:image with content before name', () => {
        const html = '<meta content="https://example.com/image.jpg" name="og:image" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('https://example.com/image.jpg');
      });

      it('handles image URLs with query parameters', () => {
        const html = '<meta property="og:image" content="https://example.com/image.jpg?v=123&size=large" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('https://example.com/image.jpg?v=123&size=large');
      });

      it('handles relative image URLs', () => {
        const html = '<meta property="og:image" content="/images/photo.jpg" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('/images/photo.jpg');
      });

      it('handles data URLs', () => {
        const html = '<meta property="og:image" content="data:image/png;base64,iVBORw0KG" />';
        const result = extractFromHtml(html, OG_PATTERNS.IMAGE);
        expect(result).toBe('data:image/png;base64,iVBORw0KG');
      });
    });

    describe('edge cases', () => {
      it('returns null when no match found', () => {
        const html = '<div>No meta tags here</div>';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBeNull();
      });

      it('returns null for empty HTML', () => {
        const html = '';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBeNull();
      });

      it('returns null for empty patterns array', () => {
        const html = '<meta property="og:title" content="Test" />';
        const result = extractFromHtml(html, []);
        expect(result).toBeNull();
      });

      it('handles malformed HTML gracefully', () => {
        const html = '<meta property="og:title" content="Test';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBeNull();
      });

      it('handles empty content attribute', () => {
        const html = '<meta property="og:title" content="" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBeNull(); // Empty string is falsy in match?.[1]
      });

      it('handles self-closing tags with />', () => {
        const html = '<meta property="og:title" content="Test Title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('handles tags without self-closing', () => {
        const html = '<meta property="og:title" content="Test Title">';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });
    });

    describe('case sensitivity', () => {
      it('is case-insensitive for tag names', () => {
        const html = '<META property="og:title" content="Test Title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('is case-insensitive for property names', () => {
        const html = '<meta PROPERTY="og:title" CONTENT="Test Title" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('preserves content case', () => {
        const html = '<meta property="og:title" content="Test TITLE" />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test TITLE');
      });
    });

    describe('whitespace handling', () => {
      it('handles extra whitespace between attributes', () => {
        const html = '<meta  property="og:title"   content="Test Title"  />';
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });

      it('handles newlines in HTML', () => {
        const html = `
          <meta 
            property="og:title" 
            content="Test Title" 
          />
        `;
        const result = extractFromHtml(html, OG_PATTERNS.TITLE);
        expect(result).toBe('Test Title');
      });
    });

    describe('real-world examples', () => {
      it('extracts from typical blog post HTML', () => {
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Blog Post Title</title>
              <meta property="og:title" content="Blog Post OG Title" />
              <meta property="og:image" content="https://blog.com/image.jpg" />
            </head>
          </html>
        `;
        expect(extractFromHtml(html, OG_PATTERNS.TITLE)).toBe('Blog Post OG Title');
        expect(extractFromHtml(html, OG_PATTERNS.IMAGE)).toBe('https://blog.com/image.jpg');
        expect(extractFromHtml(html, [OG_PATTERNS.TITLE_TAG])).toBe('Blog Post Title');
      });

      it('handles Facebook-style meta tags', () => {
        const html = `
          <meta property="og:title" content="Facebook Post Title" />
          <meta property="og:image" content="https://facebook.com/photo.jpg" />
          <meta property="og:description" content="Post description" />
        `;
        expect(extractFromHtml(html, OG_PATTERNS.TITLE)).toBe('Facebook Post Title');
        expect(extractFromHtml(html, OG_PATTERNS.IMAGE)).toBe('https://facebook.com/photo.jpg');
      });

      it('handles Twitter-style meta tags', () => {
        const html = `
          <meta name="og:title" content="Tweet Title" />
          <meta name="og:image" content="https://twitter.com/image.jpg" />
        `;
        expect(extractFromHtml(html, OG_PATTERNS.TITLE)).toBe('Tweet Title');
        expect(extractFromHtml(html, OG_PATTERNS.IMAGE)).toBe('https://twitter.com/image.jpg');
      });
    });
  });
});

import { describe, expect, it } from 'vitest';
import { UserValidator } from './user.validator';

describe('UserValidator', () => {
  // Test data factories
  const createMockImageFile = (name = 'avatar.png', type = 'image/png'): File =>
    new File(['fake-image-content'], name, { type });

  const createValidLinks = () => [
    { label: 'Website', url: 'https://example.com' },
    { label: 'GitHub', url: 'https://github.com/user' },
  ];

  describe('check - successful validation', () => {
    it('should validate complete user data', () => {
      const result = UserValidator.check('John Doe', 'Software developer', createValidLinks(), createMockImageFile());

      expect(result.error).toHaveLength(0);
      expect(result.data).toEqual({
        name: 'John Doe',
        bio: 'Software developer',
        links: expect.arrayContaining([
          expect.objectContaining({ label: 'Website' }),
          expect.objectContaining({ label: 'GitHub' }),
        ]),
        avatar: expect.any(File),
      });
    });

    it('should validate minimal user data (name only)', () => {
      const result = UserValidator.check('Alice', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.name).toBe('Alice');
      expect(result.data?.bio).toBe('');
      expect(result.data?.links).toBeUndefined();
      expect(result.data?.avatar).toBeNull();
    });
  });

  describe('check - name validation', () => {
    it('should trim name and validate', () => {
      const result = UserValidator.check('  Bob  ', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.name).toBe('Bob');
    });

    it.each([
      ['empty string', '', 'Name must be at least 3 characters'],
      ['whitespace only', '   ', 'Name must be at least 3 characters'],
      ['1 character', 'A', 'Name must be at least 3 characters'],
      ['2 characters', 'Jo', 'Name must be at least 3 characters'],
    ])('should reject %s name', (_, name, expectedMessage) => {
      const result = UserValidator.check(name, '', [], null);

      expect(result.error).toContainEqual({
        type: 'name',
        message: expectedMessage,
      });
    });

    it('should accept minimum valid name (3 characters)', () => {
      const result = UserValidator.check('Bob', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.name).toBe('Bob');
    });

    it('should accept maximum valid name (50 characters)', () => {
      const name50 = 'A'.repeat(50);
      const result = UserValidator.check(name50, '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.name).toBe(name50);
    });

    it('should reject name exceeding 50 characters', () => {
      const name51 = 'A'.repeat(51);
      const result = UserValidator.check(name51, '', [], null);

      expect(result.error).toContainEqual({
        type: 'name',
        message: 'Name must be no more than 50 characters',
      });
    });
  });

  describe('check - bio validation', () => {
    it('should trim bio', () => {
      const result = UserValidator.check('ValidUser', '  Some bio text  ', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.bio).toBe('Some bio text');
    });

    it('should accept empty bio', () => {
      const result = UserValidator.check('ValidUser', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.bio).toBe('');
    });

    it('should accept maximum valid bio (160 characters)', () => {
      const bio160 = 'A'.repeat(160);
      const result = UserValidator.check('ValidUser', bio160, [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.bio).toBe(bio160);
    });

    it('should reject bio exceeding 160 characters', () => {
      const bio161 = 'A'.repeat(161);
      const result = UserValidator.check('ValidUser', bio161, [], null);

      expect(result.error).toContainEqual({
        type: 'bio',
        message: 'Bio must be no more than 160 characters',
      });
    });
  });

  describe('check - links validation', () => {
    it('should filter empty URLs and trim link URLs', () => {
      const links = [
        { label: 'Site', url: '  https://example.com  ' },
        { label: 'Empty', url: '   ' },
        { label: 'Valid', url: 'https://test.com' },
        { label: 'Blank', url: '' },
      ];

      const result = UserValidator.check('ValidUser', '', links, null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.links).toHaveLength(2);
      expect(result.data?.links?.[0].url).toBe('https://example.com');
      expect(result.data?.links?.[1].url).toBe('https://test.com');
    });

    it('should return undefined for empty links array', () => {
      const result = UserValidator.check('TestUser', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.links).toBeUndefined();
    });

    it('should preserve link labels in output', () => {
      const links = [
        { label: 'GitHub', url: 'https://github.com/user' },
        { label: 'Blog', url: 'https://blog.example.com' },
      ];

      const result = UserValidator.check('TestUser', '', links, null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.links?.[0].label).toBe('GitHub');
      expect(result.data?.links?.[1].label).toBe('Blog');
    });

    it.each([['not-a-url'], ['just-text'], ['missing-protocol.com'], ['://no-scheme']])(
      'should reject invalid URL format: "%s"',
      (invalidUrl) => {
        const links = [{ label: 'Invalid', url: invalidUrl }];
        const result = UserValidator.check('TestUser', '', links, null);

        expect(result.error).toContainEqual({
          type: 'link_0',
          message: 'Invalid URL',
        });
      },
    );

    /**
     * Note: Zod's url() validator accepts various protocols, not just http/https
     */
    it.each([['https://example.com'], ['http://example.com'], ['ftp://files.example.com']])(
      'should accept valid URL format: "%s"',
      (validUrl) => {
        const links = [{ label: 'Valid', url: validUrl }];
        const result = UserValidator.check('TestUser', '', links, null);

        expect(result.error).toHaveLength(0);
      },
    );

    it('should report errors for multiple invalid URLs with correct indices', () => {
      const links = [
        { label: 'Invalid1', url: 'not-a-url' },
        { label: 'Valid', url: 'https://example.com' },
        { label: 'Invalid2', url: 'also-invalid' },
      ];

      const result = UserValidator.check('TestUser', '', links, null);

      expect(result.error).toHaveLength(2);
      expect(result.error).toContainEqual({ type: 'link_0', message: 'Invalid URL' });
      expect(result.error).toContainEqual({ type: 'link_2', message: 'Invalid URL' });
    });

    /**
     * Note: Empty labels cause validation to fail but the error isn't mapped
     * to errorList due to the implementation only checking field === 'url'
     */
    it('should fail validation for empty label (but error not in errorList)', () => {
      const links = [{ label: '', url: 'https://example.com' }];
      const result = UserValidator.check('TestUser', '', links, null);

      expect(result.data).toBeUndefined();
    });
  });

  describe('check - avatar validation', () => {
    it.each([
      ['image/png', 'avatar.png'],
      ['image/jpeg', 'photo.jpg'],
      ['image/gif', 'animation.gif'],
      ['image/webp', 'image.webp'],
      ['image/svg+xml', 'icon.svg'],
    ])('should accept %s file type', (type, filename) => {
      const file = createMockImageFile(filename, type);
      const result = UserValidator.check('User', '', [], file);

      expect(result.error).toHaveLength(0);
      expect(result.data?.avatar).toBe(file);
    });

    it('should accept null avatar', () => {
      const result = UserValidator.check('User', '', [], null);

      expect(result.error).toHaveLength(0);
      expect(result.data?.avatar).toBeNull();
    });

    it.each([
      ['application/pdf', 'doc.pdf'],
      ['video/mp4', 'video.mp4'],
      ['text/plain', 'file.txt'],
      ['application/json', 'data.json'],
    ])('should reject %s file type', (type, filename) => {
      const file = new File(['content'], filename, { type });
      const result = UserValidator.check('User', '', [], file);

      expect(result.error).toContainEqual({
        type: 'avatar',
        message: 'Avatar must be an image file',
      });
    });
  });

  describe('check - multiple validation errors', () => {
    it('should collect all validation errors', () => {
      const result = UserValidator.check(
        'AB', // Too short
        'Some bio',
        [
          { label: 'Bad1', url: 'invalid-url' },
          { label: 'Good', url: 'https://valid.com' },
          { label: 'Bad2', url: 'not-valid' },
        ],
        new File([''], 'video.mp4', { type: 'video/mp4' }),
      );

      expect(result.error.length).toBe(4);
      expect(result.error).toContainEqual({ type: 'name', message: 'Name must be at least 3 characters' });
      expect(result.error).toContainEqual({ type: 'link_0', message: 'Invalid URL' });
      expect(result.error).toContainEqual({ type: 'link_2', message: 'Invalid URL' });
      expect(result.error).toContainEqual({ type: 'avatar', message: 'Avatar must be an image file' });
    });

    it('should collect max length validation errors', () => {
      const result = UserValidator.check(
        'A'.repeat(51), // Too long
        'B'.repeat(161), // Too long
        [],
        null,
      );

      expect(result.error.length).toBe(2);
      expect(result.error).toContainEqual({ type: 'name', message: 'Name must be no more than 50 characters' });
      expect(result.error).toContainEqual({ type: 'bio', message: 'Bio must be no more than 160 characters' });
    });

    it('should return undefined data when validation fails', () => {
      const result = UserValidator.check('AB', '', [], null);

      expect(result.error.length).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();
    });
  });
});

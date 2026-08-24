import { describe, expect, it } from 'vitest';
import { type GuardedPost, VerifierType } from '@/services/locks/locks.types';
import { MOCK_LOCK_AUTHOR_PUBKY, mockLockFile } from '@/test-utils/locks';
import { GuardedContentParser, LockContentParser, LockFileParser, LockProofBundler } from './locks.parser';

const MOCK_LOCK_FILE = mockLockFile();

describe('LockContentParser', () => {
  describe('parse', () => {
    it('parses valid teaser content', () => {
      const content = JSON.stringify({
        lock_title: 'Private Key Management',
        teaser_description: 'Something, something, not your cheese.',
      });

      expect(LockContentParser.parse(content)).toEqual({
        lock_title: 'Private Key Management',
        teaser_description: 'Something, something, not your cheese.',
      });
    });

    it('returns null for empty content', () => {
      expect(LockContentParser.parse('')).toBeNull();
    });

    it('returns null for invalid or non-object JSON', () => {
      expect(LockContentParser.parse('not json')).toBeNull();
      expect(LockContentParser.parse('42')).toBeNull();
      expect(LockContentParser.parse('"hi"')).toBeNull();
    });

    it('defaults missing fields to empty strings', () => {
      expect(LockContentParser.parse(JSON.stringify({}))).toEqual({ lock_title: '', teaser_description: '' });
      expect(LockContentParser.parse(JSON.stringify({ lock_title: 'X' }))).toEqual({
        lock_title: 'X',
        teaser_description: '',
      });
    });
  });

  describe('isValidLockUrl', () => {
    it('accepts a pubky:// url with a valid pubky host', () => {
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`)).toBe(true);
    });

    it('rejects non-pubky or malformed urls', () => {
      expect(LockContentParser.isValidLockUrl('https://example.com/lock.json')).toBe(false);
      expect(LockContentParser.isValidLockUrl('pubky://short/lock.json')).toBe(false);
      expect(LockContentParser.isValidLockUrl('')).toBe(false);
    });

    it('rejects a valid pubky url that does not point at a .json file', () => {
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.txt`)).toBe(false);
      expect(LockContentParser.isValidLockUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/`)).toBe(false);
    });
  });

  describe('lockIdFromUrl', () => {
    it('takes the lock id from the .json filename', () => {
      expect(LockContentParser.lockIdFromUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks.app/LOCK1.json`)).toBe(
        'LOCK1',
      );
    });

    it('returns null when there is no .json filename to read', () => {
      expect(LockContentParser.lockIdFromUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks.app/`)).toBeNull();
      expect(LockContentParser.lockIdFromUrl(`pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks.app/.json`)).toBeNull();
    });
  });
});

describe('LockFileParser', () => {
  describe('resolveVerifierType', () => {
    it('resolves password from the mock lock file', () => {
      expect(LockFileParser.resolveVerifierType(MOCK_LOCK_FILE)).toBe(VerifierType.PASSWORD);
    });

    it('resolves payment from a payment criterion', () => {
      const paymentLock = {
        ...MOCK_LOCK_FILE,
        criteria: [{ criterion_id: 'criterion-1', verifier_type: 'payment', params: {} }],
      };
      expect(LockFileParser.resolveVerifierType(paymentLock)).toBe(VerifierType.PAYMENT);
    });

    it('returns null for missing, empty or unsupported verifier types', () => {
      expect(LockFileParser.resolveVerifierType(null)).toBeNull();
      expect(LockFileParser.resolveVerifierType({ ...MOCK_LOCK_FILE, criteria: [] })).toBeNull();

      const devStaticLock = {
        ...MOCK_LOCK_FILE,
        criteria: [{ criterion_id: 'criterion-1', verifier_type: 'dev-static', params: {} }],
      };
      expect(LockFileParser.resolveVerifierType(devStaticLock)).toBeNull();
    });
  });
});

describe('LockProofBundler', () => {
  const LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks.app/lock1.json`;

  it('builds a proof bundle: one satisfied proof per criterion (verifier_type mirrored), scheme stripped from the resource', () => {
    const bundle = LockProofBundler.build(MOCK_LOCK_FILE, LOCK_URL, 'bundle-1');

    expect(bundle).toEqual({
      version: 1,
      bundle_id: 'bundle-1',
      pubky_lock_resource: `${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks.app/lock1.json`,
      proofs: [{ criterion_id: 'criterion-1', verifier_type: 'password', payload: { satisfied: true } }],
    });
  });

  it('emits a proof for every criterion', () => {
    const twoCriteria = {
      ...MOCK_LOCK_FILE,
      criteria: [
        { criterion_id: 'c-1', verifier_type: 'dev-static', params: {} },
        { criterion_id: 'c-2', verifier_type: 'dev-static', params: {} },
      ],
    };
    expect(LockProofBundler.build(twoCriteria, LOCK_URL, 'b').proofs).toHaveLength(2);
  });
});

describe('GuardedContentParser', () => {
  describe('toReadPath', () => {
    it('strips the guarded content prefix to the relative read path', () => {
      expect(GuardedContentParser.toReadPath('/priv/locks.app/content/nested/a.txt')).toBe('nested/a.txt');
    });

    it('returns null for a path outside the guarded namespace', () => {
      expect(GuardedContentParser.toReadPath('/pub/pubky.app/posts/x')).toBeNull();
    });
  });

  describe('attachmentUriToPath', () => {
    it('strips the pubky scheme and host to the private path', () => {
      expect(GuardedContentParser.attachmentUriToPath('pubky://ownerb/priv/locks.app/content/img1')).toBe(
        '/priv/locks.app/content/img1',
      );
    });
  });

  describe('unlockedUrl', () => {
    it('builds the reader-owned copy path for one unlocked file', () => {
      expect(GuardedContentParser.unlockedUrl('readerpubky', 'LOCK1', 'img1')).toBe(
        'pubky://readerpubky/priv/social/unlocked/LOCK1/img1',
      );
    });
  });

  describe('unlockedPostUrl', () => {
    it('builds the reader-owned post.json marker path', () => {
      expect(GuardedContentParser.unlockedPostUrl('readerpubky', 'LOCK1')).toBe(
        'pubky://readerpubky/priv/social/unlocked/LOCK1/post.json',
      );
    });
  });

  describe('unlockedRootUrl', () => {
    it('builds the directory the unlocked list enumerates', () => {
      expect(GuardedContentParser.unlockedRootUrl('readerpubky')).toBe('pubky://readerpubky/priv/social/unlocked/');
    });
  });

  describe('completedLockIds', () => {
    const url = (tail: string) => `pubky://readerpubky/priv/social/unlocked/${tail}`;

    it('counts a lock once, from its post.json, ignoring the attachments beside it', () => {
      const files = [url('LOCK1/img1'), url('LOCK1/post.json'), url('LOCK1/img2')];

      expect(GuardedContentParser.completedLockIds(files)).toEqual(['LOCK1']);
    });

    it('drops a lock whose replication stopped before the marker landed', () => {
      const files = [url('DONE/post.json'), url('PARTIAL/img1')];

      expect(GuardedContentParser.completedLockIds(files)).toEqual(['DONE']);
    });

    it('ignores a post.json nested deeper than the lock folder', () => {
      expect(GuardedContentParser.completedLockIds([url('LOCK1/nested/post.json')])).toEqual([]);
    });

    it('ignores a post.json sitting directly in the root, which belongs to no lock', () => {
      expect(GuardedContentParser.completedLockIds([url('post.json')])).toEqual([]);
    });

    it('skips urls outside the unlocked root', () => {
      const files = ['pubky://readerpubky/pub/pubky.app/posts/post.json', url('LOCK1/post.json')];

      expect(GuardedContentParser.completedLockIds(files)).toEqual(['LOCK1']);
    });

    it('returns nothing for an empty listing, which is what a 404 root becomes', () => {
      expect(GuardedContentParser.completedLockIds([])).toEqual([]);
    });
  });

  describe('buildUnlockedPost', () => {
    const post: GuardedPost = {
      content: 'secret',
      kind: 'image',
      attachments: ['pubky://b/priv/locks.app/content/img1'],
    };

    it('repoints attachments at the reader copy with inline content types', () => {
      const json = GuardedContentParser.buildUnlockedPost(post, 'readerpubky', 'LOCK1', [
        { id: 'img1', contentType: 'image/png' },
      ]);
      expect(JSON.parse(json)).toEqual({
        content: 'secret',
        kind: 'image',
        attachments: [{ url: 'pubky://readerpubky/priv/social/unlocked/LOCK1/img1', content_type: 'image/png' }],
      });
    });

    it('keeps attachments null when the post has none', () => {
      const json = GuardedContentParser.buildUnlockedPost({ ...post, attachments: null }, 'readerpubky', 'LOCK1', []);
      expect(JSON.parse(json).attachments).toBeNull();
    });
  });

  describe('parseReplicatedPost', () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

    it('parses the reader post.json with inline attachment content types', () => {
      const bytes = encode({
        content: 'body',
        kind: 'image',
        attachments: [{ url: 'pubky://r/priv/social/unlocked/L/a', content_type: 'image/png' }],
      });
      expect(GuardedContentParser.parseReplicatedPost(bytes)).toEqual({
        content: 'body',
        kind: 'image',
        attachments: [{ url: 'pubky://r/priv/social/unlocked/L/a', content_type: 'image/png' }],
      });
    });

    it('returns null for non-JSON bytes', () => {
      expect(GuardedContentParser.parseReplicatedPost(new TextEncoder().encode('nope'))).toBeNull();
    });
  });

  describe('parsePost', () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

    it('parses guarded PubkyAppPost bytes into the reader post shape', () => {
      const bytes = encode({
        content: 'secret body',
        kind: 'short',
        attachments: ['pubky://b/priv/locks.app/content/a'],
      });
      expect(GuardedContentParser.parsePost(bytes)).toEqual({
        content: 'secret body',
        kind: 'short',
        attachments: ['pubky://b/priv/locks.app/content/a'],
      });
    });

    it('defaults missing fields (attachments → null)', () => {
      expect(GuardedContentParser.parsePost(encode({ content: 'x', kind: 'long' }))).toEqual({
        content: 'x',
        kind: 'long',
        attachments: null,
      });
    });

    it('returns null for non-JSON bytes', () => {
      expect(GuardedContentParser.parsePost(new TextEncoder().encode('not json'))).toBeNull();
    });

    it('returns null when kind is missing or invalid', () => {
      expect(GuardedContentParser.parsePost(encode({ content: 'x' }))).toBeNull();
      expect(GuardedContentParser.parsePost(encode({ content: 'x', kind: 'bogus' }))).toBeNull();
    });
  });
});

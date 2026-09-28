import { describe, expect, it } from 'vitest';
import {
  articleHasInlineSlotZero,
  collectAttachmentRefIndexes,
  countInlineImageUris,
  deserializeArticleBody,
  isAttachmentRefScheme,
  isAuthorFileUri,
  parseAttachmentRef,
  parseFileUriOwner,
  serializeArticleBody,
} from './articleInlineImages';

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const OTHER = 'z4dr71ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1abc';

const fileUri = (id: string, owner = AUTHOR) => `pubky://${owner}/pub/pubky.app/files/${id}`;
const blobUri = (id: string, owner = AUTHOR) => `pubky://${owner}/pub/pubky.app/blobs/${id}`;

const serialize = (body: string, overrides?: Partial<Parameters<typeof serializeArticleBody>[0]>) =>
  serializeArticleBody({ body, coverPresent: false, authorPubky: AUTHOR, maxInlineImages: 9, ...overrides });

describe('parseAttachmentRef', () => {
  it('parses strict references', () => {
    expect(parseAttachmentRef('attachment:0')).toBe(0);
    expect(parseAttachmentRef('attachment:1')).toBe(1);
    expect(parseAttachmentRef('attachment:42')).toBe(42);
  });

  it('rejects malformed references', () => {
    expect(parseAttachmentRef('attachment:01')).toBeNull();
    expect(parseAttachmentRef('attachment:+1')).toBeNull();
    expect(parseAttachmentRef('attachment:-1')).toBeNull();
    expect(parseAttachmentRef('attachment:1.5')).toBeNull();
    expect(parseAttachmentRef('attachment:')).toBeNull();
    expect(parseAttachmentRef('attachment:1x')).toBeNull();
    expect(parseAttachmentRef('Attachment:1')).toBeNull();
    expect(parseAttachmentRef('attachment: 1')).toBeNull();
    expect(parseAttachmentRef('')).toBeNull();
    expect(parseAttachmentRef(null)).toBeNull();
    expect(parseAttachmentRef(undefined)).toBeNull();
  });
});

describe('isAttachmentRefScheme', () => {
  it('matches any attachment-prefixed destination regardless of validity or case', () => {
    expect(isAttachmentRefScheme('attachment:0')).toBe(true);
    expect(isAttachmentRefScheme('attachment:01')).toBe(true);
    expect(isAttachmentRefScheme('ATTACHMENT:5')).toBe(true);
    expect(isAttachmentRefScheme(' attachment:1')).toBe(true);
  });

  it('rejects other destinations', () => {
    expect(isAttachmentRefScheme('attachments:1')).toBe(false);
    expect(isAttachmentRefScheme('https://example.com/a.png')).toBe(false);
    expect(isAttachmentRefScheme('')).toBe(false);
    expect(isAttachmentRefScheme(null)).toBe(false);
  });
});

describe('parseFileUriOwner / isAuthorFileUri', () => {
  it('extracts the owner from strict file URIs', () => {
    expect(parseFileUriOwner(fileUri('abc123'))).toBe(AUTHOR);
    expect(parseFileUriOwner(` ${fileUri('abc123')} `)).toBe(AUTHOR);
  });

  it('rejects non-file URIs', () => {
    expect(parseFileUriOwner(blobUri('abc123'))).toBeNull();
    expect(parseFileUriOwner(`pubky://${AUTHOR}/pub/pubky.app/posts/xyz`)).toBeNull();
    expect(parseFileUriOwner(`pubky://${AUTHOR}/other/files/xyz`)).toBeNull();
    expect(parseFileUriOwner(`${fileUri('abc')}/extra`)).toBeNull();
    expect(parseFileUriOwner(`pubky://${AUTHOR}/pub/pubky.app/files/`)).toBeNull();
    expect(parseFileUriOwner('https://example.com/pub/pubky.app/files/abc')).toBeNull();
    expect(parseFileUriOwner('not a uri')).toBeNull();
    expect(parseFileUriOwner(null)).toBeNull();
  });

  it('matches ownership', () => {
    expect(isAuthorFileUri(fileUri('abc'), AUTHOR)).toBe(true);
    expect(isAuthorFileUri(fileUri('abc', OTHER), AUTHOR)).toBe(false);
    expect(isAuthorFileUri('https://example.com/a.png', AUTHOR)).toBe(false);
  });
});

describe('serializeArticleBody', () => {
  it('returns bodies without managed images unchanged', () => {
    const body = 'Just text with a [link](https://example.com).\n\n## Heading';
    const result = serialize(body);

    expect(result).toEqual({ body, inlineUris: [], errors: [] });
  });

  it('rewrites a single author image to attachment:0 without a cover', () => {
    const body = `Intro.\n\n![My alt](${fileUri('img1')})\n\nOutro.`;
    const result = serialize(body);

    expect(result.errors).toEqual([]);
    expect(result.inlineUris).toEqual([fileUri('img1')]);
    expect(result.body).toBe('Intro.\n\n![My alt](attachment:0)\n\nOutro.');
  });

  it('offsets slots by one when a cover is present', () => {
    const body = `![A](${fileUri('a')})\n\n![B](${fileUri('b')})`;
    const result = serialize(body, { coverPresent: true });

    expect(result.inlineUris).toEqual([fileUri('a'), fileUri('b')]);
    expect(result.body).toBe('![A](attachment:1)\n\n![B](attachment:2)');
  });

  it('dedupes repeated URIs onto one slot in first-appearance order', () => {
    const body = `![One](${fileUri('x')})\n\n![Two](${fileUri('y')})\n\n![One again](${fileUri('x')})`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([fileUri('x'), fileUri('y')]);
    expect(result.body).toBe('![One](attachment:0)\n\n![Two](attachment:1)\n\n![One again](attachment:0)');
  });

  it('preserves every byte outside the rewritten destinations', () => {
    const body = `# Title\n\n  *   Weird   spacing\t\n\n> quote **bold** _em_\n\n![*alt* [x] text](${fileUri('img')} "my title")\n\ntrailing   `;
    const result = serialize(body);

    expect(result.errors).toEqual([]);
    expect(result.body).toBe(body.replace(fileUri('img'), 'attachment:0'));
  });

  it('supports angle-bracketed destinations', () => {
    const body = `![a](<${fileUri('img')}>)`;
    const result = serialize(body);

    expect(result.body).toBe('![a](<attachment:0>)');
    expect(result.inlineUris).toEqual([fileUri('img')]);
  });

  it('rebuilds the image span when the destination is entity-escaped in source', () => {
    const body = `![a](${fileUri('ab')}&#99;)`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([fileUri('abc')]);
    expect(result.body).toBe('![a](attachment:0)');
  });

  it('rebuilds instead of rewriting the alt when the decoded destination appears only in the alt text', () => {
    // Entity-escaped destination + the decoded URI pasted as alt: the only
    // raw occurrence of the decoded URL sits in the alt, and rewriting it
    // there would leak the raw file URI into the published body
    const uri = fileUri('sneaky');
    const body = `![${uri}](${fileUri('sneak')}&#121;)`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([uri]);
    // The destination is the rewritten part; the raw URI never survives as one
    expect(result.body).toContain('](attachment:0)');
    const restored = deserializeArticleBody({ body: result.body, attachments: [uri], authorPubky: AUTHOR });
    expect(serialize(restored.body).inlineUris).toEqual([uri]);
  });

  it('rebuilds the image span when the destination also appears in the alt text', () => {
    const uri = fileUri('dup');
    const body = `![${uri}](${uri})`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([uri]);
    expect(result.body).toContain('](attachment:0)');
    expect(result.body).toContain(uri);
  });

  it('ignores image syntax inside code fences and inline code', () => {
    const body = ['```', `![a](${fileUri('fence')})`, '```', '', `Inline \`![b](${fileUri('code')})\` sample.`].join(
      '\n',
    );
    const result = serialize(body);

    expect(result).toEqual({ body, inlineUris: [], errors: [] });
  });

  it('collects images inside GFM table cells', () => {
    const body = `| a | b |\n| - | - |\n| ![t](${fileUri('cell')}) | x |`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([fileUri('cell')]);
    expect(result.body).toContain('![t](attachment:0)');
  });

  it('collects and rewrites images nested inside other markdown constructs', () => {
    const body = [
      `- item with ![in list](${fileUri('list')})`,
      '',
      `> quoted ![in quote](${fileUri('quote')})`,
      '',
      `## Heading ![in heading](${fileUri('heading')})`,
      '',
      `[![link-wrapped](${fileUri('linked')})](https://example.com)`,
    ].join('\n');
    const result = serialize(body);

    expect(result.errors).toEqual([]);
    expect(result.inlineUris).toEqual([fileUri('list'), fileUri('quote'), fileUri('heading'), fileUri('linked')]);
    // Surrounding structure preserved byte-for-byte; only destinations swapped
    expect(result.body).toBe(
      [
        '- item with ![in list](attachment:0)',
        '',
        '> quoted ![in quote](attachment:1)',
        '',
        '## Heading ![in heading](attachment:2)',
        '',
        '[![link-wrapped](attachment:3)](https://example.com)',
      ].join('\n'),
    );
  });

  it('round-trips nested images through deserialize', () => {
    const composer = `- ![a](${fileUri('a')})\n\n> ![b](${fileUri('b')})`;
    const serialized = serialize(composer);
    const restored = deserializeArticleBody({
      body: serialized.body,
      attachments: serialized.inlineUris,
      authorPubky: AUTHOR,
    });

    expect(restored.warnings).toEqual([]);
    expect(restored.body).toBe(composer);
  });

  it('leaves external and non-author images verbatim and uncollected', () => {
    const body = `![ext](https://example.com/pic.png)\n\n![other](${fileUri('f', OTHER)})\n\n![mine](${fileUri('m')})`;
    const result = serialize(body);

    expect(result.inlineUris).toEqual([fileUri('m')]);
    expect(result.body).toBe(
      `![ext](https://example.com/pic.png)\n\n![other](${fileUri('f', OTHER)})\n\n![mine](attachment:0)`,
    );
  });

  it('blocks hand-typed attachment references, including malformed ones', () => {
    for (const ref of ['attachment:1', 'attachment:01', 'ATTACHMENT:2']) {
      const body = `![a](${ref})`;
      const result = serialize(body);

      expect(result.errors).toEqual([{ code: 'HAND_TYPED_ATTACHMENT_REF' }]);
      expect(result.body).toBe(body);
      expect(result.inlineUris).toEqual([]);
    }
  });

  it('blocks blob destinations', () => {
    expect(serialize('![a](blob:https://app/123)').errors).toEqual([{ code: 'BLOB_URI' }]);
    expect(serialize(`![a](${blobUri('b1')})`).errors).toEqual([{ code: 'BLOB_URI' }]);
  });

  it('blocks reference-style definitions pointing at author file URIs', () => {
    const body = `![a][ref]\n\n[ref]: ${fileUri('r')}`;
    const result = serialize(body);

    expect(result.errors).toEqual([{ code: 'REFERENCE_STYLE_FILE_URI' }]);
  });

  it('blocks attachment refs and blob URIs hidden in definitions', () => {
    expect(serialize('![a][r]\n\n[r]: attachment:3').errors).toEqual([{ code: 'HAND_TYPED_ATTACHMENT_REF' }]);
    expect(serialize(`![a][r]\n\n[r]: ${blobUri('b')}`).errors).toEqual([{ code: 'BLOB_URI' }]);
  });

  it('leaves external reference-style definitions alone', () => {
    const body = '![a][ref]\n\n[ref]: https://example.com/pic.png';
    const result = serialize(body);

    expect(result).toEqual({ body, inlineUris: [], errors: [] });
  });

  it('blocks raw HTML containing author file or blob URIs', () => {
    expect(serialize(`<img src="${fileUri('h')}" />`).errors).toEqual([{ code: 'RAW_HTML_FILE_URI' }]);
    expect(serialize(`<img src="${blobUri('h')}" />`).errors).toEqual([{ code: 'RAW_HTML_FILE_URI' }]);
  });

  it("does not block raw HTML containing other users' URIs", () => {
    const body = `<img src="${fileUri('h', OTHER)}" />`;
    const result = serialize(body);

    expect(result.errors).toEqual([]);
  });

  it('enforces the inline image cap against unique URIs', () => {
    const body = `![a](${fileUri('a')})\n\n![b](${fileUri('b')})\n\n![a again](${fileUri('a')})`;

    expect(serialize(body, { maxInlineImages: 2 }).errors).toEqual([]);
    expect(serialize(body, { maxInlineImages: 1 }).errors).toEqual([{ code: 'TOO_MANY_INLINE_IMAGES', max: 1 }]);
  });

  it('reports each error code once', () => {
    const body = '![a](attachment:1)\n\n![b](attachment:2)\n\n![c](blob:x)';
    const result = serialize(body);

    expect(result.errors).toEqual([{ code: 'HAND_TYPED_ATTACHMENT_REF' }, { code: 'BLOB_URI' }]);
  });
});

describe('deserializeArticleBody', () => {
  const deserialize = (body: string, attachments: string[]) =>
    deserializeArticleBody({ body, attachments, authorPubky: AUTHOR });

  it('resolves references to their attachment URIs', () => {
    const attachments = [fileUri('cover'), fileUri('a'), fileUri('b')];
    const body = 'Intro.\n\n![A](attachment:1)\n\nMiddle.\n\n![B](attachment:2)';
    const result = deserialize(body, attachments);

    expect(result.warnings).toEqual([]);
    expect(result.body).toBe(`Intro.\n\n![A](${fileUri('a')})\n\nMiddle.\n\n![B](${fileUri('b')})`);
  });

  it('round-trips with serializeArticleBody', () => {
    const composer = `Text.\n\n![One](${fileUri('one')})\n\nMore **text**.\n\n![Two](${fileUri('two')})`;
    const serialized = serialize(composer, { coverPresent: true });
    const attachments = [fileUri('cover'), ...serialized.inlineUris];
    const restored = deserialize(serialized.body, attachments);

    expect(restored.warnings).toEqual([]);
    expect(restored.body).toBe(composer);
  });

  it('removes images with out-of-range references and warns', () => {
    const result = deserialize('Before.\n\n![gone](attachment:5)\n\nAfter.', [fileUri('cover')]);

    expect(result.warnings).toHaveLength(1);
    expect(result.body).toBe('Before.\n\n\n\nAfter.');
  });

  it('removes images whose target is not an author-owned file URI', () => {
    expect(deserialize('![x](attachment:0)', [fileUri('f', OTHER)]).warnings).toHaveLength(1);
    expect(deserialize('![x](attachment:0)', ['https://example.com/a.png']).warnings).toHaveLength(1);
    expect(deserialize('![x](attachment:0)', [blobUri('b')]).warnings).toHaveLength(1);
  });

  it('removes malformed attachment-scheme images so the article stays repairable', () => {
    const result = deserialize('A ![x](attachment:01) B', [fileUri('a')]);

    expect(result.warnings).toHaveLength(1);
    expect(result.body).toBe('A  B');
  });

  it('handles valid and invalid references in the same body', () => {
    const result = deserialize('![ok](attachment:0)\n\n![bad](attachment:9)', [fileUri('a')]);

    expect(result.warnings).toHaveLength(1);
    expect(result.body).toBe(`![ok](${fileUri('a')})\n\n`);
  });

  it('leaves reference syntax inside code fences alone', () => {
    const body = '```\n![x](attachment:0)\n```';
    const result = deserialize(body, [fileUri('a')]);

    expect(result).toEqual({ body, warnings: [] });
  });

  it('leaves external images untouched', () => {
    const body = '![ext](https://example.com/pic.png)';
    const result = deserialize(body, [fileUri('a')]);

    expect(result).toEqual({ body, warnings: [] });
  });
});

describe('countInlineImageUris', () => {
  it('counts unique author-owned inline image URIs', () => {
    const body = `![a](${fileUri('a')})\n\n![b](${fileUri('b')})\n\n![a again](${fileUri('a')})`;

    expect(countInlineImageUris(body, AUTHOR)).toBe(2);
  });

  it('ignores external images, other owners, and code fences', () => {
    const body = [
      '![ext](https://example.com/pic.png)',
      '',
      `![other](${fileUri('f', OTHER)})`,
      '',
      '```',
      `![fenced](${fileUri('fenced')})`,
      '```',
    ].join('\n');

    expect(countInlineImageUris(body, AUTHOR)).toBe(0);
  });

  it('returns 0 for empty bodies', () => {
    expect(countInlineImageUris('', AUTHOR)).toBe(0);
  });
});

describe('collectAttachmentRefIndexes / articleHasInlineSlotZero', () => {
  it('collects indexes from images and definitions', () => {
    const body = '![a](attachment:0)\n\n![b](attachment:2)\n\n![c][r]\n\n[r]: attachment:7';

    expect(collectAttachmentRefIndexes(body)).toEqual(new Set([0, 2, 7]));
  });

  it('ignores malformed references and code fences', () => {
    const body = '![a](attachment:01)\n\n```\n![b](attachment:3)\n```';

    expect(collectAttachmentRefIndexes(body)).toEqual(new Set());
  });

  it('detects the slot-0 rule', () => {
    expect(articleHasInlineSlotZero('![a](attachment:0)')).toBe(true);
    expect(articleHasInlineSlotZero('![a](attachment:1)')).toBe(false);
    expect(articleHasInlineSlotZero('plain text')).toBe(false);
  });

  it('detects entity-escaped references (the fast-path substring check must not hide them)', () => {
    // `&#48;` decodes to '0' — a valid slot-0 ref without the literal substring
    expect(articleHasInlineSlotZero('![a](attachment:&#48;)')).toBe(true);
    expect(collectAttachmentRefIndexes('![a](attachment:&#49;)')).toEqual(new Set([1]));
    // Ampersands in prose alone never fabricate a ref
    expect(articleHasInlineSlotZero('R&D notes, no images')).toBe(false);
  });
});

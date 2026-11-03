import { describe, expect, it } from 'vitest';
import graphBasisFixture from './__fixtures__/answer.basis.graph.json';
import knowledgeBasisFixture from './__fixtures__/answer.basis.knowledge.json';
import mixedBasisFixture from './__fixtures__/answer.basis.mixed.json';
import modelBasisFixture from './__fixtures__/answer.basis.model.json';
import unknownBasisFixture from './__fixtures__/answer.basis.unknown.json';
import webBasisFixture from './__fixtures__/answer.basis.web.json';
import invalidScopeFixture from './__fixtures__/answer.scope.invalid-extra-key.json';
import scopedFixture from './__fixtures__/answer.scope.valid.json';
import invalidSectionFixture from './__fixtures__/answer.section.invalid.json';
import sectionFixture from './__fixtures__/answer.section.valid.json';
import fixture from './__fixtures__/answer.valid.json';
import { parsePubchiAnswerV1 } from './answer';

describe('pubchi answer schema', () => {
  it('parses the captured answer fixture', () => {
    const result = parsePubchiAnswerV1(fixture);
    expect(result.ok).toBe(true);
  });

  it('parses the service scope fixture', () => {
    const result = parsePubchiAnswerV1(scopedFixture);
    expect(result.ok).toBe(true);
  });

  it('parses the service section fixture', () => {
    expect(parsePubchiAnswerV1(sectionFixture).ok).toBe(true);
  });

  it('parses a strict continuation', () => {
    expect(
      parsePubchiAnswerV1({
        ...fixture,
        continuation: {
          since: '2026-09-10T06:00:00Z',
          until: '2026-09-10T07:00:00Z',
          complete: true,
          skipped: 0,
        },
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['web', webBasisFixture, 'web'],
    ['knowledge', knowledgeBasisFixture, 'knowledge'],
    ['graph', graphBasisFixture, 'graph'],
    ['mixed', mixedBasisFixture, 'mixed'],
    ['model', modelBasisFixture, 'model'],
    ['unknown', unknownBasisFixture, 'corpus-v2'],
  ] as const)('parses a %s basis fixture without SCHEMA_INVALID', (_, input, basis) => {
    const result = parsePubchiAnswerV1(input);
    expect(result).toMatchObject({ ok: true, value: { basis } });
  });

  it('parses knowledge citations and rejects model citations', () => {
    const citation = {
      kind: 'knowledge' as const,
      title: 'Pubky docs',
      url: 'https://docs.pubky.org/guide',
      corpus_version: '2026-09',
      snippet: 'Public documentation',
    };
    expect(
      parsePubchiAnswerV1({
        ...fixture,
        basis: 'knowledge',
        scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
        citations: [citation],
      }).ok,
    ).toBe(true);
    expect(
      parsePubchiAnswerV1({
        ...fixture,
        basis: 'model',
        scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
        citations: [citation],
      }).ok,
    ).toBe(false);
  });

  it('accepts graph and mixed answers whose executed scope names a graph, and rejects non-graph bases with one', () => {
    const graphScope = {
      time: {
        since_ms: 1788441249000,
        until_ms: 1789046049000,
        label: 'last 7 days (Sep 3–10 UTC)',
        source: 'explicit',
      },
      graph: { kind: 'owner_network' },
      filters: [],
      complete: true,
    };
    expect(parsePubchiAnswerV1({ ...fixture, basis: 'graph', scope: graphScope }).ok).toBe(true);
    expect(parsePubchiAnswerV1({ ...fixture, basis: 'mixed', scope: graphScope }).ok).toBe(true);
    expect(parsePubchiAnswerV1({ ...fixture, basis: 'knowledge', scope: graphScope }).ok).toBe(false);
    expect(parsePubchiAnswerV1({ ...fixture, basis: 'model', scope: graphScope }).ok).toBe(false);
    expect(parsePubchiAnswerV1({ ...fixture, basis: 'web', scope: graphScope }).ok).toBe(false);
  });

  it('allows an omitted evidence section and parses C3 sections', () => {
    const result = parsePubchiAnswerV1({
      ...fixture,
      evidence: fixture.evidence.map((item, index) => ({
        ...item,
        ...(index === 0 ? { section: 'followed_posts' } : {}),
      })),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['extra key', { ...fixture, verdict: 'high' }],
    ['forbidden verdict', { ...fixture, evidence: fixture.evidence.map((item) => ({ ...item, verdict: 'high' })) }],
    [
      'too many items',
      {
        ...fixture,
        evidence: Array.from({ length: 51 }, (_, index) => ({ ...fixture.evidence[0], label: `item-${index}` })),
      },
    ],
    ['long summary', { ...fixture, summary: 'x'.repeat(1201) }],
    ['bad uri', { ...fixture, sources: ['https://example.com'] }],
    [
      'continuation extra key',
      {
        ...fixture,
        continuation: {
          since: '2026-09-10T06:00:00Z',
          until: '2026-09-10T07:00:00Z',
          complete: true,
          skipped: 0,
          extra: true,
        },
      },
    ],
    [
      'continuation non-ISO',
      { ...fixture, continuation: { since: 'yesterday', until: '2026-09-10T07:00:00Z', complete: true, skipped: 0 } },
    ],
    [
      'continuation complete string',
      {
        ...fixture,
        continuation: { since: '2026-09-10T06:00:00Z', until: '2026-09-10T07:00:00Z', complete: 'true', skipped: 0 },
      },
    ],
    ['scope extra key', invalidScopeFixture],
    ['unknown evidence section', invalidSectionFixture],
    ['empty basis', { ...fixture, basis: '' }],
    ['basis longer than 40', { ...fixture, basis: 'x'.repeat(41) }],
    ['non-string basis', { ...fixture, basis: 1 }],
  ])('rejects %s', (_, input) => {
    expect(parsePubchiAnswerV1(input).ok).toBe(false);
  });
});

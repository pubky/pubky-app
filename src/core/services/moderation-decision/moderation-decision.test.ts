import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModerationDecisionsUrl } from '@/config/moderation';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';
import { DECISIONS_PATH, ModerationDecisionService } from './moderation-decision';
import wire from './moderation-decision.wire.fixture.json';

vi.mock('@/config/moderation', () => ({ getModerationDecisionsUrl: vi.fn() }));
vi.mock('@/services/homeserver/homeserver', () => ({ HomeserverService: { createCustomPop: vi.fn() } }));

const mockFetch = vi.fn();
const ORIGIN = 'https://moderation.example';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('ModerationDecisionService.fetchDecisions', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', asOpaque<typeof fetch>(mockFetch));
    vi.mocked(getModerationDecisionsUrl).mockReturnValue(ORIGIN);
    vi.mocked(HomeserverService.createCustomPop).mockResolvedValue({ grant: 'aaa.bbb.ccc', pop: 'ddd.eee.fff' });
    warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('signs exactly the data the moderation service requires and sends the proof without ambient credentials', async () => {
    mockFetch.mockResolvedValue(json({ decisions: [] }));

    await ModerationDecisionService.fetchDecisions();

    expect(DECISIONS_PATH).toBe('/v1/decisions');
    // The service (pubky-moderation `decisions::auth::expected_data`) accepts nothing else.
    expect(HomeserverService.createCustomPop).toHaveBeenCalledWith({
      aud: 'pubky-moderation',
      method: 'GET',
      path: '/v1/decisions',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      new URL(`${ORIGIN}/v1/decisions`),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Pubky-Pop grant=aaa.bbb.ccc, pop=ddd.eee.fff' },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('joins the path to an origin that has a trailing slash', async () => {
    vi.mocked(getModerationDecisionsUrl).mockReturnValue(`${ORIGIN}/`);
    mockFetch.mockResolvedValue(json({ decisions: [] }));

    await ModerationDecisionService.fetchDecisions();

    expect(mockFetch).toHaveBeenCalledWith(new URL(`${ORIGIN}/v1/decisions`), expect.anything());
  });

  it('reads every statement the service sent, as it sent them', async () => {
    mockFetch.mockResolvedValue(
      json({ decisions: [wire.content_visibility_restricted, wire.content_removed, wire.account_disabled] }),
    );

    const result = await ModerationDecisionService.fetchDecisions();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.decisions.map((decision) => decision?.restriction)).toEqual([
      'content_visibility_restricted',
      'content_removed',
      'account_disabled',
    ]);
    expect(result.decisions[0]).toEqual({
      id: wire.content_visibility_restricted.id,
      restriction: 'content_visibility_restricted',
      targetUri: wire.content_visibility_restricted.target_uri,
      territorialScope: 'Everywhere pubky.app is offered',
      endsAt: null,
      decidedAt: wire.content_visibility_restricted.decided_at,
      basis: 'own_initiative',
      facts: wire.content_visibility_restricted.facts,
      automatedDetection: true,
      automatedDecision: true,
      automatedMeans: wire.content_visibility_restricted.automated_means,
      ground: 'terms',
      groundReference: wire.content_visibility_restricted.ground_reference,
      explanation: wire.content_visibility_restricted.explanation,
    });
    expect(result.decisions[2]).toMatchObject({ restriction: 'account_disabled', targetUri: null });
  });

  it('keeps a statement it cannot read as a null entry, in place', async () => {
    mockFetch.mockResolvedValue(
      json({
        decisions: [
          wire.content_removed,
          { ...wire.content_removed, id: 'not-a-uuid' },
          { ...wire.content_removed, restriction: 'a_restriction_from_the_future' },
          { ...wire.content_removed, automated_means: null },
          'nonsense',
          wire.account_disabled,
        ],
      }),
    );

    const result = await ModerationDecisionService.fetchDecisions();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.decisions.map((decision) => decision?.restriction ?? null)).toEqual([
      'content_removed',
      null,
      null,
      null,
      null,
      'account_disabled',
    ]);
  });

  it('ignores statements beyond the 100 the service returns', async () => {
    mockFetch.mockResolvedValue(json({ decisions: Array.from({ length: 150 }, () => wire.content_removed) }));

    const result = await ModerationDecisionService.fetchDecisions();

    expect(result.status === 'ready' && result.decisions.length).toBe(100);
  });

  it('logs the name of a failure, never the error itself', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch Authorization: Pubky-Pop grant=aaa.bbb.ccc'));

    await ModerationDecisionService.fetchDecisions();

    expect(warn).toHaveBeenCalledWith(expect.any(String), { name: 'TypeError' });
  });

  it('is ready and empty for a user with no statements', async () => {
    mockFetch.mockResolvedValue(json({ decisions: [] }));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'ready', decisions: [] });
  });

  it('asks nothing when no moderation service is configured', async () => {
    vi.mocked(getModerationDecisionsUrl).mockReturnValue(undefined);

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
    expect(HomeserverService.createCustomPop).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('asks nothing without a grant session to sign with', async () => {
    vi.mocked(HomeserverService.createCustomPop).mockResolvedValue(null);

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is unavailable, not an error, when signing fails', async () => {
    vi.mocked(HomeserverService.createCustomPop).mockRejectedValue(new Error('no signer'));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 500, 503])('is unavailable for HTTP %i and logs the status', async (status) => {
    mockFetch.mockResolvedValue(new Response('no', { status }));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unexpected status'), { status });
  });

  it.each([
    ['a body without decisions', { items: [] }],
    ['decisions that are not a list', { decisions: 'none' }],
    ['null', null],
    ['an array', []],
  ])('is unavailable for %s', async (_label, body) => {
    mockFetch.mockResolvedValue(json(body));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable for a body that is not JSON', async () => {
    mockFetch.mockResolvedValue(new Response('<html></html>', { status: 200 }));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the network fails', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(ModerationDecisionService.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
  });

  it('gives up after eight seconds', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = ModerationDecisionService.fetchDecisions();
    await vi.advanceTimersByTimeAsync(8000);

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
  });
});

import { buildBookmark, buildFeed, buildTag, buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import answer from './schemas/__fixtures__/answer.valid.json';
import { parsePubchiAnswerV1 } from './schemas/answer';
import { parsePubchiAskBody } from './schemas/ask-body';
import { parseQueryResultV1 } from './schemas/query';
import { parsePubchiTarget, pubkyUriToAppHref } from './uri';

const owner = '4bfmrcuwfq4ksqoupn6wcfxrh5enr1izdeyszmhfrntuf1mzoh5o';
const other = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';
const id = '0032W6CBGDBP0';
const post = buildUri(owner, 'post', id);
const profile = buildUri(owner, 'user');
const tag = buildTag(other, profile, 'builder');
const question = 'Suggest tags';

describe('Pubchi social v1 references', () => {
  it('binds only the exact public reference to a target', () => {
    expect(parsePubchiTarget({ kind: 'post', uri: post })).toEqual({ kind: 'post', owner, id });
    expect(parsePubchiTarget({ kind: 'user', uri: profile })).toEqual({ kind: 'user', owner });
    expect(parsePubchiAskBody({ question, target: { kind: 'post', uri: post } }).ok).toBe(true);
    for (const uri of [profile, `${post}/${id}.json`, post.replace('/pub/', '/priv/'), `${post}?v=1`]) {
      expect(parsePubchiAskBody({ question, target: { kind: 'post', uri } }).ok).toBe(false);
    }
    expect(parsePubchiTarget({ kind: 'user', uri: `pubky://${owner}` })).toBeNull();
  });

  it('routes public post versions to the underlying post', () => {
    expect(pubkyUriToAppHref(`${post}/${id}.json`)).toBe(`/post/${owner}/${id}`);
    expect(pubkyUriToAppHref(post)).toBe(`/post/${owner}/${id}`);
  });

  it('only accepts public social evidence and keeps the query subject owner-bound', () => {
    const result = (source: string, subject: string = profile) =>
      parseQueryResultV1({
        schema: 'pubchi-query-result',
        version: 1,
        bot: other,
        owner,
        generated_at: 10,
        run_id: 'test',
        purpose: 'who-tagged-me',
        scope_owner: owner,
        items: [{ label: 'builder', source_uri: source, subject_uri: subject, claimant_count: 1 }],
        tool_trace_summary: { tools: [], call_count: 0, truncated: false },
        policy_version: 1,
      });
    expect(result(tag.url).ok).toBe(true);
    expect(result(tag.url, buildUri(other, 'user')).ok).toBe(false);
    const feed = buildFeed(owner, {
      name: 'Builders',
      icon: 'activity',
      reach: 'all',
      layout: 'columns',
      sort: 'recent',
    });
    for (const uri of [buildUri(owner, 'mute', other), buildBookmark(owner, post).url, feed.url]) {
      expect(result(uri).ok).toBe(false);
      expect(parsePubchiAnswerV1({ ...answer, sources: [uri] }).ok).toBe(false);
      expect(parsePubchiAnswerV1({ ...answer, evidence: [{ ...answer.evidence[0], uri }] }).ok).toBe(false);
      expect(pubkyUriToAppHref(uri)).toBeNull();
    }
  });
});

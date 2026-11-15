import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/answer.valid.json';
import { parsePubchiAnswerV1 } from './answer';
import { parseBySchema } from './parse';
import {
  isPubkyAppResourceUri,
  parsePubchiSuggestionV1,
  PUBCHI_SUGGESTION_TTL_SECONDS,
  suggestionFromAnswer,
} from './suggestion';

const parsedAnswer = parsePubchiAnswerV1(fixture);
if (!parsedAnswer.ok) throw new Error('answer fixture must parse');
const answer = parsedAnswer.value;

const nowSeconds = 1_780_000_000;
const suggestionId = 'what-i-missed-20260921';

function validSuggestion() {
  const built = suggestionFromAnswer(answer, { suggestionId, nowSeconds });
  if (!built) throw new Error('fixture answer must produce a suggestion');
  return built;
}

describe('pubchi suggestion schema', () => {
  it('maps a captured answer onto the design suggestions/ object', () => {
    const suggestion = validSuggestion();
    expect(suggestion).toMatchObject({
      schema: 'pubchi-suggestion',
      version: 1,
      bot: answer.bot,
      owner: answer.owner,
      suggestion_id: suggestionId,
      kind: 'what-i-missed',
      run_id: answer.run_id,
      summary: answer.summary,
    });
    expect(suggestion.source_uris).toEqual([
      'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/profile.json',
    ]);
    expect(suggestion.expires_at).toBe(nowSeconds + PUBCHI_SUGGESTION_TTL_SECONDS);
    expect(parsePubchiSuggestionV1(suggestion)).toEqual({ ok: true, value: suggestion });
    expect(parseBySchema(suggestion)).toEqual({ ok: true, value: suggestion });
  });

  it('rejects extra fields, private URIs, and inverted expiry', () => {
    const suggestion = validSuggestion();
    expect(parsePubchiSuggestionV1({ ...suggestion, prompt: 'secret ask' })).toMatchObject({ ok: false });
    expect(
      parsePubchiSuggestionV1({
        ...suggestion,
        source_uris: [`pubky://${suggestion.owner}/priv/app.pubchi/v1/cursor.json`],
      }),
    ).toMatchObject({ ok: false });
    expect(parsePubchiSuggestionV1({ ...suggestion, expires_at: suggestion.updated_at })).toMatchObject({ ok: false });
  });

  it('does not map an answer with no public pubky.app sources', () => {
    expect(
      suggestionFromAnswer(
        { ...answer, evidence: [], sources: ['https://nexus.example/v0/posts/1'] },
        { suggestionId, nowSeconds },
      ),
    ).toBeNull();
    expect(isPubkyAppResourceUri(answer.evidence[0].uri)).toBe(true);
    expect(isPubkyAppResourceUri(`pubky://${answer.owner}/pub/app.pubchi/v1/config.json`)).toBe(false);
  });
});

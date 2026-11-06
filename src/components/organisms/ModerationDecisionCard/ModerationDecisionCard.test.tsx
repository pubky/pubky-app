import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  moderationDecisionSchema,
  type TModerationDecision,
} from '@/services/moderation-decision/moderation-decision.types';
import wire from '@/services/moderation-decision/moderation-decision.wire.fixture.json';
import { moderationAppealHref, ModerationDecisionCard } from './ModerationDecisionCard';

/** Statements exactly as the moderation service sent them (see the fixture's capture note in the service test). */
const tagged = moderationDecisionSchema.parse(wire.content_visibility_restricted);
const removed = moderationDecisionSchema.parse(wire.content_removed);
const disabled = moderationDecisionSchema.parse(wire.account_disabled);

const text = (testId: string) => screen.getByTestId(testId).textContent;

describe('ModerationDecisionCard', () => {
  it('shows every Art. 17(3) element of a tagged post', () => {
    render(<ModerationDecisionCard decision={tagged} />);

    expect(screen.getByRole('heading', { name: 'Moderation decision' })).toBeInTheDocument();
    expect(text('moderation-decision-restriction')).toContain('We restricted the visibility of your content.');
    expect(screen.getByText('Everywhere pubky.app is offered')).toBeInTheDocument();
    expect(text('moderation-decision-duration')).toBe('Until the decision is lifted');
    expect(text('moderation-decision-ground')).toBe(`It breaks our Terms: ${tagged.groundReference}.`);
    expect(screen.getByText(tagged.explanation)).toBeInTheDocument();
    expect(text('moderation-decision-basis')).toBe('We found this in our own review.');
    expect(screen.getByText(tagged.facts)).toBeInTheDocument();
    expect(text('moderation-decision-automation')).toBe('Automated means detected this and took the decision.');
    expect(screen.getByText(tagged.automatedMeans ?? '')).toBeInTheDocument();
    expect(text('moderation-decision-reference')).toBe(tagged.id);
  });

  it('links a tagged post to the post, and nothing else to a post', () => {
    const { unmount } = render(<ModerationDecisionCard decision={tagged} />);
    const postId = tagged.targetUri?.split('/').pop();
    const author = tagged.targetUri?.split('/')[2];
    expect(screen.getByRole('link', { name: 'View the post' })).toHaveAttribute('href', `/post/${author}/${postId}`);
    unmount();

    render(<ModerationDecisionCard decision={removed} />);
    expect(screen.queryByRole('link', { name: 'View the post' })).not.toBeInTheDocument();
  });

  it('says the content was deleted, and that the person decided, for a removal', () => {
    render(<ModerationDecisionCard decision={removed} />);

    expect(text('moderation-decision-restriction')).toBe(
      'We deleted your content from our homeserver. It no longer exists there.',
    );
    expect(text('moderation-decision-automation')).toBe(
      'Automated means detected this. A person on the moderation team took the decision.',
    );
  });

  it('says the account was disabled', () => {
    render(<ModerationDecisionCard decision={disabled} />);

    expect(text('moderation-decision-restriction')).toContain('We disabled your account on our homeserver.');
    expect(text('moderation-decision-ground')).toContain('Termination and No Liability for Termination');
  });

  it('offers the appeal by email with the reference in the subject, and the other redress', () => {
    render(<ModerationDecisionCard decision={tagged} />);

    const appeal = screen.getByTestId('moderation-decision-appeal');
    expect(appeal).toHaveAttribute(
      'href',
      `mailto:report@synonym.to?subject=${encodeURIComponent(`Appeal ${tagged.id}`)}`,
    );
    expect(appeal).toHaveTextContent('Appeal this decision');
    expect(
      screen.getByText(/report@synonym\.to with “Appeal” and the reference below in the subject/),
    ).toBeInTheDocument();
    expect(screen.getByText(/certified out-of-court dispute settlement body, or to a court/)).toBeInTheDocument();
  });

  it('states an end date when the decision has one', () => {
    const until: TModerationDecision = { ...tagged, endsAt: '2026-12-01T00:00:00Z' };
    render(<ModerationDecisionCard decision={until} />);

    expect(text('moderation-decision-duration')).toMatch(/^Until .*2026/);
  });

  it('describes a legal ground by its reference', () => {
    const illegal: TModerationDecision = {
      ...removed,
      ground: 'illegal_content',
      groundReference: 'Directive 2011/93/EU, Articles 3 to 7',
    };
    render(<ModerationDecisionCard decision={illegal} />);

    expect(text('moderation-decision-ground')).toBe(
      'It is illegal content under Directive 2011/93/EU, Articles 3 to 7.',
    );
  });

  it('describes a decision taken on a report', () => {
    render(<ModerationDecisionCard decision={{ ...removed, basis: 'notice' }} />);

    expect(text('moderation-decision-basis')).toBe('We acted on a report.');
  });

  it.each([
    [
      { automatedDetection: false, automatedDecision: false },
      /^A person on the moderation team found this and took the decision\. No automated means were used\.$/,
    ],
    [
      { automatedDetection: false, automatedDecision: true },
      /^A person found this\. The decision was taken by automated means\.$/,
    ],
  ])('describes the automation %j', (flags, expected) => {
    render(
      <ModerationDecisionCard
        decision={{ ...removed, ...flags, automatedMeans: flags.automatedDecision ? 'x' : null }}
      />,
    );

    expect(text('moderation-decision-automation')).toMatch(expected);
  });

  it('still points to the appeal route when a statement could not be read', () => {
    render(<ModerationDecisionCard decision={null} />);

    const card = screen.getByTestId('moderation-decision-card');
    expect(within(card).getByTestId('moderation-decision-unreadable')).toHaveTextContent(
      'report@synonym.to with “Appeal” in the subject, within six months of the decision',
    );
    expect(within(card).getByTestId('moderation-decision-appeal')).toHaveAttribute(
      'href',
      'mailto:report@synonym.to?subject=Appeal',
    );
    expect(within(card).queryByTestId('moderation-decision-reference')).not.toBeInTheDocument();
  });
});

describe('moderationAppealHref', () => {
  it('encodes the subject', () => {
    expect(moderationAppealHref('a b')).toBe('mailto:report@synonym.to?subject=Appeal%20a%20b');
    expect(moderationAppealHref(null)).toBe('mailto:report@synonym.to?subject=Appeal');
  });
});

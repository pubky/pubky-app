import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { POST_ROUTES } from '@/app/routes';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { COMPLAINT_EMAIL } from '@/config/moderation';
import type { TModerationDecision } from '@/services/moderation-decision/moderation-decision.types';

const RESTRICTION_COPY: Record<TModerationDecision['restriction'], string> = {
  content_visibility_restricted:
    'We restricted the visibility of your content. Other people see it behind a notice, or do not see it in feeds and search. It is not deleted from your homeserver.',
  content_removed: 'We deleted your content from our homeserver. It no longer exists there.',
  account_disabled:
    'We disabled your account on our homeserver. It refuses requests from your account until the decision is lifted.',
};

const GROUND_COPY: Record<TModerationDecision['ground'], (reference: string) => string> = {
  terms: (reference) => `It breaks our Terms: ${reference}.`,
  illegal_content: (reference) => `It is illegal content under ${reference}.`,
};

const BASIS_COPY: Record<TModerationDecision['basis'], string> = {
  notice: 'We acted on a report.',
  own_initiative: 'We found this in our own review.',
};

const OTHER_REDRESS =
  'You can also take the decision to a certified out-of-court dispute settlement body, or to a court.';
const POST_URI_PATTERN = /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\/posts\/([0-9A-Z]{13})$/;

/**
 * How the decision was taken. The basis line already says whether a report started it, so a decision on a report
 * never claims that a person found the content.
 */
function automationCopy(
  decision: Pick<TModerationDecision, 'automatedDetection' | 'automatedDecision' | 'basis'>,
): string {
  const found = decision.basis === 'own_initiative';
  if (decision.automatedDetection && decision.automatedDecision)
    return 'Automated means detected this and took the decision.';
  if (decision.automatedDetection)
    return 'Automated means detected this. A person on the moderation team took the decision.';
  if (decision.automatedDecision)
    return `${found ? 'A person found this. ' : ''}The decision was taken by automated means.`;
  return found
    ? 'A person on the moderation team found this and took the decision. No automated means were used.'
    : 'A person on the moderation team took the decision. No automated means were used.';
}

/** The appeal email, with the decision's reference in the subject when it is known. */
export function moderationAppealHref(reference: string | null): string {
  const subject = reference === null ? 'Appeal' : `Appeal ${reference}`;
  return `mailto:${COMPLAINT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Where a restricted post can be opened, or null for anything else. */
function restrictedPostHref(decision: TModerationDecision): string | null {
  if (decision.restriction !== 'content_visibility_restricted' || decision.targetUri === null) return null;
  const match = POST_URI_PATTERN.exec(decision.targetUri);
  return match ? `${POST_ROUTES.POST}/${match[1]}/${match[2]}` : null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Typography as="h3" size="sm" className="font-semibold">
        {label}
      </Typography>
      {children}
    </div>
  );
}

function Body({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Typography as="p" size="sm" className="whitespace-pre-line text-muted-foreground" data-testid={testId}>
      {children}
    </Typography>
  );
}

function AppealLink({ reference }: { reference: string | null }) {
  return (
    <a
      href={moderationAppealHref(reference)}
      className="cursor-pointer text-sm text-brand transition-colors hover:text-brand/80"
      data-testid="moderation-decision-appeal"
    >
      Appeal this decision
    </a>
  );
}

/**
 * The statement of reasons for something moderation restricted (EU Digital Services Act Art. 17(3)): what was
 * done, where and for how long, when, why and on what facts, whether automated means were used, and how to
 * contest it. `decision` is null when the service sent a statement this build cannot read; the card then still
 * points to the appeal route.
 */
export function ModerationDecisionCard({ decision }: { decision: TModerationDecision | null }) {
  return (
    <Card className="gap-0 rounded-md p-0" data-testid="moderation-decision-card">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-amber-500/15 p-3 text-amber-600">
            <ShieldAlert className="size-5" />
          </div>
          <Typography as="h2" className="font-semibold">
            Moderation decision
          </Typography>
          {decision ? (
            <time dateTime={decision.decidedAt} className="ml-auto text-xs text-muted-foreground">
              {formatDateTime(decision.decidedAt)}
            </time>
          ) : null}
        </div>
        {decision ? <DecisionDetails decision={decision} /> : <UnreadableDetails />}
      </CardContent>
    </Card>
  );
}

function UnreadableDetails() {
  return (
    <>
      <Body testId="moderation-decision-unreadable">
        {`We sent you a moderation decision that this version of the app cannot show. Email ${COMPLAINT_EMAIL} with “Appeal” in the subject, within six months of the decision, to receive it or to contest it.`}
      </Body>
      <AppealLink reference={null} />
      <Body>{OTHER_REDRESS}</Body>
    </>
  );
}

function DecisionDetails({ decision }: { decision: TModerationDecision }) {
  const postHref = restrictedPostHref(decision);
  return (
    <>
      <Section label="What we did">
        <Body testId="moderation-decision-restriction">{RESTRICTION_COPY[decision.restriction]}</Body>
        {postHref ? (
          <Link href={postHref} className="text-sm">
            View the post
          </Link>
        ) : null}
      </Section>
      <Section label="Where it applies">
        <Body>{decision.territorialScope}</Body>
      </Section>
      <Section label="For how long">
        <Body testId="moderation-decision-duration">
          {decision.endsAt ? `Until ${formatDateTime(decision.endsAt)}` : 'Until the decision is lifted'}
        </Body>
      </Section>
      <Section label="Why">
        <Body testId="moderation-decision-ground">{GROUND_COPY[decision.ground](decision.groundReference)}</Body>
        <Body>{decision.explanation}</Body>
      </Section>
      <Section label="What we relied on">
        <Body testId="moderation-decision-basis">{BASIS_COPY[decision.basis]}</Body>
        <Body>{decision.facts}</Body>
      </Section>
      <Section label="How it was decided">
        <Body testId="moderation-decision-automation">{automationCopy(decision)}</Body>
        {decision.automatedMeans ? <Body>{decision.automatedMeans}</Body> : null}
      </Section>
      <Section label="If you disagree">
        <Body>
          {`Email ${COMPLAINT_EMAIL} with “Appeal” and the reference below in the subject, within six months of this decision. Someone who did not take the decision reviews your appeal, and we reverse the decision if it was wrong.`}
        </Body>
        <AppealLink reference={decision.id} />
        <Body>{OTHER_REDRESS}</Body>
      </Section>
      <Section label="Reference">
        <Body testId="moderation-decision-reference">{decision.id}</Body>
      </Section>
    </>
  );
}

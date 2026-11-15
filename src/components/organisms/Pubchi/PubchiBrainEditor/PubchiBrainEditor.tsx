'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@synonymdev/pubky';
import { Brain, Lock } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import type { PubchiOwnerContextV1 } from '@/libs/pubchi/schemas/context';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas/forbidden';
import { toast } from '@/molecules/Toaster/toast';
import { RingApprovalDialog } from '@/organisms/RingApprovalDialog/RingApprovalDialog';

export const PUBCHI_BRAIN_EDITOR_SURFACE = 'pubchi-brain-editor';

type PubchiBrainEditorProps = {
  context?: PubchiOwnerContextV1 | null;
  contextEditable?: boolean;
  saving?: boolean;
  onSaveContext?: (context: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>) => void | Promise<unknown>;
  onReapprove?: (session?: Session) => void | Promise<unknown>;
  onRequestReapprove?: () => void;
};

export function PubchiBrainEditor({
  context,
  contextEditable = true,
  saving = false,
  onSaveContext,
  onReapprove,
  onRequestReapprove,
}: PubchiBrainEditorProps) {
  const [draft, setDraft] = useState({ about: context?.about ?? '', instructions: context?.instructions ?? '' });
  const [contextError, setContextError] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  useEffect(() => {
    setDraft({ about: context?.about ?? '', instructions: context?.instructions ?? '' });
  }, [context]);

  function changeContext(field: 'about' | 'instructions', value: string) {
    const next = { ...draft, [field]: value };
    const safe = scanForbiddenPublicState(next).ok;
    setContextError(!safe);
    if (safe) setDraft(next);
  }

  return (
    <section
      className="flex flex-col gap-5"
      data-surface={PUBCHI_BRAIN_EDITOR_SURFACE}
      data-testid={PUBCHI_BRAIN_EDITOR_SURFACE}
    >
      <div className="flex items-start gap-3">
        <Brain aria-hidden="true" className="mt-1 size-5 shrink-0" />
        <div>
          <Typography size="lg" className="font-semibold">
            Your Pubchi&apos;s brain
          </Typography>
          <Typography className="mt-1 text-muted-foreground">
            Your Pubchi reads these before every answer: who you are and what you care about, and how you want it to
            talk to you — length, tone, language, and topics to always cover.
          </Typography>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <Lock aria-hidden="true" className="size-4" />
          <Typography className="font-medium">Private context</Typography>
        </div>
        <Typography size="sm" className="mt-1 text-muted-foreground">
          Stored in your homeserver&apos;s private area and sent to the Pubchi service inside signed requests. It can
          influence answers, contextual tag suggestions, and feed building. It is not published to your public profile.
        </Typography>
      </div>
      {!contextEditable ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="pubchi-brain-gate">
          <Typography size="sm">
            Your current sign-in doesn&apos;t include the private Pubchi folder; re-approve in Ring once to unlock
            editing.
          </Typography>
          <Button
            type="button"
            variant="outline"
            disabled={saving || (!onReapprove && !onRequestReapprove)}
            onClick={() => (onRequestReapprove ? onRequestReapprove() : setApprovalOpen(true))}
          >
            Re-approve in Ring
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pubchi-context-about">About you</Label>
          <Typography size="sm" className="text-muted-foreground">
            A few lines about you (role, interests). Used to personalise answers.
          </Typography>
          <textarea
            id="pubchi-context-about"
            value={draft.about}
            onChange={(event) => changeContext('about', event.target.value)}
            maxLength={1500}
            readOnly={!contextEditable}
            placeholder="Bitcoin developer in Lisbon; care about Lightning, self-custody, Pubky."
            className="min-h-24 rounded-md border bg-background p-3 text-sm"
          />
          <Typography size="xs" className="text-muted-foreground">
            {Array.from(draft.about).length}/1500
          </Typography>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pubchi-context-instructions">How to answer</Label>
          <Typography size="sm" className="text-muted-foreground">
            Style rules for replies (tone, length, language).
          </Typography>
          <textarea
            id="pubchi-context-instructions"
            value={draft.instructions}
            onChange={(event) => changeContext('instructions', event.target.value)}
            maxLength={1000}
            readOnly={!contextEditable}
            placeholder="Two sentences max. Mention Lightning when relevant. Portuguese is fine."
            className="min-h-24 rounded-md border bg-background p-3 text-sm"
          />
          <Typography size="xs" className="text-muted-foreground">
            {Array.from(draft.instructions).length}/1000
          </Typography>
        </div>
        {contextError ? (
          <Typography size="sm" className="text-destructive">
            That value looks like a secret or key and cannot be saved.
          </Typography>
        ) : null}
        <div className="rounded-lg border border-border p-4" data-testid="pubchi-brain-preview">
          <Typography className="font-medium">How your Pubchi will answer</Typography>
          <Typography size="sm" className="mt-1 text-muted-foreground">
            Example question: What are people saying about bitcoin this week?
          </Typography>
          <Typography size="sm" className="mt-3">
            {previewAnswer(draft.instructions)}
          </Typography>
          <Typography size="xs" className="mt-2 text-muted-foreground">
            Example, generated locally
          </Typography>
        </div>
        {contextEditable ? (
          <Button
            type="button"
            disabled={saving || contextError || !onSaveContext}
            onClick={() =>
              void Promise.resolve(onSaveContext?.(draft)).catch(() => {
                toast({ variant: 'error', title: 'Could not save private context', dismissButton: true });
              })
            }
          >
            Save private context
          </Button>
        ) : null}
      </div>
      {onReapprove && !onRequestReapprove ? (
        <RingApprovalDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          onApproved={(session) => onReapprove(session)}
        />
      ) : null}
    </section>
  );
}

function previewAnswer(instructions: string): string {
  const sentenceMatch = instructions.match(/\b(one|two|three)\s+sentences?\b/i);
  const sentenceCount = sentenceMatch?.[1]?.toLowerCase();
  const sentenceCopy = sentenceCount
    ? `I’ll keep this to ${sentenceCount} sentences.`
    : 'I’ll answer clearly and directly.';
  const languageMatch = instructions.match(/\b(Portuguese|Spanish|French|German|English)\b/i);
  const languageCopy = languageMatch ? ` I’ll use ${languageMatch[1]} when appropriate.` : '';
  return `${sentenceCopy}${languageCopy} I’ll summarize the discussion and highlight the signal that matters to you.`;
}

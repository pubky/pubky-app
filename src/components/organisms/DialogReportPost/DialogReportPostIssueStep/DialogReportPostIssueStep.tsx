'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { REPORT_ISSUE_LABELS, REPORT_ISSUE_TYPE_VALUES, REPORT_ISSUE_TYPES } from '@/pipes/report/report.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';
import { ISSUE_TYPE_ICONS } from './DialogReportPostIssueStep.constants';
import type { DialogReportPostIssueStepProps } from './DialogReportPostIssueStep.types';

export function DialogReportPostIssueStep({
  onSelectIssueType,
  onCancel,
  onOpenChange,
}: DialogReportPostIssueStepProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<ReportIssueType | null>(null);
  const handleSelect = (issueType: ReportIssueType) => {
    setSelectedType(issueType);
  };
  const handleNext = () => {
    if (!selectedType) return;

    // If copyright infringement is selected, redirect to /copyright page
    if (selectedType === REPORT_ISSUE_TYPES.COPYRIGHT) {
      onOpenChange?.(false);
      router.push('/copyright');
      return;
    }

    // Otherwise, proceed with normal flow
    onSelectIssueType(selectedType);
  };
  return (
    <>
      <DialogHeader className="pr-0">
        <DialogTitle>{'Report Post'}</DialogTitle>
        <DialogDescription className="leading-5">{'What sort of issue are you reporting?'}</DialogDescription>
      </DialogHeader>

      <Container className="gap-2" role="listbox" aria-label={'Issue types'}>
        {REPORT_ISSUE_TYPE_VALUES.map((issueType) => {
          const Icon = ISSUE_TYPE_ICONS[issueType as ReportIssueType];
          const isSelected = selectedType === issueType;
          const label = REPORT_ISSUE_LABELS[issueType as ReportIssueType];
          return (
            <Button
              key={issueType}
              data-cy={`report-issue-${issueType}`}
              variant="ghost"
              role="option"
              aria-selected={isSelected}
              aria-label={label}
              className={cn(
                'h-6 w-full min-w-0 justify-start gap-2 rounded-sm p-0 text-muted-foreground shadow-none has-[>svg]:px-0',
                isSelected && 'text-popover-foreground',
              )}
              onClick={() => handleSelect(issueType as ReportIssueType)}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <Typography as="span" size="md" className="min-w-0 flex-1 truncate text-left text-inherit">
                {label}
              </Typography>
              {isSelected && <Check className="size-5 shrink-0" aria-hidden="true" />}
            </Button>
          );
        })}
      </Container>

      <DialogFooter>
        <Button
          data-cy="report-issue-step-cancel"
          variant="outline"
          className="border-border bg-foreground/5 font-bold"
          onClick={onCancel}
          aria-label={'Cancel'}
        >
          {'Cancel'}
        </Button>
        <Button
          data-cy="report-issue-step-next"
          variant="default"
          className="font-bold"
          onClick={handleNext}
          disabled={!selectedType}
          aria-label={'Continue'}
        >
          {'Continue'}
        </Button>
      </DialogFooter>
    </>
  );
}

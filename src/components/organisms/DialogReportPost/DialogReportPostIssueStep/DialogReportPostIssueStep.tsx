'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { REPORT_ISSUE_LABEL_KEYS, REPORT_ISSUE_TYPE_VALUES, REPORT_ISSUE_TYPES } from '@/pipes/report/report.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';
import { ISSUE_TYPE_ICONS } from './DialogReportPostIssueStep.constants';
import type { DialogReportPostIssueStepProps } from './DialogReportPostIssueStep.types';

export function DialogReportPostIssueStep({
  onSelectIssueType,
  onCancel,
  onOpenChange,
}: DialogReportPostIssueStepProps) {
  const t = useTranslations('report');
  const tIssues = useTranslations('report.issues');
  const tCommon = useTranslations('common');
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
      <DialogHeader>
        <DialogTitle>{t('issueStep.title')}</DialogTitle>
        <DialogDescription>{t('issueStep.question')}</DialogDescription>
      </DialogHeader>

      <Container className="gap-1 py-2" role="listbox" aria-label={t('issueStep.label')}>
        {REPORT_ISSUE_TYPE_VALUES.map((issueType) => {
          const Icon = ISSUE_TYPE_ICONS[issueType as ReportIssueType];
          const isSelected = selectedType === issueType;
          const labelKey = REPORT_ISSUE_LABEL_KEYS[issueType as ReportIssueType];
          const label = tIssues(labelKey);
          return (
            <Button
              key={issueType}
              data-cy={`report-issue-${issueType}`}
              variant="ghost"
              role="option"
              aria-selected={isSelected}
              aria-label={label}
              className={cn(
                'h-auto w-full justify-start gap-3 rounded-lg px-3 py-3 hover:bg-muted',
                isSelected && 'bg-muted',
              )}
              onClick={() => handleSelect(issueType as ReportIssueType)}
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Typography as="span" size="sm" className="flex-1 text-left text-foreground">
                {label}
              </Typography>
              {isSelected && <Check className="size-5 shrink-0 text-foreground" aria-hidden="true" />}
            </Button>
          );
        })}
      </Container>

      <DialogFooter>
        <Button
          data-cy="report-issue-step-cancel"
          variant="secondary"
          size="lg"
          onClick={onCancel}
          aria-label={tCommon('cancel')}
        >
          {tCommon('cancel')}
        </Button>
        <Button
          data-cy="report-issue-step-next"
          variant="dark-outline"
          size="lg"
          onClick={handleNext}
          disabled={!selectedType}
          aria-label={tCommon('next')}
        >
          {tCommon('next')}
        </Button>
      </DialogFooter>
    </>
  );
}

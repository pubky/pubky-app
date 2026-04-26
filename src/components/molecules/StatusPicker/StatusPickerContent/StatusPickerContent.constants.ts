import { STATUS_EMOJIS, STATUS_LABELS } from '@/libs/status/status.constants';

/**
 * Predefined status options available in the status picker
 */
export const STATUS_OPTIONS = [
  { value: 'available', label: STATUS_LABELS.available, emoji: STATUS_EMOJIS.available },
  { value: 'away', label: STATUS_LABELS.away, emoji: STATUS_EMOJIS.away },
  { value: 'vacationing', label: STATUS_LABELS.vacationing, emoji: STATUS_EMOJIS.vacationing },
  { value: 'working', label: STATUS_LABELS.working, emoji: STATUS_EMOJIS.working },
  { value: 'traveling', label: STATUS_LABELS.traveling, emoji: STATUS_EMOJIS.traveling },
  { value: 'celebrating', label: STATUS_LABELS.celebrating, emoji: STATUS_EMOJIS.celebrating },
  { value: 'sick', label: STATUS_LABELS.sick, emoji: STATUS_EMOJIS.sick },
  { value: 'noStatus', label: STATUS_LABELS.noStatus, emoji: STATUS_EMOJIS.noStatus },
] as const;

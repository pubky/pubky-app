'use client';

import { ButtonWithTooltip, readOnly$ } from '@mdxeditor/editor';
import { useCellValue, usePublisher } from '@mdxeditor/gurx';
import { FileText, type LucideIcon, Music, Video } from 'lucide-react';
import type { InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';
import { openNewInlineMediaDialog$ } from './inlineMediaPlugin';

const BUTTONS: Record<InlineNonImageMediaKind, { title: string; Icon: LucideIcon }> = {
  video: { title: 'Video', Icon: Video },
  audio: { title: 'Audio', Icon: Music },
  pdf: { title: 'PDF', Icon: FileText },
};

/** Rich-text toolbar button that opens the insert dialog for one non-image media kind, next to `InsertImage`. */
export function InsertInlineMediaButton({ mediaKind }: { mediaKind: InlineNonImageMediaKind }) {
  const readOnly = useCellValue(readOnly$);
  const openDialog = usePublisher(openNewInlineMediaDialog$);
  const { title, Icon } = BUTTONS[mediaKind];

  return (
    <ButtonWithTooltip
      title={title}
      disabled={readOnly}
      onClick={() => openDialog(mediaKind)}
      data-testid={`insert-inline-${mediaKind}`}
    >
      <Icon className="size-6" />
    </ButtonWithTooltip>
  );
}

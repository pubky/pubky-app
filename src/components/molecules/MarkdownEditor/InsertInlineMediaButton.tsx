'use client';

import { ButtonWithTooltip, readOnly$ } from '@mdxeditor/editor';
import { useCellValue, usePublisher } from '@mdxeditor/gurx';
import type { InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';
import { INLINE_MEDIA_KIND_UI } from './InitializedMDXEditor.constants';
import { openNewInlineMediaDialog$ } from './inlineMediaPlugin';

/** Rich-text toolbar button that opens the insert dialog for one non-image media kind, next to `InsertImage`. */
export function InsertInlineMediaButton({ mediaKind }: { mediaKind: InlineNonImageMediaKind }) {
  const readOnly = useCellValue(readOnly$);
  const openDialog = usePublisher(openNewInlineMediaDialog$);
  const { label, Icon } = INLINE_MEDIA_KIND_UI[mediaKind];

  return (
    <ButtonWithTooltip
      title={label}
      disabled={readOnly}
      onClick={() => openDialog(mediaKind)}
      data-testid={`insert-inline-${mediaKind}`}
    >
      <Icon className="size-6" />
    </ButtonWithTooltip>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import { readOnly$ } from '@mdxeditor/editor';
import { useCellValues, usePublisher } from '@mdxeditor/gurx';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Button } from '@/atoms/Button/Button';
import { Video } from '@/atoms/Video/Video';
import type { InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { cn } from '@/libs/utils/utils';
import { FileVariant } from '@/services/nexus/file/file.types';
import { $isInlineMediaNode } from './InlineMediaNode';
import { inlineMediaPreviewResolver$, openEditInlineMediaDialog$ } from './inlineMediaPlugin';

interface InlineMediaEditorProps {
  src: string;
  altText: string;
  title: string;
  mediaKind: InlineNonImageMediaKind;
  nodeKey: string;
}

/**
 * The in-editor rendering of an `InlineMediaNode`: a native player (or a PDF card) plus, while the
 * node is selected, a small toolbar to edit its description or delete it. Selection, delete and
 * keyboard handling mirror MDXEditor's `ImageEditor` so the two node kinds feel the same.
 */
export function InlineMediaEditor({ src, altText, title, mediaKind, nodeKey }: InlineMediaEditorProps) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const [readOnly, previewResolver] = useCellValues(readOnly$, inlineMediaPreviewResolver$);
  const openEditDialog = usePublisher(openEditInlineMediaDialog$);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  // Browsers can't load pubky:// URIs: prefer the session's object URL (also covers the CDN
  // readiness window right after upload), then the CDN, then pass an external URL through
  const previewSrc = previewResolver(src) ?? pubkyUriToCdnUrl(src, FileVariant.MAIN) ?? src;

  useEffect(() => {
    const removeNode = () => {
      const node = $getNodeByKey(nodeKey);
      if ($isInlineMediaNode(node)) node.remove();
    };

    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          const target = event.target;
          if (!(target instanceof Node) || !wrapperRef.current?.contains(target)) return false;
          // The native controls keep working: a click on the player itself is playback, not selection
          if (target instanceof HTMLMediaElement) return false;
          if (event.shiftKey) {
            setSelected(!isSelected);
          } else {
            clearSelection();
            setSelected(true);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_DELETE_COMMAND,
        (event) => {
          if (!isSelected || !$isNodeSelection($getSelection())) return false;
          event.preventDefault();
          removeNode();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!isSelected || !$isNodeSelection($getSelection())) return false;
          event.preventDefault();
          removeNode();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ENTER_COMMAND,
        (event) => {
          const button = editButtonRef.current;
          if (!isSelected || !$isNodeSelection($getSelection()) || !button || button === document.activeElement) {
            return false;
          }
          event.preventDefault();
          button.focus();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (event.target !== editButtonRef.current) return false;
          $setSelection(null);
          editor.update(() => {
            setSelected(true);
            editor.getRootElement()?.focus();
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, isSelected, nodeKey, setSelected, clearSelection]);

  const deleteNode = () =>
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isInlineMediaNode(node)) node.remove();
    });

  return (
    <div
      ref={wrapperRef}
      data-editor-block-type="inline-media"
      data-media-kind={mediaKind}
      data-testid="inline-media-node"
      className={cn('relative my-2 max-w-full rounded-md', isSelected && 'ring-2 ring-ring')}
    >
      {mediaKind === 'video' && (
        <Video
          src={previewSrc}
          controls
          playsInline
          preload="metadata"
          aria-label={altText || undefined}
          className="w-full"
          data-testid="inline-media-video"
        />
      )}
      {mediaKind === 'audio' && (
        <Audio
          src={previewSrc}
          controls
          preload="metadata"
          aria-label={altText || undefined}
          data-testid="inline-media-audio"
        />
      )}
      {mediaKind === 'pdf' && (
        <span className="flex items-center gap-x-2 rounded-md bg-muted p-4" data-testid="inline-media-file">
          <FileText aria-hidden="true" className="size-6 shrink-0" />
          <span className="min-w-0 truncate text-sm font-bold">{altText || 'PDF document'}</span>
        </span>
      )}

      {!readOnly && isSelected && (
        <span className="absolute top-2 right-2 flex gap-1" data-testid="inline-media-toolbar">
          <Button
            ref={editButtonRef}
            type="button"
            variant="secondary"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Edit description"
            onClick={() => openEditDialog({ mediaKind, nodeKey, initialValues: { src, altText, title } })}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Delete media"
            onClick={deleteNode}
          >
            <Trash2 className="size-4" />
          </Button>
        </span>
      )}
    </div>
  );
}

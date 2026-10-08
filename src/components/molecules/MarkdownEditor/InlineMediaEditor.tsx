'use client';

import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import { iconComponentFor$, readOnly$ } from '@mdxeditor/editor';
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
import { Audio } from '@/atoms/Audio/Audio';
import { Video } from '@/atoms/Video/Video';
import { fileNameFromUrl, type InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';
import { cn } from '@/libs/utils/utils';
import { INLINE_MEDIA_KIND_UI } from './InitializedMDXEditor.constants';
import { $isInlineMediaNode } from './InlineMediaNode';
import { inlineMediaNameResolver$, inlineMediaPreviewResolver$, openEditInlineMediaDialog$ } from './inlineMediaPlugin';

interface InlineMediaEditorProps {
  src: string;
  altText: string;
  title: string;
  mediaKind: InlineNonImageMediaKind;
  nodeKey: string;
}

/**
 * The in-editor rendering of an `InlineMediaNode`: a header row (kind icon, file name, description)
 * above a native player, a PDF being the header alone, with the same toolbar an image node has:
 * MDXEditor's delete and settings icons pinned to the block's top-right corner, in its order and
 * styling. The header is where the node is selected from: a click on the player itself is playback,
 * since the native controls cover the whole element, so unlike an image the node needs its own
 * click target. Delete and keyboard handling mirror MDXEditor's `ImageEditor`.
 */
export function InlineMediaEditor({ src, altText, title, mediaKind, nodeKey }: InlineMediaEditorProps) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const [readOnly, previewResolver, nameResolver, iconComponentFor] = useCellValues(
    readOnly$,
    inlineMediaPreviewResolver$,
    inlineMediaNameResolver$,
    iconComponentFor$,
  );
  const openEditDialog = usePublisher(openEditInlineMediaDialog$);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLSpanElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  // The host resolves a file URI to something a browser loads (the session's object URL, else the
  // CDN); an external URL passes through
  const previewSrc = previewResolver(src) ?? src;
  // An external source gets no request before the author presses play, as in the reader: media
  // elements carry no referrer policy, and the node mounts on every open and mode switch
  const preload = src.startsWith('pubky://') ? 'metadata' : 'none';
  // The file's own name tells two PDFs apart; an external link is named by its last path segment
  const name = nameResolver(src) ?? fileNameFromUrl(src);

  const removeNode = () => {
    const node = $getNodeByKey(nodeKey);
    if ($isInlineMediaNode(node)) node.remove();
  };

  useEffect(() => {
    // Delete and Backspace remove the node while it is the selection, as ImageEditor does
    const onDelete = (event: KeyboardEvent) => {
      if (!isSelected || !$isNodeSelection($getSelection())) return false;
      event.preventDefault();
      removeNode();
      return true;
    };

    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          const target = event.target;
          if (!(target instanceof Node) || !wrapperRef.current?.contains(target)) return false;
          // The native controls keep working: a click on the player itself is playback, not selection.
          // The toolbar buttons act on their own: selecting from them too would land in a deferred
          // update after a delete and leave a node selection pointing at a node that is gone
          if (target instanceof HTMLMediaElement || toolbarRef.current?.contains(target)) return false;
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
      editor.registerCommand<KeyboardEvent>(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand<KeyboardEvent>(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
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
    // removeNode only reads nodeKey, which is a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isSelected, nodeKey, setSelected, clearSelection]);

  const { label, Icon } = INLINE_MEDIA_KIND_UI[mediaKind];

  return (
    <div
      ref={wrapperRef}
      data-editor-block-type="inline-media"
      data-media-kind={mediaKind}
      data-testid="inline-media-node"
      className={cn('relative my-2 max-w-full overflow-hidden rounded-md bg-muted', isSelected && 'ring-2 ring-ring')}
    >
      {/* Room on the right for the toolbar pinned to the corner */}
      <span
        className="flex min-w-0 items-center gap-x-2 py-2 pr-16 pl-3 text-sm text-muted-foreground"
        data-testid="inline-media-header"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate text-foreground" data-testid="inline-media-name">
          {name ?? label}
        </span>
        {altText && <span className="min-w-0 truncate">{altText}</span>}
      </span>
      {!readOnly && (
        // The image node's toolbar, as MDXEditor draws it: its icons, its order, its corner; the
        // colours and radius come from MDXEditor's own variables (globals.css, `data-inline-media-toolbar`)
        <span
          ref={toolbarRef}
          className="absolute top-0 right-0 z-10 flex gap-1 p-1"
          data-inline-media-toolbar=""
          data-testid="inline-media-toolbar"
        >
          <button
            type="button"
            className="cursor-default"
            aria-label="Delete media"
            title="Delete media"
            onClick={() => editor.update(removeNode)}
          >
            {iconComponentFor('delete_small')}
          </button>
          <button
            ref={editButtonRef}
            type="button"
            className="cursor-default"
            aria-label="Edit media"
            title="Edit media"
            onClick={() => openEditDialog({ mediaKind, nodeKey, initialValues: { src, altText, title } })}
          >
            {iconComponentFor('settings')}
          </button>
        </span>
      )}

      {mediaKind === 'video' && (
        <Video
          src={previewSrc}
          controls
          playsInline
          preload={preload}
          aria-label={altText || undefined}
          className="w-full rounded-none"
          data-testid="inline-media-video"
        />
      )}
      {mediaKind === 'audio' && (
        <Audio
          src={previewSrc}
          controls
          preload={preload}
          aria-label={altText || undefined}
          className="px-3 pb-3"
          data-testid="inline-media-audio"
        />
      )}
    </div>
  );
}

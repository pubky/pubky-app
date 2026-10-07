'use client';

import { useEffect, useRef, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { isLocalFirstQueryEnabled, useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';

interface UseAttachmentsMetadataParams {
  /** Attachment file URIs (`pubky://<author>/pub/pubky.app/files/<id>`) to resolve. */
  fileUris: readonly string[];
  /**
   * Caller gate. `false` while local optimistic attachments win, or while the
   * surface is not ready to resolve anything yet.
   * @default true
   */
  enabled?: boolean;
  /**
   * Called at most once per `fileUris` set when resolving it fails (local read
   * or Nexus fetch), so a surface can tell the user. A failure that belongs to
   * a set the caller has already replaced is dropped.
   */
  onError?: (error: unknown) => void;
}

interface UseAttachmentsMetadataResult {
  /** Local file rows that resolved, in the order requested. Empty until they exist. */
  files: NexusFileDetails[];
  /** True until the initial metadata read and missing-file requests settle. */
  isLoading: boolean;
}

/**
 * Resolves the local file rows behind a set of attachment URIs: live, local-first.
 *
 * A card can paint from post details before its file rows exist: Nexus can return
 * attachment URIs while `attachments_metadata` is still missing or partially indexed. A one-shot
 * `getMetadata` right after the post row arrives reads an empty table and never
 * looks again, so the attachments stay missing until something remounts the card.
 * This hook instead:
 *
 * 1. reads the rows through `useLocalFirstQuery`, so a later `file_details` write
 *    (persistFiles, bootstrap, TTL refresh) re-renders the caller, and
 * 2. asks Nexus for the URIs the local table does not have yet, so a post whose
 *    file metadata was never persisted still resolves without navigation.
 *
 * Partial arrival renders: rows that already exist are returned while the rest
 * are still being fetched. A URI whose request settled with no row is not
 * requested again by this instance — Nexus omits files it no longer serves, and
 * one request per `file_details` write would turn every unrelated write into a
 * burst of requests. A row that lands later still renders, because the read is live.
 */
export function useAttachmentsMetadata({
  fileUris,
  enabled = true,
  onError,
}: UseAttachmentsMetadataParams): UseAttachmentsMetadataResult {
  const fileUrisKey = fileUris.join('|');
  const isEnabled = isLocalFirstQueryEnabled(fileUrisKey, enabled);

  // URIs this instance has already asked Nexus for, and the ones currently in
  // flight. Together they keep one instance from re-requesting a URI it already
  // asked for, which a live query would otherwise do on every write.
  const [{ uris: settledFileUris, readVersion }, setSettledFiles] = useState(() => ({
    uris: new Set<string>(),
    readVersion: 0,
  }));
  const inFlightFileUris = useRef<Set<string>>(new Set<string>());

  // The live `fileUris` key and error handler, read when a request settles:
  // a failure that belongs to a set the caller has since replaced (an edit
  // removed the attachments) is not the current surface's failure to report.
  const currentFileUrisKeyRef = useRef<string | null>(null);
  useEffect(() => {
    currentFileUrisKeyRef.current = isEnabled ? fileUrisKey : null;
    return () => {
      currentFileUrisKeyRef.current = null;
    };
  }, [fileUrisKey, isEnabled]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  // One report per `fileUris` set: the live read re-runs on every write, and a
  // read that keeps failing must not turn each unrelated write into a toast.
  const reportedFileUrisKeyRef = useRef<string | null>(null);

  const reportError = (requestedFileUrisKey: string, error: unknown) => {
    if (currentFileUrisKeyRef.current !== requestedFileUrisKey) return;
    if (reportedFileUrisKeyRef.current === requestedFileUrisKey) return;

    reportedFileUrisKeyRef.current = requestedFileUrisKey;
    onErrorRef.current?.(error);
  };

  const requestMissingFiles = async (uris: readonly string[], requestedFileUrisKey: string): Promise<void> => {
    const requested = uris.filter((uri) => !settledFileUris.has(uri) && !inFlightFileUris.current.has(uri));
    if (requested.length === 0) return;

    requested.forEach((uri) => inFlightFileUris.current.add(uri));

    let fetched = false;
    try {
      await FileController.fetchFiles({ fileUris: [...requested] });
      fetched = true;
    } catch (error) {
      // A failed fetch is not fatal: the caller renders whatever is local, and
      // the row may still arrive through a later write on another surface. It
      // is settled below either way, so one failure cannot re-request forever.
      reportError(requestedFileUrisKey, error);
    } finally {
      requested.forEach((uri) => inFlightFileUris.current.delete(uri));
      setSettledFiles((previous) => {
        if (requested.every((uri) => previous.uris.has(uri))) return previous;

        const next = new Set(previous.uris);
        requested.forEach((uri) => next.add(uri));
        // Successful persistence needs a matching local snapshot before readiness.
        // Failed reads/fetches already have their terminal result; don't retry them.
        const currentKey = currentFileUrisKeyRef.current;
        const currentUris = new Set(currentKey?.split('|'));
        const refresh =
          fetched && requested.some((uri) => currentUris.has(uri)) && reportedFileUrisKeyRef.current !== currentKey;
        return { uris: next, readVersion: previous.readVersion + (refresh ? 1 : 0) };
      });
    }
  };

  const { data } = useLocalFirstQuery<NexusFileDetails[]>({
    queryFn: async () => {
      try {
        const files = await FileController.getMetadata({ fileAttachments: [...fileUris] });
        // `null` is this hook's cache-miss signal: with no row at all there is
        // nothing to render and the fetch arm has to run. A partial set is data —
        // those rows render while the effect below completes the rest.
        return files.length > 0 ? files : null;
      } catch (error) {
        reportError(fileUrisKey, error);
        return null;
      }
    },
    fetchFn: () => requestMissingFiles(fileUris, fileUrisKey),
    // Re-read after successful persistence so readiness and returned rows describe
    // the same database snapshot, including permanently omitted files.
    deps: [fileUrisKey, readVersion],
    enabled: isEnabled,
  });

  // The fetch arm above only fires when nothing resolved locally. A partial set
  // counts as a cache hit, so complete it here, once per URI.
  useEffect(() => {
    if (!isEnabled || !data) return;

    const resolved = new Set(data.map((file) => file.uri));
    void requestMissingFiles(
      fileUris.filter((uri) => !resolved.has(uri)),
      fileUrisKey,
    );
    // `requestMissingFiles` closes over `settledFileUris`, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fileUrisKey, isEnabled, settledFileUris]);

  // A terminal reread must not unmount already-visible media (or its lightbox).
  // Retain rows only for this URI set while the new snapshot is pending.
  const [previousRows, setPreviousRows] = useState<{ key: string; files: NexusFileDetails[] | null } | null>(null);
  if (!isEnabled && previousRows !== null) setPreviousRows(null);
  else if (isEnabled && data !== undefined && (previousRows?.key !== fileUrisKey || previousRows.files !== data)) {
    setPreviousRows({ key: fileUrisKey, files: data });
  }
  const files =
    data === undefined && isEnabled && previousRows?.key === fileUrisKey ? (previousRows.files ?? []) : (data ?? []);
  const resolved = new Set(files.map((file) => file.uri));
  const isLoading =
    isEnabled && (data === undefined || fileUris.some((uri) => !resolved.has(uri) && !settledFileUris.has(uri)));

  return { files, isLoading };
}

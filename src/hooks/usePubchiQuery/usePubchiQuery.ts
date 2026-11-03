'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { Logger } from '@/libs/logger/logger';
import { PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import { readLocalCursor, writeLocalCursor } from '@/libs/pubchi/capabilities-v1';
import { pubchiErrorCopy, pubchiQueryErrorCode } from '@/libs/pubchi/error-copy';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import type { PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import type { Phase0Purpose } from '@/libs/pubchi/schemas/request';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import {
  type PubchiQueryFormData,
  pubchiQueryFormDefaults,
  pubchiQueryFormSchema,
  QUERY_FORM_FIELDS,
} from './usePubchiQuery.types';

const SIGNING_UNAVAILABLE = "This browser isn't set up for Pubchi yet. Set it up to start asking.";

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError';
}

export function usePubchiQuery() {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const addConversationTurn = usePubchiStore((state) => state.addConversationTurn);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const [signingAvailable, setSigningAvailable] = useState(false);
  const [pubchiAvailable, setPubchiAvailable] = useState<boolean | undefined>(undefined);
  const [setupLoading, setSetupLoading] = useState(false);
  const [result, setResult] = useState<PubchiQuerySuccess | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cursorSource, setCursorSource] = useState<'device' | 'remote' | 'none'>('none');

  const form = useForm<PubchiQueryFormData>({
    resolver: zodResolver(pubchiQueryFormSchema),
    defaultValues: pubchiQueryFormDefaults,
  });

  const setupDevice = async (): Promise<boolean> => {
    setSetupLoading(true);
    try {
      const pubchi = await PubchiController.loadPubchi();
      const available = Boolean(pubchi?.verified);
      setPubchiAvailable(available);
      if (!available) {
        setSigningAvailable(false);
        return false;
      }
      const ready = await PubchiController.ensureDeviceReady();
      setSigningAvailable(ready);
      return ready;
    } catch {
      setSigningAvailable(false);
      return false;
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!owner) return;
    void setupDevice();
  }, [owner]);

  useEffect(() => {
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 50);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const unsubscribe = usePubchiStore.subscribe((state, previous) => {
      if (state.conversationGeneration !== previous.conversationGeneration) {
        abortRef.current?.abort();
      }
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, []);

  const submit = async (
    purpose: Phase0Purpose,
    requestOptions: { proposalVersion?: 2; targetFeedId?: string; currentFeed?: unknown; target?: PubchiTarget } = {},
  ): Promise<boolean> => {
    if (!isPubchiPanelEnabled()) {
      setErrorCode('PUBCHI_DISABLED');
      toast({ variant: 'error', title: 'PUBCHI_DISABLED', dismissButton: true });
      return false;
    }
    if (!signingAvailable) {
      setErrorCode(SIGNING_UNAVAILABLE);
      return false;
    }
    let ok = false;
    await form.handleSubmit(
      async (values) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;
        inFlightRequestIdRef.current = requestId;
        const requestGeneration = usePubchiStore.getState().conversationGeneration;
        const isCurrent = () =>
          !controller.signal.aborted &&
          inFlightRequestIdRef.current === requestId &&
          usePubchiStore.getState().conversationGeneration === requestGeneration;
        setLoading(true);
        setErrorCode(undefined);
        try {
          const rawQuestion = values[QUERY_FORM_FIELDS.QUESTION];
          const remoteCursorAvailable = Boolean(
            owner &&
            rawQuestion === 'What did I miss?' &&
            sessionCovers(useAuthStore.getState().selectSession()?.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY),
          );
          const requestOwner = owner;
          const remoteCursor = remoteCursorAvailable ? await PubchiController.loadPubchiCursor() : null;
          if (!isCurrent()) return;
          const cursor = remoteCursor ?? (owner && rawQuestion === 'What did I miss?' ? readLocalCursor(owner) : null);
          setCursorSource(remoteCursorAvailable && remoteCursor ? 'remote' : cursor ? 'device' : 'none');
          const conversation = usePubchiStore.getState().conversation;
          const next = await PubchiController.fetchPubchiQuery({
            question: cursor ? `What did I miss since ${cursor}` : rawQuestion,
            purpose,
            ...(purpose === 'ask' ? { conversation } : {}),
            ...(purpose === 'build-feed' ? { proposalVersion: 2 as const } : {}),
            ...requestOptions,
          });
          if (!isCurrent()) return;
          const nextUntil = next.kind === 'answer' ? next.result.continuation?.until : undefined;
          const cursorTime = cursor ? Date.parse(cursor) : Number.NaN;
          const nextUntilTime = nextUntil ? Date.parse(nextUntil) : Number.NaN;
          if (
            requestOwner &&
            next.kind === 'answer' &&
            next.result.owner === requestOwner &&
            rawQuestion === 'What did I miss?' &&
            next.result.continuation?.complete &&
            !Number.isNaN(nextUntilTime) &&
            (cursor === null || (!Number.isNaN(cursorTime) && nextUntilTime > cursorTime))
          ) {
            setResult(next);
            ok = true;
            try {
              if (remoteCursorAvailable) await PubchiController.savePubchiCursor(requestOwner, nextUntil!);
              else writeLocalCursor(requestOwner, nextUntil!);
            } catch (error) {
              Logger.warn('Failed to save Pubchi catch-up position', { error });
              toast({
                variant: 'warning',
                title: "Answer shown; couldn't save your catch-up position",
                dismissButton: true,
              });
            }
            return;
          }
          setResult(next);
          if (purpose === 'ask' && requestOwner && next.kind === 'answer') {
            addConversationTurn({ role: 'user', text: rawQuestion }, requestOwner);
            addConversationTurn(
              {
                role: 'assistant',
                text: next.result.summary,
                ...(next.result.basis ? { basis: next.result.basis } : {}),
                ...(next.result.citations ? { citations: next.result.citations } : {}),
              },
              requestOwner,
            );
          }
          ok = true;
        } catch (error) {
          if (!isCurrent() || isAbortError(error)) return;
          const code = pubchiQueryErrorCode(error);
          const { message } = pubchiErrorCopy(code);
          setErrorCode(code);
          setResult(undefined);
          toast({ variant: 'error', title: message, dismissButton: true });
        } finally {
          if (inFlightRequestIdRef.current === requestId) {
            inFlightRequestIdRef.current = 0;
            setLoading(false);
          }
        }
      },
      () => {
        document.getElementById(QUERY_FORM_FIELDS.QUESTION)?.focus();
      },
    )();
    return ok;
  };

  return {
    form,
    submit,
    result,
    errorCode,
    loading,
    elapsedMs,
    enabled: isPubchiPanelEnabled(),
    pubchiAvailable,
    signingAvailable,
    signingUnavailableMessage: SIGNING_UNAVAILABLE,
    setupDevice,
    setupLoading,
    cursorSource,
  };
}

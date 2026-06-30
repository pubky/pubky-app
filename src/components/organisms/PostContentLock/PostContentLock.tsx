'use client';

import Image from 'next/image';
import { Link as LinkIcon, LockOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { usePostLock } from '@/hooks/usePostLock/usePostLock';
import { cn } from '@/libs/utils/utils';
import { PostLockInfo } from '@/molecules/PostLockInfo/PostLockInfo';
import { PostBody } from '../PostBody/PostBody';
import type { PostContentLockProps } from './PostContentLock.types';

/**
 * Inline preview of a lock post (one with a top-level `lock` URL): the teaser body
 * renders like a normal post of its real `kind` (`teaser_description` as the text,
 * `attachments` as media), with the lock card (title, Unlock control, password/
 * payment indicator + shield) on top.
 */
export function PostContentLock({ content, lock, attachments, className, textClassName }: PostContentLockProps) {
  const t = useTranslations('post');
  const { lockContent, verifierType, hasError } = usePostLock({ content, lock });

  // TODO:[Locks] #1998 — `lockContent` is null when the teaser content can't be parsed
  // (missing / invalid JSON). For now we render nothing; the UX for an unparseable lock
  // post is not decided yet — revisit and define what to show here.
  if (!lockContent) return null;

  // Bad `lock` URL or a failed fetch — show a message instead of the
  // unlock control + brand graphic, so the post still renders and never crashes.
  const isLockUnavailable = hasError;

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      {/* Teaser body — same renderer as a normal post (PostBody), keyed on the teaser description. */}
      <PostBody
        content={lockContent.teaser_description}
        attachments={attachments ?? null}
        localAttachments={undefined}
        textClassName={textClassName}
      />

      {/* Lock UI */}
      <div className="flex items-start justify-between gap-4 rounded-md bg-muted p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center gap-2">
            <LinkIcon className="size-6 shrink-0 text-muted-foreground" aria-hidden />
            <h4 className="min-w-0 flex-1 text-xl leading-7 font-bold text-foreground">{lockContent.lock_title}</h4>
          </div>

          {isLockUnavailable ? (
            <p className="text-sm text-muted-foreground">{t('lock.unavailable')}</p>
          ) : (
            <div className="flex w-fit items-center gap-1 rounded-full bg-card p-1">
              {/* TODO:[Locks] #1998 — Unlock is presentational (unlock flow out of scope); the
                  click only stops card navigation. The unlock flow will add the real handler here. */}
              <Button
                type="button"
                variant="brand"
                onClick={(event) => event.stopPropagation()}
                className="h-10 gap-2 rounded-full px-4"
              >
                <LockOpen className="size-4 shrink-0" aria-hidden />
                {t('lock.unlock')}
              </Button>
              {verifierType && (
                <div className="flex items-center justify-center px-4">
                  <PostLockInfo verifierType={verifierType} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* TODO:[Locks] #1998 — placeholder shield; the unlock flow will swap this for
            the real state image (e.g. unlocked / content preview). */}
        {!isLockUnavailable && (
          <Image
            src="/images/shield.png"
            alt=""
            width={96}
            height={96}
            className="hidden size-24 shrink-0 rounded-md object-contain sm:block"
          />
        )}
      </div>
    </Container>
  );
}

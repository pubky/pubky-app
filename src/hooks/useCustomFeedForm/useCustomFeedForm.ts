'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { PubkyAppFeedReach } from 'pubky-app-specs';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { APP_ROUTES } from '@/app/routes';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { FeedController } from '@/controllers/feed/feed';
import { useToast } from '@/molecules/Toaster/use-toast';
import {
  CUSTOM_FEED_CONTENT_ALL,
  type CustomFeedFormData,
  customFeedFormDefaults,
  customFeedFormSchema,
  customFeedFormValuesFromFeed,
  type UseCustomFeedFormParams,
} from './useCustomFeedForm.types';

type UseCustomFeedFormResult = {
  /** React Hook Form instance — wire fields via `form.control`. */
  form: UseFormReturn<CustomFeedFormData>;
  /** True while a create/update/delete round-trip is in flight. */
  loading: boolean;
  /**
   * Validate + commit the feed. Resolves `true` when the feed was written,
   * `false` when validation rejected the form or the controller threw, so the
   * caller decides whether to close its dialog.
   */
  submit: () => Promise<boolean>;
  /** Delete the feed being edited. Resolves `false` in create mode. */
  deleteFeed: () => Promise<boolean>;
};

/**
 * Encapsulates the "create / edit custom feed" form on top of react-hook-form + zod.
 *
 * - Schema, field names, and defaults live in `./useCustomFeedForm.types.ts`
 * - Validation mode is `onChange` so the dialog's save button can track
 *   `formState.isValid` (a feed needs a name and at least one tag)
 * - Navigation is deliberately narrow: an edit only redirects when you are
 *   standing on the feed whose id just changed, so editing a feed from the nav
 *   while reading a different one leaves you where you are
 */
export function useCustomFeedForm(params: UseCustomFeedFormParams): UseCustomFeedFormResult {
  const { mode, feed, open } = params;
  const [loading, setLoading] = useState(false);
  // Synchronous re-entrancy truth: a queued second click can run a stale
  // render's closure before React commits `loading`, so the guard cannot rely
  // on state alone.
  const inFlightRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<CustomFeedFormData>({
    resolver: zodResolver(customFeedFormSchema),
    defaultValues: feed ? customFeedFormValuesFromFeed(feed) : customFeedFormDefaults,
    mode: 'onChange',
  });

  // Re-seed only while the dialog is closed: a background sync may have changed
  // the stored feed since it was last opened, but re-seeding an *open* dialog
  // would throw away whatever the user is in the middle of typing.
  //
  // This matters for the create dialog, which stays mounted behind its trigger
  // and toggles `open`. The edit dialog is mounted per open (FeedNavigation
  // renders it only while a feed is being edited), so it seeds from
  // `defaultValues` and this effect never runs for it.
  useEffect(() => {
    if (open) return;
    form.reset(feed ? customFeedFormValuesFromFeed(feed) : customFeedFormDefaults);
  }, [open, feed, form]);

  const submit = async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setLoading(true);

    let saved = false;

    try {
      await form.handleSubmit(async (data) => {
        // `null` is the feed record's "no content filter"; the form carries a
        // sentinel instead because a Select cannot hold null as an option value.
        // Tagged as is a UI-only reach: persist as WoT + the form's domain_tags.
        const { reach: formReach, content: formContent, ...rest } = data;
        const changes = {
          ...rest,
          reach: formReach === TAGGED_AS_FILTER_KEY ? PubkyAppFeedReach.Wot : formReach,
          content: formContent === CUSTOM_FEED_CONTENT_ALL ? null : formContent,
        };

        try {
          if (mode === 'create') {
            const createdFeed = await FeedController.commitCreate(changes);

            toast({
              title: `Feed created: ${createdFeed.name}`,
            });
            router.push(`${APP_ROUTES.FEED}/${createdFeed.id}`);
            saved = true;

            return;
          }

          const currentFeedHref = `${APP_ROUTES.FEED}/${feed.id}`;
          const updatedFeed = await FeedController.commitUpdate({
            feedId: feed.id,
            changes,
          });

          toast({
            title: `Feed updated: ${updatedFeed.name}`,
          });

          // Config edits rehash the id, which moves the feed's route. Only a
          // reader standing on the old route needs redirecting, and via `replace`
          // (not `push`) because the old id no longer resolves.
          if (pathname === currentFeedHref && updatedFeed.id !== feed.id) {
            router.replace(`${APP_ROUTES.FEED}/${updatedFeed.id}`);
          }

          saved = true;
        } catch {
          toast({
            variant: 'error',
            description: mode === 'create' ? 'Could not create feed. Try again.' : 'Could not update feed. Try again.',
          });
        }
      })();
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }

    return saved;
  };

  const deleteFeed = async (): Promise<boolean> => {
    if (inFlightRef.current || mode !== 'edit') return false;
    inFlightRef.current = true;
    setLoading(true);

    try {
      const currentFeedHref = `${APP_ROUTES.FEED}/${feed.id}`;

      await FeedController.commitDelete({
        feedId: feed.id,
      });
      toast({
        title: `Feed deleted: ${feed.name}`,
      });

      if (pathname === currentFeedHref) {
        router.replace(APP_ROUTES.HOME);
      }

      return true;
    } catch {
      toast({
        variant: 'error',
        description: 'Could not delete feed. Try again.',
      });

      return false;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  return {
    form,
    loading,
    submit,
    deleteFeed,
  };
}

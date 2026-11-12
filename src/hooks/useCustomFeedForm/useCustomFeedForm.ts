'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import type { KnownFeedTarget } from 'pubky-social-specs';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { APP_ROUTES } from '@/app/routes';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { FeedController } from '@/controllers/feed/feed';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { hasResourceFeedFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useCustomResourceFeedStore } from '@/stores/customResourceFeed/customResourceFeed.store';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';
import {
  CUSTOM_FEED_CONTENT_ALL,
  CUSTOM_FEED_CONTENT_RESOURCES,
  CUSTOM_FEED_RESOURCE_TYPES_ALL,
  type CustomFeedFormData,
  customFeedFormDefaults,
  customFeedFormSchema,
  customFeedFormValuesFromFeed,
  type UseCustomFeedFormParams,
  withPageResourceFilters,
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

/** The form's values: the feed's (a new one's defaults), with the page's External resources filters (`pageSearch`). */
function getFormValues(feed: FeedModelSchema | undefined, pageSearch: string | null): CustomFeedFormData {
  const values = feed ? customFeedFormValuesFromFeed(feed) : customFeedFormDefaults;
  return pageSearch !== null ? withPageResourceFilters(values, new URLSearchParams(pageSearch)) : values;
}

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
  const { waitForAuth } = useRequireAuth(open);
  const [loading, setLoading] = useState(false);
  // Synchronous re-entrancy truth: a queued second click can run a stale
  // render's closure before React commits `loading`, so the guard cannot rely
  // on state alone.
  const inFlightRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The External resources filters on screen: Home's, or a custom resources feed's panel. A feed
  // created there starts with them; the feed on screen, edited, saves them.
  const isFiltersPage =
    mode === 'create'
      ? pathname === APP_ROUTES.HOME || pathname.startsWith(`${APP_ROUTES.FEED}/`)
      : pathname === `${APP_ROUTES.FEED}/${feed.id}`;
  // The feed's own page holds its filters once they are seeded (`useSeedCustomResourceFeed`), even
  // when the viewer cleared every one
  const readyFeedId = useCustomResourceFeedStore((state) => state.readyFeedId);
  const homeContent = useHomeStore((state) => state.content);
  // Home's External resources, or a custom resources feed's page, lists resources also with no filter in
  // its URL: a feed created there starts as one
  const isResourcesPage =
    (pathname === APP_ROUTES.HOME && homeContent === CONTENT.RESOURCES) ||
    (readyFeedId !== null && pathname === `${APP_ROUTES.FEED}/${readyFeedId}`);
  const hasPageFilters =
    mode === 'edit' ? readyFeedId === feed.id : isResourcesPage || hasResourceFeedFilters(searchParams);
  const pageSearch = isFiltersPage && hasPageFilters ? searchParams.toString() : null;
  // A post feed edited keeps its own values
  const takesPage = mode === 'create' || feed.target === 'resources';
  const pageFilters = takesPage ? pageSearch : null;

  const form = useForm<CustomFeedFormData>({
    resolver: zodResolver(customFeedFormSchema),
    defaultValues: getFormValues(feed, pageFilters),
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
    form.reset(getFormValues(feed, pageFilters));
  }, [open, feed, form, pageFilters]);

  const submit = async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setLoading(true);

    let saved = false;

    try {
      await form.handleSubmit(async (data) => {
        if (!(await waitForAuth())) return;
        // `null` is the feed record's "no content filter"; the form carries a
        // sentinel instead because a Select cannot hold null as an option value.
        // External resources is a target, not a post kind: no content filter.
        // Tagged as is a UI-only reach: persist as WoT + the form's domain_tags.
        const {
          reach: formReach,
          content: formContent,
          resource_types: formTypes,
          resource_filters: formFilters,
          ...rest
        } = data;
        const isResources = formContent === CUSTOM_FEED_CONTENT_RESOURCES;
        const target: KnownFeedTarget = isResources ? 'resources' : 'posts';
        const changes = {
          ...rest,
          reach: formReach === TAGGED_AS_FILTER_KEY ? 'wot' : formReach,
          content: formContent === CUSTOM_FEED_CONTENT_ALL || isResources ? null : formContent,
          target,
          resource_types: isResources && formTypes !== CUSTOM_FEED_RESOURCE_TYPES_ALL ? formTypes.split(',') : null,
          resource_filters: isResources ? formFilters : null,
        };

        try {
          if (mode === 'create') {
            const createdFeed = await FeedController.commitCreate(changes);
            // The account changed while the write waited for the sync lock: nothing was created, and
            // the viewer is gone, so there is nothing to announce or open.
            if (!createdFeed) return;

            toast({
              title: 'Feed created',
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
          if (!updatedFeed) return;

          toast({
            title: 'Feed updated',
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
      if (!(await waitForAuth())) return false;
      const currentFeedHref = `${APP_ROUTES.FEED}/${feed.id}`;

      const deleted = await FeedController.commitDelete({
        feedId: feed.id,
      });
      // false: the account changed while the delete waited for the sync lock; nothing to announce.
      if (!deleted) return false;
      toast({
        title: 'Feed deleted',
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

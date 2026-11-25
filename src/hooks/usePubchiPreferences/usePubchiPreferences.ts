'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type PubchiPreferencesFormData,
  pubchiPreferencesFormDefaults,
  pubchiPreferencesFormSchema,
} from './usePubchiPreferences.types';

export function usePubchiPreferences(onSaved?: (config: PubchiConfigV1) => void) {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const generation = useAuthStore((state) => state.generation);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () => {
    const auth = useAuthStore.getState();
    return mounted.current && owner !== null && auth.currentUserPubky === owner && auth.generation === generation;
  };
  const form = useForm<PubchiPreferencesFormData>({
    resolver: zodResolver(pubchiPreferencesFormSchema),
    defaultValues: pubchiPreferencesFormDefaults,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return mounted.current && auth.currentUserPubky === owner && auth.generation === generation;
    };
    form.reset(pubchiPreferencesFormDefaults);
    setSaved(false);
    if (!owner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      PubchiController.loadPubchiConfig(),
      typeof PubchiController.loadPubchi === 'function' ? PubchiController.loadPubchi() : Promise.resolve(undefined),
    ])
      .then(([config, bot]) => {
        if (!active || !isCurrent() || !config || config.owner !== owner) return;
        form.reset({
          display_name: bot?.displayName ?? config.display_name,
          language: ['en', 'es', 'de', 'fr', 'pt'].includes(config.language)
            ? (config.language as PubchiPreferencesFormData['language'])
            : 'en',
          summary_length: config.summary.length,
          include_sources: config.summary.include_sources,
          include_disagreement: config.summary.include_disagreement,
          topics: config.interests.topics,
          excluded_topics: config.interests.excluded_topics,
          proactive_enabled: config.proactive.enabled,
          max_suggestions_per_day: config.proactive.max_suggestions_per_day,
          quiet_hours_start: config.proactive.quiet_hours_utc.start,
          quiet_hours_end: config.proactive.quiet_hours_utc.end,
          follower_history_opt_in: config.follower_history_opt_in,
        });
      })
      .catch(() => {
        if (active && isCurrent())
          toast({ variant: 'error', title: 'Could not load preferences', dismissButton: true });
      })
      .finally(() => {
        if (active && isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form, owner, generation]);

  const submit = async (): Promise<boolean> => {
    let ok = false;
    await form.handleSubmit(async (values) => {
      if (!isCurrent()) return;
      setLoading(true);
      setSaved(false);
      try {
        const next = await PubchiController.savePubchiConfig({
          display_name: values.display_name,
          language: values.language,
          summary: {
            length: values.summary_length,
            include_sources: values.include_sources,
            include_disagreement: values.include_disagreement,
          },
          interests: { topics: values.topics, excluded_topics: values.excluded_topics },
          proactive: {
            enabled: values.proactive_enabled,
            max_suggestions_per_day: values.max_suggestions_per_day,
            quiet_hours_utc: { start: values.quiet_hours_start, end: values.quiet_hours_end },
          },
          follower_history_opt_in: values.follower_history_opt_in,
        });
        if (!isCurrent() || next.owner !== owner) return;
        onSaved?.(next);
        form.reset(values);
        setSaved(true);
        toast({ variant: 'default', title: 'Preferences saved', dismissButton: true });
        ok = true;
      } catch {
        if (!isCurrent()) return;
        toast({ variant: 'error', title: 'Could not save preferences', dismissButton: true });
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    return ok;
  };

  return { form, submit, reset: form.reset, loading, saved };
}

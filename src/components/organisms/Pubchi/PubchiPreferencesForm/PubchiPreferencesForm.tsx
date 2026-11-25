'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { type Control, Controller, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Label } from '@/atoms/Label/Label';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiPreferences } from '@/hooks/usePubchiPreferences/usePubchiPreferences';
import type { PubchiPreferencesFormData } from '@/hooks/usePubchiPreferences/usePubchiPreferences.types';
import { type PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas/forbidden';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';

export const PUBCHI_PREFERENCES_SURFACE = 'pubchi-preferences';

const languages = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['de', 'German'],
  ['fr', 'French'],
  ['pt', 'Portuguese'],
] as const;

export function PubchiPreferencesForm({ onSaved }: { onSaved?: (config: PubchiConfigV1) => void }) {
  const { form, submit, loading } = usePubchiPreferences(onSaved);
  const [topicInput, setTopicInput] = useState('');
  const [excludedInput, setExcludedInput] = useState('');
  const [topicError, setTopicError] = useState('');
  const [excludedError, setExcludedError] = useState('');
  const topics = useWatch({ control: form.control, name: 'topics' }) ?? [];
  const excludedTopics = useWatch({ control: form.control, name: 'excluded_topics' }) ?? [];

  const addTopic = () => {
    const label = topicInput.trim();
    if (!scanForbiddenPublicState(label).ok) {
      setTopicError('That looks like a secret or recovery phrase. Bot state is public — choose something else.');
      return;
    }
    setTopicError('');
    if (!label || topics.length >= 20 || topics.some((topic) => topic.label === label)) return;
    form.setValue('topics', [...topics, { label, weight: 3 }], { shouldDirty: true });
    setTopicInput('');
  };

  const addExcludedTopic = () => {
    const label = excludedInput.trim();
    if (!scanForbiddenPublicState(label).ok) {
      setExcludedError('That looks like a secret or recovery phrase. Bot state is public — choose something else.');
      return;
    }
    setExcludedError('');
    if (!label || excludedTopics.length >= 20 || excludedTopics.includes(label)) return;
    form.setValue('excluded_topics', [...excludedTopics, label], { shouldDirty: true });
    setExcludedInput('');
  };

  return (
    <Card
      data-surface={PUBCHI_PREFERENCES_SURFACE}
      data-testid={PUBCHI_PREFERENCES_SURFACE}
      className="border border-border"
    >
      <CardHeader>
        <CardTitle>Pubchi preferences</CardTitle>
        <Typography className="rounded-md border border-border bg-muted p-3 text-sm">
          Public bot state — anyone can read this.
        </Typography>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ControlledInputField<PubchiPreferencesFormData>
            name="display_name"
            control={form.control}
            label="Display name"
            maxLength={40}
            disabled={loading}
          />

          <Controller
            control={form.control}
            name="language"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="pubchi-language">Language</Label>
                <Select value={field.value} onValueChange={field.onChange} disabled={loading}>
                  <SelectTrigger id="pubchi-language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="summary_length"
            render={({ field }) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Summary length</legend>
                <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-cols-3">
                  <RadioGroupItem value="short" label="Short" />
                  <RadioGroupItem value="medium" label="Medium" />
                  <RadioGroupItem value="long" label="Long" />
                </RadioGroup>
              </fieldset>
            )}
          />

          <SwitchField control={form.control} name="include_sources" label="Include sources" disabled={loading} />
          <SwitchField
            control={form.control}
            name="include_disagreement"
            label="Include disagreement"
            disabled={loading}
          />

          <TopicField
            label="Interests"
            input={topicInput}
            setInput={setTopicInput}
            onAdd={addTopic}
            error={topicError}
            values={topics.map((topic, index) => (
              <span
                key={topic.label}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-sm"
              >
                {topic.label}
                <select
                  aria-label={`Weight for ${topic.label}`}
                  value={topic.weight}
                  onChange={(event) => {
                    const next = [...topics];
                    next[index] = { ...topic, weight: Number(event.target.value) };
                    form.setValue('topics', next, { shouldDirty: true });
                  }}
                >
                  {[1, 2, 3, 4, 5].map((weight) => (
                    <option key={weight} value={weight}>
                      {weight}
                    </option>
                  ))}
                </select>
              </span>
            ))}
          />

          <TopicField
            label="Excluded topics"
            input={excludedInput}
            setInput={setExcludedInput}
            onAdd={addExcludedTopic}
            error={excludedError}
            values={excludedTopics.map((topic) => (
              <span key={topic} className="rounded-full border border-border px-2 py-1 text-sm">
                {topic}
              </span>
            ))}
          />

          <SwitchField
            control={form.control}
            name="proactive_enabled"
            label="Enable proactive suggestions"
            disabled={loading}
          />
          <SelectField
            control={form.control}
            name="max_suggestions_per_day"
            label="Maximum suggestions per day"
            options={Array.from({ length: 11 }, (_, index) => index)}
          />
          <SelectField
            control={form.control}
            name="quiet_hours_start"
            label="Quiet hours start (UTC)"
            options={Array.from({ length: 24 }, (_, index) => index)}
          />
          <SelectField
            control={form.control}
            name="quiet_hours_end"
            label="Quiet hours end (UTC)"
            options={Array.from({ length: 24 }, (_, index) => index)}
          />
          <SwitchField
            control={form.control}
            name="follower_history_opt_in"
            label="Store follower history"
            description="Stores a public snapshot of your follower list on your homeserver"
            disabled={loading}
          />

          <Button type="submit" disabled={loading || !form.formState.isDirty}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SwitchField({
  control,
  name,
  label,
  description,
  disabled,
}: {
  control: Control<PubchiPreferencesFormData>;
  name: 'include_sources' | 'include_disagreement' | 'proactive_enabled' | 'follower_history_opt_in';
  label: string;
  description?: string;
  disabled: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor={`pubchi-${name}`}>{label}</Label>
            {description ? <Typography className="text-sm text-muted-foreground">{description}</Typography> : null}
          </div>
          <Switch id={`pubchi-${name}`} checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
        </div>
      )}
    />
  );
}

function SelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<PubchiPreferencesFormData>;
  name: 'max_suggestions_per_day' | 'quiet_hours_start' | 'quiet_hours_end';
  label: string;
  options: number[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`pubchi-${name}`}>{label}</Label>
          <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
            <SelectTrigger id={`pubchi-${name}`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

function TopicField({
  label,
  input,
  setInput,
  onAdd,
  error,
  values,
}: {
  label: string;
  input: string;
  setInput: (value: string) => void;
  onAdd: () => void;
  error: string;
  values: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add a topic"
        />
        <Button type="button" variant="secondary" onClick={onAdd}>
          Add
        </Button>
      </div>
      {error ? <Typography className="text-sm text-destructive">{error}</Typography> : null}
      <div className="flex flex-wrap gap-2">{values}</div>
    </div>
  );
}

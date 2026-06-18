'use client';

import { Controller, FieldValues } from 'react-hook-form';
import { Container } from '@/atoms/Container/Container';
import { Label } from '@/atoms/Label/Label';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import { InputField } from '../InputField/InputField';
import type { ControlledInputFieldProps } from './ControlledInputField.types';

export function ControlledInputField<T extends FieldValues>({
  name,
  control,
  label,
  labelHint,
  placeholder,
  maxLength,
  variant = 'dashed',
  size = 'lg',
  icon,
  iconPosition,
  disabled = false,
  loading = false,
  loadingText,
  onPaste,
  className,
  dataCy,
}: ControlledInputFieldProps<T>) {
  return (
    <Container className="gap-2">
      {label && (
        <Label htmlFor={name} className={FORM_LABEL_CLASSES}>
          {label}
          {labelHint}
        </Label>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <InputField
            id={name}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            maxLength={maxLength}
            placeholder={placeholder}
            variant={variant}
            size={size}
            icon={icon}
            iconPosition={iconPosition}
            disabled={disabled}
            loading={loading}
            loadingText={loadingText}
            onPaste={onPaste}
            className={className ?? 'mb-0'}
            dataCy={dataCy}
            status={fieldState.error ? 'error' : 'default'}
            message={fieldState.error?.message}
            messageType={fieldState.error ? 'error' : 'default'}
          />
        )}
      />
    </Container>
  );
}

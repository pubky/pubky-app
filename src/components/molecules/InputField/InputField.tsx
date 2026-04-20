'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

interface InputFieldProps {
  id?: string;
  name?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
  onClickIcon?: () => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  icon?: ReactNode;
  variant?: 'default' | 'dashed';
  loading?: boolean;
  loadingText?: string;
  loadingIcon?: ReactNode;
  status?: 'default' | 'success' | 'error';
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  maxLength?: number;
  iconPosition?: 'left' | 'right';
  message?: ReactNode;
  messageType?: 'default' | 'info' | 'alert' | 'error' | 'success';
  size?: 'sm' | 'md' | 'lg';
  dataCy?: string;
}

export function InputField({
  id,
  name,
  value,
  placeholder,
  disabled = false,
  readOnly = false,
  onClick,
  onClickIcon = () => {},
  className,
  icon,
  variant = 'default',
  loading = false,
  loadingText,
  loadingIcon,
  status = 'default',
  onChange,
  onBlur,
  onKeyDown,
  maxLength,
  iconPosition = 'left',
  message,
  messageType = 'default',
  size = 'md',
  dataCy,
}: InputFieldProps) {
  const t = useTranslations('common');
  const resolvedLoadingText = loadingText ?? t('loading');

  const containerClasses = variant === 'dashed' && 'border-dashed';

  const statusClasses = {
    default: '',
    success: 'border-brand text-brand',
    error: 'border-red-500 text-red-500',
  };

  const sizeClasses = {
    sm: 'h-10 text-sm',
    md: 'h-12 text-base',
    lg: 'h-14 text-lg',
  } as const;

  const messageClasses = {
    default: 'text-muted-foreground',
    info: 'text-blue-500',
    alert: 'text-yellow-500',
    error: 'text-red-500',
    success: 'text-brand',
  } as const;

  return (
    <>
      <Atoms.Container
        className={Libs.cn(
          '!bg-alpha-90/10 mx-0 mb-2 w-full cursor-pointer flex-row items-center gap-0 rounded-md border bg-transparent',
          icon && iconPosition === 'left' ? 'pl-4.5' : 'pl-2',
          containerClasses,
          statusClasses[status],
          loading && 'border-brand text-brand',
          sizeClasses[size],
          className,
        )}
      >
        {loading && (
          <Atoms.Container className="w-auto items-center justify-center">
            {loadingIcon ?? (
              <Libs.Loader2 className="linear infinite h-4 w-4 animate-spin text-brand" data-testid="loading-icon" />
            )}
          </Atoms.Container>
        )}
        {!loading && icon && iconPosition === 'left' && (
          <Atoms.Container
            onClick={onClickIcon}
            className={Libs.cn('w-auto cursor-pointer items-center justify-center')}
          >
            {icon}
          </Atoms.Container>
        )}
        <Atoms.Input
          id={id}
          name={name}
          type="text"
          className={Libs.cn('w-full border-none !bg-transparent')}
          value={loading ? resolvedLoadingText : value}
          placeholder={placeholder}
          disabled={disabled || loading}
          readOnly={readOnly}
          onClick={onClick}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          maxLength={maxLength}
          aria-invalid={status === 'error'}
          data-cy={dataCy}
        />
        {!loading && icon && iconPosition === 'right' && (
          <Atoms.Container
            onClick={onClickIcon}
            className={Libs.cn('mr-5 w-auto cursor-pointer items-center justify-center')}
          >
            {icon}
          </Atoms.Container>
        )}
      </Atoms.Container>
      {message && (
        <Atoms.Typography as="small" size="sm" className={Libs.cn('ml-1', messageClasses[messageType])}>
          {message}
        </Atoms.Typography>
      )}
    </>
  );
}

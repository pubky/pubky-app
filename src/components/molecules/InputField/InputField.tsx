'use client';

import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

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
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  maxLength?: number;
  iconPosition?: 'left' | 'right';
  message?: ReactNode;
  messageType?: 'default' | 'info' | 'alert' | 'error' | 'success';
  size?: 'sm' | 'md' | 'lg';
  dataCy?: string;
  inputClassName?: React.HTMLAttributes<HTMLInputElement>['className'];
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
  onPaste,
  maxLength,
  iconPosition = 'left',
  message,
  messageType = 'default',
  size = 'md',
  dataCy,
  inputClassName,
}: InputFieldProps) {
  const resolvedLoadingText = loadingText ?? 'Loading...';
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
      <Container
        className={cn(
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
          <Container className="w-auto items-center justify-center">
            {loadingIcon ?? (
              <Loader2 className="linear infinite h-4 w-4 animate-spin text-brand" data-testid="loading-icon" />
            )}
          </Container>
        )}
        {!loading && icon && iconPosition === 'left' && (
          <Container onClick={onClickIcon} className={cn('w-auto cursor-pointer items-center justify-center')}>
            {icon}
          </Container>
        )}
        <Input
          id={id}
          name={name}
          type="text"
          className={cn('w-full border-none !bg-transparent', inputClassName)}
          value={loading ? resolvedLoadingText : value}
          placeholder={placeholder}
          disabled={disabled || loading}
          readOnly={readOnly}
          onClick={onClick}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          maxLength={maxLength}
          aria-invalid={status === 'error'}
          data-cy={dataCy}
        />
        {!loading && icon && iconPosition === 'right' && (
          <Container onClick={onClickIcon} className={cn('mr-5 w-auto cursor-pointer items-center justify-center')}>
            {icon}
          </Container>
        )}
      </Container>
      {message && (
        <Typography as="small" size="sm" className={cn('ml-1', messageClasses[messageType])}>
          {message}
        </Typography>
      )}
    </>
  );
}

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
  iconAriaLabel?: string;
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
  iconClassName?: React.HTMLAttributes<HTMLDivElement>['className'];
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
  onClickIcon,
  iconAriaLabel,
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
  iconClassName,
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
  const messageId = id && message ? `${id}-message` : undefined;
  // An actionable icon renders as a real button (keyboard/screen-reader reachable) and stays mounted while
  // loading — aria-disabled instead of disabled/unmount — so keyboard focus survives the pending state.
  const iconSlot =
    icon &&
    (onClickIcon ? (
      <button
        type="button"
        aria-label={iconAriaLabel}
        aria-disabled={loading}
        onClick={loading ? undefined : onClickIcon}
        className={cn(
          'flex w-auto cursor-pointer items-center justify-center outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:opacity-50',
          iconPosition === 'right' && 'mr-5',
          iconClassName,
        )}
      >
        {icon}
      </button>
    ) : (
      !loading && (
        <Container
          className={cn('w-auto items-center justify-center', iconPosition === 'right' && 'mr-5', iconClassName)}
        >
          {icon}
        </Container>
      )
    ));
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
        {iconPosition === 'left' && iconSlot}
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
          aria-describedby={messageId}
          data-cy={dataCy}
        />
        {iconPosition === 'right' && iconSlot}
      </Container>
      {message && (
        <Typography
          as="small"
          size="sm"
          id={messageId}
          role={messageType === 'error' ? 'alert' : undefined}
          className={cn('ml-1', messageClasses[messageType])}
        >
          {message}
        </Typography>
      )}
    </>
  );
}

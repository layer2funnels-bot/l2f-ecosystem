import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/util.ts';
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';
import { Tooltip } from './Overlay.tsx';

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="pm-spinner" width={size} height={size} viewBox="0 0 16 16" role="status" aria-label="Loading" focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconEnd, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('pm-btn', `pm-btn--${variant}`, size === 'sm' && 'pm-btn--sm', !children && 'pm-btn--icon', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} /> : null}
      {children ? <span className="pm-btn__label">{children}</span> : null}
      {iconEnd && !loading ? <Icon name={iconEnd} /> : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon'> {
  icon: IconName;
  /** Required: accessible name and tooltip text. */
  label: string;
  tooltip?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, tooltip, variant = 'ghost', ...rest },
  ref,
) {
  return (
    <Tooltip label={tooltip ?? label}>
      <Button ref={ref} variant={variant} icon={icon} aria-label={label} {...rest} />
    </Tooltip>
  );
});

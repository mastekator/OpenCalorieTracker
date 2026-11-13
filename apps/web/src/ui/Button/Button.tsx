import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import './Button.css';

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style'
> & {
  variant?: 'primary' | 'tonal' | 'plain' | 'danger' | 'danger-plain';
  /** Small: height 44, subhead, content width (e.g. «Unblock» in a list row). */
  small?: boolean;
  /** Spinner and no clicks; pass the verb with an ellipsis as children («Signing in…»). */
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  small = false,
  loading = false,
  disabled,
  type = 'button',
  onClick,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={`button button--${variant}${small ? ' button--small' : ''}`}
      // Loading keeps focus (VoiceOver, keyboard): aria-disabled instead of disabled.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (loading)
          event.preventDefault(); // also stops a form submit
        else onClick?.(event);
      }}
    >
      {loading && <span className="button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

import type { ReactNode } from 'react';
import './Badge.css';

type Props = {
  tone?: 'neutral' | 'ok' | 'warn' | 'err';
  children: ReactNode;
};

export function Badge({ tone = 'neutral', children }: Props) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

import { useEffect, useState, type ReactNode } from 'react';
import './Skeleton.css';

type Props = {
  /** CSS lengths, preferably tokens: `var(--control-height)`, `60%`. */
  width?: string;
  height?: string;
  radius?: string;
};

/** Placeholder in the shape of the coming content; wrap a group of them in <Delayed>. */
export function Skeleton({
  width = '100%',
  height = 'var(--control-height)',
  radius = 'var(--radius-md)',
}: Props) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** Renders nothing for the first `ms` (short waits show no loader at all, OCT-13 §3). */
export function Delayed({
  ms = 300,
  children,
}: {
  ms?: number;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return shown ? children : null;
}

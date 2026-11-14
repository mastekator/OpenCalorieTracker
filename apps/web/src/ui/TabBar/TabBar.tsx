import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../../i18n';
import { useIsCurrent, type NavItem } from '../nav';
import './TabBar.css';

type Props = {
  /** Four tabs; the camera button sits between the second and the third. */
  items: NavItem[];
  /** The camera button; what it opens is decided by the caller (OCT-16). */
  onAdd: () => void;
  /** Long press on the camera button (menu 5.5); the click that ends it is swallowed. */
  onLongPress?: () => void;
};

export const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export function TabBar({ items, onAdd, onLongPress }: Props) {
  const { t } = useT();
  const press = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const fired = useRef(false);
  const release = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const isCurrent = useIsCurrent();
  const tab = ({ href, icon: Icon, label }: NavItem) => (
    <li key={href}>
      <Link
        href={href}
        className="tabbar__tab"
        aria-current={isCurrent(href) ? 'page' : undefined}
      >
        <Icon aria-hidden="true" />
        {label}
      </Link>
    </li>
  );
  return (
    <nav className="tabbar" aria-label={t('nav.main')}>
      <ul>
        {items.slice(0, 2).map(tab)}
        <li>
          <button
            type="button"
            className="tabbar__camera"
            aria-label={t('nav.take_photo')}
            onClick={() => {
              if (fired.current) fired.current = false;
              else onAdd();
            }}
            onPointerDown={(event) => {
              if (!onLongPress) return;
              release();
              fired.current = false;
              press.current = {
                x: event.clientX,
                y: event.clientY,
                timer: setTimeout(() => {
                  press.current = null;
                  fired.current = true;
                  onLongPress();
                }, LONG_PRESS_MS),
              };
            }}
            onPointerMove={(event) => {
              const p = press.current;
              if (
                p &&
                Math.hypot(event.clientX - p.x, event.clientY - p.y) >
                  MOVE_TOLERANCE_PX
              )
                release();
            }}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            // No system callout / context menu on a long press (iOS, Android).
            onContextMenu={(event) => event.preventDefault()}
          >
            <Camera aria-hidden="true" />
          </button>
        </li>
        {items.slice(2).map(tab)}
      </ul>
    </nav>
  );
}

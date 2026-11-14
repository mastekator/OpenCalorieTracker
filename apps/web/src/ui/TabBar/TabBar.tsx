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
};

export function TabBar({ items, onAdd }: Props) {
  const { t } = useT();
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
            onClick={onAdd}
          >
            <Camera aria-hidden="true" />
          </button>
        </li>
        {items.slice(2).map(tab)}
      </ul>
    </nav>
  );
}

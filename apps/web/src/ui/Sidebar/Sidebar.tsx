import { Camera } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { useIsCurrent, type NavItem } from '../nav';
// The app icon master (OCT-25); Vite emits it as an asset.
import logo from '../../../../../docs/design/oct-25/icon.svg';
import './Sidebar.css';

type Props = {
  /** Main destinations: Today, Diary, Week, Profile. */
  items: NavItem[];
  /** Pinned to the bottom (Settings). */
  settings: NavItem;
  /** Signed-in user, shown under Settings. */
  email?: string;
  /** «Add food»; what it opens is decided by the caller (OCT-16). */
  onAdd: () => void;
};

export function Sidebar({ items, settings, email, onAdd }: Props) {
  const { t } = useT();
  const isCurrent = useIsCurrent();
  const link = ({ href, icon: Icon, label }: NavItem) => (
    <Link
      href={href}
      className="sidebar__link"
      aria-current={isCurrent(href) ? 'page' : undefined}
    >
      <Icon aria-hidden="true" />
      {label}
    </Link>
  );
  return (
    <nav className="sidebar" aria-label={t('nav.main')}>
      <div className="sidebar__brand">
        <img src={logo} alt="" />
        {t('common.appName')}
      </div>
      <Button onClick={onAdd}>
        <Camera aria-hidden="true" />
        {t('nav.add_food')}
      </Button>
      <ul>
        {items.map((item) => (
          <li key={item.href}>{link(item)}</li>
        ))}
      </ul>
      <div className="sidebar__footer">
        {link(settings)}
        {email && <p className="sidebar__email">{email}</p>}
      </div>
    </nav>
  );
}

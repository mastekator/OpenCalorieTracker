import type { ReactNode } from 'react';
import { BookOpen, ChartColumn, House, Settings2, User } from 'lucide-react';
import { useT } from '../i18n';
import type { NavItem } from '../ui/nav';
import { Sidebar } from '../ui/Sidebar/Sidebar';
import { TabBar } from '../ui/TabBar/TabBar';

// shortcut: camera / «Add food» do nothing until OCT-16 / OCT-56 add the photo flow.
const noop = () => {};

/** Signed-in layout: tab bar below 1024px, sidebar from 1024px (styles/layout.css). */
export function AppShell({
  email,
  children,
}: {
  email?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  const tabs: NavItem[] = [
    { href: '/', icon: House, label: t('nav.today') },
    { href: '/diary', icon: BookOpen, label: t('nav.diary') },
    { href: '/week', icon: ChartColumn, label: t('nav.week') },
    { href: '/profile', icon: User, label: t('nav.profile') },
  ];
  return (
    <div className="app-shell">
      <Sidebar
        items={tabs}
        settings={{
          href: '/settings',
          icon: Settings2,
          label: t('nav.settings'),
        }}
        email={email}
        onAdd={noop}
      />
      <div className="app-shell__content">{children}</div>
      <TabBar items={tabs} onAdd={noop} />
    </div>
  );
}

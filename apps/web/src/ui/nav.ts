import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'wouter';

/** One navigation destination, shared by TabBar and Sidebar. */
export type NavItem = { href: string; icon: LucideIcon; label: string };

/** True on the item's own screen and on screens nested under it (/settings/theme → /settings). */
export function useIsCurrent() {
  const [location] = useLocation();
  return (href: string) =>
    location === href ||
    (href !== '/' && location.startsWith(`${href}/`)) ||
    // The Week tab also holds the month view (OCT-19 §4).
    (href === '/week' && location.startsWith('/month/'));
}

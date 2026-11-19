import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'wouter';

/** One navigation destination, shared by TabBar and Sidebar. */
export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Another section this item holds, e.g. the tab bar's Profile holds /kitchen. */
  also?: string;
};

/** True on the item's own screen and on screens nested under it (/settings/theme → /settings). */
export function useIsCurrent() {
  const [location] = useLocation();
  return (href: string, also?: string) =>
    location === href ||
    (also !== undefined &&
      (location === also || location.startsWith(`${also}/`))) ||
    (href !== '/' && location.startsWith(`${href}/`)) ||
    // The Week tab also holds the month view (OCT-19 §4).
    (href === '/week' && location.startsWith('/month/'));
}

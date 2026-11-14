// Story helpers shared by TabBar, Sidebar and NavBar stories (not shipped in the app).
import type { Decorator } from '@storybook/react-vite';
import { BookOpen, ChartColumn, House, User } from 'lucide-react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { useT } from '../i18n';
import type { NavItem } from './nav';

/** The app's tabs with labels from the dictionary (locale toolbar switches RU / EN). */
export function useTabs(): NavItem[] {
  const { t } = useT();
  return [
    { href: '/', icon: House, label: t('nav.today') },
    { href: '/diary', icon: BookOpen, label: t('nav.diary') },
    { href: '/week', icon: ChartColumn, label: t('nav.week') },
    { href: '/profile', icon: User, label: t('nav.profile') },
  ];
}

/** Starts the story at `parameters.path`; links navigate inside the story. */
export const atPath: Decorator = (Story, { parameters }) => (
  <Router hook={memoryLocation({ path: parameters.path ?? '/' }).hook}>
    <Story />
  </Router>
);

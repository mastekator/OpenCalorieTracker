import { Info } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import {
  ALL_DONE,
  FROZEN,
  FROZEN_DAYS,
  NEWBIE,
  RESTART,
  RUNNING,
  TODAY,
  streaksOf,
} from './fixtures';
import { StreaksScreen } from './StreaksScreen';

const meta = {
  title: 'Week/Streaks/StreaksScreen',
  component: StreaksScreen,
  decorators: [
    // The app screen around it: «‹ Week», title, ⓘ while on (as in app/routes.tsx).
    function InScreen(Story, { args }) {
      const { t } = useT();
      return (
        <div className="screen screen--wide">
          <NavBar
            title={t('streaks.title')}
            back={{ href: '#', label: t('nav.week') }}
            action={
              args.streaks?.on === false
                ? undefined
                : { icon: Info, label: t('streaks.rules.title'), href: '#' }
            }
          />
          <main className="screen__body">{Story()}</main>
        </div>
      );
    },
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    streaks: streaksOf(RUNNING),
    today: TODAY,
    rulesOpen: false,
    onCloseRules: fn(),
    onEnable: fn(),
    onCloseFreezeNotice: fn(),
  },
} satisfies Meta<typeof StreaksScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 2.1 */
export const Running: Story = {};
export const RunningDark: Story = { globals: dark };
export const RunningRussian: Story = { globals: { locale: 'ru' } };
/** 2.2 */
export const Rules: Story = { args: { rulesOpen: true } };
export const RulesDark: Story = { ...Rules, globals: dark };
export const RulesRussian: Story = { ...Rules, globals: { locale: 'ru' } };
/** 3.1 */
export const Newbie: Story = { args: { streaks: streaksOf(NEWBIE) } };
export const NewbieDark: Story = { ...Newbie, globals: dark };
/** 3.2 */
export const NewStreak: Story = { args: { streaks: streaksOf(RESTART) } };
export const NewStreakDark: Story = { ...NewStreak, globals: dark };
/** 3.3: «Week frozen» until × */
export const Frozen: Story = {
  args: { streaks: streaksOf(FROZEN, true, { days: FROZEN_DAYS }) },
};
export const FrozenDark: Story = { ...Frozen, globals: dark };
export const FrozenRussian: Story = { ...Frozen, globals: { locale: 'ru' } };
/** 3.4: offline before the full pull; the OfflineBar comes from AppShell. */
export const Offline: Story = {
  args: {
    streaks: streaksOf(RUNNING, true, {
      fullSyncAt: null,
      pulledAt: new Date(2026, 10, 12, 18).getTime(),
    }),
  },
};
export const OfflineDark: Story = { ...Offline, globals: dark };
/** Every challenge of the month done. */
export const AllDone: Story = {
  args: { streaks: streaksOf(RUNNING, true, { challenges: ALL_DONE }) },
};
export const AllDoneDark: Story = { ...AllDone, globals: dark };
/** 3.5: skeletons after 300 ms. */
export const Loading: Story = { args: { streaks: undefined } };
export const LoadingDark: Story = { ...Loading, globals: dark };
/** 3.6 */
export const Off: Story = { args: { streaks: streaksOf(RUNNING, false) } };
export const OffDark: Story = { ...Off, globals: dark };
export const OffRussian: Story = { ...Off, globals: { locale: 'ru' } };
/** D.1: two columns, the right one kept for awards and past months. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
export const DesktopRules: Story = { ...Rules, globals: desktop };
export const DesktopOff: Story = { ...Off, globals: desktop };
export const DesktopFrozen: Story = { ...Frozen, globals: desktop };
export const DesktopFrozenDark: Story = {
  ...Frozen,
  globals: { ...desktop, ...dark },
};
export const DesktopOffline: Story = { ...Offline, globals: desktop };

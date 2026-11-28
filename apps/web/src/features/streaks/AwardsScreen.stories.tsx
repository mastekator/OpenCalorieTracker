import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { awardItems } from './awards';
import { AwardCard, AwardsBlock, AwardsScreen } from './AwardsScreen';
import { AWARDS_SOME, NEWBIE, RUNNING, streaksOf } from './fixtures';

const ITEMS = awardItems(streaksOf(RUNNING, true, AWARDS_SOME));
const NO_PHOTO = awardItems(
  streaksOf(RUNNING, true, { awards: [], stored: [], photoAi: false }),
);
const item = (key: string) => ITEMS.find((a) => a.key === key)!;

const meta = {
  title: 'Week/Streaks/AwardsScreen',
  component: AwardsScreen,
  decorators: [
    // As in app/routes.tsx: «‹ Streaks», «All awards».
    function InScreen(Story) {
      const { t } = useT();
      return (
        <div className="screen screen--wide">
          <NavBar
            title={t('awards.all')}
            back={{ href: '#', label: t('awards.back') }}
          />
          <main className="screen__body">{Story()}</main>
        </div>
      );
    },
  ],
  parameters: { layout: 'fullscreen' },
  args: { items: ITEMS, onOpen: fn() },
} satisfies Meta<typeof AwardsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 5.1: secret last; a not-yet secret shows nothing of its own. */
export const Screen: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findAllByRole('button', { name: /^Secret award/ }),
    ).toHaveLength(4);
  },
};
export const ScreenDark: Story = { globals: dark };
export const ScreenRussian: Story = { globals: { locale: 'ru' } };
/** AC-3.10: no photo AI and no photo award earned — no «Photo» group, «of 29». */
export const NoPhoto: Story = { args: { items: NO_PHOTO } };
export const Loading: Story = { args: { items: undefined } };
/** D.2: eight a row. */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };

/** 2.1: the block on the streak screen. */
export const Block: StoryObj<typeof AwardsBlock> = {
  render: (args) => (
    <div style={{ maxWidth: 420, padding: 'var(--space-4)' }}>
      <AwardsBlock {...args} />
    </div>
  ),
  args: { items: ITEMS, onOpen: fn(), onAll: fn() },
};
export const BlockDark: StoryObj<typeof AwardsBlock> = {
  ...Block,
  globals: dark,
};
/** 3.1: nothing earned yet. */
export const BlockEmpty: StoryObj<typeof AwardsBlock> = {
  ...Block,
  args: { ...Block.args, items: awardItems(streaksOf(NEWBIE)) },
};
export const BlockEmptyDark: StoryObj<typeof AwardsBlock> = {
  ...BlockEmpty,
  globals: dark,
};

const card = (key: string): StoryObj<typeof AwardCard> => ({
  render: (args) => <AwardCard {...args} />,
  args: { item: item(key), onClose: fn() },
});
/** 5.2 */
export const CardGot = card('weeks_26');
export const CardGotDark = { ...CardGot, globals: dark };
export const CardGotDesktop = { ...CardGot, globals: desktop };
/** 5.3 */
export const CardAhead = card('manual_25');
export const CardAheadDark = { ...CardAhead, globals: dark };
export const CardAheadDesktop = { ...CardAhead, globals: desktop };
/** 5.4: only «?», «Secret award» and the hint. */
export const CardSecret: StoryObj<typeof AwardCard> = {
  ...card('secret_comeback'),
  play: async ({ canvas }) => {
    await canvas.findByRole('dialog', { name: 'Secret award' });
    await expect(canvas.queryByText(/Welcome back/)).toBeNull();
  },
};
export const CardSecretDark = { ...CardSecret, globals: dark };
export const CardSecretDesktop = { ...CardSecret, globals: desktop };
/** 5.5: an earned secret reads as any other. */
export const CardSecretGot = card('secret_freeze');
export const CardSecretGotDark = { ...CardSecretGot, globals: dark };

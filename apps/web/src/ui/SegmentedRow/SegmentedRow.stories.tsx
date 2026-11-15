import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Globe, Moon } from 'lucide-react';
import { useT } from '../../i18n';
import { List } from '../List/List';
import { SegmentedRow } from './SegmentedRow';

type Theme = 'system' | 'light' | 'dark';

// Local state only: the settings screen saves and applies the value.
function Demo({ initial = 'system' }: { initial?: Theme }) {
  const { t } = useT();
  const [lang, setLang] = useState<'en' | 'ru'>('en');
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <List title={t('settings.group.appearance')}>
      <SegmentedRow
        icon={<Globe />}
        label={t('settings.language')}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Русский' },
        ]}
        value={lang}
        onChange={setLang}
      />
      <SegmentedRow
        icon={<Moon />}
        label={t('settings.theme')}
        options={(['system', 'light', 'dark'] as const).map((v) => ({
          value: v,
          label: t(`settings.theme_option.${v}`),
        }))}
        value={theme}
        onChange={setTheme}
      />
    </List>
  );
}

/** OCT-25 §4: a segment in a list row. Theme and language: toolbar; Dark stories below. */
const meta = {
  title: 'UI/SegmentedRow',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

export const Default: Story = {};
export const DefaultDark: Story = { ...Default, ...dark };
export const ThirdSelected: Story = { args: { initial: 'dark' } };
export const ThirdSelectedDark: Story = { ...ThirdSelected, ...dark };
/** iPhone SE: three labels fit in equal segments. */
export const Narrow: Story = {
  globals: { viewport: { value: 'iphoneSE' } },
};
export const NarrowDark: Story = {
  globals: { viewport: { value: 'iphoneSE' }, theme: 'dark' },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};

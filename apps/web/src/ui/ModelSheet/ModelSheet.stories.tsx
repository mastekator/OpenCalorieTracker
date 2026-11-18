import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AiModelInfo } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ModelSheet } from './ModelSheet';

const gemini: AiModelInfo[] = [
  { id: 'gemini-3.5-flash-lite', vision: true },
  { id: 'gemini-3.8-flash', vision: true },
  { id: 'gemini-3.8-pro', vision: true },
  { id: 'gemini-3.8-flash-image', vision: true },
  { id: 'gemma-4-27b-it', vision: true },
  { id: 'gemma-4-2b-it', vision: false },
  { id: 'gemini-3.8-flash-tts', vision: false },
];
const vendors = ['qwen', 'zhipu', 'mistral', 'meta', 'google', 'nousresearch'];
/** OpenRouter-sized: 347 models, a third of them silent about photos. */
const router: AiModelInfo[] = Array.from({ length: 347 }, (_, i) => ({
  id: `${vendors[i % vendors.length]}/${i % 4 === 0 ? 'vl' : 'chat'}-model-${i}`,
  vision: i % 3 === 0 ? null : i % 3 === 1,
}));

type Props = ComponentProps<typeof ModelSheet>;

// Opens on load; the button reopens it after a pick.
function Demo({ failed, ...args }: Partial<Props> & { failed?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(args.value ?? '');
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {value || 'Model'}
      </Button>
      <ModelSheet
        models={gemini}
        loading={false}
        error={
          failed
            ? t('ai.models.failed', {
                reason: t('ai.models.reason.auth_error'),
              })
            : null
        }
        onRefresh={() => {}}
        {...args}
        open={open}
        value={value}
        onClose={() => setOpen(false)}
        onPick={(model) => {
          setValue(model);
          setOpen(false);
        }}
      />
    </>
  );
}

/** Model picker on «AI provider», OCT-248 1.4 and §2. */
const meta = {
  title: 'UI/ModelSheet',
  component: Demo,
  args: { value: 'gemini-3.5-flash-lite' },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 1.4 Photo models first, «No photos» below, «Enter the name manually» at the bottom. */
export const List: Story = {};
export const ListDark: Story = { ...dark };
/** 2.1 Long list (OpenRouter) with a search: the match is highlighted. */
export const LongSearch: Story = {
  args: { models: router, value: 'qwen/vl-model-0', initialQuery: 'vl' },
};
export const LongSearchDark: Story = { ...LongSearch, ...dark };
/** 2.1 Long list without a search: three groups. */
export const Long: Story = { args: { models: router, value: '' } };
export const LongDark: Story = { ...Long, ...dark };
/** 2.2 Nothing found: one tap puts the query into manual entry. */
export const NothingFound: Story = { args: { initialQuery: 'gpt-9-vision' } };
export const NothingFoundDark: Story = { ...NothingFound, ...dark };
/** The list is on its way. */
export const Loading: Story = { args: { models: null, loading: true } };
export const LoadingDark: Story = { ...Loading, ...dark };
/** 2.3 The list didn't come: the reason, the name field at once. */
export const Failed: Story = {
  args: {
    models: null,
    failed: true,
  },
};
export const FailedDark: Story = { ...Failed, ...dark };

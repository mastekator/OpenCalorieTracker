import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { List, ListRow } from '../List/List';
import { Segment } from '../Segment/Segment';
import {
  FormRow,
  HeightFtIn,
  InlineDate,
  InlineNumber,
  PickValue,
} from './FormList';

type Props = {
  empty?: boolean;
  us?: boolean;
  error?: boolean;
  readOnly?: boolean;
};

// Sample screen copy (OCT-22 §6); the keys arrive with the profile screen (OCT-87).
const copy = {
  en: {
    calc: 'For the calculation',
    sex: 'Sex for the formula',
    male: 'Male',
    female: 'Female',
    birth: 'Date of birth',
    age: '30 years',
    height: 'Height',
    weight: 'Weight',
    deadline: 'By date',
    optional: 'optional',
    cm: 'cm',
    kg: 'kg',
    lb: 'lb',
    hint: 'The formula differs for men and women — choose which one to use. This isn’t a question about who you are.',
    error: 'Height: 100 to 250 cm',
  },
  ru: {
    calc: 'Для расчёта',
    sex: 'Пол для расчёта',
    male: 'Мужская',
    female: 'Женская',
    birth: 'Дата рождения',
    age: '30 лет',
    height: 'Рост',
    weight: 'Вес',
    deadline: 'Срок',
    optional: 'необязательно',
    cm: 'см',
    kg: 'кг',
    lb: 'lb',
    hint: 'Формула расчёта разная для мужчин и женщин — выберите, по какой считать. Это не вопрос о том, кто вы.',
    error: 'Рост: от 100 до 250 см',
  },
};

function Form({
  empty = false,
  us = false,
  error = false,
  readOnly = false,
}: Props) {
  const { t, locale } = useT();
  const c = copy[locale === 'ru' ? 'ru' : 'en'];
  const [sex, setSex] = useState<'male' | 'female' | ''>(empty ? '' : 'male');
  const [birth, setBirth] = useState<string | null>(
    empty ? null : '1996-03-14',
  );
  const [height, setHeight] = useState<number | null>(
    empty ? null : error ? 260 : 180,
  );
  const [ftIn, setFtIn] = useState({
    ft: empty ? null : 5,
    in: empty ? null : error ? 12 : 11,
  } as { ft: number | null; in: number | null });
  const [weight, setWeight] = useState<number | null>(
    empty ? null : us ? 176.4 : 80,
  );
  const [deadline, setDeadline] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gap: 'var(--section-gap)' }}>
      <List title={c.calc} footer={error && !us ? c.error : c.hint}>
        <FormRow label={c.sex} stacked>
          <Segment
            label={c.sex}
            options={[
              { value: 'male', label: c.male },
              { value: 'female', label: c.female },
            ]}
            value={sex as 'male' | 'female'}
            onChange={setSex}
          />
        </FormRow>
        <FormRow label={c.birth}>
          <InlineDate
            label={c.birth}
            value={birth}
            onChange={setBirth}
            suffix={c.age}
            readOnly={readOnly}
          />
        </FormRow>
        <FormRow label={c.height}>
          {us ? (
            <HeightFtIn
              label={c.height}
              value={ftIn}
              onChange={setFtIn}
              readOnly={readOnly}
            />
          ) : (
            <InlineNumber
              label={c.height}
              value={height}
              onChange={setHeight}
              unit={c.cm}
              error={error}
              readOnly={readOnly}
            />
          )}
        </FormRow>
        <FormRow label={c.weight}>
          <InlineNumber
            label={c.weight}
            value={weight}
            onChange={setWeight}
            unit={us ? c.lb : c.kg}
            decimals={1}
            readOnly={readOnly}
          />
        </FormRow>
        <ListRow
          value={
            <PickValue value={empty ? null : t('activity.moderate.name')} />
          }
          description={empty ? undefined : t('activity.moderate.desc')}
          onClick={readOnly ? undefined : () => {}}
          chevron={!readOnly}
        >
          {t('activity.title')}
        </ListRow>
        <FormRow label={c.deadline}>
          <InlineDate
            label={c.deadline}
            value={deadline}
            onChange={setDeadline}
            placeholder={c.optional}
            readOnly={readOnly}
          />
        </FormRow>
      </List>
    </div>
  );
}

const meta = {
  title: 'UI/FormList',
  component: Form,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Form>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {};
/** 8.1 / 8.2: every value is an accent «Add» / «Choose», no sex selected. */
export const Empty: Story = { args: { empty: true } };
/** 8.11: value out of range. */
export const Error: Story = { args: { error: true } };
/** 8.19: feet and inches, pounds. */
export const UsUnits: Story = { args: { us: true } };
/** 8.19: 12 inches is an error. */
export const UsInchesError: Story = { args: { us: true, error: true } };
/** 8.15: offline, read-only. */
export const ReadOnly: Story = { args: { readOnly: true } };
export const Focused: Story = {
  parameters: { pseudo: { focus: true, focusVisible: true } },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const EmptyDark: Story = { ...Empty, globals: { theme: 'dark' } };
export const ErrorDark: Story = { ...Error, globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };

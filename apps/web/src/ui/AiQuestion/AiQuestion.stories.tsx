import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AiQuestion } from './AiQuestion';

/** Tapping works, as on the edit screen. */
function Demo(props: ComponentProps<typeof AiQuestion>) {
  const [chosen, setChosen] = useState(props.chosen);
  return (
    <AiQuestion
      {...props}
      chosen={chosen}
      onChoose={(i) => {
        setChosen(i);
        props.onChoose(i);
      }}
    />
  );
}

const meta = {
  title: 'UI/AiQuestion',
  component: AiQuestion,
  render: (args) => <Demo {...args} />,
  args: {
    text: 'What’s the salad dressing?',
    options: [
      { label: 'Mayo' },
      { label: 'Yogurt' },
      { label: 'Oil' },
      { label: 'No dressing' },
    ],
    guess: 0,
    onChoose: fn(),
    onOther: fn(),
  },
} satisfies Meta<typeof AiQuestion>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** H.1: the AI's guess checked, nothing answered yet. */
export const Default: Story = {};
export const DefaultDark: Story = { globals: dark };
/** H.2: «Yogurt» tapped. */
export const Answered: Story = { args: { chosen: 1 } };
export const AnsweredDark: Story = { args: { chosen: 1 }, globals: dark };
/** H.8: offline — the options work, «Other…» says why it waits. */
const offline = { otherOff: 'Needs a connection' };
export const OtherOff: Story = { args: offline };
export const OtherOffDark: Story = { args: offline, globals: dark };
/** Long texts wrap, never cut. */
const long = {
  text: 'Was the cheesecake baked with full-fat cream cheese or a lighter cottage cheese and yogurt base?',
  options: [
    { label: 'Classic, full-fat cream cheese' },
    { label: 'Light, cottage cheese and Greek yogurt' },
  ],
};
export const LongTexts: Story = { args: long };
export const LongTextsDark: Story = { args: long, globals: dark };
/** OCT-352 3.1: the user's recipe — a chef's hat and its kcal per 100 g. */
const recipe = {
  text: 'Is it your recipe?',
  options: [
    { label: 'My cheesecake', hint: '160\u00a0kcal/100\u00a0g' },
    { label: 'Light cheesecake', hint: '160\u00a0kcal/100\u00a0g' },
    { label: 'Regular cheesecake' },
  ],
  guess: 2,
};
export const Recipe: Story = { args: recipe };
export const RecipeDark: Story = { args: recipe, globals: dark };
export const RecipeChosen: Story = { args: { ...recipe, chosen: 0 } };
export const RecipeChosenDark: Story = {
  args: { ...recipe, chosen: 0 },
  globals: dark,
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};

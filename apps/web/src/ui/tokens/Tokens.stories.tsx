import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import css from '../../styles/tokens.css?raw';
import { parseTokens } from './parseTokens';
import './Tokens.css';

// The sample shows the live value through var(), so the theme toolbar switches it.
function Sample({ name }: { name: string }) {
  const value = `var(${name})`;
  let style: CSSProperties | undefined;
  if (/^--(color|theme-color|tabbar-bg)/.test(name))
    style = { background: value };
  else if (name.startsWith('--shadow')) style = { boxShadow: value };
  else if (name.startsWith('--radius'))
    style = { borderRadius: value, background: 'var(--color-accent-soft)' };
  else if (/^--(space|screen-gutter|section-gap|desktop-gutter)/.test(name))
    return (
      <div className="tokens__sample">
        <div className="tokens__bar" style={{ width: value }} />
      </div>
    );
  else if (/^--text-.*-size$/.test(name))
    return (
      <div className="tokens__sample" style={{ fontSize: value }}>
        Aa
      </div>
    );
  else if (name.startsWith('--font'))
    return (
      <div className="tokens__sample" style={{ fontFamily: value }}>
        Aa
      </div>
    );
  return <div className="tokens__sample" style={style} />;
}

function Tokens() {
  return (
    <div className="tokens">
      {parseTokens(css).map((group) => (
        <section key={group.title} className="tokens__group">
          <h2 className="tokens__title">{group.title}</h2>
          {group.tokens.map((token) => (
            <div key={token.name} className="tokens__row">
              <Sample name={token.name} />
              <div>
                <div className="tokens__name">{token.name}</div>
                <div className="tokens__value">{token.value}</div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  component: Tokens,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Tokens>;
export default meta;

export const AllTokens: StoryObj<typeof meta> = {};

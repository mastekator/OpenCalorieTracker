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
      <div className="tokens__text" style={{ fontSize: value }}>
        Aa
      </div>
    );
  else if (/^--text-.*-weight$/.test(name))
    return (
      <div className="tokens__text" style={{ fontWeight: value }}>
        Aa
      </div>
    );
  else if (name.startsWith('--font'))
    return (
      <div className="tokens__text" style={{ fontFamily: value }}>
        Aa
      </div>
    );
  return <div className="tokens__sample" style={style} />;
}

// Values of the active theme; the story remounts on the theme toolbar switch.
function Tokens() {
  const root = getComputedStyle(document.documentElement);
  return (
    <div className="tokens">
      {parseTokens(css).map((group) => (
        <section key={group.title} className="tokens__group">
          <h2 className="tokens__title">{group.title}</h2>
          <div className="tokens__rows">
            {group.tokens.map((token) => (
              <div key={token.name} className="tokens__row">
                <Sample name={token.name} />
                <div>
                  <div className="tokens__name">{token.name}</div>
                  <div className="tokens__value">
                    {root.getPropertyValue(token.name).trim() || token.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  component: Tokens,
  parameters: { layout: 'fullscreen' },
  render: (_, { globals }) => <Tokens key={globals.theme} />,
} satisfies Meta<typeof Tokens>;
export default meta;

export const AllTokens: StoryObj<typeof meta> = {};

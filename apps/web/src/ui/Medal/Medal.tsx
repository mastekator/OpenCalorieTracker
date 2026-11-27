import { useId } from 'react';
import { AWARDS, type AwardKey, type AwardRarity } from '@oct/shared';
import { ART, SECRET_GLYPH, SHAPES } from './art';
import './Medal.css';

export type MedalState = 'got' | 'locked' | 'secret';

const METAL: Record<AwardRarity, string> = {
  common: 'bronze',
  rare: 'silver',
  epic: 'gold',
  legendary: 'platinum',
};
const BY_KEY = new Map(AWARDS.map((a) => [a.key as AwardKey, a]));
const v = (name: string) => `var(--medal-${name})`;

/**
 * An award medal (OCT-184): silhouette = category, metal and rim mark = rarity, glyph = the award,
 * plaque = the count. `secret` is a not-yet-earned secret award: a star silhouette with «?», nothing
 * of its own. Without `label` the medal is decorative.
 */
export function Medal({
  awardKey,
  state,
  size = 'md',
  label,
}: {
  awardKey: AwardKey;
  state: MedalState;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const gradient = useId();
  const award = BY_KEY.get(awardKey)!;
  const secret = state === 'secret';
  const locked = state !== 'got';
  const category = secret ? 'secret' : award.category;
  const rarity = secret ? 'common' : award.rarity;
  const metal = METAL[award.rarity];
  const shape = SHAPES[category];
  const num = secret ? undefined : ART[awardKey].num;
  const fill = v('locked-fill');
  const deep = locked ? v('locked-line') : v(`${metal}-deep`);
  const hi = v(`${metal}-hi`);
  const base = v(`${metal}-base`);
  const ink = locked ? v('locked-line') : v(`ink-${category}`);
  const k = num ? 1.75 : 1.95;

  return (
    <svg
      className={`medal medal--${size}`}
      viewBox="0 0 120 120"
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {!locked && (
        <defs>
          <linearGradient
            id={gradient}
            x1="20"
            y1="10"
            x2="100"
            y2="110"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" style={{ stopColor: hi }} />
            <stop offset=".45" style={{ stopColor: base }} />
            <stop offset="1" style={{ stopColor: deep }} />
          </linearGradient>
        </defs>
      )}
      <g transform="translate(60 60)">
        {rarity === 'legendary' && (
          <g
            style={{ fill: locked ? v('locked-line') : base }}
            opacity={locked ? 0.45 : undefined}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <path
                key={i}
                d="M-3,-50L0,-59L3,-50Z"
                transform={`rotate(${i * 22.5 + 11.25})`}
              />
            ))}
          </g>
        )}
        <path
          d={shape}
          style={{ fill: locked ? fill : `url("#${gradient}")`, stroke: deep }}
          strokeWidth="1.6"
          strokeDasharray={locked ? '4 3' : undefined}
        />
        {!locked && (
          <path
            d={shape}
            transform="scale(.93)"
            fill="none"
            style={{ stroke: v('shine') }}
            strokeWidth="1.6"
            strokeDasharray="70 400"
            strokeDashoffset="-150"
            strokeLinecap="round"
          />
        )}
        {/* Rarity is also a rim mark, not colour only: rare = engraved line, epic and up = beads. */}
        {rarity === 'rare' && (
          <path
            d={shape}
            transform="scale(.86)"
            fill="none"
            style={{ stroke: deep }}
            strokeWidth="1.4"
            opacity={0.75}
          />
        )}
        {(rarity === 'epic' || rarity === 'legendary') && (
          <path
            d={shape}
            transform="scale(.865)"
            fill="none"
            style={{ stroke: locked ? deep : hi }}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray="0 7.2"
            opacity={locked ? 0.7 : undefined}
          />
        )}
        <path
          d={shape}
          transform="scale(.74)"
          style={{
            fill: locked ? 'none' : v(`enamel-${category}`),
            stroke: deep,
          }}
          strokeWidth="2.2"
        />
        <g
          data-glyph={secret ? 'secret' : awardKey}
          transform={`translate(${-12 * k} ${num ? -26 : -12 * k}) scale(${k})`}
          fill="none"
          style={{ stroke: ink, color: ink }}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={locked && !secret ? 0.8 : undefined}
        >
          {secret ? SECRET_GLYPH : ART[awardKey].glyph}
        </g>
        {num && (
          <>
            <rect
              x={-(num.length * 8.6 + 14) / 2}
              y="21"
              width={num.length * 8.6 + 14}
              height="19"
              rx="9.5"
              style={{
                fill: locked ? fill : deep,
                stroke: locked ? deep : 'none',
              }}
              strokeWidth="1.4"
            />
            <text
              className="medal__num"
              x="0"
              y="35"
              textAnchor="middle"
              style={{ fill: locked ? deep : v('plaque-text') }}
            >
              {num}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}

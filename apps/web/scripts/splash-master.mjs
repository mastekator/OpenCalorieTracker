// Splash masters (design OCT-217): the closed pod, the first frame of the launch animation
// (lid turned 17° on its left tip, peas not out yet). The pod colour follows the ground, so one master per theme.
// Colours = --logo-pod / --logo-pod-on-dark in src/styles/tokens.css.
import { writeFileSync } from 'node:fs';

const pod = (
  fill,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">
  <path d="M6 50C22 86 78 86 94 48C76 66 24 66 6 50Z" fill="${fill}"/>
  <g transform="rotate(17 6 48)">
    <path d="M6 46C20 20 66 12 92 34C70 26 30 30 6 46Z" fill="${fill}"/>
    <path d="M92 34c3-4 4-9 2-13" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>
`;
writeFileSync('public/splash-light.svg', pod('#13784A'));
writeFileSync('public/splash-dark.svg', pod('#5FD394'));

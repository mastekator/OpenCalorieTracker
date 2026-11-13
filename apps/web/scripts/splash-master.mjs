// Splash screens are plain images, so iOS does not mask them: round the icon here
// (design OCT-25 §1.3, .app-icon radius 22.5% of 1024 = 230). Corners stay transparent.
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const open = svg.indexOf('>', svg.indexOf('<svg')) + 1;
const close = svg.lastIndexOf('</svg>');
writeFileSync(
  'public/icon-splash.svg',
  `${svg.slice(0, open)}
  <defs><clipPath id="splash-round"><rect width="1024" height="1024" rx="230"/></clipPath></defs>
  <g clip-path="url(#splash-round)">${svg.slice(open, close)}</g>
</svg>
`,
);

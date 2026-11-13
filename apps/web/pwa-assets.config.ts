import {
  AllAppleDeviceNames,
  appleSplashScreenSizes,
  defineConfig,
  type AppleDeviceSize,
} from '@vite-pwa/assets-generator/config';

// Run `pnpm --filter web icons` after changing docs/design/oct-25/icon.svg; the PNGs are committed (ADR-0012).
// Colours = --theme-color in src/styles/tokens.css (light / dark).
const LIGHT = '#F8FAF9';
const DARK = '#0E1110';
// Splash icon size in CSS px (design OCT-25 §1, --splash-icon-size).
const SPLASH_ICON = 120;

// The generator only knows iPhones up to the 11; newer screens (portrait px, scale 3).
const NEW_IPHONES: AppleDeviceSize[] = [
  [1170, 2532], // 12, 13, 14
  [1284, 2778], // 12/13 Pro Max, 14 Plus
  [1179, 2556], // 14 Pro, 15, 16
  [1290, 2796], // 14 Pro Max, 15 Plus, 16 Plus
  [1206, 2622], // 16 Pro, 17
  [1260, 2736], // Air
  [1320, 2868], // 16 Pro Max, 17 Pro Max
].map(([width, height]) => ({
  width: width!,
  height: height!,
  scaleFactor: 3,
}));

const iphones = [
  ...AllAppleDeviceNames.filter((name) => name.startsWith('iPhone')).map(
    (name) => appleSplashScreenSizes[name],
  ),
  ...NEW_IPHONES,
];

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [192, 512],
      padding: 0,
      favicons: [[48, 'favicon.ico']],
    },
    maskable: { sizes: [] },
    apple: { sizes: [180], padding: 0 },
    appleSplashScreens: {
      // Unique screens only: several devices share a size.
      sizes: [
        ...new Map(iphones.map((s) => [`${s.width}x${s.height}`, s])).values(),
      ].map((s) => ({
        ...s,
        // Padding is relative to the short side, so the icon stays SPLASH_ICON points wide.
        padding: 1 - (SPLASH_ICON * s.scaleFactor) / s.width,
      })),
      resizeOptions: { background: LIGHT },
      darkResizeOptions: { background: DARK },
    },
  },
  // The generator writes next to the image, so the script copies the master into public/ first.
  images: ['public/icon.svg'],
});

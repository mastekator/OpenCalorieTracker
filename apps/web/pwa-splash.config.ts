import {
  AllAppleDeviceNames,
  appleSplashScreenSizes,
  defineConfig,
  type AppleDeviceSize,
} from '@vite-pwa/assets-generator/config';

// iPhone splash screens from the rounded master (scripts/splash-master.mjs); run via `pnpm --filter web icons`.
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
  preset: {
    // The generator requires these presets; icons come from pwa-assets.config.ts.
    transparent: { sizes: [] },
    maskable: { sizes: [] },
    apple: { sizes: [] },
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
  // Temporary master written and removed by the icons script.
  images: ['public/icon-splash.svg'],
});

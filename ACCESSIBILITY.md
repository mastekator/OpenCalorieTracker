# Accessibility

We aim for [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA on phones and desktops. The app has **not** been audited against it, so we do not claim conformance. This page says what is in place and what is known to be missing.

## What is in place

- **Keyboard.** Every control is reachable with Tab and shows a visible focus ring. Sheets and dialogs are native modal dialogs: they move focus to their title, keep Tab inside, close with Escape, and return focus to the control that opened them. Sliders such as the weight ruler work with the arrow keys.
- **Touch targets.** Every control has a hit area of at least 44 × 44 px.
- **Themes.** Light and dark themes, following the system by default. Text contrast is designed to be at least 4.5:1, and field borders and graphics at least 3:1, in both themes.
- **Screen readers.** Sheets are labelled by their titles, icon-only buttons have labels, decorative icons are hidden, the weight and calorie charts have a text label, and status messages are announced. The page language follows the chosen language (English or Russian).
- **Motion.** Animations respect the system's reduced-motion setting.
- **Zoom.** The page can be zoomed; the viewport does not block it.

Keyboard focus in sheets is covered by automated tests.

## Known gaps

- No automated accessibility checks run in CI, and contrast is not re-measured automatically when colors change.
- The app has not been tested end to end with screen readers (VoiceOver, TalkBack, NVDA).
- Charts give a short summary, not the full data as text.
- Gestures, such as swiping a row to delete it, have not been checked everywhere for a single-tap alternative.

## Reporting a problem

Open an [issue](https://github.com/mastekator/OpenCalorieTracker/issues/new/choose) and describe the screen, your device and browser, any assistive technology you use, and what got in your way. Accessibility problems are treated as bugs.

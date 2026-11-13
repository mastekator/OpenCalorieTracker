# Product

<!-- impeccable:product-schema 1 -->
<!-- Inferred from the project description and the design document «Дизайн-документ OpenCalorieTracker» (no interview round was possible; owner comments in OCT-13 are the confirmation channel). -->

## Platform

adaptive

## Users
Primary: a self-hoster who installs OpenCalorieTracker for themselves, family or friends and logs every meal from an iPhone PWA on the home screen, several times a day, often one-handed at the table. Secondary: the same people on a desktop browser reviewing the diary. The instance owner also acts as admin (invites, users, lockouts).

## Product Purpose
Count calories from a photo: photo → vision model of a pluggable AI provider → dishes with grams, kcal and macros → quick correction → diary. Success: the "snap → correct → save" loop takes seconds and the numbers are trusted.

## Positioning
Open source (AGPL-3.0), self-hosted, one Docker container (Hono + SQLite). No default AI provider: bring your own (Gemini, OpenAI, Anthropic, OpenRouter, Ollama…); without one, manual mode works. Your food data stays on your server — no accounts with a vendor, no ads, no subscriptions.

## Operating Context
Logged at meal time: kitchen, canteen, restaurant, under any light. Photo of a plate is the entry point. Diary per day, daily calorie goal, macros (protein / fat / carbs). Sign-in by passkey first, password as fallback; invites by link.

## Capabilities and Constraints
PWA (iOS home screen first), light and dark theme, RU and EN. Must work offline for viewing and degrade gracefully. All visual values live in one token file. Touch targets ≥ 44pt, safe areas, VoiceOver labels, WCAG AA contrast.

## Brand Commitments
Name: OpenCalorieTracker. Owner feedback (2026-11-13): the first visual pass (system font, iOS-like neutral palette, green accent) reads as "very generic" — the product needs its own recognisable look.

## Evidence on Hand
No logo, illustrations or photography yet. Real content is the user's own meals and numbers; demo content in mockups is synthetic.

## Product Principles
- Minimum taps on the main loop: snap → correct → save.
- Numbers first: kcal and grams must be readable at a glance and editable in place.
- Honest about AI: estimates are shown as editable estimates, never as facts.
- Owned, not rented: self-hosted calm, no gamification pressure, no dark patterns.

## Accessibility & Inclusion
WCAG 2.1 AA in both themes, Dynamic Type friendly sizes, VoiceOver labels on every control, reduced-motion respected.

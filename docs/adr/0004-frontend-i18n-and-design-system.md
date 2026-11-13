# ADR-0004: Frontend structure, i18n and the design system

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** @mastekator95 (owner), @lead

## Context

`apps/web` is a React + Vite PWA used mostly as an iPhone home-screen app and also in desktop browsers (one breakpoint, 1024 px). The approved visual system (design OCT-13) defines `tokens.css` as the only place for visual values, a set of base components, Lucide icons, and RU/EN texts. The interface defaults to English, Russian is a switch; the choice is stored in the account; before sign-in the browser language is used. The owner decided that the design system has a living showcase in Storybook (OCT-31). The bundle must stay small for weak phones and offline caching.

## Decision

### Layout of `apps/web/src`

```
main.tsx               # mounts <App/>
app/                   # App.tsx (providers + routes), routes.tsx, AuthGate, layouts (AuthLayout, AppShell)
api/                   # client.ts: fetch wrapper -> typed result or ApiError(code); one file per area (auth.ts, admin.ts…)
i18n/                  # en.ts, ru.ts, index.tsx (I18nProvider, useT)
styles/                # tokens.css (copied verbatim from docs/design/oct-13), base.css (reset, body, focus), layout.css (all @media for the 1024 px breakpoint)
ui/                    # base components from OCT-13: Button/, Field/, PasswordRules/, Segment/, List/, Badge/, Banner/, OfflineBar/, Sheet/, ConfirmDialog/, Toast/, ScreenState/, Skeleton/, TabBar/, Sidebar/, NavBar/
features/<area>/       # screens and feature components: auth/, settings/, admin/, later meals/, diary/…
```

- A component folder holds `Name.tsx`, `Name.css`, `Name.stories.tsx` (and `Name.test.tsx` when it has logic). Screens import from `ui/`, never style base components from outside.
- **Styling:** plain CSS files imported by the component, class names prefixed by the component (`.button`, `.button--primary`). Values only through `var(--…)` from `tokens.css`. No CSS-in-JS, no Tailwind, no UI kit. The 1024 px breakpoint appears only in `styles/layout.css` (CSS variables cannot be used in `@media`); if JS needs it, `matchMedia` with the constant from `styles/breakpoints.ts`, whose comment points to `layout.css`.
- **Theme:** `data-theme` on `<html>` set by a tiny inline script in `index.html` from `localStorage` before first paint; `system` removes the attribute. Two `<meta name="theme-color">` with `media`.
- **Icons:** `lucide-react` (tree-shaken named imports), stroke 1.75, sizes 24/20.
- **Routing:** `wouter` (~2 KB) — every screen has its own URL, browser Back works (OCT-13 §4.1). Routes outside the app: `/login`, `/invite`, `/recover`, `/register`; everything else is behind `AuthGate`, which redirects to `/login?next=<path>` on 401 and returns there after sign-in (AC-5.3).
- **Data:** `api/client.ts` wraps `fetch` (`credentials: 'same-origin'`, JSON, parses `{error:{code}}` into `ApiError`), typed with `packages/shared`. Server state lives in the screens that use it plus two React contexts: `ConfigContext` (`GET /api/config`) and `SessionContext` (`GET /api/auth/me`). No data-fetching or state library for now; offline caching and the outbox are decided in OCT-26.

### i18n

- Own dictionary, no library. `i18n/en.ts` is the source: a nested object of strings with `{name}` placeholders; `ru.ts` is typed `typeof en`, so a missing key fails `typecheck`. `useT()` returns `t('auth.login.title', { name })`. Plurals with `Intl.PluralRules` (`{ one, few, many, other }` objects), numbers and dates with `Intl.NumberFormat` / `Intl.DateTimeFormat` for the active locale.
- API error codes are translated under `errors.<code>` with a generic fallback.
- Active locale: `users.locale` once signed in; before that `navigator.language` (`ru*` → `ru`, else `en`). The switch in settings (OCT-6) saves to the account and to `localStorage` for the next cold start. `<html lang>` follows the locale.
- **AI locale:** the server passes `users.locale` to AI operations (ADR-0005); dish names come back in that language. The client never sends a locale to the AI.
- Adding a language later = one dictionary file + the locale in the shared `Locale` union.

### Design system and Storybook

- `styles/tokens.css` is copied from `docs/design/oct-13/tokens.css` unchanged; later design changes edit this one file.
- Base components live in `apps/web/src/ui/`. **OCT-31** sets up Storybook in `apps/web` (dev dependency, not in the image), a tokens page that reads `tokens.css`, stories for every base component, and the publish workflow. This ADR does not duplicate that task; it only fixes where things live.
- Rule from now on: every new UI component comes with its story in the same PR.

## Options Considered

- **i18next / react-intl.** Mature, but 15–40 KB and runtime features (namespaces, backends) we do not need for two bundled languages. Own typed dictionary gives compile-time key checks. Rejected.
- **React Router.** Full-featured but ~10× the size of wouter for ~20 flat routes. Rejected.
- **TanStack Query.** Good cache/retry story; revisit in OCT-26 together with offline, where it would interact with the service worker cache. Not added now.
- **CSS Modules / Tailwind.** CSS Modules would be fine but add naming indirection for no real collision risk in a small app; Tailwind conflicts with "values only from tokens.css". Rejected.

## Consequences

- The web app has two runtime dependencies beyond React for this epic: `wouter`, `lucide-react` (+ `@simplewebauthn/browser` for passkeys).
- Translations are reviewed like code; a key missing in `ru.ts` breaks CI.
- Storybook stories double as the visual review surface for @designer.

## Action Items

1. [ ] OCT-2 task "Web foundation": `styles/`, `i18n/`, `api/client.ts`, contexts, routing skeleton.
2. [ ] OCT-31: Storybook, base components in `ui/`, publishing.
3. [ ] OCT-2 screen tasks build on both.

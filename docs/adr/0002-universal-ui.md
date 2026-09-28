# ADR-0002: Universal UI styling (React Native StyleSheet plus tokens in the MVP)

- Status: Accepted for the MVP (closed pilot, go/no-go Fri 2026-11-27). Uniwind/NativeWind decision deferred to phase 2.
- Date: 2026-10-07
- Deciders: Dev A, Dev B (lead review)
- Supersedes: escalation ESC-4 (Plan-01 interface sheet)

## Context

Sanchay renders one set of universal screens (`packages/features`) on the web (Next 16 via
react-native-web at app.sanchay.in) and on Android (Expo 57). We need a styling approach that
works on both targets today, with no build-time CSS pipeline in the shared packages, and that
the AI coding agents can test in jsdom without a device.

Candidates were React Native `StyleSheet` plus design tokens, Uniwind, and NativeWind.

## Decision

1. For the MVP, `@sanchay/ui` and `@sanchay/features` style components with React Native
   `StyleSheet.create` and values from `@sanchay/tokens` only (colours, font sizes, line heights,
   font weights, `space()`, radii, `minTouchTarget = 48`). No raw hex values or magic numbers in
   components.
2. Primitives are tested with Vitest in jsdom, with `react-native` aliased to `react-native-web`,
   web-first extensions (`.web.tsx` first) and `esbuild: { jsx: 'automatic' }` (X-06).
3. Component props (`AppText`, `Button`, `Card`, `Screen`, `TextField`, `OtpInput`, `Banner`) are
   the stable interface. A later switch to a class-name styling engine must not change them.
4. The Uniwind or NativeWind choice is re-opened in phase 2 (P2-2 platform hardening, or earlier
   if the design system needs responsive variants the tokens cannot express). The decision will
   be recorded by amending this ADR.

## Consequences

- There is no Tailwind step in the shared packages. `biome.json` keeps
  `css.parser.tailwindDirectives` only for `apps/web` global CSS.
- Responsive layout in the MVP uses `useWindowDimensions` breakpoints (sidebar at 1024 px or
  wider, bottom nav below 768 px, H-14) instead of utility classes.
- Every primitive gets an accessibility test through react-native-web: roles, `aria-*`, and
  focusable inputs.

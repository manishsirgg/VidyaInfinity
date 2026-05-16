# Vercel dependency install troubleshooting (`@vercel/*`)

## Context

This repository already declares:

- `@vercel/analytics`
- `@vercel/speed-insights`

in `package.json` dependencies, and `app/layout.tsx` imports:

- `@vercel/analytics/next`
- `@vercel/speed-insights/next`

with `<Analytics />` and `<SpeedInsights />` rendered in the root layout.

## Observed issue in restricted environments

In environments with blocked npm registry access, install can fail with:

`403 Forbidden - GET https://registry.npmjs.org/@vercel%2fanalytics`

When install fails, TypeScript/build will also fail to resolve:

- `@vercel/analytics/next`
- `@vercel/speed-insights/next`

## Package manager and lockfile notes

- Intended package manager: **npm** (scripts and repo setup).
- If this repo has no `package-lock.json`, CI install behavior depends on the platform defaults (`npm install`), and lockfile reproducibility is reduced.
- If `package-lock.json` is present but stale, regenerate it in a network-enabled environment.

## Required recovery steps

Run in an environment with npm registry access:

```bash
npm install
npm run -s lint
npm run -s typecheck
npm run -s build
```

This will:

1. install `@vercel/analytics` and `@vercel/speed-insights` into `node_modules`;
2. update/generate `package-lock.json` consistently;
3. verify lint/typecheck/build before deployment.

## If Vercel/GitHub CI still fails

Check build logs for:

- npm registry connectivity issues;
- proxy/firewall restrictions;
- private registry overrides for scoped packages (for example `@vercel:registry=...` in `.npmrc`);
- token/auth restrictions causing 403 for public npm packages.

If a scoped registry override for `@vercel` is present and points to a private registry, correct it so `@vercel/*` can resolve from npmjs (or provide proper auth where required).

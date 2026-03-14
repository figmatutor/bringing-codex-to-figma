# State-Driven SPA Capture Guide

Use this reference when the app has no URL router and screens are driven by UI state.

## How it differs from URL-routed apps

| | URL-routed | State-driven SPA |
|---|---|---|
| `--routes` values | URL paths like `/about` | VIEWS keys like `settings-profile` |
| Tab navigation | `appUrl + path` | all tabs start at `appUrl` |
| `--views-file` | not needed | required |

## Step 1: Generate `capture-views.mjs`

Write the file in the target project directory and add it to that project's `.gitignore`.

Required export:

```js
export const VIEWS = {
  'home': null,
  'settings-profile': async (page) => {
    await page.locator('[data-testid="settings-link"]').click();
    await page.waitForTimeout(600);
  },
};
```

Guidelines:

- `null` means the default app state already matches the target view.
- Async functions receive a Playwright `page` already loaded at `appUrl`.
- Use deterministic selectors and short waits to let transitions settle.
- `label-*` entries are not defined in `VIEWS`; `capture.mjs` handles them separately.

## Step 2: Prepare tabs

Run:

```bash
node {SKILL_DIR}/scripts/capture.mjs --prepare \
  --routes "home,settings-profile" \
  --labels "label-home:Home|home" \
  --app-url http://localhost:5173 \
  --viewport 1440x900 \
  --views-file ./capture-views.mjs
```

All tabs load `appUrl`, then each named view uses its navigate function to reach the
desired state.

## Auth

Authentication is shared through the Playwright browser context created in
`--start-browser` or the inline auth flow inside `--prepare`.

## Generated Files

Typical project-local generated files:

- `capture-views.mjs`
- `.capture-browser.json`
- `.capture-session.json`

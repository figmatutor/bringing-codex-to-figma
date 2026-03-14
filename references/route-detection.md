# Route Detection Guide

Use this reference to identify the app's framework, enumerate routes or views, and
plan `label-*` divider tabs. Try each strategy in order and stop at the first strong
match.

## LOCAL vs EXTERNAL

| Type | Hosts |
|---|---|
| LOCAL | `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`, `*.local` |
| EXTERNAL | everything else |

LOCAL apps can be patched locally if `capture.js` is missing.
EXTERNAL apps must already expose the required capture script.

## Label Tab Plan

Plan divider labels before building the `--routes` and `--labels` arguments.
Insert one `label-*` view before each logical route group.

Example:

```text
label-main    before  /
label-auth    before  /login, /register
label-admin   before  /dashboard, /settings
```

## Strategy 1: Next.js App Router

Signal: `app/` exists with `page.tsx`, `page.jsx`, `page.js`, or `page.ts`.

Rules:

- Strip the `app/` prefix and `/page.*` suffix.
- Remove route groups like `(auth)`.
- Ignore `_`-prefixed segments.
- Keep `[param]` for display and substitute a concrete value for capture.

Examples:

- `app/page.tsx` -> `/`
- `app/login/page.tsx` -> `/login`
- `app/users/[id]/page.tsx` -> display `/users/[id]`, capture `/users/1`

## Strategy 2: Next.js Pages Router

Signal: `pages/` exists and App Router is not in use.

Ignore:

- `pages/api/**`
- `_app`, `_document`, `_error`
- `404`, `500`

Examples:

- `pages/index.tsx` -> `/`
- `pages/login.tsx` -> `/login`
- `pages/users/[id].tsx` -> display `/users/[id]`, capture `/users/1`

## Strategy 3: React Router / TanStack Router

Look for:

- `createBrowserRouter`
- `createHashRouter`
- `<Route path=...>`

Search order:

1. `src/router/index.tsx`
2. `src/routes.tsx`
3. `src/App.tsx`
4. any file containing router creation

Resolve nested routes by concatenating parent and child paths. Substitute `:param`
with representative values like `1`.

## Strategy 4: Vue Router

Look for `createRouter`, `createWebHistory`, or a `routes` array in `src/router`.
Resolve nested child routes and substitute dynamic params.

## Strategy 5: Generic fallback

Search for static navigation patterns such as:

- `<Route path="...">`
- `to="..."`
- `<a href="...">`
- `router.push('...')`
- `navigate('...')`

Filter to path-like values starting with `/`.

## Strategy 6: State-driven SPA

If no URL router exists:

1. Inspect the root component, usually `App.tsx` or `App.jsx`
2. Find `useState` or similar state that determines which screen is rendered
3. Enumerate each distinct state value
4. Generate `capture-views.mjs` with deterministic Playwright navigation steps

For SPA capture details and the `capture-views.mjs` structure, read
[spa-capture.md](spa-capture.md).

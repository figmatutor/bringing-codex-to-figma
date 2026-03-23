# Route Detection Guide

Use this reference to identify the app framework, enumerate routes or views, and
produce a grouping plan for post-capture section organization.
Try each strategy in order and stop at the first strong match.

## LOCAL vs EXTERNAL

| Type | Hosts |
|---|---|
| LOCAL | `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`, `*.local` |
| EXTERNAL | everything else |

LOCAL apps can be patched locally if `capture.js` is missing.
EXTERNAL apps must already expose the required capture script.

## Grouping Plan

Build these outputs before capture:

- `routes`: ordered list used by `capture.mjs --prepare --routes`.
- `groups`: logical sections for Figma grouping after capture.
- `expectedFrameCounts`: per-route/view expected frame count (default `1`).

Example:

```json
{
  "routes": ["/", "/login", "/register", "/dashboard", "/settings"],
  "groups": [
    { "name": "main", "views": ["/"] },
    { "name": "auth", "views": ["/login", "/register"] },
    { "name": "admin", "views": ["/dashboard", "/settings"] }
  ],
  "expectedFrameCounts": {
    "/": 1,
    "/login": 1,
    "/register": 1,
    "/dashboard": 1,
    "/settings": 1
  }
}
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

Resolve nested routes by concatenating parent and child paths.
Substitute `:param` with representative values like `1`.

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
2. Find state that determines which screen is rendered
3. Enumerate each distinct state value and use those as route keys
4. Generate `capture-views.mjs` with deterministic Playwright navigation steps
5. Set `expectedFrameCounts` for each key (default `1`)

For SPA capture details and the `capture-views.mjs` structure, read
[spa-capture.md](spa-capture.md).

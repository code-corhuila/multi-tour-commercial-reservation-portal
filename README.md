# multi-tour-commercial-reservation-portal

Angular 21 micro frontend of the commercial-reservation domain (Multi Tour). The `multi-tour-front`
container loads it and mounts it; the portal never makes its own HTTP client or session (norm 5.4.1,
Annex H, ADR-006 F4). The domain specs live in `code-corhuila/multi-tour-docs`.

## Install, run and test

Requires Node `^22.12.0 || >=24` (see `engines` in `package.json`).

```bash
npm ci
npm test            # Vitest through the Angular unit-test builder, Testing Library, jsdom
npm start           # standalone dev server on http://localhost:4201 (no API client, no session)
```

`npm test` runs every `tests/**/*.spec.ts` and is what `.github/workflows/ci.yml` runs on pull requests
to `develop` and `qa`. Without a local Node:
`docker run --rm -v "$PWD":/w -w /w node:22 sh -c "npm ci && npm test"`.

## Builds

| Script | Output | What it is |
|---|---|---|
| `npm run build:module` | `dist/portal.js`, `dist/portal.css` | the real module: `src/app/sources.ts` provides only the catalog and establishments adapters, over the container `apiClient` |
| `npm run build:module:demo` | same files | the demo module: `sources.ts` is replaced by `sources.demo.ts`, so every story reads in-memory data from `src/app/demo/` |
| `npm run build` | `dist/commercial-reservation-portal` | the standalone Native Federation build |

Both module builds run `scripts/pack-module.mjs`, which copies the bundle to `dist/portal.js` and
`src/styles/portal.css` to `dist/portal.css`. `scripts/check-bundle-size.mjs` fails when either file is
over the limits of `scripts/bundle-budget.json` (the CI runs it after the module build and also writes
both sizes in the job summary). `angular.json` adds an Angular `initial` budget to the `module` target.

## Container image

`deploy/Dockerfile` builds with `npm ci` and `npm run build:${PORTAL_BUILD}`, then serves the two files
with nginx under the names the container manifest loads (`commercial-reservation-portal.js` and
`.css`). `PORTAL_BUILD` defaults to `module:demo`: the delivered image shows demo data on every screen
until each story is connected. The real module is `--build-arg PORTAL_BUILD=module`.
`deploy/compose.yml` brings up only this portal; the whole application is composed in the infra repository.

## How the container mounts it

`src/mount-entry.ts` exports `mount(element, props)` and returns a function that unmounts. `props` is
`MountProps` (`src/app/shell-contract.ts`, a local copy of the container type; the portal never
imports the container):

- `apiClient`: `request<T>(path, init?)`, already carrying the interceptor; the only way out to the API.
- `session`: `roles`, optional `displayName` and `initials`, and `open(answer)` / `close()`.
- `navigate(target)`: optional; opens an area of another portal. Without it the Perfil button is not drawn.
- `initialParams`: optional parameters kept across a remount (for example `area`, or a selection in progress).
- `commercialName`: optional; the strip "Operador activo" of the operator screens.
- `chrome`: `'container'` means the container draws the sidebar and the portal only draws its content.

The stylesheet is one `<link>` to `commercial-reservation-portal.css` next to the module, added on the
first mount and removed with the last one. Every rule hangs from `.crp-root`.

## Structure of `src/app`

- One folder per story: `catalog`, `establishments`, `discounts`, `current-discounts`, `customers`,
  `reservations`, `self-service-reservation`, `public-offer`, `payments`, `my-payments`, `credit-balance`,
  `refunds`, `rescheduling`, `reservation-changes`. Inside, `model/` (rules), `data/` (abstract ports
  and their sources), `pages/` and `components/`.
- `shared/`: what several stories use (money, clock, formats, idempotency keys, focus, slots, capabilities).
- `http/`: the container-client adapters of the stories that are connected.
- `demo/`: the in-memory stores and fixtures of the demo build.
- `portal-shell.component.ts`, `portal-navigation.ts`, `portal-areas.ts`, `shell-contract.ts`: the shell
  and the contract with the container.

Screens read and write only through abstract ports (`*Source`, `*Writer`); a story imports from another
only its `data/` ports. Business data is not written into components.

## Architecture tests (`tests/`)

- `pillar-*.spec.ts`: the class pillars as tests. `pillar-time` (tenant clock, no browser date),
  `pillar-rules`, `pillar-quote`, `pillar-selection`, `pillar-focus`, `pillar-budget` (size budget) and
  `pillar-idempotency-ports` (every write port operation takes the `Idempotency-Key`).
- `story-boundaries.spec.ts`: a story imports only the public `data/` ports of another one.
- `source-tree.spec.ts`: `src/` holds exactly the specified files; adding or removing one changes that list.
- `no-http-client.spec.ts`: no `provideHttpClient`, `fetch` or `XMLHttpRequest` anywhere in `src/`.
- `no-delete.spec.ts`: no screen offers a delete action; `portal-css-scope.spec.ts` and `css-tokens.ts`:
  scoped selectors and colour tokens.

## Pull requests

At most 400 changed lines per PR, counting added and removed lines and excluding tests and generated
files (`.github/pull_request_template.md`, norm 9.2). The PR title is the squash commit, so it must be a
Conventional Commit. Work goes to `develop` through branches named `feat/` or `fix/`.

## Status

Connected to the API through `src/app/http/`: the catalog and the associated establishments, only.
Every other story (discounts, customers, reservations, self-service reservation, payments,
my payments, credit balance, refunds, rescheduling, reservation changes, public offer) is built
and tested against the demo sources: it works in the demo image and has no HTTP adapter yet.
Images come from the `TourImages` port (`src/app/shared/tour-photo.ts`) under the same origin as the
container (CSP `img-src 'self'`); the portal produces no `blob:` or `data:` URL.

# multi-tour-commercial-reservation-portal

## What it is

The Angular 21 Micro Frontend of the commercial-reservation domain (operational catalog, story
`code-corhuila/multi-tour-docs#167`). It is mounted by the `multi-tour-front` container through
Native Federation, which exposes `src/app/catalog/catalog.routes.ts` as `./routes`.

The HTTP client and the session live in the `multi-tour-front` container, never here (norm 5.4.1,
Annex H). The portal receives the container `HttpClient` already carrying the interceptor and never
calls `provideHttpClient()`. The test `portalDeclaresNoHttpClientOfItsOwn` enforces it. The container
is not built yet (G-FRT), so this portal cannot be mounted or exercised end to end.

## How to start

Requires Node 22 LTS.

```bash
npm ci
npm start      # standalone dev server on http://localhost:4201
```

Standalone, the portal has no HTTP client and no session by design. Real runs happen inside
`multi-tour-front`. `deploy/` builds the image with `npm ci` and serves it with nginx.

## Where its data is

Nowhere: the portal stores nothing. Catalog data lives in the PostgreSQL schema owned by
`multi-tour-commercial-reservation-db` and is reached through `multi-tour-commercial-reservation-api`,
always with the client of the container. `.env.example` declares no variable because the portal reads none.

## How to test

```bash
npm run build
npm test       # Vitest (Angular unit-test builder) with Testing Library
```

`npm test` is what `.github/workflows/ci.yml` runs. Two guards exist today:
`portalDeclaresNoHttpClientOfItsOwn` (no second HTTP client anywhere in `src/`) and
`portalTreeMatchesTheSpecifiedTree` (`src/` holds exactly the specified files). Without local Node:
`docker run --rm -v "$PWD":/w -w /w node:22 sh -c "npm ci && npm run build && npm test"`.

## Images and the content security policy

The portal draws every image from the same origin as the container: the CSP of the container allows `img-src 'self'` and nothing
else, so a `blob:` or `data:` URL, or an image on another host, is blocked and must never be produced by the portal. The image of a tour
comes from the `TourImages` port (`src/app/shared/tour-photo.ts`): production answers one self-hosted resource of the container
(`/assets/mountain-hero.jpg`) until the catalog API publishes the image of each tour, and then the adapter returns that URL, which must
stay under the same origin. Only the demo build (`src/app/demo/tour-photo-demo.ts`) assigns a different photo to each demo tour.

## What is missing

Done: the money model (T-03), the four states with the newest request winning (T-04) and the test that no screen offers a delete action (T-08). `catalog-item-form.component.ts` is still an empty stub and `catalog.routes.ts` declares no route. The tasks still open, from `tasks.md` of the story:

- T-00: the route map and the catalog operations in the published contract.
- T-05: the form. T-06: one `Idempotency-Key` per intention. T-07: actions by role.
- T-09: mounting in `multi-tour-front` (blocked by G-FRT).
- The Playwright level for the mounted portal.

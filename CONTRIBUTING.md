# Contributing

Thanks for considering a contribution!

## Target `develop`, not `main`

All pull requests must target the **`develop`** branch. `main` is
promotion-only: it receives merges from `develop`, and PRs into it run no CI.
A PR against `main` will be closed with a polite note pointing here.

```bash
git checkout develop
git checkout -b my-change
# ...work...
gh pr create --base develop
```

## What CI expects

Every PR into `develop` must pass three required checks, each running against
a MySQL 8.4 database seeded from the fixture export in `test/fixtures/export`:

| Check | What it runs |
| --- | --- |
| Import tools tests | `npm test` at the repo root (unit + MCP integration) |
| Website API tests | `npm test` in `website/` (vitest + supertest) |
| Playwright e2e | `npm run test:e2e` in `website/` against the built SPA |

First-time contributors: a maintainer has to approve the workflow run before
checks start, so don't worry if CI shows as pending at first.

## Running the tests locally

You need Node 22+ and Docker.

```bash
docker compose up -d               # MySQL 8.4 on 127.0.0.1:3306
npm ci                             # root deps (builds dist/)
node dist/extract.js test/fixtures/export   # seed the database
npm test                           # root suite

cd website
npm ci
npm test                           # API tests
npm run build                      # e2e drives the built SPA
npx playwright install chromium    # first time only
npm run test:e2e                   # Playwright suite
```

Heads-up: seeding points `MYSQL_DATABASE` (default `strava`) at the fixture
data. If your local `strava` database holds a real archive you care about,
seed a scratch database instead: `MYSQL_DATABASE=strava_ci node
dist/extract.js test/fixtures/export` and run the website suites with the same
variable set.

## Fixture data

The fixture export is deliberately tiny but load-bearing: several tests assert
exact activity/point counts. If you add fixture activities, update the count
assertions in `src/export.test.ts`, `src/integration.test.ts`, and check
`website/tests/api.test.ts` still finds what it needs (it requires at least
one activity with more than 100 GPS points).

# Harta Accesibilității

A mobile accessibility map for people with mobility disabilities in Chișinău, Moldova,
built with the NGO MOTIVAȚIE for a Minerva University capstone (Marinela Vodă, advisor
Prof. Volkan). Users find places and see verified accessibility information; registered
users submit assessments of existing places; MOTIVAȚIE reviewers verify every submission
before anything is published. MOTIVAȚIE owns the app, code and data at handover (May 2027).

The author is new to web development. Explain what you do and why, in plain words.

## Read before working

- `docs/decisions.md` — every product and technical decision. **It wins over the PRD**
  where they disagree (the PRD in Google Docs is partly outdated).
- `docs/criteria-and-rules.md` — the 9 criteria, scoring rules, publishing rule, photos.
- `docs/architecture/` — use case, component, sequence and database diagrams (PlantUML).
  The diagrams are the design the code must follow.
- `web/src/db/schema.ts` — the database schema (source of truth for tables).

## Stack

| Part | Technology |
|---|---|
| Mobile app (public) | React Native + Expo, TypeScript, MapLibre (`@maplibre/maplibre-react-native`), Romanian/English |
| Review dashboard + backend | One Next.js app (App Router, TypeScript) on Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) |
| API for the mobile app | Next.js route handlers under `/api/...` (no Hono, no server actions for mobile) |
| Database | Cloudflare D1 (SQLite) with Drizzle ORM; migrations via drizzle-kit + wrangler |
| Photos | Cloudflare R2, private bucket, short-lived signed URLs |
| Auth | Better Auth (email, Google, Apple), roles: `user`, `reviewer`, `admin` |
| Maps / places | OpenStreetMap: tiles from a tile provider, places imported via Overpass, Nominatim only for admin address lookup |
| Scheduled jobs | Cron Trigger via an OpenNext custom worker |

## Hard rules — never break these

1. **Every API route and every dashboard server action calls `requireRole(...)` first,**
   before reading or writing data. Do not rely on Next.js middleware alone for authorization.
2. **Public routes return only approved data**: current assessments and places with a
   `published_level`. Pending, rejected or hidden data is never public.
3. **Only the approval step publishes.** Only it may change `assessments.is_current` or
   the copied fields on `places` (`published_level`, `has_designated_parking`, `last_verified_at`).
   Admin edits go through the same code path.
4. **Multi-step writes use one D1 batch** (`db.batch([...])`). D1 has no interactive transactions:
   compute everything first, then send one batch.
5. **Every change writes a `change_log` row in the same batch** as the change.
6. **Scoring (rules now, ML later) only writes suggestions**, never published data.
7. **Users cannot create places.** They assess existing places (imported from OpenStreetMap).
   Only admins add a missing place.
8. **Never commit secrets.** Use `.env` / `.dev.vars` and wrangler secrets.
9. **Schema changes go through `schema.ts` + a new migration.** Never edit an applied migration.

## How to work with me

- **Plan first** for anything bigger than a small fix: say which files change and why,
  check it against the diagrams, then wait for my OK.
- **Small steps.** One feature or one table group at a time. Commit after each working step.
- **Explain the code** you write: what each new file does, and anything surprising.
- **Ask before adding a dependency** and say why it's needed.
- **Write tests** for permissions and publishing rules (e.g. an anonymous user can't see
  a pending submission). Run them before saying something is done.
- **If code and diagrams disagree,** stop and tell me. Don't silently change the design.
  When we change the design, update `docs/decisions.md` and the affected diagram.
- Prefer simple, readable code over clever code. MOTIVAȚIE's future volunteer must understand it.

## Repository layout

```
mobile/          Expo app
web/             Next.js app: dashboard pages + /api routes + server code
  src/db/        schema.ts, client, queries
  src/server/    requireRole, domain services, rules scoring, change logger, notifications
  drizzle/       migrations (generated; never edit an applied one)
  seed/          sample data for local development only
  test/          check_rules.py (database constraints), auth tests, access-check.sh
  scripts/       make-admin
scripts/         OSM import, MOTIVAȚIE migration (run with wrangler)
docs/            decisions, criteria, diagrams
```

## Useful commands

Run these from `web/`. Node is installed with fnm: if `node`/`npm` isn't found, run
`eval "$(fnm env)"` first.

- `npm run dev` — the dashboard locally (plain Next.js)
- `npm run preview` — build and run locally in the Workers runtime (closest to production)
- `npm run deploy` — build and deploy to Cloudflare Workers
- `npm run db:generate -- --name <change>` — new migration from schema changes
- `npm run db:migrate:local` — apply migrations to the local D1 database
- `npm run db:seed:local` — load the sample data into the local D1 database
- `npm run db:reset:local` — wipe the local database, then migrate and seed again
- `npm run db:check` — verify database constraints against the migrations (Python 3)
- `npm test` — unit tests (roles, password hashing, CSV export, change descriptions)
- `bash test/access-check.sh` — signs in as each sample role and checks which dashboard pages
  open (needs `npm run dev` running and the local sample data; local only)
- `npm run make-admin -- <email> [--remote]` — make an existing account admin (first admin only)

Local sign-in: after `npm run db:reset:local`, admin@example.com, reviewer@example.com and
ana@example.com have the test password in `seed/dev-accounts.mts` (local database only).

Settings: copy `web/.dev.vars.example` to `web/.dev.vars`. On the live site, secrets are set
with `npx wrangler secret put BETTER_AUTH_SECRET` (and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

## Known gotchas

- Keep `cacheComponents` off in `next.config.ts`: with OpenNext on Workers it makes
  requests hang (opennextjs/opennextjs-cloudflare#1450, #1464).
- Passwords are hashed by `web/src/server/password.ts` (PBKDF2), not Better Auth's default
  scrypt, which is too slow for the Workers free plan.
- `requireRole()` reads the role from the database on every call; a dashboard layout check alone
  isn't enough because layouts don't re-run on every navigation. Each page calls it too.
- Better Auth rate-limits sign-in in production builds (counter resets after 10 quiet seconds).

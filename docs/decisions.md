# Decisions log

Last updated: 2026-11-01. Where this file and the PRD (Google Doc) disagree, this file wins.
Add new decisions at the top of the relevant section with a date.

## Scope

- **Languages:** Romanian and English only. Russian dropped (non-goal); translations are stored
  as `{ro, en}` JSON so another language can be added later.
- **Public website, P0 (2026-11-01):** the product is a mobile app *and* a public website with the same
  features (map, search, filters, place pages, sign-in, submitting assessments with photos). The website and the
  review dashboard share one address: public pages for everyone, `/dashboard` for reviewers and admins only.
  Shared place links are website links (they open the app instead once installed, P1). The old P2 item R56 now
  covers only a mobile version of the dashboard. Today's home page (a list of places) is the first step towards it.
- **Temporary barriers** (broken elevator, construction): dropped (non-goal). Updates are for
  lasting changes only.
- **Places come from OpenStreetMap.** Users never add places; they assess existing ones.
  Admins can add a missing place (address via Nominatim).
- **Import every named place people visit** (shops, cafés, health, offices, schools, culture,
  sports, hotels, worship…), not street furniture (benches, bins, ATMs, parking spaces, bus stops).
  OSM tags are mapped to ~10–15 app categories.
- **OSM refresh:** a place that disappears from OSM is kept and flagged `gone_from_osm` if it has
  assessments; otherwise it is deleted.
- **Managing places (admins, 2026-10-31):**
  - **Add a missing place:** the admin searches an address with Nominatim (only when they press "Find",
    limited to Chișinău) or types the coordinates. If another place is within ~100 m, the admin must
    confirm it's a different one (most "missing" places are already there under another name).
    A new place is shown right away as "Not yet rated".
  - **Edit** changes only the place's own details (name, other names, category, location, address),
    never its accessibility level: that changes only by approving a submission. If someone else changed
    the place since the form was opened, nothing is saved (same guarded-batch idea as review decisions).
  - **Hide / show again:** hidden places disappear from the public app; everything about them is kept.
  - **Delete** only for admin-added places with no assessments (i.e. added by mistake). A place with
    assessments keeps its history and can only be hidden; an OSM place would come back with the next
    import, so it can only be hidden too.
  - No map picker yet (would need MapLibre in the dashboard); a link opens the location on openstreetmap.org to check it.
- **Dashboard places list (2026-10-31):** search by name and other names (same search index as the app,
  ignores diacritics), filters for category, level (incl. "not yet rated") and status, sort by longest since
  verified / name / recently added, 50 per page. Filters live in the address bar so a filtered list can be
  bookmarked or shared. Addresses are searched too (2026-10-31, migration 0002 added `address` to the
  search index); the mobile app can limit its search to names with an FTS column filter if address matches
  turn out to be noisy there.
- **Dashboard overview (2026-10-31):** a to-do box first ("N submissions waiting", red with words when the
  oldest has waited over 14 days), then coverage of places shown in the app (rated of total, per level,
  places last verified over 24 months ago, hidden places) and "this week" (last 7 days: received, decided,
  decided by you). Every number links to the matching filtered list; the places list gained a "Last verified:
  over 24 months ago" filter for this. Limits live in `web/src/lib/overview.ts`. Not included for now:
  "opened but not decided", coverage by category, recent activity, most-searched places (needs the app).

## Map and search

- The base map (OSM tiles) shows all places as the style's own small labels/icons.
- **Colored markers only for rated places** (`published_level` set). No grey markers for unrated places.
- Tapping a base-map label: the app asks the backend which place it is (match by location + name,
  or OSM ID if the tile provider exposes it) and shows the place page. Unrated → "Not yet rated:
  assess this place". Test matching reliability in the first MapLibre prototype.
- **Search runs on our own database** (FTS5, ignores diacritics, includes `other_names` and, since
  2026-10-31, `address`) and finds every place, rated or not.
- "Show unrated places" toggle (old PRD R6) dropped.
- Directions: open the phone's own maps app.

## Users and roles

| | Visitor | Registered user | Reviewer | Admin |
|---|---|---|---|---|
| Browse, search, view places | ✓ | ✓ | ✓ | ✓ |
| Submit assessment or update for an existing place | | ✓ | ✓ | ✓ |
| See own submissions and status; delete own account | | ✓ | ✓ | ✓ |
| Review queue: correct answers, approve, reject (incl. own) | | | ✓ | ✓ |
| Add a missing place; edit published places | | | | ✓ |
| Hide / delete places | | | | ✓ |
| Edit questionnaire and categories | | | | ✓ |
| Assign roles | | | | ✓ |
| Export data, view change log | | | | ✓ |

- Roles live in one `users.role` column (`user` | `reviewer` | `admin`), each role includes the previous.
- Reviewers may approve their own submissions (traceable via the change log).
- Who submitted and who approved is recorded internally; **never shown publicly**. Imported
  MOTIVAȚIE assessments have no assessor.
- **Account deletion:** personal data wiped (`deleted_at` set), approved contributions kept.

## Submissions and review

- A user can assess **some or all criteria**. An update covers **only the criteria that changed**,
  picked from a list.
- **On approval,** a complete new assessment is built: unchanged criterion results are copied from
  the current one, the new results added; it becomes current (`based_on_id` points to the old one).
- **Publishing rule:** approved answers are always saved, but the place's level appears in the app
  only when the rule is met:
  - **Inaccessible** once the entry path is known (access until entering, ramp, entrance doors);
  - **Accessible / partially accessible** once all 6 mandatory criteria are known.
  Until then the place stays "Not yet rated".
- Reviewers can **correct answers** before approving (recorded as `edited_by_reviewer`).
- **Rejection requires a reason**, which is emailed to the contributor.
- **No hard lock while reviewing:** the dashboard shows a warning ("opened by Ana 5 min ago") for 60 minutes
  after another reviewer opened a submission. Opening is not written to the change log (it changes no data).
- **The reviewer picks the published level** (it starts at the suggestion). Corrections are limited to the
  criteria in the submission; a reviewer can't add criteria the contributor didn't assess (2026-10-30).
- **Double decisions are impossible:** the decision batch includes a guarded change_log insert that fails
  (and cancels the whole batch) if someone else decided the submission first (2026-10-30).
- **Admins can correct a published assessment directly** ("Edit accessibility" on a place's page, 2026-10-31),
  e.g. a mistake spotted later or MOTIVAȚIE's own visit, also for a place with no assessment yet. Saving goes
  through the same steps as an approval (`planAdminEdit` -> `planApproval`): a new assessment with origin
  `admin_edit` becomes current (`based_on_id` = the old one, which stays as history), unchanged criteria and
  photos are copied, the publishing rule applies, and the level starts at the suggestion once an answer changes.
  Published immediately, without review. Every changed answer is logged before/after, with an optional note.
  "Last verified" moves to today only if the admin ticks "checked in person"; a desk correction keeps the old
  date so the place stays in the "longest since verified" list. Criteria can be added or corrected, not removed.
  The page shows what's published as a summary; staff open only the criteria they want to change ("Edit answer",
  the same button for unassessed ones), then publish all changes at once from a panel listing every change and the
  resulting level (suggested, with override; a level-only change is allowed). A change that would take a place
  off the map (publishing rule no longer met) shows a red warning.
- Rejected submissions are kept forever; **their photos are deleted after 6 months** (Cron job).
- Rule-based score suggestions are the P0 baseline; P1 ML suggestions are compared against both
  rules and reviewer decisions. Suggestions are never shown to the public.

## Photos

- **1 to 3 photos per assessed criterion**, required when the feature exists; none needed for
  "Not needed", "No public toilet" or "N/A".
- Shrunk on the phone before upload (~1600 px wide). Uploaded straight to R2 with a signed URL.
- Public only once their assessment is published. Users are asked not to photograph people;
  reviewers reject photos with recognizable people. Automatic face blurring is P1.

## Questionnaire

- Criteria and questions are stored as data so MOTIVAȚIE can change them without a developer.
- Question types: **choice** (the main answer), **checkboxes**, **text** (measurements go here for
  now). A "number" type can be added later if measurements are needed by rules or ML.
- Answer options are stored inside each question (JSON).
- Changing a question: typos can be fixed; a change in meaning retires the question and adds a new one.

## Technology

| Decision | Chosen | Rejected and why |
|---|---|---|
| Mobile | React Native + Expo | Flutter (fewer maintainers know Dart), PWA (worse on phones) |
| Dashboard + API | One Next.js app on Cloudflare Workers (OpenNext) | Separate Vite dashboard + Hono API (two projects to deploy and hand over) |
| API style | Next.js route handlers | Hono inside Next.js (extra tool; fine to add later if the API grows) |
| Database | Cloudflare D1 (SQLite) + Drizzle | Supabase/Postgres (earlier plan; switched for cost and simplicity) |
| Authorization | `requireRole()` helper called in every route/action | Row-level security (not available in D1); Next.js middleware alone (can be bypassed) |
| Photos | R2 | — |
| Auth | Better Auth | Clerk (hosted, paid above a limit, data outside our database) |
| Maps | OpenStreetMap + MapLibre | Google Maps: terms restrict storing place data and showing it on non-Google maps; billing account needed |
| Next.js caching | `cacheComponents` off (2026-10-30) | On by default in new Next.js apps, but it hangs requests on Workers with OpenNext |
| Repo layout | One repo: `web/` (Next.js), `mobile/` (Expo, later), `docs/` (2026-10-30) | Separate repos (harder to keep docs and code in sync) |
| Workers plan | Paid (~$5/month) likely needed | Free plan's 3 MiB Worker size limit is often too small for Next.js |
| Password hashing | PBKDF2-SHA256, 100,000 rounds, Web Crypto (2026-10-30) | Better Auth's default scrypt: far over the free plan's ~10 ms CPU per request. Round count is stored in each hash, so it can be raised on the paid plan |
| Sign-in methods | Email + password and Google now; Apple with the mobile app (2026-10-30) | Apple now (needs a paid Apple developer account; only relevant for iOS) |
| Web sign-up | Open to anyone; new accounts are `user` and can't open the dashboard (2026-10-30) | Sign-in only (staff accounts would need another way to be created before the app exists) |
| First admin | `npm run make-admin -- <email>` after signing up; afterwards roles are changed on the dashboard (2026-10-30) | Admin emails in a setting (a second place that decides roles) |
| Dashboard language | English first, Romanian added once the screens settle (2026-10-30) | Both now (translation setup before the screens are stable) |

## Open questions

- [ ] MOTIVAȚIE: does their spreadsheet contain every answer or only levels? (affects migration)
- [ ] MOTIVAȚIE: confirm the ramp + stairs reading, the 3 new answer options, and the door width for "wide".
- [ ] MOTIVAȚIE: in old data, did "Ramp: No" sometimes mean "not needed"?
- [ ] Choose a map tile provider (start free; the URL is swappable).
- [ ] Run the 30-place OpenStreetMap coverage test.
- [ ] ODbL share-alike: check what applies to exports combining OSM and MOTIVAȚIE data.
- [ ] Baseline review time per PDF submission (for the review-time success metric).
- [x] Compare our Better Auth tables with Better Auth 1.7's core schema (checked by hand 2026-10-30: same columns).
- [ ] OSM refresh script: when an admin has edited an OSM place's name or location, should the import
      keep the admin's edit or take OpenStreetMap's? (Check the change log for admin edits before overwriting.)
- [ ] How to build the public website (2026-11-01): Expo for web from the same codebase as the mobile app, or
      pages in the Next.js app next to the dashboard. Decide before building the map.
- [ ] Email service (for password reset, email verification and rejection emails) — not chosen yet.

## PRD sections known to be outdated

Updated in the PRD on 2026-11-01 to match this file: R5 (MapLibre + OSM), R6 (no grey markers, toggle dropped),
R7 (search by other names and address), R16 (assess existing places only), R17 (1 to 3 photos), R25 (admin
corrections; delete only admin-added places without assessments, otherwise hide), R27 (24-month count on the
overview), R29 (one Next.js app), R32 (three roles), and the Design Doc tab (photos; warning instead of a claim/lock).
Also on 2026-11-01, the public website became P0: description, R1, R4, R14, R17, R21, R44 and R56 updated.

Still open in the PRD:
- R11 "May be outdated after a set period": the period isn't decided (the dashboard uses 24 months for old ratings).
- R35, R51, R52 (community reviews): not in the database or in this file; still planned or dropped?
- R14 share message includes a Google Maps link: not decided again since the switch to OpenStreetMap.
- The diagram pictures pasted in the Design Doc tab are older versions.

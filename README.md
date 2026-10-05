# FlashQuizz

A private PhLE (Philippine Pharmacist Licensure Exam) reviewer: flashcards,
practice quizzes, spaced-repetition review and timed mock exams over questions
imported from review-center material, organised Module → Subject → Topic.
It installs as an app on iPhone, Android and desktop and works offline.

Built with TanStack Start, React 19, Drizzle + Neon Postgres, Clerk, Tailwind v4
and shadcn/ui.

## Run it

```bash
npm install
cp .env.example .env       # fill in Neon + Clerk keys
npm run db:migrate         # create tables
npm run db:seed            # load scripts/taxonomy.ts + data/questions/*.json
npm run dev                # http://localhost:3000
```

The app is **invite-only**. Sign in, open `/forbidden`, copy the user ID shown
there into `ADMIN_CLERK_USER_IDS`, and restart: that makes you the admin. Then
invite people from **Question bank → People**.

- Everyone studies the same question bank, with their own progress, sessions,
  mock exams and bookmarks.
- Only admins can edit the question bank and invite people.
- The `requireUser` middleware wraps every server function (`src/start.ts`)
  and refuses anyone who isn't an admin or an invited member. Admin-only
  functions add `requireAdmin` (`src/server/auth.ts`).

## Study modes

| Mode | Where | What happens |
|---|---|---|
| Practice | `/study/new` | Pick A–E, see the answer and rationale straight away |
| Flashcards | `/study/new?mode=flashcards` | Flip, then rate yourself; "Again" brings the card back |
| Review | `/review` | Leitner boxes: a miss or bookmark returns tomorrow, then 3 days, 1 week, 3 weeks |
| Mock exam | `/exam` | Timed, no feedback until you submit; results by topic; survives a refresh |

Keyboard: `1`–`5` answer, `Space`/`Enter` flip or next, `←`/`→` move between
questions, `B` bookmark, `M` flag (exams).

## Offline and installing

Practice, flashcards, review, mock exams and the Today page all work without a
connection. Each person keeps their own copy on each device they use, so two
people can share a device without seeing each other's progress. The question
bank editor (`/admin`) needs a connection.

**Install it** (once per device):

- **iPhone / iPad:** in Safari, tap Share → **Add to Home Screen**. Open
  FlashQuizz from the home screen and sign in *there*: the installed app keeps
  its own storage, separate from Safari.
- **Android:** in Chrome, ⋮ → **Install app**.
- **Desktop:** in Chrome or Edge, use the install icon in the address bar; in
  Safari on a Mac, **File → Add to Dock**.

The first time it opens, it downloads the questions (about 3 MB) and then the
images (about 55 MB, in the background). **Offline & sync** (in the account
menu, `/offline`) shows what's on the device, the storage used, and has **Keep
offline data safe** (asks the browser not to clear it), **Sync now** and
**Remove offline data**.

**How sync works:**

- Answers, bookmarks and sessions are saved on the device first, then uploaded
  a few seconds later when online. The header shows what's waiting
  ("Offline, 3 waiting").
- It syncs when the app opens, when the connection comes back, when you return
  to the app, and on **Sync now**. There's no background sync (iOS has none),
  so open the app now and then to upload.
- A mock exam stays on the device that started it until it's submitted (or
  its time runs out); then the graded exam uploads.
- Several devices stay in step: the server keeps every answer and rebuilds
  progress from that history, so nothing is lost when two devices were
  offline at once.
- A device works offline for 30 days after the server last confirmed you.
  After that, it needs one online sign-in.
- **Sign out** (account menu) removes your copy from the device and warns first
  if anything hasn't synced yet. Other people's copies on the device stay.

## Question bank

`/admin/questions` lists every question with fuzzy search and filters. The
editor has a live preview, image upload and flags. `/admin/review` is the queue
of imported items the extraction couldn't settle (missing/conflicting answers,
suspect corrections); they stay out of study until marked **Verified**.
Questions edited in the app are never overwritten by a later `db:seed` (unless
you pass `--force`).

`/admin/people` manages who can use FlashQuizz:

- **Invite** by email. Clerk sends the invitation, and signing up from it gives
  access.
- **Cancel** an invitation nobody has accepted yet.
- **Remove access** or **give it back**. Their progress stays in the database,
  and their device copy is deleted the next time it checks in.

## Importing reviewer material

The source PDFs live in `reviewer/` and the extracted data in `data/` — both are
gitignored because the material is review-center property.

```bash
py -3.12 scripts/import/extract_text.py     # text PDFs  → data/raw/*.jsonl + data/images/
py -3.12 scripts/import/dump_pages.py       # scanned PDFs → data/pages/<source>/p###.jpg
py -3.12 scripts/import/show_raw.py pb1 --module m4 --from 1 --to 25
npm run questions:validate                  # zod-validate data/questions/*.json
npm run questions:dedupe -- --write         # mark cross-source repeats
npm run db:seed
```

Raw blocks and page images are turned into `data/questions/*.json` following
`scripts/import/STRUCTURING.md` (the contract is `questionImportFileSchema` in
`src/lib/schemas/question.ts`). Needs PyMuPDF (`py -3.12 -m pip install pymupdf`).

## Scripts

| Script | |
|---|---|
| `npm run typecheck` | Route generation + `tsc` |
| `npm test` | Study logic, the device store, sync download/upload (fake IndexedDB) |
| `npm run db:generate` / `db:migrate` | Drizzle migrations (`drizzle/`) |
| `npm run db:seed` | Upsert taxonomy + questions + images (`--dir`, `--dry-run`, `--force`) |
| `npm run build && npm run serve:prod` | The production build locally on :4173, with the service worker (needed to try offline; `npm run dev` has none) |
| `npx tsx scripts/check-offline-parity.ts [--user <id>]` | Read-only: device-side study logic gives the same answers as the SQL, for one person (default: the first admin) |
| `npx tsx scripts/sync-smoke.ts` | Exercises the sync API on the real database as two test people, then removes what they wrote |
| `npx tsx scripts/claim-existing-progress.ts` | One-off for migration `0002`: progress recorded before rows had an owner goes to the first admin |

### How offline is built

- `src/lib/study/` holds the pure study logic: candidates, tallies, streak,
  rebuilding progress from history, merging sessions, grading. The device and
  the server both use it.
- `src/offline/` is the device side:
  - `db.ts`: one IndexedDB copy per person;
  - `device.ts` and `auth.ts`: whose copy is open, and the 30-day offline
    lease;
  - `api/`: the study API, same shapes as the server functions it replaced;
  - `sync/`: pull, push, images, engine.
- `src/server/sync.*` is the server side: content manifest by hash, paged
  pulls, and an upload that runs in one transaction (locked per person) and
  re-grades answers. Every query is scoped to the signed-in person, and each
  call names whose device copy is syncing, so another account signed in on
  the device is refused. Bump `SYNC_PROTOCOL` in `src/lib/schemas/sync.ts`
  whenever a payload changes shape.
- `src/pwa/` is the service worker. A small Vite plugin writes `sw.js` during
  `vite build`; every page is served from the prerendered `/_shell.html`, and
  images from the `fq-images` cache.

## Deploying to Vercel

1. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `VITE_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY` and `ADMIN_CLERK_USER_IDS` for Production (and Preview).
   The older `OWNER_CLERK_USER_IDS` still works when `ADMIN_CLERK_USER_IDS`
   isn't set.
   The offline app shell is prerendered during the build, so they need to be
   available at build time too (Vercel does this by default).
2. Settings → Functions → Region: **Singapore (sin1)**, next to the Neon database.
3. In the Clerk dashboard:
   - set sign-up mode to **Restricted**, so only people invited from the
     People page can sign up;
   - if the allowlist is on, add each invitee's email to it, or turn it off
     (Restricted mode already keeps everyone else out);
   - turn on MFA if you want it (it applies to invited people too);
   - raise the **maximum session lifetime** (the default is 7 days), so a long
     offline stretch doesn't need a fresh sign-in before it can sync.

   A Clerk production instance needs a custom domain; without one, deploy with
   the development keys. Development instances cap the number of users and
   show a "Development mode" badge. Your user ID differs per Clerk instance,
   so set `ADMIN_CLERK_USER_IDS` for each environment.
4. Run `npm run db:migrate` and `npm run db:seed` against the production database.
5. Installing the app and the service worker need HTTPS, so test phones against
   the deployed URL (or a preview), not a LAN address.

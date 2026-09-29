# FlashQuizz

A private PhLE (Philippine Pharmacist Licensure Exam) reviewer: flashcards,
practice quizzes, spaced-repetition review and timed mock exams over questions
imported from review-center material, organised Module → Subject → Topic.

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

The app is **owner-only**. Sign in, open `/forbidden`, copy the user ID shown
there into `OWNER_CLERK_USER_IDS`, and restart. Everyone else is refused by the
`ownerOnly` middleware that wraps every server function (`src/start.ts`).

## Study modes

| Mode | Where | What happens |
|---|---|---|
| Practice | `/study/new` | Pick A–E, see the answer and rationale straight away |
| Flashcards | `/study/new?mode=flashcards` | Flip, then rate yourself; "Again" brings the card back |
| Review | `/review` | Leitner boxes: a miss or bookmark returns tomorrow, then 3 days, 1 week, 3 weeks |
| Mock exam | `/exam` | Timed, no feedback until you submit; results by topic; survives a refresh |

Keyboard: `1`–`5` answer, `Space`/`Enter` flip or next, `B` bookmark,
`←`/`→` and `M` (flag) in exams.

## Question bank

`/admin/questions` lists every question with fuzzy search and filters. The
editor has a live preview, image upload and flags. `/admin/review` is the queue
of imported items the extraction couldn't settle (missing/conflicting answers,
suspect corrections); they stay out of study until marked **Verified**.
Questions edited in the app are never overwritten by a later `db:seed` (unless
you pass `--force`).

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
| `npm test` | Leitner scheduling, session builder, exam apportioning |
| `npm run db:generate` / `db:migrate` | Drizzle migrations (`drizzle/`) |
| `npm run db:seed` | Upsert taxonomy + questions + images (`--dir`, `--dry-run`, `--force`) |

## Deploying to Vercel

1. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `VITE_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY` and `OWNER_CLERK_USER_IDS` for Production (and Preview).
2. Settings → Functions → Region: **Singapore (sin1)**, next to the Neon database.
3. In the Clerk dashboard: sign-up mode **Restricted**, add only your email to the
   allowlist, turn on MFA. A Clerk production instance needs a custom domain;
   without one, deploy with the development keys. Your user ID differs per Clerk
   instance, so set `OWNER_CLERK_USER_IDS` for each environment.
4. Run `npm run db:migrate` and `npm run db:seed` against the production database.

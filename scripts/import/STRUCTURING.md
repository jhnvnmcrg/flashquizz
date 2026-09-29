# Question structuring spec (for extraction agents)

You turn raw reviewer material into `data/questions/<file>.json` files that
`scripts/validate-questions.ts` accepts and `scripts/seed.ts` loads.
The material is confidential review-center content: never copy it anywhere
except `data/` (gitignored).

## Output file

```jsonc
{
  "source": { "slug": "pb1", "name": "Pre-board 1", "shortName": "PB1" },
  "questions": [ /* QuestionImport objects, in source order */ ]
}
```

Source slugs/names (use exactly):
| slug | name | shortName |
|---|---|---|
| pb1 | Pre-board 1 | PB1 |
| m2fc | M2 Final Coaching | M2 FC |
| m6fc | M6 Final Coaching | M6 FC |
| m4pt | M4 Post-test | M4 PT |
| m3fc | M3 Final Coaching | M3 FC |
| m1fpb | M1 Final Pre-board | M1 FPB |
| m3fpb | M3 Final Pre-board | M3 FPB |
| m4fpr | M4 Final Pre-board | M4 FPR |

A source may be split across several files (e.g. `pb1-m1.json`, `pb1-m2.json`);
each file repeats the same `source` header.

## QuestionImport fields

| field | rules |
|---|---|
| `sourceRef` | Stable id. Text sources: copy the raw block's `sourceRef` (`pb1:m4:058`, `m2fc:143`). Scanned sources: `<source>:<nnn>` with a zero-padded 3-digit running ordinal (`m3fc:004`). Lowercase, `:`-separated. |
| `module` | `m1`…`m6`. |
| `topicSlug` | One slug from `scripts/taxonomy.ts` **belonging to that module** (see list below). Pick the closest fit; never invent slugs. |
| `ordinal` | Position within the source (or within the module for pb1). Integer. |
| `printedNumber` | The number printed in the source, as a string (`"58"`), or null. |
| `sourcePage` | 1-based page number, or null. |
| `format` | `single` (one best answer) · `except` (stem says EXCEPT / NOT / LEAST / FALSE) · `roman_combo` (statements I–IV + choices like "I and II") · `two_statement` ("first statement true, second false" style) · `matching` (a set of items sharing one choice list / context) · `computation` (requires calculation). |
| `stem` | The question only, cleaned Markdown. Do NOT include the choices or the roman statements. Keep bold/italics only where meaningful. |
| `statements` | For `roman_combo` / `two_statement`: `[{ "label": "I", "text": "…" }, …]` (labels I–VI). Otherwise `[]`. For `two_statement`, label the two statements `I` and `II`. |
| `choices` | `[{ "key": "A", "text": "…" }, …]` — keys must run A, B, C… in order with no gaps (2–5 choices). Normalise lowercase a/b/c to A/B/C. Fix OCR noise: `Il`→`II`, `Ill`→`III`, `l`→`I` inside roman combos. |
| `answerKey` | `"A"`–`"E"` or `null`. See answer rules. |
| `rationale` | Cleaned Markdown explanation (may be `""`). Do not repeat the "Answer: X" line. Use bullet lists for bullet-ish lines, `→` for arrows, and rebuild flattened tables as Markdown tables when the structure is clear (otherwise a bullet list). Keep drug/organism names exact. Keep Taglish as written. |
| `mnemonic` | Memory aids (acronyms like DUMBELS, LEORA/GEROA, "tip:" lines, rhymes) moved out of the rationale, verbatim. `""` if none. |
| `requiresImage` | `true` when the stem or choices cannot be answered without a picture (structures, prescriptions, figures). |
| `images` | `[{ "file": "pb1/pb1_m1_058-1.png", "role": "stem"|"choice"|"rationale", "choiceKey": null, "alt": "short description" }]`. Only reference image files that exist under `data/images/` and are actually relevant (skip decorative images, emoji, banners, "Screenshot" placeholders that are unrelated). `role: "choice"` + `choiceKey` when the image is a choice. |
| `groupKey` | For matching sets / shared-stem items: same key on every member, e.g. `pb1:m1:g056` (use the first member's number). Otherwise null. |
| `groupOrder` | 1, 2, 3… within the group, else null. |
| `context` | The shared instruction for the group ("For numbers 56–60, select the indication of the structure…") — identical text on every member. The member's own `stem` is just its item ("Structure III: Pyrazinamide"). Null when not grouped. |
| `flags` | Zero or more of: `answer_text_conflict`, `answer_missing`, `answer_not_in_choices`, `multiple_answers`, `image_required`, `strikethrough_suspect`, `ocr_uncertain`, `placeholder`, `duplicate`, `rationale_missing`, `answer_disputed`, `rationale_disputed`. |
| `status` | `auto` normally; `needs_review` whenever something below says so. |
| `reviewNote` | One or two sentences telling the reviewer what is wrong / uncertain. `""` when fine. |
| `duplicateOfRef` | Leave null (dedupe runs later) unless the source itself repeats a question — then point the later copy at the earlier `sourceRef` and add flag `duplicate`. |
| `raw` | `{ "text": <raw question text>, "answer": <raw answer string>, "rationale": <raw rationale text> }` — copy from the raw block (text sources) or your literal transcription (scanned). Keep it for audit. |

## Answer rules (most important)

1. **Never invent or "correct" an answer by yourself.** The key comes from the source.
2. Text sources: the key is the letter in `answerRaw` / the `Answer:` line. If the letter and the answer text disagree (text matches a different choice), set `answerKey` to the letter whose **text** matches **only if** the rationale clearly supports it; otherwise keep the letter. Either way add `answer_text_conflict`, `status: needs_review`, and explain in `reviewNote`.
3. Answer given as a combination not present among the choices, "X."/placeholder letters, "correct answer not in choices", or two answers → `answerKey: null` (or the best-supported letter if unambiguous), flags `answer_not_in_choices` / `placeholder` / `multiple_answers`, `status: needs_review`.
4. If you are highly confident the source key is factually wrong, keep the source key, add `answer_disputed`, `status: needs_review`, and give the reason in `reviewNote`.
5. Scanned slides (m1fpb, m3fpb, m4fpr): the answer is the highlighted choice (yellow/blue highlighter band or box drawn by the lecturer). Student pen strike-throughs of wrong options are NOT answers. If no highlight is visible or two choices are highlighted → `answerKey: null`, `answer_missing`, `status: needs_review`.
6. Scanned M3 Final Coaching: the key is the printed `Answer: X.` in the right column.

## Strikethrough / corrections

Raw text wraps struck-out words in `~~…~~` ("~~60s~~ 50s ribosomal"). The struck
word is the mistake and the following word is the correction → keep only the
correction ("50s ribosomal"). If a struck word has no obvious replacement,
drop it. If a struck span changes the meaning of the **answer** or you are
unsure, add `strikethrough_suspect` + `needs_review`.

## Raw text quirks

- Tables in rationales arrive flattened one cell per line, and sometimes the
  left half of a rationale table spills into the `question` text after the
  choices. Move those lines back into the rationale.
- Page breaks can push the last choices after the answer; reassemble them.
- Duplicated words from extraction ("scratchscratchscratch") → fix.
- Strip boilerplate (headers, "Question/Rationale" labels, sharing warnings).
- Missing math: equation objects may be lost (`V = = 80 mL`). Rebuild the
  calculation in the rationale when it is obvious from the numbers; otherwise
  keep what is there and add `rationale_missing` only if nothing useful remains.
- An empty rationale → `rationale: ""` and flag `rationale_missing` (status stays `auto`).
- Image-only stems/choices with no usable image file → `requiresImage: true`,
  flag `image_required`, `status: needs_review`.

## Clarifications (from the pilot batches)

- **Tables without a header row**: Markdown needs one — add a short, meaningful
  header ("Drug | Use", "Antidote | Poison"). Fine to do without flagging.
- **Memory aids the rationale depends on**: put the aid in `mnemonic`; if the
  rationale would stop making sense without it, keep a short reference in the
  rationale too (copying is fine).
- **Rebuilt content** (lost formulas, equations, symbol-font glyphs): rebuild it
  when you are confident from context/standard pharmacy knowledge. Add
  `ocr_uncertain` only when you are guessing.
- **Wingdings / symbol bullets** (`ü`, `§`, `Ø`, `�` at line starts) → Markdown bullets.
- **Typos**: fix clear misspellings of drug names and terms ("xanthine oxidate"
  → "oxidase", "poisoining"). Do not rewrite grammar or style.
- **`except` format**: only when the question asks you to find the exception /
  the false or incorrect option ("all of the following EXCEPT", "which is NOT
  true", "which is incorrect"). "NOT" that merely describes a property
  ("a drug that is not advertised") stays `single`.
- **Rationale factually wrong but key right**: keep the key, add flag
  `rationale_disputed`, explain in `reviewNote`, status stays `auto`.
- **Topic tie-breaks**: antidote / poisoning questions → the toxicology topic
  even when drug-specific; herbals asked in a pharmacology module →
  `m4-general-principles`; a law question inside another module → the closest
  topic of *that* module (the `module` must stay the source module).

- **Default stems** (the schema needs a non-empty stem): image-only stems →
  "Identify the structure shown." (or a similarly short neutral instruction that
  does not give the answer away); two-statement items with no question →
  "Evaluate the following statements."
- A combining strike-through (U+0336, e.g. "P̶o̶s̶i̶t̶r̶o̶n̶") counts as struck text too.
- Always look at an image before attaching it — skip ones that are blank, solid
  black, emoji/decoration, Zoom chrome, or exact duplicates.
- When the only explanation is in an image, transcribe it into `rationale` (then
  it is not `rationale_missing`) and attach the image if it adds something.
- Cross-references like "refer to #7": copy the relevant facts in, because the
  app shows questions out of order.

## Scanned sources (m3fc, m1fpb, m3fpb, m4fpr)

You read page images with the Read tool (`data/pages/<source>/p###.jpg`) and
transcribe. There is no raw block, so:
- `sourceRef` = `<source>:<nnn>` using the **printed question number**
  zero-padded (`m1fpb:007`). If a slide has no number, use `<source>:p<page>`
  (e.g. `m4fpr:p045`). `printedNumber` = the printed number; `ordinal` = the
  printed number (or 900 + page when unnumbered); `sourcePage` = page number.
- `raw` = `{ "text": <your literal transcription of question + choices>,
  "answer": <how the answer was marked, e.g. "B highlighted yellow">,
  "rationale": <literal transcription of the notes> }`.
- Lecture slides: the typed text is the question; the answer is the
  highlighted choice (see answer rules). Handwritten lecturer notes around the
  slide are the rationale — transcribe the legible ones as short bullets, keep
  drug names exact, and add `ocr_uncertain` if you had to guess words. Ignore
  watermarks, page counters, "BEQ" tags (but you may note "Marked BEQ (board
  exam question) in the source." as the first rationale line), toolbar UI and
  student cross-outs.
- A question may span several slides (question slide + annotation slides) —
  merge them into one question.
- Figures (structures, prescriptions, graphs) needed to answer: crop them into
  `data/images/<source>/` with
  `py -3.12 scripts/import/crop_image.py data/pages/<source>/p014.jpg 0.1 0.35 0.6 0.8 <source>/<source>_014-1.png`
  (fractions of the page, top-left origin), check the crop with Read, and list
  it in `images`.
- Page split between agents: handle every question whose **first** slide/page is
  inside your page range, even if it continues onto the next range.

## Unkeyed sources (m4drill, m5notes, calc) — you supply the answer

These sources have no reliable answer key, so **you work out the answer**.
Accuracy matters more than speed: reason it through as a pharmacist would,
using standard references (Katzung, Remington, USP, Ansel, Philippine laws).

Every question from these sources gets:
- `flags` including `ai_answer` (and `ai_choices` if you wrote the choices),
- `status: "needs_review"` (the owner verifies before it reaches study),
- a `reviewNote` stating where the key came from and anything the owner should
  check, e.g. `"No key in source; Claude's answer C. Student circled D (wrong: …)."`
  or `"Highlighted answer B matches Claude's answer."`,
- a `rationale` you write: 1–4 short bullets or a worked solution that explains
  why the answer is right (and, when useful, why the tempting distractor is wrong).
- If you are genuinely unsure between two choices, pick the better-supported one,
  add `answer_disputed`, and name the alternative + reason in `reviewNote`.

Source specifics:
- **m4drill** (`MODULE 4- Drill 1.pdf`, pages `data/pages/m4drill/p00N.jpg`,
  module `m4`): typed MCQs a–d in a two-column table, 100 items. Pen circles,
  ticks and strike-throughs are a **student's** attempts and are often wrong —
  record them in `raw.answer` ("student circled d") but do not trust them.
  `sourceRef` `m4drill:<nnn>` (printed number).
- **m5notes** (`Module 5.pdf`, pages `data/pages/m5notes/p00N.jpg`, module `m5`):
  a Module 5 questionnaire (printed numbers from ~116 up) annotated by a student:
  **green highlighter** marks a chosen answer, pasted screenshots are reference
  notes, handwriting is notes. Treat the green highlight as a candidate key:
  verify it; if you agree say so in `reviewNote`, if you disagree use your answer
  and explain. Use pasted notes as rationale material when relevant.
  `sourceRef` `m5notes:<nnn>` (printed number).
- **calc** (`4-Annotated Pharmaceutical Calculations Handout.pdf`; typed text in
  `data/raw/calc.txt` with `=== page N ===` markers, page images in
  `data/pages/calc/p###.jpg`), module `m3`, topic `m3-pharm-calc`, format
  `computation`:
  - Lecture pages 1–127 contain worked **examples** (typed problem, handwritten
    answer that is often illegible). `sourceRef` `calc:ex<page 3 digits>-<n>`
    (n = order on that page), `ordinal` = page × 10 + n, `printedNumber` null.
    If the handwritten answer is legible, compare it with yours in `reviewNote`.
  - Practice pages 129–154 ("PROBLEMA NA NAMAN!!") list numbered problems with
    no choices and no answers. `sourceRef` `calc:p<page 3 digits>-<n>` (n = the
    printed number), `ordinal` = page × 10 + n, `printedNumber` = n.
  - **Write 4 choices A–D** (flag `ai_choices`): the correct value plus three
    distractors built from realistic mistakes (inverted ratio, wrong conversion
    factor such as 454 vs 453.6 g/lb or 30 vs 29.57 mL/fl oz, off by ×10/×1000,
    forgetting a step). Same units and rounding style in all four. **Spread the
    correct letter across A–D** — do not always put it first.
  - Put the full step-by-step solution in `rationale` (show the setup, the
    conversion factors used and the arithmetic; state the rounding).
  - Roman-numeral items: "Express 2332 in Roman numerals." / "Caps. no. xlv —
    how many capsules?" with numeric or Roman choices.
  - Skip lecture content that is not a problem (definitions, rules, tables).

## Reference-note tables (notes) — you write the questions

Eight screenshots of reviewer reference tables, cleaned up in
`data/images/notes/notes-<table>.jpg` (originals in `data/pages/jfif/`). They
contain no questions, so you **write** board-style MCQs that test the facts in
each table.

- Source header `"source": { "slug": "notes", "name": "Reviewer reference notes", "shortName": "Notes" }`.
- `sourceRef` `notes:<table>-<nn>` (e.g. `notes:antifungals-03`), `ordinal` =
  table number × 100 + n, `printedNumber` null, `sourcePage` null.
- Every question: flags `ai_answer` + `ai_choices`, status `needs_review`,
  reviewNote `"Written by Claude from the <table> reference table."` plus any caveat.
- Attach the table image with `role: "rationale"` (shown only after answering, so
  it doesn't give the answer away) and a short `alt`.
- Rationale: the relevant rows retyped (Markdown table or bullets), plus a line
  on why the distractors are wrong. Keep the table's mnemonics in `mnemonic`.
- Only test what the table states. Where the table is wrong or oversimplified
  versus standard references, don't build a question on that fact (or note the
  correction in `reviewNote` and flag `rationale_disputed`).
- Mix formats as the PhLE does: single best answer, EXCEPT/NOT (`except`), a few
  roman-numeral combos, and matching sets (groupKey `notes:<table>-g<nn>`).
  Distractors come from other rows of the same table. Spread the answer letter
  across A–D.
- Check with `npx tsx scripts/validate-questions.ts --dupes <files…> data/questions/*.json`
  style runs that you are not duplicating an existing question; if one already
  asks the same fact the same way, skip it.

## Topic slugs by module

- **m1**: m1-general-chem, m1-organic-chem, m1-medicinal-chem, m1-inorganic-chem, m1-radiopharma-gases, m1-qualitative-analysis
- **m2**: m2-cell-biology, m2-proteins, m2-enzymes-vitamins, m2-carbohydrates, m2-lipids, m2-nucleic-acids, m2-metabolism, m2-inborn-errors, m2-crude-drugs, m2-biosynthesis, m2-carbohydrate-drugs, m2-fixed-oils, m2-volatile-oils, m2-resins, m2-alkaloids, m2-glycosides, m2-tannins, m2-ph-medicinal-plants
- **m3**: m3-prescriptions, m3-pharmacotherapy, m3-interactions, m3-adr-safety, m3-clinical-lab, m3-hospital-pharmacy, m3-pharm-calc
- **m4**: m4-general-principles, m4-autonomic, m4-cardiovascular, m4-blood, m4-lipids, m4-autacoids, m4-endocrine, m4-analgesics, m4-cns, m4-respiratory, m4-gi, m4-chemotherapy, m4-toxicology-antidotes
- **m5**: m5-physical-pharmacy, m5-dosage-forms, m5-manufacturing, m5-cosmetics, m5-laws-ethics
- **m6**: m6-micro-general, m6-immunology, m6-bacteriology, m6-virology, m6-mycology, m6-antimicrobials, m6-parasitology, m6-volumetric, m6-instrumental, m6-special-assays, m6-qa-qc

## Validate before finishing

```
npx tsx scripts/validate-questions.ts data/questions/<your-file>.json
```

Fix every error it reports and re-run until it passes. Then report: question
count, count per topic, and every `needs_review` item with its reason.

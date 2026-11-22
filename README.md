[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/payajakali1/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/payajakali1/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Entry for the [make.fun bounty: csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121) by **payaja**.

---

# csv-reader-speed-01-run-20261121 — entry by payaja

A faster drop-in for csv-reader 1.0.0: `solve.js` exports `run(input)`, which
returns exactly csv-reader's reading of `{text, header}` — `{columns, rows,
errors}` — under its broken-row policy (stray CRs, quote junk, unterminated
quotes, short/long rows all reported exactly as the reference reports them).
`main.ts` is the standard harness driver: it reads `/input/cases.json`,
answers each case with `run`, and writes `/output/answers.json`.

## Approach

The reference reader walks the text a character at a time and builds every
field by concatenation. This reader keeps the same single left-to-right pass
and the same decisions, but moves in jumps:

- Unquoted fields are located with `indexOf` (or a tight `charCodeAt` scan
  when the text contains CRs) and taken as one `slice` of the text; only a
  field that actually holds a stray CR is assembled from pieces.
- A quoted field's closing quote is found with `indexOf('"')`, skipping
  doubled quotes; clean content is one slice, and only content with doubled
  quotes or CRs is reassembled (with CRLF / lone CR read as LF).
- A quote that never closes costs one failed search: the field is then
  re-read as unquoted from just after the quote, exactly as the reference
  re-reads it.

Verified locally against the reference reader on the kit's practice set
(6/6 cases identical) and on randomized broken-CSV inputs (no differences).

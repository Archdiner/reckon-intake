# Which calls belong on the signed-in page

The signed-in page (`worker/app-page.js`) shows "Things you told your agents"
and offers one action: tick the ones worth keeping and copy them as plain
lines. That only works if every listed entry could plausibly be pasted into an
agent's standing instructions and still make sense. The extractor that
produced the current entries was tuned for decisions to verify, which is a
different shape, so entries have to be re-selected against this page's purpose.

This note is the selection rule. It contains no real session content.

## The property an entry needs

An entry earns a place when it reads as a **standing instruction in the
owner's own words**. Concretely, all five must hold:

1. **It tells the agent how to act, not what to answer.** An imperative or a
   rule ("Show me the failing test before you change anything", "Do not merge
   until..."). Questions, status updates and one-word replies fail.
2. **It applies beyond the moment it was said.** It would still be good advice
   in the next session on the same project. A go-ahead for one change ("yes,
   ship it") or a scope cut for one release usually fails; the same idea stated
   as a policy ("ship behind a flag first") passes.
3. **It is self-contained.** Someone reading only the quote knows what it asks.
   References to things outside it ("the agreed cap", "that file", "this PR",
   "do it like before") fail unless the referent is in the quote itself.
4. **It is whole.** Quotes are capped at 280 characters and cut ones end in
   " …". A cut quote pastes as a broken instruction, and quotes are never
   rewritten on the page, so cut entries fail.
5. **It is the owner's words.** A genuine user turn, not a command echo, hook
   output, file name or pasted agent text. Earlier counts were contaminated by
   exactly these, so this needs a manual look.

Type is a hint, not a filter. In the extractor's types:

- **Asked for proof** and **Merge or release gate** most often pass, because
  they are already phrased as conditions on how the agent should work.
- **Budget or limit** passes when the limit is stated in the quote, and fails
  when it points at a number agreed elsewhere.
- **Scope call** usually fails (tied to one release or task) unless it states a
  general rule.
- **Go-ahead** almost always fails: it approves one action at one time.

Status (checked or not) does not affect selection. An observed outcome is
useful context on the page, but it does not make an instruction more or less
reusable.

## Applied to the synthetic test entries

These are the four realistic fixtures in `worker/test-calls.mjs`. They are
invented for tests; the real entries are injected at deploy time and are not
in this repository, so they have to be judged against the rule above directly.

| Fixture | Quote (shortened) | Verdict | Why |
| --- | --- | --- | --- |
| `call-3` Asked for proof | "Show me the failing test before you change anything." | Keep | Imperative, general, self-contained, whole. The model case. |
| `call-2` Merge or release gate | "Do not merge until the migration test passes." | Keep, weakly | A gate rule that generalizes, but "the migration test" assumes one specific test exists. |
| `call-1` Budget or limit | "Keep the monthly spend under the agreed cap." | Drop as is | "The agreed cap" is defined outside the quote, so pasted alone it says nothing an agent can act on. |
| `call-4` Scope call (cut) | "Scope this release to the import flow only..." | Drop | About one release, and cut at 280 characters. |

So even in a hand-written set built to look like the real data, about half
fail. Expect a similar or larger share of the real entries to drop out,
especially go-aheads and one-off scope calls.

## What the page shows for selected entries

Entries that pass the rule need only `id` and `quote`, plus `project` and
`date` when known (`worker/calls.js` documents the shape). For each one the
page shows the quote, then one muted line with the project and date. Nothing
else:

- **No type label.** Every listed entry is a standing instruction, so a label
  would repeat itself. The extractor's types guide selection only.
- **No check machinery unless the data has it.** "Where to check" appears only
  for an entry that carries a locator, and an observed outcome only for an
  entry marked `checked` with outcome text. The fine print ("no outcome check
  is recorded here; you may have checked elsewhere") appears only when at least
  one listed entry carries an observed outcome, because only then is there a
  contrast to explain. With the re-selected set, none of this renders.

## Design calls on the page

These are decided, not open questions:

- **No filtering in the page.** The page lists every entry it is given, of
  every type. Selection happens upstream, when entries are chosen for
  injection, using the rule above. Hiding types in code would quietly
  second-guess curated data and make the page harder to reason about.
- **Data order.** Entries appear in the order they are injected, so the curator
  controls it. Put the strongest standing instructions first.
- **Copy format: `- quote (project)`.** One line per instruction pastes cleanly
  into a Markdown instructions file, and the project in parentheses keeps a
  rule from being applied to the wrong codebase. Grouping by project was
  considered and rejected: with a handful of entries it adds headings without
  adding meaning.

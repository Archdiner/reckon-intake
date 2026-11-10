# Directions to try

Four distinct approaches for what Reckon gives the owner, each small enough to
try tonight as a preview. None is chosen. Nothing here claims an effect: every
"what we would learn" is a question for one person, not a rate.

What the data looks like so far: the owner steers agents constantly, in
concrete, in-the-moment directives (simplicity, visuals, doing less). Almost
none of it is phrased as a reusable rule. Any direction has to work with that
shape, not wish it away.

## Two bars every direction must meet

These come from how the owner already works with agents:

- **Visuals earn their pixels.** Anything visual has to be striking and carry
  function: state he would otherwise have to ask for. Ornament fails, and he
  reverts it.
- **Everything is inspectable afterwards.** Whatever a direction does (what it
  showed, when, and from which data) is written to a plain local log he can
  read. Any use of a model, and especially a stronger one, is logged with which
  model and its usage, and is visible without digging.

## 1. One observation, with its evidence

**First three seconds:** one sentence written by the person running the pilot
after reading the moments together, such as "When the agent added more than you
asked for, you pulled it back to the smallest version." Under it, two or three
of the owner's own moments, each with project and date.

**One action:** copy a single suggested line that states the pattern as a rule,
clearly labeled as written from those moments, not as his words.

**Data:** the 24 candidates from the wider pass, read by hand for one cluster
with at least three supporting moments.

**Try tonight:** write one observation, pick its three evidence moments, inject
them, and preview the page.

**Earns its pixels:** the evidence is the visual. Each moment shows where and
when he said it, so he can judge the observation without asking where it came
from.

**Inspectable:** the page names who wrote the observation and links each
evidence line to its session and date. Written by hand, so no model use; if a
model ever drafts one, the model and its usage are stated on the page.

**Honest risk:** one reader, one sample. The observation can be wrong or
obvious, and a copied line may change nothing. If no cluster has three real
moments behind it, show nothing rather than a weak takeaway.

## 2. Backstage metrics, one well-timed prompt

**First three seconds:** nothing on a page. At the start of a session he sees
one short prompt drawn from his own pattern, for example "On this project you
have pulled scope back before. Smallest version first?" The measures behind it
never appear on screen.

**One action:** ignore it or not. The experiment is whether later sessions look
different.

**Data:** exploratory instrumentation, not metrics. The candidate measures (how
often he redirects, how long the agent runs before a redirect, how often scope
gets cut) come from rule-matched classifiers that are already known to be
noisy: earlier counts were contaminated by command echoes, hook output and file
names. Each measure has to be checked by hand against a sample of real moments
before anyone reads meaning into it, and any that fail the check are dropped.

**Try tonight:** run the classifiers over the existing upload and hand-check a
sample of what each one matched. Keep only the measures that survive. If any
do, write one prompt into the project's own agent instructions file by hand, as
the owner's choice. A later comparison needs a later upload; that only matters
if he picks this trial.

**Earns its pixels:** it has almost none, on purpose: one line of text at the
moment it applies, and nothing otherwise.

**Inspectable:** every prompt shown is logged locally with its date, project and
the measures that triggered it, and he can read the full measures file any
time. "Backstage" means not on screen, never hidden from him. The classifiers
are deterministic; no model is involved unless he asks, and then it is logged.

**Honest risk:** the measures may not survive the hand check at all. Even if
they do, one person and two snapshots can only suggest, never show, an effect.
Any tracking has to stay local and opt-in to avoid feeling like surveillance.

## 3. A terminal buddy that occasionally speaks up (picked, built)

The owner picked this direction. It is built as a local install in
`prototype/buddy/`; its README is the user-facing guide. Nothing about it is
deployed or wired up by this repository.

### What was built

- **An owl in the status line,** with three states:
  - `(-,-) zz reckon`: sleeping, no recent activity;
  - `(o,o) reckon`: attentive, the session's token count moved in the last 3
    minutes;
  - `(o,o)> <what it said>`: speaking, for 2 minutes after it speaks.

  The right side shows the model in use, the session's estimated cost and the
  context used, so usage stays visible. Plain ASCII, one line.
- **One interjection at most per session,** across all rules. It is sent at the
  end of a turn from the Stop hook as a `systemMessage` prefixed by the owl, for
  example `(o,o)> this grew past the ask - trim to the smallest version?` A rule
  that has fired 3 times on a project goes quiet there.
- **Rules the user picks and edits.** Five starter suggestions live in
  `~/.reckon/rules.json`, each with an `enabled` flag, a plain description, the
  words the owl says, and its numbers:
  - `scope-growth`: a short request whose turn edited many files or added
    extras;
  - `redirect-run`: 3 or more steering messages in the session;
  - `ornament`: edits that add gradients, shadows, animations or emoji;
  - `plan-ceremony`: a long plan and no changes yet;
  - `session-length`: a neutral check-in at about 90 minutes.

  They are suggestions drawn from the owner's patterns, not validated habits.
  The installer asks about each one, and nothing is on by default.
- **An installer,** `install.mjs`:
  - backs up `~/.claude/settings.json` to a timestamped file before changing it;
  - adds the status line and a Stop hook, and prints exactly what it added;
  - wraps an existing status line command, so its output is shown unchanged with
    the owl on a line below;
  - asks before replacing a status line it cannot wrap;
  - appends the Stop hook once, alongside existing hooks.

  `--uninstall` removes only the owl's entries and restores the original status
  line.
- **Robust and inspectable.** Malformed input, transcripts, state or rules never
  break the session: the hook stays silent and logs an error. `~/.reckon/buddy.log`
  records every fire, skip and error with only a timestamp, the rule id, a hash
  of the session id and a reason word. No prompts, quotes or file contents are
  logged. The log rotates at 1 MB.
- **Tested.** `prototype/buddy/buddy.test.mjs` covers:
  - the pet states and every starter rule;
  - the session cap and the project quiet-down;
  - malformed inputs, log hygiene and rotation;
  - installer merge, wrap, replace and uninstall, against a temporary home
    folder.

### Why this shape (verified against the docs)

- **A hook can speak to the person.** `systemMessage` is a "Warning message shown
  to the user" (https://code.claude.com/docs/en/hooks), and the installed 2.1.42
  build describes it as "Display a message to the user (all hooks)". Stop is not
  among the events the docs list as discarding it.
- **The other channels reach only the model.** `additionalContext` "doesn't
  appear as a chat message in the interface" and on Stop it keeps the agent
  working. For `UserPromptSubmit`, "Neither channel produces a visible
  transcript entry." So the owl speaks only through `systemMessage`, and never
  to the agent.
- **What the Stop hook sees:** `transcript_path`, `cwd`, `stop_hook_active` and
  `last_assistant_message`.
- **What the status line sees:** the model, estimated cost, lines changed and
  context window, refreshed about 300 ms after each conversation update
  (https://code.claude.com/docs/en/statusline).

### Limits, stated to the user

- **What it cannot see:** it reads the transcript after each turn only, and
  cannot see the screen, the editor, other apps or anything between turns.
- **How it decides:** the rules are pattern matching, not understanding.
- **What leaves the machine:** nothing. No network, no model calls, and it
  costs nothing to run.

### Still to confirm on his machine

The docs describe the current release. The first real session should confirm
that the Stop hook's line appears in his version of Claude Code, and that a
wrapped status line renders cleanly in his terminal.

### Reduced form (fallback)

If the interjections prove unwelcome, he can switch every rule off in
`rules.json`. The owl then stays a quiet status line with model and usage: a
readout, not a buddy.

## 4. One moment, before and after

**First three seconds:** a single moment from his sessions, shown side by
side: what the agent had produced, his one-line redirect, and what it produced
next. The redirect sits in the middle, large.

**One action:** step to the next moment, or stop. A handful at most.

**Data:** for a few hand-picked corrections, the agent output just before and
just after, trimmed by hand from the masked upload.

**Try tonight:** pick three corrections from the 24, trim the before and after
by hand, and preview them as a three-step page.

**Earns its pixels:** the side-by-side is the content: the change his one line
made is visible at a glance, without rereading a transcript.

**Inspectable:** each moment names its session and date, and marks where the
before and after text was trimmed. Picked and trimmed by hand, so no model
use; if a model ever helps trim, the model and its usage are stated.

**Honest risk:** it shows that his steering mattered in those moments, not
how often; it could read as a highlight reel. Agent output can be long and can
contain code or details the masker missed, so every excerpt needs a careful
manual read before it is shown, even privately.

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

## 3. A terminal buddy that occasionally speaks up

The owner asked for "a little terminal buddy that pops out occasionally with
some ideas or interferences", one that sees what he is doing live and adapts
over time, and asked whether that is feasible or overdone.

**Short answer: feasible in a lean form, inside Claude Code.** It can see the
session as it happens, say one line at the end of a turn, and adapt, all locally
and at no cost to run. It cannot see anything outside Claude Code, and it
cannot speak between turns. It becomes overdone the moment it talks more than
about once a session.

A working preview is in `prototype/buddy/` (not wired into anything; see its
README). Sources for the facts below:

- the official hooks reference, https://code.claude.com/docs/en/hooks;
- the official status line guide, https://code.claude.com/docs/en/statusline;
- the installed Claude Code 2.1.42 build in this environment.

The docs describe the current release. A few fields may differ in older
versions, so the first trial should confirm them on his machine.

### Can a hook say something he actually sees?

Yes, through `systemMessage`. The hooks reference lists it as a "Warning message
shown to the user", and the installed build describes it the same way, as
"Display a message to the user (all hooks)". The reference names the events
that discard it (Setup, InstructionsLoaded, MessageDisplay, Notification,
ConfigChange, PreCompact, PostCompact, WorktreeRemove, SessionEnd); Stop is not
among them.

The other channels are wrong for this job:

- `additionalContext` goes to the model and "doesn't appear as a chat message in
  the interface". On Stop it even keeps the agent working.
- Plain stdout from `UserPromptSubmit` or `SessionStart` is added to the
  model's context. For `UserPromptSubmit` the reference says "Neither channel
  produces a visible transcript entry."

So the buddy speaks only through `systemMessage` on Stop. Its words reach him
and never the agent.

### Does it see enough to be timely?

Within the session, yes:

- **Stop hook input:** the session's `transcript_path` (every prompt, reply and
  tool call so far), `cwd`, `stop_hook_active`, and `last_assistant_message`,
  the agent's final text for the turn.
- **Status line input:** the model, the estimated session cost, lines added and
  removed, and how full the context window is.

That is enough for rules such as "the prompt asked for something small and
this turn edited five files", "three redirects in a row" or "the agent just
described adding a gradient". Those follow his own steering patterns.

What it cannot see: his screen, his editor outside Claude Code, other apps,
other tools such as Cursor or Codex, and anything between turns. Background
(`async`) hooks do not change this; they report back to the agent, not to him.

### The smallest visual identity that earns its place

- **Two states in the status line, nothing more:**
  - Quiet: `· Reckon`, plus at most one phrase of his own for the project.
  - Has something to say: `◆ Reckon: <the thought>` for about two minutes after
    it speaks.

  The glyph change is the only signal that it has something. It carries state
  he would otherwise not know about, so it earns its pixels.
- **The interjection itself:** one named line, `Reckon: ...`, phrased as a
  question.
- **Cap:** at most once per session by default.
- No face, no score, no mood.

### How it adapts

- **No model calls:** rules are deterministic, local and free to run.
- **It quiets itself:** a rule shown three times on a project goes quiet there.
- **Rules and phrases live in one editable file**
  (`~/.reckon/buddy-rules.json`), which can be revised by hand after he reads
  the log or after a later upload. A model-written thought could be added later
  only as an explicit opt-in, occasional rather than continuous, and logged
  with its model and usage.

### Inspectable

Every status line change (with the model in use), every thought (with its rule,
the prompt and files touched) and the next prompt after each thought go to
`~/.reckon/buddy.log`. Whether it helped is judged by reading that log, not by
a number on screen. It makes no network calls and uploads nothing.

### Setup he runs once

Copy the script and the rules file to `~/.reckon/`. Then add `statusLine` and
one `Stop` hook to `~/.claude/settings.json`; the exact entries are in the
prototype README. Deleting the entries uninstalls it. It needs Node, which an
npm install of Claude Code already has.

### Reduced form (fallback)

If the interjections prove noisy or unwelcome, drop the Stop hook and keep only
the status line. That fallback shows the model, cost and context used, plus his
project phrase. It is honest and useful, but it is a readout, not a buddy, and
should be labeled as the reduced form.

### Tonight's trial, smallest install

Install the status line entry and the Stop hook with the example rules, and use
Claude Code normally for an evening. Then read `~/.reckon/buddy.log` and answer
four questions:

- Did it speak at most once per session?
- Was each thought about something real?
- Did the next prompt suggest it was useful?
- Did the status line glyph carry its weight?

If it never spoke, the rules are too narrow; if it annoyed, fall back to the
reduced form.

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

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
one short prompt drawn from his own pattern, for example "Last time on this
project you cut scope twice. Smallest version first?" The metrics behind it
never appear.

**One action:** ignore it or not. The experiment is whether the next sessions
look different, measured quietly.

**Data:** a handful of per-session measures computed offline from uploads (how
often he redirects, how long the agent runs before a redirect, how often scope
gets cut), per project.

**Try tonight:** compute the measures from the existing upload. Write one
prompt into the project's own agent instructions file by hand, as the owner's
choice, and plan a second upload after a few sessions to compare.

**Earns its pixels:** it has almost none, on purpose: one line of text at the
moment it applies, and nothing otherwise.

**Inspectable:** every prompt shown is logged locally with its date, project and
the measures that triggered it, and he can read the full metrics file any time.
"Backstage" means not on screen, never hidden from him. Computing the measures
is deterministic; no model is involved unless he asks, and then it is logged.

**Honest risk:** with one person and two snapshots, any change could be noise,
so this can suggest but never show an effect. It needs a second upload, which
the one-upload cap blocks unless the owner grants himself an extra. Silent
tracking also has to stay local and opt-in to avoid feeling like surveillance.

## 3. A companion in the status line

**First three seconds:** in Claude Code's status line, live state he would
otherwise have to ask for: which model this session is using, and what the
session has used so far. A stronger model is marked plainly, never buried.
After that, one short line of his own context for the current project, such as
"here: smallest change that works." No face, no score, no mood.

**One action:** none needed. Glancing at it is the use; one keystroke could
hide the context part for the session.

**Data:** the fields the status line script already receives for the session
(model name and running usage; check which ones his Claude Code version
passes), plus a small local file per project written from the curated moments
or from direction 1's observation. No network, no new capture.

**Try tonight:** a status line script that prints model, usage and the
project line, and appends every line it prints to a local log with a
timestamp. Installed by hand in his settings.

**Earns its pixels:** model and usage are state he would otherwise stop and
ask about; the context line is the only part that is Reckon's own, and it is
one short phrase.

**Inspectable:** the local log shows every line the companion displayed and
when, including each model change and the usage at that point.

**Honest risk:** status line space is precious, and stale or wrong context is
worse than none. It only covers Claude Code. Model and usage are useful on
their own, so the companion could be valued for those while the Reckon line
adds nothing; that would be worth knowing.

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

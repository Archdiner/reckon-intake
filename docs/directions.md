# Directions to try

Four distinct approaches for what Reckon gives the owner, each small enough to
try tonight as a preview. None is chosen. Nothing here claims an effect: every
"what we would learn" is a question for one person, not a rate.

What the data looks like so far: the owner steers agents constantly, in
concrete, in-the-moment directives (simplicity, visuals, doing less). Almost
none of it is phrased as a reusable rule. Any direction has to work with that
shape, not wish it away.

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

**Honest risk:** with one person and two snapshots, any change could be noise,
so this can suggest but never show an effect. It needs a second upload, which
the one-upload cap blocks unless the owner grants himself an extra. Silent
tracking also has to stay local and opt-in to avoid feeling like surveillance.

## 3. A companion in the status line

**First three seconds:** in Claude Code's status line, a small mark and one
line of context for the project he is in, such as "Reckon: you tend to want
the smallest change that works here." It changes when he switches projects.
No face, no score, no mood.

**One action:** none needed. Glancing at it is the use; one keystroke could
hide it for the session.

**Data:** a small local file per project, written from the curated moments (or
from direction 1's observation), read by a status line script. It needs no
network and no new capture.

**Try tonight:** a status line script that reads the file for the current
working directory and prints one line, installed by hand in his settings.

**Honest risk:** status line space is precious, and stale or wrong context is
worse than none. It only covers Claude Code, and it is a reminder; whether a
reminder helps is exactly what is unknown.

## 4. One moment, before and after

**First three seconds:** a single moment from his sessions, shown side by
side: what the agent had produced, his one-line redirect, and what it produced
next. The redirect sits in the middle, large.

**One action:** step to the next moment, or stop. A handful at most.

**Data:** for a few hand-picked corrections, the agent output just before and
just after, trimmed by hand from the masked upload.

**Try tonight:** pick three corrections from the 24, trim the before and after
by hand, and preview them as a three-step page.

**Honest risk:** it shows that his steering mattered in those moments, not
how often; it could read as a highlight reel. Agent output can be long and can
contain code or details the masker missed, so every excerpt needs a careful
manual read before it is shown, even privately.

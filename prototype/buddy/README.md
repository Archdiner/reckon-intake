# Reckon buddy

A small owl for Claude Code. It sits in the status line, and at most once per
session it speaks up with one short question when a rule you switched on
matches what just happened in the turn.

```
(-,-) zz reckon  |  <model> · $0.42 · ctx 31%      sleeping: no recent activity
(o,o) reckon  |  <model> · $0.42 · ctx 31%         attentive: the session is active
(o,o)> added flourish - keep or strip?  |  ...     speaking: for about 2 minutes after it speaks
```

When it speaks, Claude Code also shows you one line at the end of the turn:

```
(o,o)> this grew past the ask - trim to the smallest version?
```

That line is for you only. The owl never adds anything to what the agent
sees, so it cannot steer the agent.

## Setup

```bash
git clone https://github.com/Archdiner/reckon-intake.git
```

```bash
node reckon-intake/prototype/buddy/install.mjs
```

Then restart Claude Code.

The installer asks about each starter rule, one by one, and switches on only
the ones you answer `y` to. Then it:

- copies the owl to `~/.reckon/`;
- backs up `~/.claude/settings.json` to a timestamped file next to it;
- adds a `statusLine` entry and one `Stop` hook entry, and prints exactly what
  it added.

Existing settings are never silently replaced:

- **Status line command:** if you already have one, the owl wraps it. Your
  command still runs first, its output is shown unchanged, and the owl appears
  on its own line below it.
- **Other status line setting:** if it cannot be wrapped safely, the installer
  asks before replacing it. Your original is in the backup either way.
- **Stop hooks:** the owl's hook is appended alongside any you already have,
  and never added twice.

It needs Node, which an npm install of Claude Code already has. No other
dependencies, no network.

## Uninstall

```bash
node reckon-intake/prototype/buddy/install.mjs --uninstall
```

This backs up `~/.claude/settings.json` again, removes only the owl's entries,
and puts back your original status line if the owl had wrapped or replaced it.
Your rules and the log stay in `~/.reckon/`; delete that folder if you want
them gone too.

## Your rules

The starter rules are suggestions to pick and edit, not findings about you.
They live in `~/.reckon/rules.json`, and the owl reads that file on every turn,
so edits apply immediately. Each rule has:

- `enabled`: `true` or `false`. Nothing runs unless it is `true`.
- `description`: in plain words, when the rule matches.
- `says`: what the owl says. Reword it freely.
- `params`: the numbers the rule uses, such as how many files count as many.

| Rule | Matches when | The owl says |
| --- | --- | --- |
| `scope-growth` | after a short request (25 words or fewer), the turn edited 4 or more files, or the agent said it added extras | this grew past the ask - trim to the smallest version? |
| `redirect-run` | 3 or more steering messages in the session (starting with no, don't, stop, instead, actually, simpler and similar) | several redirects - worth stating the target shape up front? |
| `ornament` | the turn's edits add gradients, shadows, animations or emoji | added flourish - keep or strip? |
| `plan-ceremony` | the agent replied with a plan of 5 or more steps and changed nothing yet | skip the plan, start the smallest step? |
| `session-length` | the session has run about 90 minutes; a neutral check-in, not a judgment | about 90 minutes in. still heading where you meant to? |

Two limits are built in and cannot be switched off:

- **At most one interruption per session**, across all rules.
- **Per-project quiet-down:** a rule that has fired 3 times on a project goes
  quiet there.

## Honest limits

- **When it looks:** it reads the session's transcript on your disk after each
  turn ends, and the status line only refreshes when the conversation updates.
- **What it cannot see:** your screen, your editor, other apps, other tools,
  or anything between turns.
- **How it decides:** rules are simple pattern matching on words, file counts
  and timestamps, not understanding. Expect some misses and some false alarms;
  that is why you choose and edit them.
- **What leaves the machine:** nothing. No network calls and no model calls,
  so it costs nothing to run.

## The log

`~/.reckon/buddy.log` records every time the owl spoke, every time a matching
rule was held back (by the session cap or the quiet-down), and every error. Each
line holds only:

- a timestamp;
- `fire`, `skip` or `error`;
- the rule id;
- a short hash of the session id;
- a word from a fixed list saying why, for skips and errors.

It never stores prompts, quotes, file names or file contents. It is capped at
1 MB; when full, it moves to `buddy.log.1` and starts again. Any failure is
silent to your session and shows up here instead.

## Test

```bash
node reckon-intake/prototype/buddy/buddy.test.mjs
```

The tests use temporary folders as the home folder; they never touch your real
`~/.reckon` or `~/.claude`.

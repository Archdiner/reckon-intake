# Terminal buddy (preview prototype)

**Preview only.** Nothing in this repository installs, wires up or runs this.
It is here so the idea can be reviewed as working code. It ships nowhere until
the owner picks this direction. See `docs/directions.md`, pitch 3.

## What it does

One local script, `buddy.mjs`, for Claude Code:

- **`status` (status line command).** Shows a quiet `· Reckon` mark, plus one
  short phrase of the owner's own for the current project if one is set. When
  the buddy has just said something, the mark becomes `◆ Reckon: <the thought>`
  for about two minutes. On the right it shows the model in use, the session's
  estimated cost and context used: state that would otherwise mean asking.
- **`stop` (Stop hook command).** At the end of a turn, checks a few
  deterministic rules against the session so far. If one holds, it returns one
  line as a `systemMessage`, which Claude Code shows to the person. It never
  returns `additionalContext` or a decision, so it cannot steer the agent. At
  most one thought per session by default. A rule shown three times on a
  project goes quiet there.

The example rules (`buddy-rules.example.json`) follow the owner's own steering
patterns, and are phrased as questions:

- **Small ask, big turn:** the prompt asked for something small, and the turn
  touched four or more files.
- **Redirect run:** three redirects in a row.
- **Ornament:** the agent's closing message mentions decoration such as a
  gradient or an animation.

These matches are rule-based and noisy. Treat every one as a candidate until
the log shows whether it was useful.

## What it cannot see

Anything outside the Claude Code session: the screen, the editor, other apps,
or other tools. It also cannot speak between turns; it only reacts when a turn
ends or the status line refreshes.

## Inspecting it

Every line it shows is appended to `~/.reckon/buddy.log` as JSON:

- each status line change, with the model at that moment;
- each nudge, with its rule, the prompt and the number of files touched;
- the next prompt after a nudge, so its value can be judged by reading the log.

It makes no network calls and no model calls, and it writes nothing outside
`~/.reckon/`. Set `RECKON_HOME` to use another folder.

## Trying it, only once picked

1. Copy `buddy.mjs` to `~/.reckon/buddy.mjs`, and
   `buddy-rules.example.json` to `~/.reckon/buddy-rules.json`. Edit the phrases.
2. Smallest trial, the status line only. Add to `~/.claude/settings.json`:

   ```json
   { "statusLine": { "type": "command", "command": "node ~/.reckon/buddy.mjs status" } }
   ```

3. Next step, the occasional line. Also add a Stop hook:

   ```json
   { "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node ~/.reckon/buddy.mjs stop" } ] } ] } }
   ```

Removing those entries uninstalls it. It needs Node, which an npm install of
Claude Code already has.

## Test

```bash
node prototype/buddy/buddy.test.mjs
```

The test uses a synthetic transcript and a temporary folder; it touches nothing
in `~/.reckon`.

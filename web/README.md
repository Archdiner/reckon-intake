# Reckon site (`web/`)

The public Reckon website: a fully static Next.js (App Router, TypeScript)
site. It explains the problem Reckon is studying, holds an interactive sketch,
and describes the pilot as it exists today. It has no server code, no secrets,
no analytics, no cookies and no network calls of its own.

## Local development

Requires Node 22.18 or newer.

```bash
cd web
npm ci
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm test           # content and honesty checks, plus the sketch's word rules
npm run typecheck  # tsc --noEmit
npm run build      # static export to web/out/
npm start          # serve web/out/ locally after a build
```

`npm test` runs the TypeScript sources directly through Node's type stripping,
so it needs no build step.

## Deployment

Deployed on Vercel (the free Hobby plan is enough):

1. Import the repository in Vercel.
2. Set **Root Directory** to `web/`. The framework preset is detected as
   Next.js; keep the default build command (`next build`).
3. Deploy. `next.config.ts` sets `output: "export"`, so Vercel serves plain
   static files. `vercel.json` adds a few security headers.

No environment variables are needed.

## Structure

- `app/page.tsx`: the single page and its sections.
- `app/globals.css`: design tokens and page styles. One accent color
  (`--accent`), Instrument Serif for display type, Inter for body text, both
  self-hosted from npm (`@fontsource`), so no font CDN is contacted.
- `components/ExperienceSketch.tsx` (+ `.module.css`): the centerpiece slot.
  Today it holds a sketch of the feeling Reckon is after: you think first, and
  your own reasoning is made visible before any answer appears. It is built to
  be swapped out wholesale for the real interaction once the research picks a
  direction; the page only passes it `scenarios` and an `id`.
- `lib/thought-map.ts`: the sketch's few fixed word rules (because, unless,
  if, questions, numbers). Transparent and local; nothing is scored.
- `lib/sketch-content.ts`: everything the sketch shows: `SCENARIOS` (questions
  and optional pre-written answers) and `SKETCH_COPY` (all framing text). To
  swap in new material, edit this file only; the component holds no visible
  text, and a test fails if that changes. Leaving out a scenario's `answer`
  hides the "read an answer" step for it.
- `lib/content.ts`: install command, links, and the "What happens to your
  sessions" facts.

## Content rules

- Only the collector upload and hand-written findings are live today. Do not
  describe capture, inference or any companion behavior as working.
- Effects of AI turn-taking on thinking are open research questions, not
  established facts. Phrase them as questions or flagged hypotheses.
- The trust facts in `lib/content.ts` are copied word for word from
  `worker/landing-page.js`. `test/content.test.mjs` fails if they drift.
- No scores, metrics, rankings or gamified stats. No tracking of any kind.
- Plain voice; no em dashes. The test file lists the banned words.

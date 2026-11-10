# Reckon site (`web/`)

The public Reckon website: a fully static Next.js (App Router, TypeScript)
site. It explains the question Reckon is studying, previews what the private
page shows,
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
npm test           # content, honesty and isolation checks
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
- `components/CallsPreview.tsx` (+ `.module.css`): the centerpiece slot. A
  static, server-rendered preview of the signed-in page's "Calls we noticed"
  section: abstract rows with placeholder bars where a participant's own words
  would be, the real type labels and status wording, and a legend explaining
  what the private page shows. No client JavaScript and nothing interactive;
  it does not pretend to be the product.
- `lib/preview-content.ts`: every string the preview shows (`PREVIEW_COPY`).
  To change the centerpiece copy, edit this file only; the component holds no
  visible text, and a test fails if that changes. Never add invented people,
  quotes or decisions here, and never real participant data: the preview
  stays abstract, and the tests check that it stays labeled as a placeholder
  preview.
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

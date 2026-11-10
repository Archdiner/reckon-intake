// Everything the CallsPreview shows lives in this file. To change the
// centerpiece copy, edit this file only; the component holds no visible text,
// and a test fails if that changes.
//
// The preview is abstract on purpose: placeholder bars stand in for a
// participant's words. Never put invented people, quotes or decisions here,
// and never real participant data. The type labels and status wording match
// the signed-in page's "Calls we noticed" section.

export type PreviewRow = {
  /** A real type label from the signed-in page. */
  type: string;
  status: "not_checked" | "checked";
  /** Shown dimmed with the "Reviewed" mark. */
  reviewed?: boolean;
};

export type PreviewCopy = {
  eyebrow: string;
  /** The visible "this is a placeholder preview" label. Must stay prominent. */
  label: string;
  title: string;
  titleEmphasis: string;
  question: string;
  intro: string;
  candidates: string;
  sectionTitle: string;
  rows: PreviewRow[];
  status: {
    notChecked: string;
    whereToCheck: string;
    checked: string;
    source: string;
    markReviewed: string;
    reviewed: string;
  };
  legend: Array<{ title: string; text: string }>;
  caption: string;
  signIn: string;
};

export const PREVIEW_COPY: PreviewCopy = {
  eyebrow: "What your private page shows",
  label: "Preview with placeholder bars. No real people, quotes or decisions.",
  title: "Calls from your sessions,",
  titleEmphasis: "and where to check them.",
  question: "When you settle something with AI, what happens to that call afterwards? Does anyone go back and look?",
  intro:
    "In this pilot, a rule pass over an upload pulls out moments that look like decisions: a budget, a merge gate, a go-ahead. Your private page lists them, with where each one could be checked, and you can mark the ones you have reviewed.",
  candidates:
    "Rules misread sometimes, so every entry is a candidate, not a conclusion. Not checked means nobody has looked yet, not that anything went wrong.",
  sectionTitle: "Calls we noticed in your sessions",
  rows: [
    { type: "Budget or limit", status: "not_checked" },
    { type: "Merge or release gate", status: "checked" },
    { type: "Go-ahead", status: "not_checked", reviewed: true },
  ],
  status: {
    notChecked: "Not checked",
    whereToCheck: "Where to check",
    checked: "Checked",
    source: "Source",
    markReviewed: "Mark reviewed",
    reviewed: "Reviewed",
  },
  legend: [
    {
      title: "Your words, in context",
      text: "What you said, when, and in which project, quoted as it appears in your session.",
    },
    {
      title: "Where it could be checked",
      text: "A place to look, as plain text. If someone has checked, the state they observed and its source.",
    },
    {
      title: "Marked as reviewed",
      text: "Mark an entry once you have looked at it. Marks stay on your device, in your browser.",
    },
  ],
  caption:
    "A static preview, not the product. The real list appears only on your private page after sign-in, and only once a pass has been run on your upload.",
  signIn: "Sign in to your page",
};

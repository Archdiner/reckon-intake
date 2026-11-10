// A tiny, transparent word-rule pass that makes the visitor's own reasoning
// visible in the ExperienceSketch. It does not judge, grade or count anything
// for display; it only finds the shape that is already there (a call, reasons,
// conditions, questions, specifics) so the page can typeset it.
//
// Plain TypeScript with type annotations only, so Node can run the tests
// directly (type stripping) without a build step.

export type Mark = "reason" | "condition" | "question" | "specific";

export type Segment = { text: string; mark: Mark | null };

export type ThoughtMap = {
  segments: Segment[];
  call: string | null;
  reasons: string[];
  conditions: string[];
  questions: string[];
  specifics: string[];
};

type Range = { start: number; end: number; mark: Mark };

const PATTERNS: Array<[Mark, RegExp]> = [
  ["question", /[^.!?\n]*\?/g],
  [
    "reason",
    /\b(because|since|so that|which means|that way|otherwise|the reason)\b[^.!?;\n]*/gi,
  ],
  [
    "condition",
    /\b(unless|as long as|only if|if|provided|but|although|though|however|depends on|it depends)\b[^.!?;,\n]*/gi,
  ],
  [
    "specific",
    /(\$\s?\d[\d,.]*|\b\d[\d,.]*\s?(%|percent|am|pm|hours?|minutes?|days?|weeks?|people|km|miles)?\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|morning|afternoon|evening)\b)/gi,
  ],
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/^[,;:\s]+|[,;:\s]+$/g, "");
const fragment = (s: string) => clean(s).replace(/[.,;:!]+$/, "");

function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]*/g) || []).map(clean).filter(Boolean);
}

export function mapThought(input: string): ThoughtMap {
  const text = input.replace(/\r\n?/g, "\n");
  const taken: Range[] = [];
  for (const [mark, re] of PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      let start = m.index;
      let end = start + m[0].length;
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end - start < 2) continue;
      // Keep trailing punctuation with the phrase so it never wraps alone.
      if (end < text.length && /[.,;:!]/.test(text[end])) end++;
      if (taken.some((r) => start < r.end && end > r.start)) continue;
      taken.push({ start, end, mark });
    }
  }
  taken.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let pos = 0;
  for (const r of taken) {
    if (r.start > pos) segments.push({ text: text.slice(pos, r.start), mark: null });
    segments.push({ text: text.slice(r.start, r.end), mark: r.mark });
    pos = r.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), mark: null });

  const pick = (mark: Mark) =>
    [...new Set(taken.filter((r) => r.mark === mark).map((r) => fragment(text.slice(r.start, r.end))))].filter(Boolean);

  const all = sentences(text);
  const call = all.find((s) => !s.endsWith("?")) ?? null;

  return {
    segments,
    call,
    reasons: pick("reason"),
    conditions: pick("condition"),
    questions: pick("question"),
    specifics: pick("specific"),
  };
}

export const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

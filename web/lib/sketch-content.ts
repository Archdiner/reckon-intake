// Everything the ExperienceSketch shows lives in this file: the scenarios and
// the framing copy around them. To swap in new material (for example
// scenarios grounded in real session patterns), edit SCENARIOS and, if the
// framing needs to change, SKETCH_COPY. The component itself holds no visible
// text and does not need to change.
//
// Nothing here is generated at runtime and no AI service is ever called.
// Answers are optional and are only shown after the visitor has written and
// seen their own take.

export type Scenario = {
  /** Stable key; must be unique. */
  id: string;
  /** Short label on the picker chip. */
  label: string;
  /** The prompt the visitor answers in their own words. */
  question: string;
  /** Placeholder inside the writing box. */
  placeholder: string;
  /** Optional pre-written answer, one string per paragraph. Leave out to hide the "read an answer" step. */
  answer?: string[];
};

export type SketchCopy = {
  eyebrow: string;
  title: string;
  titleEmphasis: string;
  pickerLabel: string;
  inputLabel: string;
  showButton: string;
  hintStart: string;
  hintReady: string;
  markLabels: { reason: string; condition: string; question: string; specific: string };
  pageLabel: string;
  callLabel: string;
  marginLabel: string;
  groupTitles: { reasons: string; conditions: string; questions: string; specifics: string };
  emptyTitle: string;
  emptyNote: string;
  usualName: string;
  usualSteps: string[];
  nowName: string;
  nowSteps: string[];
  contrast: string;
  readAnswer: string;
  keepWriting: string;
  another: string;
  answerBadge: string;
  answerNote: string;
  closer: string;
  disclaimer: string;
};

export const SKETCH_COPY: SketchCopy = {
  eyebrow: "Interactive sketch",
  title: "Before any answer:",
  titleEmphasis: "what do you think?",
  pickerLabel: "Choose a question",
  inputLabel: "Your own take",
  showButton: "See my thinking",
  hintStart: "A few words is enough to start.",
  hintReady: "Words like because, unless and if will light up.",
  markLabels: { reason: "a reason", condition: "a condition", question: "an open question", specific: "a specific" },
  pageLabel: "Your thinking",
  callLabel: "Your call",
  marginLabel: "What is in your take",
  groupTitles: {
    reasons: "Your reasons",
    conditions: "Your conditions",
    questions: "Still open for you",
    specifics: "Your specifics",
  },
  emptyTitle: "A clear starting point",
  emptyNote: "Add a because or an unless and watch the reasoning light up.",
  usualName: "The usual loop",
  usualSteps: ["Ask", "Wait", "Read an answer"],
  nowName: "Just now",
  nowSteps: ["Think", "See your thinking", "Then read, if you like"],
  contrast: "The usual loop goes straight from your question to its answer. Here, the first thing on the screen was yours.",
  readAnswer: "Now read an answer",
  keepWriting: "Keep writing",
  another: "Try another question",
  answerBadge: "An answer",
  answerNote: "pre-written, no AI called",
  closer:
    "Read it with your own take in hand: what would you keep, and what would you push back on? That feeling, thinking first and seeing it, is what Reckon is after. How to bring it into real work with AI is the open question.",
  disclaimer:
    "A sketch of a feeling, not a product feature. It runs in your browser with a few fixed word rules and pre-written answers. No AI is called, nothing you type leaves this page, and nothing is stored or measured.",
};

export const SCENARIOS: Scenario[] = [
  {
    id: "ship",
    label: "Ship or slip",
    question:
      "Your team of four can ship on Friday with one known, minor bug, or slip a week and ship it clean. What would you do, and why?",
    placeholder: "Your call first. Then say why.",
    answer: [
      "Ship on Friday, with three conditions.",
      "First, the bug must be truly minor: no data loss, no security exposure, and a clear workaround. Second, write a short known-issues note so support and users are not surprised. Third, put the fix on the calendar for early next week and name an owner.",
      "Slipping a week has hidden costs: momentum drops, other work queues up behind it, and feedback from real users arrives later. A small, documented, time-boxed bug is usually the cheaper risk.",
      "If any condition fails, slip, and use the week to fix the bug and nothing else.",
    ],
  },
  {
    id: "saturday",
    label: "A free Saturday",
    question:
      "You have one completely free Saturday after a draining month. How would you spend it so you actually feel rested on Sunday night?",
    placeholder: "What does rested mean for you? Start there.",
    answer: [
      "Plan the day in three loose blocks and protect the evening.",
      "Morning: sleep without an alarm, then get outside within an hour of waking. A long walk or an easy ride resets your sense of time better than a screen.",
      "Afternoon: one thing you enjoy for its own sake, with no output expected. Cooking, reading, a museum, a long call with a friend.",
      "Evening: keep it quiet and low-stimulation, and decide in advance when screens go off. Prepare one small thing for Monday so it does not leak into Sunday.",
    ],
  },
  {
    id: "sky",
    label: "Why is the sky blue?",
    question:
      "A ten-year-old asks you why the sky is blue. How would you explain it, in your own words?",
    placeholder: "Say it the way you would at the kitchen table.",
    answer: [
      "Sunlight looks white, but it is really all the colors mixed together.",
      "When that light comes through the air, it bumps into tiny bits of gas. Those bits are much better at bouncing blue light around than red or yellow light, so blue gets scattered all across the sky.",
      "Wherever you look up, some of that bounced-around blue light is heading toward your eyes. That is why the whole sky looks blue.",
      "At sunset the light travels through much more air, so most of the blue is scattered away before it reaches you, and the reds and oranges are what is left.",
    ],
  },
];

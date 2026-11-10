// Pre-written content for the ExperienceSketch. Nothing here is generated at
// runtime and no AI service is ever called. The answers are only shown after
// the visitor has written and seen their own take.

export type Scenario = {
  id: string;
  label: string;
  question: string;
  placeholder: string;
  answer: string[];
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

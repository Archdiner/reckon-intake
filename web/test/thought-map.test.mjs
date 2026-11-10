import { test } from "node:test";
import assert from "node:assert/strict";
import { mapThought, wordCount } from "../lib/thought-map.ts";

test("finds reasons, conditions, questions and specifics, keeping the text intact", () => {
  const input =
    "I'd ship on Friday because the bug is cosmetic. But only if support knows about it. Could we fix it by Tuesday? We have 4 people.";
  const m = mapThought(input);
  assert.equal(m.segments.map((s) => s.text).join(""), input);
  assert.equal(m.call, "I'd ship on Friday because the bug is cosmetic.");
  assert.deepEqual(m.reasons, ["because the bug is cosmetic"]);
  assert(m.conditions.some((c) => c.startsWith("But only if")));
  assert.deepEqual(m.questions, ["Could we fix it by Tuesday?"]);
  assert(m.specifics.includes("Friday"));
  assert(m.specifics.some((s) => s.startsWith("4")));
});

test("marks never overlap and plain text stays unmarked", () => {
  const m = mapThought("Just go outside.");
  assert.deepEqual(m.segments, [{ text: "Just go outside.", mark: null }]);
  assert.equal(m.reasons.length + m.conditions.length + m.questions.length + m.specifics.length, 0);
});

test("handles empty input and newlines", () => {
  assert.deepEqual(mapThought("").segments, []);
  assert.equal(mapThought("").call, null);
  const m = mapThought("Sleep in.\nThen walk, since it clears my head.");
  assert.equal(m.segments.map((s) => s.text).join(""), "Sleep in.\nThen walk, since it clears my head.");
  assert.deepEqual(m.reasons, ["since it clears my head"]);
  assert.equal(wordCount("  two words "), 2);
});

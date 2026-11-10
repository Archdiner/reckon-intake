// Guards the site's honesty rules. Run with `npm test` (Node 22.18+ runs the
// TypeScript sources directly via type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TRUST, INSTALL_COMMAND, REPO_URL, SIGN_IN_URL, NOT_LIST } from "../lib/content.ts";
import * as worker from "../../worker/landing-page.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strip = (s) => s.replace(/<[^>]+>/g, "").trim();

test("trust facts match the worker's SESSIONS_FACTS_HTML word for word", () => {
  const html = worker.SESSIONS_FACTS_HTML.replace("${REPO_URL}", REPO_URL);
  const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1]));
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => strip(m[1]));
  assert.deepEqual(paras, [TRUST.intro, TRUST.gap]);
  assert.deepEqual(items, [...TRUST.points, TRUST.code.before + TRUST.code.link + TRUST.code.after]);
});

test("install command, repo and sign-in links", () => {
  assert.equal(INSTALL_COMMAND, worker.INSTALL_COMMAND);
  assert.equal(REPO_URL, worker.REPO_URL);
  assert.equal(SIGN_IN_URL, "https://paxel-intake.aarizvi06.workers.dev/browser/app");
  assert.deepEqual(NOT_LIST, ["No scores", "No rankings", "No productivity surveillance", "No dashboard"]);
});

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|css|svg)$/.test(name)) files.push(p);
  }
};
for (const d of ["app", "components", "lib"]) walk(join(root, d));

test("copy rules: no dashes, banned words or attribution", () => {
  const banned = [
    "seamless", "empower", "delve", "leverage", "unlock", "supercharge", "ai-powered", "revolutioniz",
    "game-changer", "cutting-edge", "robust", "holistic", "journey", "fast-paced", "privacy-first",
    "safe with us", "guarantee", "generated with", "co-authored",
  ];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert(!/[–—]/.test(text), `dash in ${f}`);
    for (const w of banned) assert(!text.toLowerCase().includes(w), `"${w}" in ${f}`);
  }
});

test("no tracking, storage, network calls or dashboard widgets in the site", () => {
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const re of [/\bfetch\(/, /XMLHttpRequest/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /gtag|analytics|plausible|posthog|segment\.io/i, /<progress|<meter|<canvas/]) {
      assert(!re.test(text), `${re} in ${f}`);
    }
  }
});

test("the centerpiece module keeps its slot comment and sketch label", () => {
  const src = readFileSync(join(root, "components/ExperienceSketch.tsx"), "utf8");
  assert.match(src, /THE place where Reckon's real interaction will land/);
  assert.match(src, /Interactive sketch/);
  assert.match(src, /No AI is called, nothing you type leaves this page/);
});

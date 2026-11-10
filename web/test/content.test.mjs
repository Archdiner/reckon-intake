// Guards the site's honesty rules. Run with `npm test` (Node 22.18+ runs the
// TypeScript sources directly via type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TRUST, INSTALL_COMMAND, REPO_URL, SIGN_IN_URL, NOT_LIST } from "../lib/content.ts";
import * as worker from "../../worker/landing-page.js";
import { PREVIEW_COPY } from "../lib/preview-content.ts";

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

const previewSrc = () => readFileSync(join(root, "components/CallsPreview.tsx"), "utf8");

test("the centerpiece is a labeled, static preview of the signed-in calls section", () => {
  const src = previewSrc();
  assert.match(src, /centerpiece slot/);
  assert.equal(PREVIEW_COPY.label, "Preview with placeholder bars. No real people, quotes or decisions.");
  assert.match(src, /\{copy\.label\}/, "component must render the placeholder label");
  assert.match(PREVIEW_COPY.caption, /A static preview, not the product/);
  assert.equal(PREVIEW_COPY.sectionTitle, "Calls we noticed in your sessions");
  // Type labels and status wording are the signed-in page's real ones.
  const types = ["Budget or limit", "Merge or release gate", "Asked for proof", "Go-ahead", "Scope call"];
  for (const r of PREVIEW_COPY.rows) assert(types.includes(r.type), `unknown type label ${r.type}`);
  assert.equal(PREVIEW_COPY.status.notChecked, "Not checked");
  assert.match(PREVIEW_COPY.legend[2].text, /Marks stay on your device, in your browser/);
});

test("the preview pretends nothing: no interaction, no client code, no invented content", () => {
  const src = previewSrc();
  for (const re of [/"use client"/, /\bon[A-Z][a-zA-Z]*=/, /<button/, /<input/, /<textarea/, /<form/, /useState|useEffect/, /<blockquote/]) {
    assert(!re.test(src), `${re} in CallsPreview`);
  }
  const text = JSON.stringify(PREVIEW_COPY);
  assert(!/[\u201c\u201d]/.test(text), "no quoted decision text in the preview copy");
  assert(!/\b(Maya|Alex|Sam|Jordan|Priya)\b/.test(text), "no invented people");
  for (const w of ["score", "streak", "dashboard", "ranking", "automatically", "every upload", "we analy"]) {
    assert(!text.toLowerCase().includes(w), `"${w}" in preview copy`);
  }
});

test("preview content is isolated: the component holds no copy", () => {
  const src = previewSrc();
  const strings = [];
  const collect = (v) => (typeof v === "string" ? strings.push(v) : Object.values(v).forEach(collect));
  collect(PREVIEW_COPY);
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const t of strings.filter((t) => t.length > 3 && !["not_checked", "checked"].includes(t))) {
    // Whole-word match, so identifiers such as copy.status.notChecked do not count.
    assert(!new RegExp(`(?<![A-Za-z_.])${esc(t)}(?![A-Za-z_])`).test(src), `component hardcodes "${t}"`);
  }
});

test("effects of AI turn-taking on thinking are framed as questions, not facts", () => {
  const asserted = [
    /makes handing over your thinking/i,
    /turn-taking does it/i,
    /starts at the answer, so/i,
    /this part never happens/i,
    /is the half that gets skipped/i,
    /long enough to let go of the problem/i,
    /invites a yes, not a judgment/i,
    /tends to get shorter/i,
  ];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const re of asserted) assert(!re.test(text), `${re} in ${f}`);
  }
});

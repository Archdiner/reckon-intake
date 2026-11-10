"use client";

/*
 * ExperienceSketch: the site's centerpiece slot.
 *
 * This module is THE place where Reckon's real interaction will land once the
 * current research picks a direction. Today it holds a sketch of the feeling
 * Reckon is after, not a chosen mechanism: the visitor thinks first, and their
 * own reasoning is made visible and worth looking at before any answer
 * appears. Replace this module wholesale when the direction is chosen; the
 * page only depends on the props below.
 *
 * Runs entirely in the browser: a few fixed word rules (lib/thought-map.ts)
 * and pre-written answers (lib/sketch-content.ts). It calls no AI service,
 * makes no network requests, and stores or measures nothing.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Scenario } from "@/lib/sketch-content";
import { mapThought, wordCount, type Mark } from "@/lib/thought-map";
import styles from "./ExperienceSketch.module.css";

export type ExperienceSketchProps = {
  /** Questions the visitor can pick from. Answers are pre-written. */
  scenarios: Scenario[];
  /** Anchor id for the section. */
  id?: string;
};

type Phase = "write" | "map" | "answer";

const MARK_LABEL: Record<Mark, string> = {
  reason: "a reason",
  condition: "a condition",
  question: "an open question",
  specific: "a specific",
};

const GROUPS: Array<{ key: "reasons" | "conditions" | "questions" | "specifics"; title: string; mark: Mark }> = [
  { key: "reasons", title: "Your reasons", mark: "reason" },
  { key: "conditions", title: "Your conditions", mark: "condition" },
  { key: "questions", title: "Still open for you", mark: "question" },
  { key: "specifics", title: "Your specifics", mark: "specific" },
];

export default function ExperienceSketch({ scenarios, id = "sketch" }: ExperienceSketchProps) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("write");
  const [run, setRun] = useState(0);
  const mapRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scenario = scenarios[index];
  const words = wordCount(draft);
  const map = useMemo(() => mapThought(draft), [draft]);
  const present = new Set(map.segments.filter((s) => s.mark).map((s) => s.mark as Mark));
  const ready = words >= 3;

  useEffect(() => {
    if (phase === "map") mapRef.current?.focus({ preventScroll: false });
    if (phase === "answer") answerRef.current?.focus({ preventScroll: false });
  }, [phase, run]);

  const choose = (i: number) => {
    setIndex(i);
    setDraft("");
    setPhase("write");
  };

  const show = () => {
    if (!ready) return;
    setRun((n) => n + 1);
    setPhase("map");
  };

  const edit = () => {
    setPhase("write");
    window.setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  // Typeset the visitor's words with a gentle staggered entrance.
  let wordIndex = 0;
  let markIndex = 0;
  const quote = map.segments.map((seg, i) => {
    const parts = seg.text.split(/(\s+)/).map((part, j) => {
      if (!part || /^\s+$/.test(part)) return part;
      const style = { "--d": `${Math.min(wordIndex++ * 22, 1500)}ms` } as CSSProperties;
      return (
        <span key={j} className={styles.word} style={style}>
          {part}
        </span>
      );
    });
    if (!seg.mark) return <span key={`${run}-${i}`}>{parts}</span>;
    const style = { "--m": `${900 + Math.min(markIndex++ * 160, 1200)}ms` } as CSSProperties;
    return (
      <span key={`${run}-${i}`} className={styles.mark} data-mark={seg.mark} style={style}>
        {parts}
      </span>
    );
  });
  const size = draft.length > 520 ? "s" : draft.length > 220 ? "m" : "l";
  const groups = GROUPS.filter((g) => map[g.key].length);

  return (
    <section id={id} className={styles.root} aria-labelledby={`${id}-title`}>
      <div className={styles.frame}>
        <header className={styles.top}>
          <div>
            <p className={styles.eyebrow}>Interactive sketch</p>
            <h2 id={`${id}-title`} className={styles.title}>
              Before any answer: <em>what do you think?</em>
            </h2>
          </div>
          <div className={styles.picker} role="group" aria-label="Choose a question">
            {scenarios.map((s, i) => (
              <button key={s.id} type="button" className={styles.chip} aria-pressed={i === index} onClick={() => choose(i)}>
                {s.label}
              </button>
            ))}
          </div>
        </header>

        <p className={styles.question}>{scenario.question}</p>

        {phase === "write" && (
          <div className={styles.work}>
            <label htmlFor={`${id}-draft`} className={styles.srOnly}>
              Your own take
            </label>
            <textarea
              id={`${id}-draft`}
              ref={inputRef}
              className={styles.textarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  show();
                }
              }}
              placeholder={scenario.placeholder}
              rows={4}
              spellCheck
            />
            <div className={styles.bar}>
              <p className={styles.legend} aria-hidden="true">
                {(Object.keys(MARK_LABEL) as Mark[]).map((m) => (
                  <span key={m} className={styles.legendItem} data-mark={m} data-on={present.has(m) || undefined}>
                    <i />
                    {MARK_LABEL[m]}
                  </span>
                ))}
              </p>
              <button type="button" className={styles.primary} onClick={show} disabled={!ready}>
                See my thinking
                <kbd className={styles.kbd} aria-hidden="true">
                  Ctrl ↵
                </kbd>
              </button>
            </div>
            <p className={styles.hint}>
              {ready ? "Words like because, unless and if will light up." : "A few words is enough to start."}
            </p>
          </div>
        )}

        {phase !== "write" && (
          <div className={styles.result} key={run}>
            <div className={styles.page}>
              <h3 className={styles.pageLabel} ref={mapRef} tabIndex={-1}>
                Your thinking
              </h3>
              <blockquote className={styles.quote} data-size={size}>
                {quote}
              </blockquote>
              {map.call && (
                <p className={styles.call}>
                  <span>Your call</span>
                  {map.call}
                </p>
              )}
            </div>

            <aside className={styles.margin} aria-label="What is in your take">
              {groups.length ? (
                groups.map((g, gi) => (
                  <div key={g.key} className={styles.group} style={{ "--g": `${1100 + gi * 180}ms` } as CSSProperties}>
                    <p className={styles.groupTitle} data-mark={g.mark}>
                      {g.title}
                    </p>
                    <ul>
                      {map[g.key].map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className={styles.group} style={{ "--g": "1000ms" } as CSSProperties}>
                  <p className={styles.groupTitle}>A clear starting point</p>
                  <p className={styles.groupNote}>Add a because or an unless and watch the reasoning light up.</p>
                </div>
              )}
            </aside>

            <div className={styles.contrast}>
              <div className={styles.loopRow} data-kind="usual">
                <span className={styles.loopName}>The usual loop</span>
                <ol>
                  <li>Ask</li>
                  <li>Wait</li>
                  <li>Read an answer</li>
                </ol>
              </div>
              <div className={styles.loopRow} data-kind="now">
                <span className={styles.loopName}>Just now</span>
                <ol>
                  <li>Think</li>
                  <li>See your thinking</li>
                  <li>Then read, if you like</li>
                </ol>
              </div>
              <p className={styles.contrastText}>
                The usual loop starts at the answer, so this part never happens. Here, the first thing on the screen was
                yours.
              </p>
              <div className={styles.actions}>
                {phase === "map" && (
                  <button type="button" className={styles.primary} onClick={() => setPhase("answer")}>
                    Now read an answer
                  </button>
                )}
                <button type="button" className={styles.secondary} onClick={edit}>
                  Keep writing
                </button>
                <button type="button" className={styles.link} onClick={() => choose((index + 1) % scenarios.length)}>
                  Try another question
                </button>
              </div>
            </div>

            {phase === "answer" && (
              <div className={styles.answer} ref={answerRef} tabIndex={-1} aria-label="Pre-written answer">
                <div className={styles.answerHead}>
                  <span className={styles.badge}>An answer</span>
                  <span className={styles.answerNote}>pre-written, no AI called</span>
                </div>
                {scenario.answer.map((p, i) => (
                  <p key={i} className={styles.answerPara} style={{ "--d": `${i * 140}ms` } as CSSProperties}>
                    {p}
                  </p>
                ))}
                <p className={styles.closer}>
                  Read it with your own take in hand: what would you keep, and what would you push back on? That feeling,
                  thinking first and seeing it, is what Reckon is after. How to bring it into real work with AI is the
                  open question.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className={styles.disclaimer}>
        A sketch of a feeling, not a product feature. It runs in your browser with a few fixed word rules and
        pre-written answers. No AI is called, nothing you type leaves this page, and nothing is stored or measured.
      </p>
    </section>
  );
}

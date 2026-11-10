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
 * Content is isolated from behavior: every visible string and every scenario
 * comes in through props from lib/sketch-content.ts (SCENARIOS, SKETCH_COPY).
 * Swapping the material is an edit to that file only.
 *
 * Runs entirely in the browser: a few fixed word rules (lib/thought-map.ts)
 * and pre-written content. It calls no AI service, makes no network requests,
 * and stores or measures nothing.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Scenario, SketchCopy } from "@/lib/sketch-content";
import { mapThought, wordCount, type Mark } from "@/lib/thought-map";
import styles from "./ExperienceSketch.module.css";

export type ExperienceSketchProps = {
  /** Questions the visitor can pick from. Answers, if any, are pre-written. */
  scenarios: Scenario[];
  /** Every visible string in the module. */
  copy: SketchCopy;
  /** Anchor id for the section. */
  id?: string;
};

type Phase = "write" | "map" | "answer";

const MARKS: Mark[] = ["reason", "condition", "question", "specific"];

const GROUPS: Array<{ key: "reasons" | "conditions" | "questions" | "specifics"; mark: Mark }> = [
  { key: "reasons", mark: "reason" },
  { key: "conditions", mark: "condition" },
  { key: "questions", mark: "question" },
  { key: "specifics", mark: "specific" },
];

export default function ExperienceSketch({ scenarios, copy, id = "sketch" }: ExperienceSketchProps) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("write");
  const [run, setRun] = useState(0);
  const mapRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scenario = scenarios[index];
  const answer = scenario.answer ?? [];
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
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h2 id={`${id}-title`} className={styles.title}>
              {copy.title} <em>{copy.titleEmphasis}</em>
            </h2>
          </div>
          <div className={styles.picker} role="group" aria-label={copy.pickerLabel}>
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
              {copy.inputLabel}
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
                {MARKS.map((m) => (
                  <span key={m} className={styles.legendItem} data-mark={m} data-on={present.has(m) || undefined}>
                    <i />
                    {copy.markLabels[m]}
                  </span>
                ))}
              </p>
              <button type="button" className={styles.primary} onClick={show} disabled={!ready}>
                {copy.showButton}
                <kbd className={styles.kbd} aria-hidden="true">
                  ⌘/Ctrl ↵
                </kbd>
              </button>
            </div>
            <p className={styles.hint}>
              {ready ? copy.hintReady : copy.hintStart}
            </p>
          </div>
        )}

        {phase !== "write" && (
          <div className={styles.result} key={run}>
            <div className={styles.page}>
              <h3 className={styles.pageLabel} ref={mapRef} tabIndex={-1}>
                {copy.pageLabel}
              </h3>
              <blockquote className={styles.quote} data-size={size}>
                {quote}
              </blockquote>
              {map.call && (
                <p className={styles.call}>
                  <span>{copy.callLabel}</span>
                  {map.call}
                </p>
              )}
            </div>

            <aside className={styles.margin} aria-label={copy.marginLabel}>
              {groups.length ? (
                groups.map((g, gi) => (
                  <div key={g.key} className={styles.group} style={{ "--g": `${1100 + gi * 180}ms` } as CSSProperties}>
                    <p className={styles.groupTitle} data-mark={g.mark}>
                      {copy.groupTitles[g.key]}
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
                  <p className={styles.groupTitle}>{copy.emptyTitle}</p>
                  <p className={styles.groupNote}>{copy.emptyNote}</p>
                </div>
              )}
            </aside>

            <div className={styles.contrast}>
              <div className={styles.loopRow} data-kind="usual">
                <span className={styles.loopName}>{copy.usualName}</span>
                <ol>
                  {copy.usualSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <div className={styles.loopRow} data-kind="now">
                <span className={styles.loopName}>{copy.nowName}</span>
                <ol>
                  {copy.nowSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <p className={styles.contrastText}>{copy.contrast}</p>
              <div className={styles.actions}>
                {phase === "map" && answer.length > 0 && (
                  <button type="button" className={styles.primary} onClick={() => setPhase("answer")}>
                    {copy.readAnswer}
                  </button>
                )}
                <button type="button" className={styles.secondary} onClick={edit}>
                  {copy.keepWriting}
                </button>
                <button type="button" className={styles.link} onClick={() => choose((index + 1) % scenarios.length)}>
                  {copy.another}
                </button>
              </div>
            </div>

            {phase === "answer" && answer.length > 0 && (
              <div className={styles.answer} ref={answerRef} tabIndex={-1} aria-label={copy.answerBadge}>
                <div className={styles.answerHead}>
                  <span className={styles.badge}>{copy.answerBadge}</span>
                  <span className={styles.answerNote}>{copy.answerNote}</span>
                </div>
                {answer.map((p, i) => (
                  <p key={i} className={styles.answerPara} style={{ "--d": `${i * 140}ms` } as CSSProperties}>
                    {p}
                  </p>
                ))}
                <p className={styles.closer}>{copy.closer}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className={styles.disclaimer}>{copy.disclaimer}</p>
    </section>
  );
}

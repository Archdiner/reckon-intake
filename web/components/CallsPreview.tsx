/*
 * CallsPreview: the site's centerpiece slot.
 *
 * A static, abstract preview of the signed-in page's "Calls we noticed"
 * section. Placeholder bars stand in for a participant's own words; there are
 * no invented people, quotes or decisions, and nothing here is interactive or
 * pretends to be the product. It renders on the server with no client
 * JavaScript.
 *
 * Content is isolated from layout: every visible string comes in through the
 * `copy` prop from lib/preview-content.ts. Changing the copy is an edit to
 * that file only.
 */

import type { CSSProperties } from "react";
import type { PreviewCopy } from "@/lib/preview-content";
import styles from "./CallsPreview.module.css";

export type CallsPreviewProps = {
  /** Every visible string in the module. */
  copy: PreviewCopy;
  /** Where the sign-in link points. */
  signInHref: string;
  /** Anchor id for the section. */
  id?: string;
};

// Fixed placeholder widths, so every visit renders the same abstract rows.
const QUOTE_WIDTHS = [
  [92, 64],
  [86, 78, 40],
  [74, 52],
];
const META_WIDTHS = [26, 18, 22];

const bar = (width: number, extra?: string) => (
  <span className={`${styles.bar} ${extra ?? ""}`} style={{ "--w": `${width}%` } as CSSProperties} />
);

export default function CallsPreview({ copy, signInHref, id = "preview" }: CallsPreviewProps) {
  return (
    <section id={id} className={styles.root} aria-labelledby={`${id}-title`}>
      <div className={styles.frame}>
        <div className={styles.grid}>
          <div className={styles.text}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h2 id={`${id}-title`} className={styles.title}>
              {copy.title} <em>{copy.titleEmphasis}</em>
            </h2>
            <p className={styles.question}>{copy.question}</p>
            <p className={styles.intro}>{copy.intro}</p>
            <p className={styles.candidates}>{copy.candidates}</p>
            <ol className={styles.legend}>
              {copy.legend.map((item, i) => (
                <li key={item.title}>
                  <span className={styles.legendNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a className={styles.signIn} href={signInHref}>
              {copy.signIn}
            </a>
          </div>

          <figure className={styles.figure}>
            <p className={styles.label}>
              <span className={styles.labelDot} aria-hidden="true" />
              {copy.label}
            </p>
            <div className={styles.page} aria-hidden="true">
              <div className={styles.pageHead}>
                <span className={styles.pageDots}>
                  <i />
                  <i />
                  <i />
                </span>
                {bar(34, styles.barFaint)}
              </div>
              <p className={styles.pageTitle}>{copy.sectionTitle}</p>
              {bar(88, styles.barFaint)}
              {bar(62, styles.barFaint)}
              <ol className={styles.rows}>
                {copy.rows.map((row, i) => (
                  <li
                    key={row.type}
                    className={styles.row}
                    data-reviewed={row.reviewed || undefined}
                    style={{ "--i": i } as CSSProperties}
                  >
                    <p className={styles.meta}>
                      <span className={styles.type}>{row.type}</span>
                      {bar(META_WIDTHS[i % META_WIDTHS.length], styles.barMeta)}
                    </p>
                    <div className={styles.quote}>{QUOTE_WIDTHS[i % QUOTE_WIDTHS.length].map((w, j) => <span key={j}>{bar(w)}</span>)}</div>
                    <div className={styles.status}>
                      {row.status === "checked" ? (
                        <>
                          <span className={styles.checked}>{copy.status.checked}</span>
                          {bar(46, styles.barInline)}
                          <span className={styles.source}>{copy.status.source}</span>
                        </>
                      ) : (
                        <>
                          <span>{copy.status.notChecked}</span>
                          <span className={styles.where}>{copy.status.whereToCheck}</span>
                          {bar(30, styles.barInline)}
                        </>
                      )}
                    </div>
                    <span className={styles.mark} data-on={row.reviewed || undefined}>
                      {row.reviewed ? copy.status.reviewed : copy.status.markReviewed}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <figcaption className={styles.caption}>{copy.caption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

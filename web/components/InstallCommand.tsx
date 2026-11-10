"use client";

import { useId, useState } from "react";

type Props = { command: string; label?: string };

export default function InstallCommand({ command, label = "Install command" }: Props) {
  const [copied, setCopied] = useState(false);
  const textId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById(textId);
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };

  return (
    <div className="cmd" role="group" aria-label={label}>
      <span className="cmd-prompt" aria-hidden="true">
        $
      </span>
      <code id={textId} className="cmd-text">
        {command}
      </code>
      <button type="button" className="cmd-copy" onClick={copy} aria-label={copied ? "Copied" : "Copy install command"}>
        {copied ? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
        <span className="cmd-copy-label">{copied ? "Copied" : "Copy"}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Install command copied to clipboard" : ""}
      </span>
    </div>
  );
}

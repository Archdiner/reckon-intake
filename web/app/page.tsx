import ExperienceSketch from "@/components/ExperienceSketch";
import InstallCommand from "@/components/InstallCommand";
import Mark from "@/components/Mark";
import RevealObserver from "@/components/RevealObserver";
import { INSTALL_COMMAND, NOT_LIST, REPO_URL, SIGN_IN_URL, SUPPORTED_SOURCES, TRUST } from "@/lib/content";
import { SCENARIOS } from "@/lib/sketch-content";

const LOOP = [
  {
    word: "Ask",
    text: "You hand over the question while it is still half-formed. The half you had not worked out yet is the half that gets skipped.",
  },
  {
    word: "Wait",
    text: "A few seconds is long enough to let go of the problem. When the answer lands, you read it cold.",
  },
  {
    word: "Answer",
    text: "A finished-looking reply invites a yes, not a judgment. Next turn, your own message tends to get shorter.",
  },
];

const QUESTIONS = [
  "What would make thinking with AI feel rewarding, not like extra work?",
  "When does taking turns help you think, and when does it quietly take over?",
  "What would you want to see about your own habits, if you could?",
];

const STEPS = [
  {
    title: "Run the collector",
    text: "One command runs the open-source collector on your machine. It finds your newest local AI sessions.",
  },
  {
    title: "A masked copy is uploaded",
    text: "Detected key-like values are replaced with stars in a copy, and that copy is uploaded once.",
  },
  {
    title: "A person writes findings",
    text: "Someone reads your sessions and writes findings by hand: observations and hypotheses, not verdicts.",
  },
  {
    title: "You read them privately",
    text: "Findings appear on your private page when they are ready. You decide what, if anything, to change.",
  },
];

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href="#top" aria-label="Reckon, back to top">
            <Mark />
            <span>Reckon</span>
          </a>
          <nav aria-label="Sections" className="nav-links">
            <a href="#sketch">Sketch</a>
            <a href="#loop">The loop</a>
            <a href="#today">Today</a>
            <a href="#sessions">Your sessions</a>
          </nav>
          <div className="nav-end">
            <a className="nav-quiet" href={REPO_URL}>
              GitHub
            </a>
            <a className="btn btn-small" href={SIGN_IN_URL}>
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-glow" aria-hidden="true" />
          <div className="container">
            <p className="pill">
              <span className="pill-dot" aria-hidden="true" />
              Research pilot
            </p>
            <h1 className="hero-title">
              Keep the thinking <em>yours.</em>
            </h1>
            <p className="hero-sub">
              Most work with AI runs on one loop: you ask, you wait, it answers. That shape makes handing over your
              thinking the easy default. Reckon is a research pilot about rethinking the interaction itself, so that
              thinking with AI feels rewarding and stays visibly your own.
            </p>
            <div className="hero-actions">
              <a className="btn" href="#sketch">
                Try the sketch
              </a>
              <a className="btn btn-ghost" href="#today">
                What exists today
              </a>
            </div>
          </div>
        </section>

        <div className="container sketch-wrap">
          <ExperienceSketch scenarios={SCENARIOS} id="sketch" />
        </div>

        <section className="section" id="loop" aria-labelledby="loop-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <p className="eyebrow">The problem</p>
              <h2 id="loop-title" className="display">
                Ask. Wait. Answer. <em>Repeat.</em>
              </h2>
              <p className="lede">
                Nobody decides to stop thinking. The turn-taking does it quietly: every exchange starts at the answer,
                and your own reasoning rarely gets a turn of its own.
              </p>
            </div>
            <ol className="loop" data-reveal>
              {LOOP.map((step, i) => (
                <li key={step.word} className="loop-step" style={{ ["--i" as string]: i }}>
                  <span className="loop-index">0{i + 1}</span>
                  <h3 className="loop-word">{step.word}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
            <p className="footnote" data-reveal>
              These are working hypotheses the pilot is looking into, not settled findings.
            </p>
          </div>
        </section>

        <section className="section section-open" aria-labelledby="open-title">
          <div className="container narrow">
            <div data-reveal>
              <p className="eyebrow">The open question</p>
              <h2 id="open-title" className="display">
                So what replaces the loop? <em>We do not know yet.</em>
              </h2>
              <p className="lede">
                Reckon exists to rethink the interaction itself, not to add a feature to the chat box. We have not
                picked an answer, and nothing on this page is a design we have chosen. The pilot below is how we are
                learning.
              </p>
            </div>
            <ul className="questions" data-reveal>
              {QUESTIONS.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section" id="today" aria-labelledby="today-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <p className="eyebrow">What exists today</p>
              <h2 id="today-title" className="display">
                A small pilot. <em>Software, then a person.</em>
              </h2>
              <p className="lede">
                The only live parts today are an open-source collector and findings written by hand. Nothing watches
                you, and nothing on this page runs on your sessions.
              </p>
            </div>
            <ol className="steps" data-reveal>
              {STEPS.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="today-grid" data-reveal>
              <div>
                <h3 className="small-title">Get the collector</h3>
                <p className="muted">Run this in a terminal on macOS or Linux. The script is public, so you can read it first.</p>
                <InstallCommand command={INSTALL_COMMAND} />
                <p className="muted after-cmd">
                  Already ran it? <a href={SIGN_IN_URL}>Sign in</a> with the same email to see your uploads and findings.
                </p>
              </div>
              <div>
                <h3 className="small-title">What it reads today</h3>
                <p className="muted">
                  The collector supports local coding assistants. Support for more session sources, such as general
                  chatbots, is planned.
                </p>
                <ul className="sources">
                  {SUPPORTED_SOURCES.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="sessions" aria-labelledby="sessions-title">
          <div className="container trust">
            <div className="trust-head" data-reveal>
              <p className="eyebrow">Plainly</p>
              <h2 id="sessions-title" className="display">
                What happens to your sessions
              </h2>
              <p className="trust-intro">{TRUST.intro}</p>
            </div>
            <div className="trust-body" data-reveal>
              <ul className="trust-list">
                {TRUST.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
                <li>
                  {TRUST.code.before}
                  <a href={REPO_URL}>{TRUST.code.link}</a>
                  {TRUST.code.after}
                </li>
              </ul>
              <p className="trust-gap">{TRUST.gap}</p>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="not-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <p className="eyebrow">What it is not</p>
              <h2 id="not-title" className="display">
                Nothing to score. <em>Nothing to watch.</em>
              </h2>
            </div>
            <ul className="not-list" data-reveal>
              {NOT_LIST.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section final" aria-labelledby="final-title">
          <div className="container narrow center" data-reveal>
            <h2 id="final-title" className="display">
              Start with <em>one upload.</em>
            </h2>
            <p className="lede">Run the collector, then read what a person noticed about how you work with AI.</p>
            <InstallCommand command={INSTALL_COMMAND} label="Install command (again)" />
            <div className="hero-actions center">
              <a className="btn" href={SIGN_IN_URL}>
                Sign in
              </a>
              <a className="btn btn-ghost" href={REPO_URL}>
                Read the code
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="brand brand-small">
            <Mark size={18} />
            <span>Reckon</span>
            <span className="footer-note">A research pilot</span>
          </span>
          <nav aria-label="Footer" className="footer-links">
            <a href={REPO_URL}>GitHub</a>
            <a href={SIGN_IN_URL}>Sign in</a>
          </nav>
        </div>
      </footer>
      <RevealObserver />
    </>
  );
}

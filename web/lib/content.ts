// Copy and links shared across the site. Facts here must stay accurate to the
// pilot as it exists today; see web/README.md for the rules.

export const INSTALL_COMMAND =
  "curl -fsSL https://reckon-intake.aarizvi06.workers.dev/install.sh | bash";
export const SIGN_IN_URL = "https://paxel-intake.aarizvi06.workers.dev/browser/app";
export const REPO_URL = "https://github.com/Archdiner/reckon-intake";

export const SUPPORTED_SOURCES = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Gemini",
  "Antigravity",
  "OpenCode",
  "VS Code Copilot",
  "Pi",
];

// "What happens to your sessions". Carried over word for word from
// worker/landing-page.js (SESSIONS_FACTS_HTML); test/content.test.mjs fails if
// the two drift apart. Do not soften or extend these.
export const TRUST = {
  intro:
    "The collector runs on your machine and does not modify your original files. It uploads a copy of the transcript content with detected key-like values replaced by stars. Masking can miss secrets, and names, emails, personal information and code remain readable in the uploaded copy.",
  points: [
    "Masking is deterministic local pattern matching, with no network calls.",
    "Your masked copy goes to private storage operated by the person running the pilot. A real person reads it to write your findings. It is not sold, shared, or made public.",
    "The pilot allows one upload per account, with small caps on accounts and upload size.",
  ],
  // Rendered with "public" linked to REPO_URL.
  code: {
    before: "The collector code is ",
    link: "public",
    after: ", so you can read exactly what runs and what leaves your machine.",
  },
  gap: "Self-serve deletion and automatic retention limits are not built into this pilot yet. It is run by one operator, the person who gave you the install command.",
};

export const NOT_LIST = ["No scores", "No rankings", "No productivity surveillance", "No dashboard"];

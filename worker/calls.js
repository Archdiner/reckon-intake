// Deployment-private entries for the signed-in page are intentionally not
// published. Injected at deploy time; never committed to the public repo.
//
// Keyed by participant. Each entry is a standing instruction the participant
// gave their agents, picked from their upload by an operator-side rule pass and
// a manual read (see docs/calls-selection.md). Shape:
// { id: string,                    required, unique per participant
//   quote: string,                 required, the participant's own words, whole
//   project: string,               optional
//   date: 'YYYY-MM-DD'|null,       optional
//   // Optional, from the earlier decisions-to-verify schema; rendered only when present:
//   type: string,                  not shown on the page
//   status: 'not_checked'|'checked',
//   outcome: null|{ text: string, source_url: string },   shown only when status is 'checked'
//   check_target: { kind: string, locator: string|null, basis: string } }
//
// 'checked' means the current implementation was observed against verified
// evidence on a stated date; it is never proof about the original change.
// This empty export keeps the public code and tests self-contained; with no
// entries, /browser/app shows a one-line empty state.
export const callsByParticipant={};

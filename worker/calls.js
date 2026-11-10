// Deployment-private "Calls we noticed" entries are intentionally not published.
// Injected at deploy time; never committed to the public repo.
//
// Keyed by participant. Each entry (schema_version 1):
// { id: string,
//   type: 'budget_cap'|'merge_or_release_gate'|'verification_demand'|'go_ahead'|'launch_or_scope_call',
//   project: string,
//   date: 'YYYY-MM-DD'|null,
//   quote: string,
//   status: 'not_checked'|'checked',
//   outcome: null|{ text: string, source_url: string },
//   check_target: { kind: 'none'|'github_pr', locator: string|null, basis: string } }
//
// Entries are candidates from a one-off, curated rule pass run operator-side,
// offline, over a participant's upload. 'checked' means the current
// implementation was observed against verified evidence on a stated date; it
// is never proof about the original change. Anything other than 'checked' is
// shown as "Not checked".
// This empty export keeps the public code and tests self-contained; with no
// entries, /browser/app renders no calls section at all.
export const callsByParticipant={};

// Deployment-private findings are intentionally not published.
// The live service injects its real findings at deploy time, keyed by
// participant, with entries of the form {title, url, date}. This empty export
// keeps the public code and tests self-contained; /browser/app shows an honest
// empty state when a participant has no entries.
export const findingsByParticipant={};

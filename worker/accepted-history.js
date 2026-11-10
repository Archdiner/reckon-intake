// Deployment-private accepted-upload history is intentionally not published.
// The live service keeps its real accepted-archive record outside this
// repository and injects it at deploy time. This empty export keeps the public
// code and tests self-contained; allowance logic in identity-registry.js
// treats it as "no prior static history".
export const acceptedHistory=[];

import type { NextConfig } from "next";

// Fully static: `next build` writes plain HTML, CSS and JS to out/. Vercel
// serves it as a static site; no server functions run.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

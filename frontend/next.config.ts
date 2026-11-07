import type { NextConfig } from "next";

// Deployment note: this app is built for Cloudflare Pages with the
// @cloudflare/next-on-pages adapter (see README → Frontend Deployment).
// `frontend/.npmrc` sets legacy-peer-deps=true to avoid an ERESOLVE conflict
// between next-on-pages' peer (workers-types ^4) and the latest wrangler
// (workers-types ^5) that `npx` pulls in during the Pages build.
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;



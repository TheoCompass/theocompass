import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is fully client-rendered: every page is a client component that
  // talks to the Cloudflare Worker API at runtime via NEXT_PUBLIC_API_URL.
  // There is no server rendering, no API route, and no middleware, so it can
  // be shipped as plain static files from Cloudflare Pages.
  //
  // `output: "export"` makes `next build` emit a static site into `out/`.
  // This replaces the deprecated @cloudflare/next-on-pages adapter.
  output: "export",

  images: {
    // next/image's on-demand optimizer needs a server, which a static export
    // does not have. Images are served as-is from /public.
    unoptimized: true,
  },
};

export default nextConfig;


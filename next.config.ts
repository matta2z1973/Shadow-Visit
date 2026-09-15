import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a worker file (pdf.worker.mjs) that it loads via dynamic
  // import at runtime. Bundling drops the worker, so we mark the package as
  // external — Node resolves it from node_modules and the worker is found.
  serverExternalPackages: ["pdfjs-dist"],
  // The host calendar-link guide is a self-contained static page in
  // `public/` rather than a route in the app, so it has no dependency on the
  // root layout, the Supabase session, or the database — it must stay
  // readable by a student who isn't signed in (and who may not even have an
  // account yet). This rewrite is only so the link we hand out is a clean
  // `/help/calendar-link` instead of exposing the `.html` extension.
  async rewrites() {
    return [{ source: "/help/calendar-link", destination: "/help/calendar-link.html" }];
  },
  experimental: {
    serverActions: {
      // Default 1MB is far too small for the course-catalog PDF upload on
      // /admin/settings (see uploadCourseCatalogAction, which separately
      // enforces its own ~24MB cap once the body actually arrives).
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;

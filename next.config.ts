import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a worker file (pdf.worker.mjs) that it loads via dynamic
  // import at runtime. Bundling drops the worker, so we mark the package as
  // external — Node resolves it from node_modules and the worker is found.
  serverExternalPackages: ["pdfjs-dist"],
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

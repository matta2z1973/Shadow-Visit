import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a worker file (pdf.worker.mjs) that it loads via dynamic
  // import at runtime. Bundling drops the worker, so we mark the package as
  // external — Node resolves it from node_modules and the worker is found.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

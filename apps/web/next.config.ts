import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Share images read the .woff files at request time; make sure they ship with those functions.
  outputFileTracingIncludes: { "/**/*": ["./assets/fonts/*.woff"] },
};

export default nextConfig;

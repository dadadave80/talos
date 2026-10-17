import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Share images read the .woff files at request time; make sure they ship with those functions.
  outputFileTracingIncludes: { "/**/*": ["./assets/fonts/*.woff"] },
  // The arena used to be the home page; old tour links (/?judge=1) still land on it.
  redirects: async () => [{ source: "/", has: [{ type: "query", key: "judge" }], destination: "/arena", permanent: false }],
};

export default nextConfig;

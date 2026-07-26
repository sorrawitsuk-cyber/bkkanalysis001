import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async redirects() {
    return [
      { source: "/heat-island", destination: "/observatory?lens=heat", permanent: false },
      { source: "/green-space", destination: "/observatory?lens=vegetation", permanent: false },
      { source: "/ndvi", destination: "/observatory?lens=vegetation", permanent: false },
      { source: "/urban-expansion", destination: "/observatory?lens=urban", permanent: false },
      { source: "/land-cover-change", destination: "/observatory?lens=urban", permanent: false },
      { source: "/rainfall", destination: "/observatory?lens=water", permanent: false },
      { source: "/flood-risk", destination: "/observatory?lens=water", permanent: false },
      { source: "/population", destination: "/observatory?lens=people", permanent: false },
      { source: "/accessibility", destination: "/observatory?lens=people", permanent: false },
      { source: "/nighttime-lights", destination: "/observatory?lens=activity", permanent: false },
      { source: "/air-quality", destination: "/observatory?lens=air", permanent: false },
      { source: "/decision-support", destination: "/observatory", permanent: false },
      { source: "/district-analysis", destination: "/areas", permanent: false },
      { source: "/districts/:path*", destination: "/areas", permanent: false },
      { source: "/traffy", destination: "/", permanent: false },
      { source: "/traffy-ingest", destination: "/", permanent: false },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "standalone",
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias.googleapis = fileURLToPath(new URL(
        "./src/lib/googleapis-shim.ts",
        import.meta.url,
      ));
    }
    return config;
  },
};

export default nextConfig;

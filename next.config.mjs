import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
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

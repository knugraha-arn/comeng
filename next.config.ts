import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@supabase/ssr"],
  },
};

export default nextConfig;

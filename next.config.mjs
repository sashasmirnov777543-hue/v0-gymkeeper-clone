/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      "3.0.0",
  },
  outputFileTracingIncludes: {
    "/api/import/json": ["./migrations/016_seed_h2_v9_v4.sql"],
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

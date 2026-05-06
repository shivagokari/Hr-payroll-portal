/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignore TypeScript errors during Vercel build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ignore ESLint errors during Vercel build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

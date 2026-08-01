import type { NextConfig } from 'next';
const nextConfig: NextConfig = { output: 'standalone', transpilePackages: ['@havona/ui'], poweredByHeader: false };
export default nextConfig;

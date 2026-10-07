import type { NextConfig } from 'next';

// Local and e2e only: baked into the build's rewrites. In AWS, routing of app.sanchay.in/api/v1/*
// is owned by the CDK stack (ADR-0014).
const apiOrigin = process.env.SANCHAY_API_ORIGIN;

const nextConfig: NextConfig = {
  reactCompiler: true,
  // cacheComponents stays OFF: PPR static shells cannot carry the per-request CSP nonce
  // (ADR-0001 row, C11). App routes render per request via `await connection()`.
  cacheComponents: false,
  typedRoutes: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@sanchay/ui', '@sanchay/features', '@sanchay/app-core'],
  turbopack: {
    resolveAlias: { 'react-native': 'react-native-web' },
    resolveExtensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.mjs',
      '.json',
    ],
  },
  async rewrites() {
    return apiOrigin
      ? [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }]
      : [];
  },
};

export default nextConfig;

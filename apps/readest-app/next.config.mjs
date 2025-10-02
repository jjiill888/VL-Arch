import withPWAInit from '@ducanh2912/next-pwa';
import withBundleAnalyzer from '@next/bundle-analyzer';

const isDev = process.env['NODE_ENV'] === 'development';
const appPlatform = process.env['NEXT_PUBLIC_APP_PLATFORM'];

if (isDev) {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev();
}

const exportOutput = appPlatform !== 'web' && !isDev;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Next.js uses SSG instead of SSR
  // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
  output: exportOutput ? 'export' : undefined,
  pageExtensions: exportOutput ? ['jsx', 'tsx'] : ['js', 'jsx', 'ts', 'tsx'],
  // Note: This feature is required to use the Next.js Image component in SSG mode.
  // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  // Configure assetPrefix or else the server won't properly resolve your assets.
  assetPrefix: '',
  reactStrictMode: true,
  serverExternalPackages: ['isows'],

  // Cross-platform build optimizations - PERFORMANCE FOCUSED
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
    // React compiler optimizations for better runtime performance
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },

  // Optimize bundle size and runtime performance
  experimental: {
    optimizePackageImports: [
      'react-icons',
      'lodash',
      'date-fns',
    ],
  },

  // Production optimizations
  productionBrowserSourceMaps: false,  // Disable source maps for faster load
  poweredByHeader: false,              // Remove X-Powered-By header

  transpilePackages: !isDev
    ? [
        'i18next-browser-languagedetector',
        'react-i18next',
        'i18next',
        '@ducanh2912/next-pwa',
        '@tauri-apps',
        'highlight.js',
        'foliate-js',
        'marked',
      ]
    : [],
  async headers() {
    // Headers are not supported in export mode
    if (exportOutput) return [];

    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ];
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: isDev || appPlatform !== 'web',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withPWA(withAnalyzer(nextConfig));

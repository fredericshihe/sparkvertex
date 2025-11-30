const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  // Disable aggressive caching to prevent "Failed to fetch RSC payload" errors in App Router
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => {
          return url.searchParams.has('_rsc');
        },
        handler: 'NetworkOnly',
        options: {
          cacheName: 'next-rsc',
        },
      },
      {
        urlPattern: /^https:\/\/waesizzoqodntrlvrwhw\.supabase\.co\/auth\/v1\/.*$/,
        handler: 'NetworkOnly',
        options: {
          cacheName: 'supabase-auth',
        },
      },
      {
        urlPattern: /^https:\/\/waesizzoqodntrlvrwhw\.supabase\.co\/storage\/v1\/object\/public\/.*$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'supabase-storage',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/cdn\.staticfile\.org\/.*$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'staticfile-cdn',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'jsdelivr-cdn',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'tailwind-cdn',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false, // Disable source maps in production
  poweredByHeader: false, // Remove X-Powered-By header
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }
        ]
      }
    ];
  }
};

module.exports = withPWA(nextConfig);

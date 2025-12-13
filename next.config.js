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
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'waesizzoqodntrlvrwhw.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  productionBrowserSourceMaps: false, // Disable source maps in production
  poweredByHeader: false, // Remove X-Powered-By header
  async rewrites() {
    return [
      {
        source: '/api/contact',
        destination: '/api/submit',
      },
      {
        source: '/api/feedback',
        destination: '/api/submit',
      },
      {
        source: '/api/message',
        destination: '/api/submit',
      },
      {
        source: '/api/form',
        destination: '/api/submit',
      },
      {
        source: '/api/order',
        destination: '/api/submit',
      },
      {
        source: '/api/booking',
        destination: '/api/submit',
      },
      {
        source: '/api/contact',
        destination: '/api/submit',
      },
      {
        source: '/api/feedback',
        destination: '/api/submit',
      },
      {
        source: '/api/message',
        destination: '/api/submit',
      },
      {
        source: '/api/reservation',
        destination: '/api/submit',
      },
    ];
  },
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
  },
  // 允许局域网设备访问开发服务器
  // 注意：如果端口不是3000，需要在这里添加对应的端口
  // Next.js 14+ specific config for dev server
  allowedDevOrigins: [
    'http://192.168.124.3:3000', 'http://192.168.124.3:3001', 'http://192.168.124.3:3002', 'http://192.168.124.3:3003', 'http://192.168.124.3:3004', 'http://192.168.124.3:3005',
    'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005',
    'http://0.0.0.0:3000', 'http://0.0.0.0:3001', 'http://0.0.0.0:3002', 'http://0.0.0.0:3003', 'http://0.0.0.0:3004', 'http://0.0.0.0:3005'
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        '192.168.124.3:3000', '192.168.124.3:3001', '192.168.124.3:3002', '192.168.124.3:3003', '192.168.124.3:3004', '192.168.124.3:3005',
        'localhost:3000', 'localhost:3001', 'localhost:3002', 'localhost:3003', 'localhost:3004', 'localhost:3005',
        '0.0.0.0:3000', '0.0.0.0:3001', '0.0.0.0:3002', '0.0.0.0:3003', '0.0.0.0:3004', '0.0.0.0:3005'
      ],
    },
  },
};

module.exports = withPWA(nextConfig);

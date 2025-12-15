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

const os = require('os');

function getLanIPv4s() {
  try {
    const interfaces = os.networkInterfaces();
    const results = new Set();
    for (const name of Object.keys(interfaces)) {
      for (const item of interfaces[name] || []) {
        if (!item || item.family !== 'IPv4' || item.internal) continue;
        const addr = item.address;
        if (!addr) continue;
        // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
        const isPrivate10 = addr.startsWith('10.');
        const isPrivate192 = addr.startsWith('192.168.');
        const isPrivate172 = addr.startsWith('172.') && (() => {
          const parts = addr.split('.');
          const second = Number(parts[1]);
          return Number.isFinite(second) && second >= 16 && second <= 31;
        })();
        if (isPrivate10 || isPrivate192 || isPrivate172) results.add(addr);
      }
    }
    return Array.from(results);
  } catch {
    return [];
  }
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 压缩优化
  compress: true,
  // 实验性优化 (merged)
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
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
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/fontawesome/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
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
  // 允许局域网设备访问开发服务器 (dev only)
  allowedDevOrigins: (() => {
    const ports = [3000, 3001, 3002, 3003, 3004, 3005];
    const base = ports.flatMap((p) => [`http://localhost:${p}`, `http://0.0.0.0:${p}`]);
    if (process.env.NODE_ENV !== 'development') return uniq(base);
    const lanIps = getLanIPv4s();
    const lan = lanIps.flatMap((ip) => ports.map((p) => `http://${ip}:${p}`));
    return uniq([...base, ...lan]);
  })(),
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
    serverActions: {
      allowedOrigins: (() => {
        const ports = [3000, 3001, 3002, 3003, 3004, 3005];
        const base = ports.flatMap((p) => [`localhost:${p}`, `0.0.0.0:${p}`]);
        if (process.env.NODE_ENV !== 'development') return uniq(base);
        const lanIps = getLanIPv4s();
        const lan = lanIps.flatMap((ip) => ports.map((p) => `${ip}:${p}`));
        return uniq([...base, ...lan]);
      })(),
    },
  },
};

module.exports = withPWA(nextConfig);

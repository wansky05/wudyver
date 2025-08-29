const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true,
    // Menambahkan runtime caching untuk API jika diperlukan
    runtimeCaching: [
      {
        urlPattern: /\/api\/visitor\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'visitor-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24 jam
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  }
});

// Import konfigurasi API
const apiConfig = { DOMAIN_URL: process.env.MY_DOMAIN_URL || "wudysoft.xyz" };

// Header keamanan yang tidak akan bentrok dengan middleware
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  }
];

const nextConfig = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  experimental: {
    appDir: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5gb"
    },
    amp: {
      skipValidation: true
    }
  },
  images: {
    domains: [apiConfig.DOMAIN_URL, "cdn.weatherapi.com", "tile.openstreetmap.org", "www.chess.com", "deckofcardsapi.com", "raw.githubusercontent.com"],
    minimumCacheTTL: 60
  },
  async headers() {
    return [
      {
        // Header keamanan dasar untuk semua route
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        // Header khusus untuk file PWA
        source: "/:path*(sw.js|workbox-*.js|manifest.json)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        // Header CORS untuk API routes - lebih sederhana karena middleware sudah menangani
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Credentials",
            value: "true"
          },
          {
            key: "Access-Control-Allow-Origin",
            value: `https://${apiConfig.DOMAIN_URL}`
          }
        ]
      }
    ];
  },
  // Menghapus rewrites yang tidak diperlukan karena middleware sudah menangani CORS
  webpack: (config, { dev, isServer }) => {
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      bufferutil: "commonjs bufferutil"
    });
    if (!dev && !isServer) {
      const WebpackObfuscator = require("webpack-obfuscator");
      config.plugins.push(new WebpackObfuscator({
        rotateStringArray: true,
        stringArray: true,
        stringArrayThreshold: 0.75,
        disableConsoleOutput: true,
        renameGlobals: true,
        identifierNamesGenerator: "mangled"
      }));
    }
    return config;
  }
});

module.exports = nextConfig;
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: process.env.NODE_ENV === "production"
  }
});

const { createSecureHeaders } = require("next-secure-headers");

// Configuration
const config = {
  DOMAIN_URL: process.env.DOMAIN_URL || "wudysoft.xyz",
  NODE_ENV: process.env.NODE_ENV || "development"
};

// Security Headers
const securityHeaders = [
  ...createSecureHeaders({
    frameGuard: "deny",
    xssProtection: "block-rendering", 
    referrerPolicy: "strict-origin-when-cross-origin"
  }),
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; upgrade-insecure-requests;"
  },
  {
    key: "Permissions-Policy", 
    value: "camera=(), microphone=(), geolocation=()"
  }
];

// CORS Headers
const corsHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value: config.NODE_ENV === "production" ? `https://${config.DOMAIN_URL}` : "*"
  },
  {
    key: "Access-Control-Allow-Credentials",
    value: "true"
  },
  {
    key: "Access-Control-Allow-Methods", 
    value: "GET, POST, PUT, DELETE, OPTIONS, PATCH"
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token"
  },
  {
    key: "Access-Control-Max-Age",
    value: "86400"
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
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },

  images: {
    domains: [
      config.DOMAIN_URL,
      "cdn.weatherapi.com", 
      "tile.openstreetmap.org",
      "www.chess.com",
      "deckofcardsapi.com",
      "raw.githubusercontent.com"
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 60
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        source: "/api/:path*", 
        headers: [
          ...corsHeaders,
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate"
          }
        ]
      },
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        has: [{ type: "header", key: "access-control-request-method" }],
        destination: "/api/:path*"
      }
    ];
  },

  webpack: (config, { dev, isServer }) => {
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      "bufferutil": "commonjs bufferutil"
    });

    if (!dev && !isServer) {
      // Production optimizations
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: "vendors",
              chunks: "all"
            }
          }
        }
      };
    }

    return config;
  }
});

module.exports = nextConfig;
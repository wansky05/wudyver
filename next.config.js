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
    disableDevLogs: process.env.NODE_ENV === "production",
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/cdn\.weatherapi\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'weather-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
          },
        },
      },
    ],
  }
});

const { createSecureHeaders } = require("next-secure-headers");

// Centralized configuration
const APP_CONFIG = {
  DOMAIN_URL: process.env.DOMAIN_URL || "wudysoft.xyz",
  NODE_ENV: process.env.NODE_ENV || "development",
  PROTOCOL: process.env.PROTOCOL || "https://",
  API_TIMEOUT: parseInt(process.env.API_TIMEOUT) || 10000,
  RATE_LIMIT_POINTS: parseInt(process.env.RATE_LIMIT_POINTS) || 100,
  RATE_LIMIT_DURATION: parseInt(process.env.RATE_LIMIT_DURATION) || 60
};

// Security headers configuration
const SECURITY_HEADERS = [
  ...createSecureHeaders({
    frameGuard: "deny",
    xssProtection: "block-rendering",
    referrerPolicy: "strict-origin-when-cross-origin",
    contentTypeOptions: "nosniff",
    forceHTTPS: APP_CONFIG.NODE_ENV === "production",
    reportOnly: false
  }),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join("; ")
  },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "browsing-topics=()",
      "interest-cohort=()"
    ].join(", ")
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "require-corp"
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin"
  }
];

// CORS headers configuration
const CORS_HEADERS = [
  {
    key: "Access-Control-Allow-Origin",
    value: APP_CONFIG.NODE_ENV === "production" 
      ? `${APP_CONFIG.PROTOCOL}${APP_CONFIG.DOMAIN_URL}` 
      : "*"
  },
  {
    key: "Access-Control-Allow-Credentials",
    value: "true"
  },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
  },
  {
    key: "Access-Control-Allow-Headers",
    value: [
      "X-CSRF-Token",
      "X-Requested-With",
      "Accept",
      "Accept-Version",
      "Accept-Encoding",
      "Content-Length",
      "Content-MD5",
      "Content-Type",
      "Date",
      "X-Api-Version",
      "Authorization",
      "Origin",
      "X-Custom-Header",
      "X-Real-IP",
      "X-Forwarded-For"
    ].join(", ")
  },
  {
    key: "Access-Control-Max-Age",
    value: "86400"
  },
  {
    key: "Vary",
    value: "Origin, Accept-Encoding"
  }
];

// Cache headers configuration
const CACHE_HEADERS = {
  STATIC_ASSETS: [
    {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable"
    }
  ],
  DYNAMIC_CONTENT: [
    {
      key: "Cache-Control",
      value: "public, max-age=0, must-revalidate"
    }
  ],
  API_RESPONSES: [
    {
      key: "Cache-Control",
      value: "no-store, no-cache, must-revalidate, proxy-revalidate"
    }
  ]
};

const nextConfig = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  trailingSlash: false,
  
  experimental: {
    appDir: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5mb" // Changed from 5gb to more reasonable 5mb
    },
    optimizeCss: true,
    scrollRestoration: true
  },

  // Image optimization
  images: {
    domains: [
      APP_CONFIG.DOMAIN_URL,
      "cdn.weatherapi.com",
      "tile.openstreetmap.org",
      "www.chess.com",
      "deckofcardsapi.com",
      "raw.githubusercontent.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com"
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  },

  // Headers configuration
  async headers() {
    return [
      // Security headers for all routes
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS
      },
      // CORS headers for API routes
      {
        source: "/api/:path*",
        headers: [
          ...CORS_HEADERS,
          ...CACHE_HEADERS.API_RESPONSES
        ]
      },
      // Cache headers for static assets
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)",
        headers: CACHE_HEADERS.STATIC_ASSETS
      },
      // Manifest and service worker specific headers
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json"
          },
          ...CACHE_HEADERS.DYNAMIC_CONTENT
        ]
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript"
          },
          ...CACHE_HEADERS.DYNAMIC_CONTENT
        ]
      },
      // Font optimization
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  },

  // Rewrites for API and routing
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          has: [{ type: 'header', key: 'access-control-request-method' }],
          destination: '/api/:path*'
        }
      ],
      afterFiles: [
        // Health check endpoint
        {
          source: '/health',
          destination: '/api/health'
        }
      ],
      fallback: []
    };
  },

  // Redirects for common patterns
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true
      }
    ];
  },

  // Webpack optimization
  webpack: (config, { dev, isServer, webpack }) => {
    // External dependencies optimization
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      "bufferutil": "commonjs bufferutil"
    });

    // Production optimizations
    if (!dev && !isServer) {
      // Bundle analyzer (optional)
      if (process.env.ANALYZE === 'true') {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
          })
        );
      }

      // Code obfuscation for production
      if (process.env.NODE_ENV === 'production' && process.env.OBFUSCATE === 'true') {
        const WebpackObfuscator = require("webpack-obfuscator");
        config.plugins.push(
          new WebpackObfuscator({
            rotateStringArray: true,
            stringArray: true,
            stringArrayThreshold: 0.75,
            disableConsoleOutput: true,
            renameGlobals: false, // Changed to false for better compatibility
            identifierNamesGenerator: "mangled",
            compact: true,
            controlFlowFlattening: false, // Disabled for better performance
            deadCodeInjection: false, // Disabled for better performance
            debugProtection: false, // Disabled for compatibility
            splitStrings: true,
            splitStringsChunkLength: 10
          }, ['**/node_modules/**/*'])
        );
      }
    }

    // Development optimizations
    if (dev) {
      config.devtool = 'eval-source-map';
    }

    // Resolve fallbacks for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },

  // Environment variables to expose to the client
  env: {
    DOMAIN_URL: APP_CONFIG.DOMAIN_URL,
    NODE_ENV: APP_CONFIG.NODE_ENV
  }
});

module.exports = nextConfig;
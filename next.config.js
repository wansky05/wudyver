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
    disableDevLogs: true
  }
});

const { createSecureHeaders } = require("next-secure-headers");

// Import konfigurasi API
const apiConfig = { DOMAIN_URL: "wudysoft.xyz" };

const securityHeaders = [
  ...createSecureHeaders({
    frameGuard: "sameorigin",
    xssProtection: "block-rendering",
    referrerPolicy: "no-referrer-when-downgrade"
  }), 
  {
    key: "Content-Security-Policy",
    value: "upgrade-insecure-requests"
  }, 
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  }
];

const corsHeaders = [{
  key: "Access-Control-Allow-Credentials",
  value: "true"
}, {
  key: "Access-Control-Allow-Methods",
  value: "GET, POST, PUT, DELETE, OPTIONS, PATCH"
}, {
  key: "Access-Control-Allow-Headers",
  value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Origin, X-Custom-Header"
}, {
  key: "Access-Control-Max-Age",
  value: "86400"
}, {
  key: "Vary",
  value: "Origin"
}];

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
    return [{
      source: "/(.*)",
      headers: securityHeaders
    }, {
      source: "/api/:path*",
      headers: corsHeaders
    }, {
      source: "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)",
      headers: [{
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable"
      }]
    }, {
      source: "/manifest.json",
      headers: [{
        key: "Content-Type",
        value: "application/manifest+json"
      }, {
        key: "Cache-Control",
        value: "public, max-age=0, must-revalidate"
      }]
    }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        has: [{ type: 'header', key: 'access-control-request-method' }],
        destination: '/api/:path*'
      }
    ];
  },
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
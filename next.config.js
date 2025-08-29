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
    skipWaiting: true,
    clientsClaim: true
  }
});
const {
  createSecureHeaders
} = require("next-secure-headers");
const apiConfig = {
  DOMAIN_URL: "wudysoft.xyz",
  API_BASE_URL: "https://wudysoft.xyz"
};
const allowedOrigins = [`https://${apiConfig.DOMAIN_URL}`, `https://www.${apiConfig.DOMAIN_URL}`];
const cspHeader = `
  frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();
const securityHeaders = [...createSecureHeaders({
  frameGuard: "sameorigin",
  xssProtection: "block-rendering",
  referrerPolicy: "strict-origin-when-cross-origin"
}), {
  key: "Content-Security-Policy",
  value: cspHeader
}, {
  key: "Permissions-Policy",
  value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()"
}, {
  key: "X-Content-Type-Options",
  value: "nosniff"
}, {
  key: "X-DNS-Prefetch-Control",
  value: "on"
}];
const isAllowedOrigin = origin => {
  return allowedOrigins.includes(origin) || allowedOrigins.some(allowed => origin && origin.endsWith(allowed.replace("https://", "")));
};
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
      bodySizeLimit: "5gb",
      allowedOrigins: allowedOrigins
    },
    amp: {
      skipValidation: true
    }
  },
  images: {
    domains: [apiConfig.DOMAIN_URL, "cdn.weatherapi.com", "tile.openstreetmap.org", "www.chess.com", "deckofcardsapi.com", "raw.githubusercontent.com"],
    remotePatterns: [{
      protocol: "https",
      hostname: apiConfig.DOMAIN_URL
    }, {
      protocol: "https",
      hostname: "cdn.weatherapi.com"
    }, {
      protocol: "https",
      hostname: "tile.openstreetmap.org"
    }],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
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
    return [{
      source: "/api/:path*",
      destination: "/api/:path*"
    }];
  },
  async redirects() {
    return [{
      source: "/home",
      destination: "/",
      permanent: true
    }];
  },
  webpack: (config, {
    dev,
    isServer
  }) => {
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      bufferutil: "commonjs bufferutil"
    });
    if (!dev && !isServer) {
      const WebpackObfuscator = require("webpack-obfuscator");
      config.plugins.push(new WebpackObfuscator({
        rotateStringArray: true,
        stringArray: true,
        stringArrayThreshold: .75,
        disableConsoleOutput: true,
        renameGlobals: true,
        identifierNamesGenerator: "mangled"
      }));
    }
    return config;
  },
  env: {
    API_VERSION: "1.0.0"
  }
});
module.exports = nextConfig;
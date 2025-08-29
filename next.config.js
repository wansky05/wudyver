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
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [{
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: {
          maxEntries: 200
        }
      }
    }]
  }
});
const {
  createSecureHeaders
} = require("next-secure-headers");
const apiConfig = {
  DOMAIN_URL: process.env.MY_DOMAIN_URL || "wudysoft.xyz",
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || "https://wudysoft.xyz"
};
const allowedOrigins = [`https://${apiConfig.DOMAIN_URL}`, `https://www.${apiConfig.DOMAIN_URL}`, "http://localhost:3000", "http://localhost:3001"];
const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.weatherapi.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: https://cdn.weatherapi.com http://*;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://api.weatherapi.com wss: ws:;
    media-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
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
    },
    optimizeCss: true,
    scrollRestoration: true
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
      headers: [{
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
      }]
    }, {
      source: "/(_next/static|favicon.ico|robots.txt|sitemap.xml)",
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
  async middleware() {
    return [{
      source: "/api/:path*",
      handler: async (req, res, next) => {
        const origin = req.headers.origin;
        if (isAllowedOrigin(origin)) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
        if (req.method === "OPTIONS") {
          res.status(200).end();
          return;
        }
        next();
      }
    }];
  },
  webpack: (config, {
    dev,
    isServer
  }) => {
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      bufferutil: "commonjs bufferutil",
      canvas: "commonjs canvas"
    });
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false
      };
    }
    if (!dev && !isServer) {
      try {
        const WebpackObfuscator = require("webpack-obfuscator");
        config.plugins.push(new WebpackObfuscator({
          rotateStringArray: true,
          stringArray: true,
          stringArrayThreshold: .75,
          disableConsoleOutput: true,
          renameGlobals: true,
          identifierNamesGenerator: "mangled",
          transformObjectKeys: true,
          unicodeEscapeSequence: false
        }, ["excluded_bundle_name.js"]));
      } catch (error) {
        console.warn("WebpackObfuscator tidak tersedia:", error.message);
      }
    }
    return config;
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
    API_VERSION: "1.0.0"
  },
  async redirects() {
    return [{
      source: "/home",
      destination: "/",
      permanent: true
    }];
  }
});
module.exports = nextConfig;
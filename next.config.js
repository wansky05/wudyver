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
const {
  createSecureHeaders
} = require("next-secure-headers");
const securityHeaders = [...createSecureHeaders({
  frameGuard: "sameorigin",
  xssProtection: "block-rendering",
  referrerPolicy: "no-referrer-when-downgrade"
}), {
  key: "Content-Security-Policy",
  value: "upgrade-insecure-requests"
}, {
  key: "Permissions-Policy",
  value: "camera=(), microphone=(), geolocation=(), Browse-topics=()"
}];
const nextConfig = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  exportTrailingSlash: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  experimental: {
    appDir: true,
    swcMinify: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5gb"
    },
    amp: {
      skipValidation: true
    }
  },
  images: {
    domains: ["wudysoft.xyz", "cdn.weatherapi.com", "tile.openstreetmap.org", "www.chess.com", "deckofcardsapi.com", "raw.githubusercontent.com"],
    minimumCacheTTL: 60
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: securityHeaders
    }];
  },
  webpack: (config, {
    buildId,
    dev,
    isServer,
    defaultLoaders,
    webpack
  }) => {
    config.externals.push({
      "utf-8-validate": "commonjs utf-8-validate",
      bufferutil: "commonjs bufferutil"
    });
    if (!dev && !isServer) {
      const WebpackObfuscator = require("webpack-obfuscator");
      config.plugins.push(new WebpackObfuscator({
        compact: true,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: .4,
        rotateStringArray: true,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: .4,
        transformObjectKeys: true,
        unicodeEscapeSequence: true
      }));
    }
    return config;
  }
});
module.exports = nextConfig;
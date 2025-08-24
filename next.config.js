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
        rotateStringArray: true,
        stringArray: true,
        stringArrayThreshold: .75,
        disableConsoleOutput: true,
        renameGlobals: true,
        identifierNamesGenerator: "mangled"
      }));
    }
    return config;
  }
});
module.exports = nextConfig;
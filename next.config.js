const webpack = require('webpack');
const WebpackObfuscator = require('webpack-obfuscator');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /\/api\/visitor\//,
        handler: "NetworkFirst",
        options: {
          cacheName: "visitor-api-cache",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /\/api\/auth\//,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https:\/\/cdn\.weatherapi\.com\//,
        handler: "CacheFirst",
        options: {
          cacheName: "weather-api-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60,
          },
        },
      },
    ],
  },
});

const apiConfig = {
  DOMAIN_URL: process.env.MY_DOMAIN_URL || "wudysoft.xyz",
};

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

let nextConfig = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,

  experimental: {
    appDir: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5mb",
      allowedOrigins: [`https://${apiConfig.DOMAIN_URL}`],
    },
    amp: {
      skipValidation: true,
    },
    esmExternals: 'loose',
    optimizePackageImports: ['lodash', 'date-fns'],
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  images: {
    domains: [
      apiConfig.DOMAIN_URL,
      "cdn.weatherapi.com",
      "tile.openstreetmap.org",
      "www.chess.com",
      "deckofcardsapi.com",
      "raw.githubusercontent.com",
    ],
    minimumCacheTTL: 60,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/:path*(sw.js|workbox-*.js|manifest.json)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: `https://${apiConfig.DOMAIN_URL}` },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, PATCH" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, Origin, X-CSRF-Token" },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  webpack: (config, { dev, isServer, buildId }) => {
    if (!dev && !isServer) {
      config.plugins.push(
        new WebpackObfuscator({
          compact: true,
          renameGlobals: false,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          stringArray: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayThreshold: 0.75,
          unicodeEscapeSequence: false,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          selfDefending: false,
          disableConsoleOutput: true,
        }, [])
      );
    }

    if (process.env.ANALYZE && !isServer) {
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: true,
          reportFilename: isServer ? '../analyze/server.html' : './analyze/client.html',
        })
      );
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util/'),
        buffer: require.resolve('buffer/'),
        process: require.resolve('process/browser'),
        zlib: require.resolve('browserify-zlib'),
        querystring: require.resolve('querystring-es3'),
        url: require.resolve('url/'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        assert: require.resolve('assert/'),
      };
    }

    config.plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      })
    );

    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_DEBUG': JSON.stringify(false),
        'process.env.NEXT_BUILD_ID': JSON.stringify(buildId),
      })
    );

    if (isServer) {
      config.externals.push({
        "utf-8-validate": "commonjs utf-8-validate",
        "bufferutil": "commonjs bufferutil",
        "encoding": "commonjs encoding",
      });
    }

    return config;
  },

  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
});

if (process.env.NODE_ENV !== 'development') {
  const originalWebpack = nextConfig.webpack;

  nextConfig.webpack = (config, options) => {
    if (!options.isServer) {
      if (!config.optimization.minimizer) {
        config.optimization.minimizer = [];
      }
      config.optimization.minimizer.forEach((plugin) => {
        if (plugin.constructor.name === 'TerserPlugin') {
          plugin.options.terserOptions.compress.drop_console = true;
        }
      });
    }

    if (originalWebpack) {
      return originalWebpack(config, options);
    }
    return config;
  };
}

module.exports = nextConfig;
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
    runtimeCaching: [{
      urlPattern: /\/api\/visitor\//,
      handler: "NetworkFirst",
      options: {
        cacheName: "visitor-api-cache",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    }]
  }
});

const withTM = require('next-transpile-modules')([
  // Tambahkan modul yang perlu di-transpile di sini
]);

const webpack = require('webpack');
const apiConfig = {
  DOMAIN_URL: process.env.MY_DOMAIN_URL || "wudysoft.xyz"
};

const securityHeaders = [{
  key: "X-DNS-Prefetch-Control",
  value: "on"
}, {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload"
}];

const nextConfig = withTM(withPWA({
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  
  // Tambahkan experimental flags
  experimental: {
    appDir: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5gb"
    },
    amp: {
      skipValidation: true
    },
    esmExternals: 'loose' // Penting untuk modul ESM
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
      source: "/:path*(sw.js|workbox-*.js|manifest.json)",
      headers: [{
        key: "Cache-Control",
        value: "public, max-age=0, must-revalidate"
      }, {
        key: "Service-Worker-Allowed",
        value: "/"
      }]
    }, {
      source: "/api/:path*",
      headers: [{
        key: "Access-Control-Allow-Credentials",
        value: "true"
      }, {
        key: "Access-Control-Allow-Origin",
        value: `https://${apiConfig.DOMAIN_URL}`
      }]
    }];
  },
  
  webpack: (config, { dev, isServer }) => {
    // Remove the manual process.browser definition - Next.js handles this automatically
    
    // Konfigurasi resolve untuk handle node: scheme
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve.alias,
        'node:module': 'module',
        'node:buffer': 'buffer',
        'node:util': 'util',
        'node:process': 'process',
      },
      fallback: {
        ...config.resolve.fallback,
        module: false,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util/'),
        buffer: require.resolve('buffer/'),
        process: require.resolve('process/browser'),
      }
    };

    // Tambahkan plugin untuk provide polyfills
    config.plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      })
    );

    // Define global variables - REMOVE process.browser definition
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_DEBUG': JSON.stringify(false),
        // 'process.browser' is automatically set by Next.js, don't define it manually
      })
    );

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
}));

module.exports = nextConfig;
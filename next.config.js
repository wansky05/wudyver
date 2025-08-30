const webpack = require('webpack');
const WebpackObfuscator = require('webpack-obfuscator');

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development', // Disable PWA in development
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
            maxAgeSeconds: 24 * 60 * 60 // 1 day
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      },
      {
        urlPattern: /\/api\/auth\//,
        handler: "NetworkOnly", // Don't cache auth requests
      },
      {
        urlPattern: /^https:\/\/cdn\.weatherapi\.com\//,
        handler: "CacheFirst",
        options: {
          cacheName: "weather-api-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 // 1 hour
          }
        }
      }
    ]
  }
});

const apiConfig = {
  DOMAIN_URL: process.env.MY_DOMAIN_URL || "wudysoft.xyz"
};

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()"
  }
];

const nextConfig = withPWA({
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  
  // Experimental features
  experimental: {
    appDir: true,
    nextScriptWorkers: true,
    serverActions: {
      bodySizeLimit: "5mb", // Changed from 5gb to reasonable limit
      allowedOrigins: [`https://${apiConfig.DOMAIN_URL}`]
    },
    amp: {
      skipValidation: true
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
    }
  },
  
  // Image optimization
  images: {
    domains: [
      apiConfig.DOMAIN_URL, 
      "cdn.weatherapi.com", 
      "tile.openstreetmap.org", 
      "www.chess.com", 
      "deckofcardsapi.com", 
      "raw.githubusercontent.com"
    ],
    minimumCacheTTL: 60,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Headers configuration
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        source: "/:path*(sw.js|workbox-*.js|manifest.json)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ]
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Credentials",
            value: "true"
          },
          {
            key: "Access-Control-Allow-Origin",
            value: `https://${apiConfig.DOMAIN_URL}`
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS, PATCH"
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, Origin, X-CSRF-Token"
          }
        ]
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  },
  
  // Webpack configuration
  webpack: (config, { dev, isServer, buildId, defaultLoaders }) => {
    // Only add obfuscation in production and client-side
    if (!dev && !isServer) {
      console.log('🔒 Applying webpack obfuscation for production build...');
      
      // Add webpack obfuscator
      config.plugins.push(
        new WebpackObfuscator({
          rotateStringArray: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
          disableConsoleOutput: false, // Set to false to avoid issues
          debugProtection: false, // Disable debug protection to avoid issues
          selfDefending: true,
          compact: true,
          // Exclude certain files from obfuscation
          exclude: [
            'node_modules/**',
            '**/*.map'
          ]
        })
      );
    }
    
    // Resolve fallbacks for client-side
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
    
    // Add webpack plugins
    config.plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      })
    );
    
    // Define global variables
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_DEBUG': JSON.stringify(false),
        'process.env.NEXT_BUILD_ID': JSON.stringify(buildId),
      })
    );
    
    // External modules
    if (isServer) {
      config.externals.push({
        "utf-8-validate": "commonjs utf-8-validate",
        "bufferutil": "commonjs bufferutil",
        "encoding": "commonjs encoding"
      });
    }
    
    // Optimization for production
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        providedExports: true,
        usedExports: true,
        sideEffects: false,
        concatenateModules: true,
        splitChunks: {
          ...config.optimization.splitChunks,
          chunks: 'all',
          cacheGroups: {
            ...config.optimization.splitChunks.cacheGroups,
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    
    // Custom loaders
    // Ignore warnings for certain modules
    config.ignoreWarnings = [
      /Module not found: Error: Can't resolve 'encoding'/,
      /Critical dependency: the request of a dependency is an expression/,
    ];
    
    // Performance hints
    config.performance = {
      ...config.performance,
      maxAssetSize: 1000000, // 1MB
      maxEntrypointSize: 1000000, // 1MB
    };
    
    console.log(`📦 Webpack config applied for ${dev ? 'development' : 'production'} ${isServer ? 'server' : 'client'} build`);
    
    return config;
  },
  
  // Environment variables
  // Redirects
  
  // Rewrites for API routes
});

module.exports = nextConfig;
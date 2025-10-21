import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 600,
  productionBrowserSourceMaps: false,
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.(ico|png|svg)$/,
      use: [
        {
          loader: 'file-loader',
          options: {
            name: 'static/media/[name].[hash:8].[ext]',
          },
        },
      ],
    });

    // Mark Node.js native modules and cache dependencies as external for server-side bundles
    // This prevents webpack from trying to bundle them
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push('sqlite3', '@keyv/sqlite', 'keyv-file');
      } else if (typeof config.externals === 'function') {
        const original = config.externals;
        config.externals = async (context: any, request: string, callback: any) => {
          if (['sqlite3', '@keyv/sqlite', 'keyv-file'].includes(request)) {
            return callback(null, 'commonjs ' + request);
          }
          return original(context, request, callback);
        };
      } else {
        config.externals = ['sqlite3', '@keyv/sqlite', 'keyv-file'];
      }
    }

    return config;
  },
};

export default withBundleAnalyzer(nextConfig);

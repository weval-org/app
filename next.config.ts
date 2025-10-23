import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

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

// Wrap with bundle analyzer first, then Sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

// Sentry configuration options
export default withSentryConfig(configWithAnalyzer, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the Sentry DSN provided to the browser is the same one used for this configuration.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  sourcemaps: {
    disable: true,
  },

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});

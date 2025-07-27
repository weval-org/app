import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 600,
  webpack(config) {
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
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);

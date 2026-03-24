/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  i18n: {
    locales: ['en', 'he'],
    defaultLocale: 'he',
  },
};

module.exports = nextConfig;

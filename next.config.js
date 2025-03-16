/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: true,
  },
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
    responseLimit: '500mb',
  },
  images: {
    domains: ['ad-video-generator-bucket.s3.eu-central-1.amazonaws.com'],
  },
};

module.exports = nextConfig; 
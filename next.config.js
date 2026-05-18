/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.unsplash.com', 'avatar.vercel.sh'],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'CartGain',
    NEXT_PUBLIC_APP_URL: 'https://cartgain.com',
  },
  webpack: (config, { isServer }) => {
    // Mark server-only packages as external for client builds to prevent bundling errors
    if (!isServer) {
      const serverOnlyPackages = [
        'razorpay',
        'bull',
        'nodemailer',
        'bcryptjs',
        '@auth/prisma-adapter',
        'next-auth',
        'ioredis',
        'redis'
      ]
      
      // Initialize externals if not already an array
      if (!Array.isArray(config.externals)) {
        config.externals = []
      }
      
      // Add server-only packages to externals
      config.externals.push(...serverOnlyPackages)
    }
    return config
  },
  // Suppress build warnings for optional dependencies
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
}

module.exports = nextConfig

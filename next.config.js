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
    // Mark server-only packages as external for client builds
    if (!isServer) {
      config.externals.push(
        'razorpay',
        'bull',
        'nodemailer',
        'bcryptjs',
        '@auth/prisma-adapter',
        'next-auth'
      )
    }
    return config
  },
}

module.exports = nextConfig

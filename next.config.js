/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.unsplash.com', 'avatar.vercel.sh'],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'RecoverFlow',
    NEXT_PUBLIC_APP_URL: 'https://recoverflow.com',
  },
}

module.exports = nextConfig

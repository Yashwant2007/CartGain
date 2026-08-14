/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com https://js.stripe.com https://cdn.shopify.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.cart-gain.com https://checkout.razorpay.com https://api.razorpay.com https://lumberjack.razorpay.com https://api.stripe.com https://admin.shopify.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://js.stripe.com https://cdn.shopify.com https://admin.shopify.com",
  "child-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
  "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'avatar.vercel.sh' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'CartGain',
  },
  poweredByHeader: false,
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  // Ignore Shopify CLI extension folder - it's built/deployed separately via `shopify app deploy`
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/extensions/**', '**/node_modules/**'],
    };
    return config;
  },
  async redirects() {
    return [
      {
        source: '/auth/reset-password',
        destination: '/reset-password',
        permanent: true,
      },
    ]
  },
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // NOTE: no X-Frame-Options — frame-ancestors CSP below governs embedding.
          // Shopify embedded apps REQUIRE the app to render inside admin.shopify.com,
          // and X-Frame-Options: SAMEORIGIN would block it.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=(self), publickey-credentials-get=()' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

module.exports = nextConfig

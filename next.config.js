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

// More permissive CSP for storefront bargain widget (needs cross-origin embedding)
const bargainWidgetCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com https://js.stripe.com https://cdn.shopify.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.cart-gain.com https://checkout.razorpay.com https://api.razorpay.com https://lumberjack.razorpay.com https://api.stripe.com https://admin.shopify.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://js.stripe.com https://cdn.shopify.com https://admin.shopify.com",
  "child-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
  "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com https://checkout.shopify.com",
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
          // Cross-Origin-Resource-Policy: same-origin blocks cross-origin iframe embedding
          // Remove for routes that need to be embedded (like /s/bargain)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      // Storefront bargain widget needs cross-origin embedding + no CORP
      {
        source: '/s/bargain',
        headers: [
          { key: 'Content-Security-Policy', value: bargainWidgetCsp },
          // Allow cross-origin embedding in Shopify themes/checkout
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Shopify auth callback needs cross-origin for popup flow
      {
        source: '/shopify-auth-success',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      // Auth callbacks need cross-origin for OAuth
      {
        source: '/api/auth/callback/:provider*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig

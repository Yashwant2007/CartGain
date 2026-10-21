import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CartGain - AI Negotiation & Cart Recovery',
    short_name: 'CartGain',
    description: 'Recover abandoned carts with AI-powered WhatsApp and Email recovery plus AI negotiation',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#1e40af',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}

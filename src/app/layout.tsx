import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RecoverFlow - Multi-Channel Cart Recovery That Actually Works',
  description: 'Recover abandoned carts with SMS, WhatsApp, Email & Push notifications. AI-optimized sequences that recover 3x more revenue than email alone.',
  keywords: ['cart recovery', 'abandoned cart', 'SMS marketing', 'WhatsApp marketing', 'e-commerce'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  )
}

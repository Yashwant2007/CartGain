'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export const GA_MEASUREMENT_ID = 'G-K6JRGC3MMC'

const TRACKED_PATHS = new Set([
  '/',
  '/pricing',
  '/bargain',
  '/contact',
  '/privacy',
  '/terms',
  '/dpa',
  '/security-policy',
  '/cookies',
  '/docs/api',
])

type GtagWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (command: string, action: string, params?: Record<string, unknown>) => void
}

export default function GoogleAnalytics() {
  const pathname = usePathname()
  const [loaded, setLoaded] = useState(false)
  const tracked = typeof pathname === 'string' && TRACKED_PATHS.has(pathname)

  useEffect(() => {
    if (!loaded || !tracked || !pathname) return

    const sendPageView = () => {
      const w = window as GtagWindow
      if (typeof w.gtag !== 'function') return false
      w.gtag('event', 'page_view', {
        page_path: pathname,
        page_title: document.title,
      })
      return true
    }

    if (sendPageView()) return
    const timer = window.setInterval(() => {
      if (sendPageView()) window.clearInterval(timer)
    }, 50)
    return () => window.clearInterval(timer)
  }, [loaded, pathname, tracked])

  if (!tracked) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <Script
        id="cartgain-google-analytics-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false,transport_type:'beacon'});`,
        }}
      />
    </>
  )
}

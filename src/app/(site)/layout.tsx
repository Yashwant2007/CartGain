import type { ReactNode } from 'react'

/**
 * The public marketing / auth routes live in this route group so they can opt
 * out of request-time rendering.
 *
 * The root layout reads request headers to decide whether the page is being
 * served inside the Shopify admin iframe (it only renders the App Bridge
 * runtime there). Reading headers makes a route dynamic, which would push the
 * whole marketing site off the CDN cache, so every public route declares
 * `force-static` here. Under `force-static` the header read returns an empty
 * header set — exactly what the root layout needs for these routes.
 */
export const dynamic = 'force-static'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return children
}

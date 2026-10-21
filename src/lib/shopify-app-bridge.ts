'use client'

import createApp from '@shopify/app-bridge'
// @ts-ignore
import { getSessionToken } from '@shopify/app-bridge-utils'
import { getShopifyEmbedParams } from './shopify-embed'

let app: any = null

export function getShopifyApp() {
  if (typeof window === 'undefined') return null
  if (app) return app

  try {
    const { shop, host } = getShopifyEmbedParams()
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '67beb1794fab10553102c134b63e1277'
    
    if (!host && !shop) return null
    
    app = createApp({
      apiKey,
      host: host || '',
      forceRedirect: false,
    })
    return app
  } catch (e) {
    console.error('Failed to create app bridge', e)
    return null
  }
}

export async function getAppBridgeSessionToken(): Promise<string | null> {
  try {
    const appInstance = getShopifyApp()
    if (appInstance) {
      const token = await getSessionToken(appInstance)
      if (token) return token
    }
  } catch (e) {
    // ignore
  }
  return null
}

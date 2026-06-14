import { shopifyApp } from '@shopify/shopify-app-remix/server'
import { restResources } from '@shopify/shopify-api/rest/admin/2026-01'
import { ApiVersion } from '@shopify/shopify-api'

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecret: process.env.SHOPIFY_API_SECRET!,
  scopes: [
    // Checkout scopes - includes webhook management for checkouts
    'read_checkouts',
    'write_checkouts',
    
    // Order scopes - includes webhook management for orders
    'read_orders',
    'write_orders',
    
    // Customer scopes - includes webhook management for customers
    'read_customers',
    'write_customers',
    
    // Product scopes (optional, for product info)
    'read_products',
    'write_products',
    
    // Fulfillment scopes
    'read_merchant_managed_fulfillment_orders',
    'write_merchant_managed_fulfillment_orders',
  ],
  host: process.env.SHOPIFY_APP_URL || 'http://localhost:3000',
  apiVersion: ApiVersion.January26,
  isEmbeddedApp: false,
  restResources,
})

export default shopify

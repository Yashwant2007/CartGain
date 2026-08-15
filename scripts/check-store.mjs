import fs from 'fs'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

function loadEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (v) out[m[1]] = v
  }
  return out
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') }
for (const k of Object.keys(env)) if (!(k in process.env)) process.env[k] = env[k]

const ALGORITHM = 'aes-256-gcm'
function getKey() { return crypto.scryptSync(process.env.ENCRYPTION_KEY, 'cartgain-salt', 32) }
function decrypt(encoded) {
  const [iv, tag, data] = encoded.split(':')
  const d = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  let out = d.update(data, 'hex', 'utf8')
  out += d.final('utf8')
  return out
}

const prisma = new PrismaClient()
const stores = await prisma.store.findMany({
  where: { platform: 'shopify' },
  select: { id: true, domain: true, name: true, platform: true, apiKey: true, shopifyRefreshToken: true, shopifyTokenExpiresAt: true },
  orderBy: { createdAt: 'asc' },
})

console.log('\n=== STORES IN DB ===')
for (const s of stores) {
  console.log(`- domain=${s.domain} | name=${s.name} | hasToken=${!!s.apiKey} | hasRefresh=${!!s.shopifyRefreshToken} | expiresAt=${s.shopifyTokenExpiresAt ? s.shopifyTokenExpiresAt.toISOString() : 'n/a'}`)
}

async function queryShop(store) {
  const shopDomain = store.domain.includes('.myshopify.com') ? store.domain : `${store.domain}.myshopify.com`
  let token = null
  try { if (store.apiKey) token = decrypt(store.apiKey) } catch (e) { console.error('  decrypt apiKey failed:', e.message) }

  if (token && store.shopifyRefreshToken) {
    const expires = store.shopifyTokenExpiresAt ? store.shopifyTokenExpiresAt.getTime() : 0
    if (Date.now() > expires - 300000) {
      try {
        const refresh = decrypt(store.shopifyRefreshToken)
        const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET,
            refresh_token: refresh,
            grant_type: 'refresh_token',
          }),
        })
        const data = await res.json()
        if (data.access_token) { token = data.access_token; console.log('  refreshed token OK') }
        else console.log('  refresh failed:', JSON.stringify(data.errors || data))
      } catch (e) { console.log('  refresh threw:', e.message) }
    }
  }

  if (!token) { console.log('  NO ACCESS TOKEN available'); return }

  const api = `https://${shopDomain}/admin/api/2026-07/graphql.json`
  const headers = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }
  const q1 = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ query: `{ shop { name myshopifyDomain plan { displayName } } }` }) })
  const j1 = await q1.json()
  console.log('\n  [shop]', JSON.stringify(j1.data?.shop || j1.errors))

  const q2 = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ query: `{ app { title version url } }` }) })
  const j2 = await q2.json()
  console.log('  [app] ', JSON.stringify(j2.data?.app || j2.errors, null, 0).slice(0, 400))
}

for (const s of stores) {
  console.log(`\n=== QUERY: ${s.domain} ===`)
  await queryShop(s)
}
await prisma.$disconnect()

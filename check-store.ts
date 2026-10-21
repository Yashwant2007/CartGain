import { PrismaClient } from '@prisma/client'
import { decrypt } from './src/lib/encryption'
const prisma = new PrismaClient()
async function main() {
  const s = await prisma.store.findFirst({ where: { domain: 'cartgain.myshopify.com' } })
  const token = decrypt(s!.apiKey!)
  for (const ver of ['2026-04', '2025-10', '2024-10']) {
    const res = await fetch(`https://${s!.domain}/admin/api/${ver}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    })
    const body = await res.text()
    console.log(ver, res.status, body.slice(0, 200))
  }
}
main().finally(() => prisma.$disconnect())

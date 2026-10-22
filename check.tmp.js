const fs = require('fs')
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
process.env.DATABASE_URL = env.DATABASE_URL
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const now = Date.now()
  const msg = await p.message.findMany({ where: { createdAt: { gte: new Date(now - 3*3600*1000) } }, orderBy: { createdAt: 'desc' }, take: 10, select: { cartId: true, channel: true, step: true, status: true, createdAt: true, providerId: true } })
  console.log(JSON.stringify(msg, null, 1))
  const camps = await p.campaign.findMany({ where: { isActive: true }, select: { id: true, name: true, storeId: true, channels: true } })
  console.log('active campaigns:', JSON.stringify(camps))
  await p.$disconnect()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })

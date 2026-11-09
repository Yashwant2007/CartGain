import crypto from 'crypto'
import prisma from '@/lib/db'
import { recoveryAppBase, type RecoveryLinkKind } from '@/lib/recovery/links'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateCode(): string {
  const bytes = crypto.randomBytes(8)
  let code = 'l'
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return code
}

export type RecoveryShortLink = {
  code: string
  url: string
}

/**
 * Return (or create) a compact tracked link for one cart destination.
 *
 * The same cart/channel/kind/discount always maps to the same code, so retries
 * and repeated rounds do not create a new link or break the click attribution.
 * `null` means storage failed and the caller should fall back to the long
 * `/r/<cartId>?...` URL.
 */
export async function getRecoveryShortLink(opts: {
  cartId: string
  channel: 'email' | 'whatsapp'
  kind: RecoveryLinkKind
  discountCode?: string | null
  appUrl?: string | null
}): Promise<RecoveryShortLink | null> {
  const discountCode = opts.discountCode || ''
  try {
    const existing = await prisma.recoveryShortLink.findUnique({
      where: {
        cartId_channel_kind_discountCode: {
          cartId: opts.cartId,
          channel: opts.channel,
          kind: opts.kind,
          discountCode,
        },
      },
      select: { code: true },
    })
    if (existing) {
      return { code: existing.code, url: `${recoveryAppBase(opts.appUrl)}/r/${existing.code}` }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode()
      try {
        await prisma.recoveryShortLink.create({
          data: {
            code,
            cartId: opts.cartId,
            channel: opts.channel,
            kind: opts.kind,
            discountCode,
          },
        })
        return { code, url: `${recoveryAppBase(opts.appUrl)}/r/${code}` }
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Either the code collided (try another) or another worker created
          // this exact link first (read it back).
          const raced = await prisma.recoveryShortLink.findUnique({
            where: {
              cartId_channel_kind_discountCode: {
                cartId: opts.cartId,
                channel: opts.channel,
                kind: opts.kind,
                discountCode,
              },
            },
            select: { code: true },
          }).catch(() => null)
          if (raced) {
            return { code: raced.code, url: `${recoveryAppBase(opts.appUrl)}/r/${raced.code}` }
          }
          continue
        }
        throw err
      }
    }
    return null
  } catch (err) {
    console.error('Recovery short link creation failed (falling back to long link):', err)
    return null
  }
}

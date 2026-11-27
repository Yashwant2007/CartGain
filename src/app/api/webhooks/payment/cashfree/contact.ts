import prisma from '@/lib/db'

export async function resolveCustomerContact(merchantId: string, orderRef: string): Promise<{ email?: string; phone?: string } | undefined> {
  try {
    const cart = await prisma.cart.findFirst({
      where: { storeId: merchantId, cartId: orderRef },
      select: { customerEmail: true, customerPhone: true },
    })
    if (cart?.customerEmail || cart?.customerPhone) {
      return { email: cart.customerEmail ?? undefined, phone: cart.customerPhone ?? undefined }
    }
    return undefined
  } catch {
    return undefined
  }
}

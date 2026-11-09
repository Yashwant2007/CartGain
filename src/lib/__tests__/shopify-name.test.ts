import { cleanShopifyName, contactFromShopifyCustomer } from '../shopify'

describe('cleanShopifyName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanShopifyName('  Asha   Sharma  ')).toBe('Asha Sharma')
  })

  it('returns null for blank and placeholder names', () => {
    expect(cleanShopifyName('   ')).toBeNull()
    expect(cleanShopifyName('Valued Customer')).toBeNull()
    expect(cleanShopifyName('guest')).toBeNull()
    expect(cleanShopifyName(null)).toBeNull()
  })

  it('never treats an email address as a customer name', () => {
    expect(cleanShopifyName('yashwantkaushik44@gmail.com')).toBeNull()
  })
})

describe('contactFromShopifyCustomer', () => {
  it('uses a recent order address when the customer profile has no name or phone', () => {
    const contact = contactFromShopifyCustomer(
      {
        email: 'yashwantkaushik44@gmail.com',
        displayName: 'yashwantkaushik44@gmail.com',
        orders: {
          nodes: [
            {
              shippingAddress: { firstName: 'Yashwant', lastName: 'Kaushik', phone: '+919999999999' },
            },
          ],
        },
      },
      'yashwantkaushik44@gmail.com',
    )

    expect(contact).toEqual({
      name: 'Yashwant Kaushik',
      email: 'yashwantkaushik44@gmail.com',
      phone: '+919999999999',
    })
  })

  it('ignores an email display name and returns null when no real name exists', () => {
    const contact = contactFromShopifyCustomer({
      email: 'shopper@example.com',
      displayName: 'shopper@example.com',
      addresses: [{ phone: '+919111111111' }],
    })

    expect(contact.name).toBeNull()
    expect(contact.phone).toBe('+919111111111')
  })
})

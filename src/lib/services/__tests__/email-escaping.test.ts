import { EmailTemplates } from '../email'

// Recovery emails mix customer checkout data, catalog data and LLM output into
// raw HTML. Every dynamic value must be HTML-escaped (and image/href URLs
// scheme-checked) so a crafted product name or a prompt-injected AI body cannot
// inject markup or a javascript: URL into a message sent from our domain.
describe('EmailTemplates — HTML escaping', () => {
  it('escapes customer, cart and AI values in the abandoned template', () => {
    const html = EmailTemplates.abandoned(
      'Bob <script>alert(1)</script>',
      [
        {
          name: '<img src=x onerror=alert(1)>',
          quantity: 1,
          price: 10,
          image: 'javascript:alert(1)',
          description: '</div><script>alert(2)</script>',
        },
      ],
      10,
      'https://cart-gain.com/r/1?c=email',
      'My <b>Store</b>',
      '₹',
      '<script>alert("ai")</script>',
    )

    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('rejects a javascript: image URL in the back-in-stock template', () => {
    const html = EmailTemplates.backInStock(
      'a',
      'Product',
      'javascript:alert(1)',
      'https://cart-gain.com/x',
      'Store',
    )
    expect(html).not.toContain('src="javascript:')
  })

  it('escapes the customer name and discount code in the discount template', () => {
    const html = EmailTemplates.withDiscount(
      '<script>alert(1)</script>',
      [],
      100,
      '"><script>alert(2)</script>',
      10,
      'https://cart-gain.com/x',
      'Store',
      '₹',
    )
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })
})

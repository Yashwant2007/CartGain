import { WooCommerceClient } from '../client'
import type { DnsLookup } from '../url'

const publicLookup: DnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

describe('WooCommerce client API namespace negotiation', () => {
  it('uses wc/v3 when the store advertises it', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/wp-json')) {
        return jsonResponse({ namespaces: ['wc/v3'] })
      }
      return jsonResponse({ site: { id: '10', title: 'V3 Store' }, settings: { currency_code: 'USD' } })
    }) as unknown as typeof fetch

    const client = new WooCommerceClient(
      {
        storeId: 'store-1',
        storeUrl: 'https://shop.example.com',
        credentials: { key: 'ck_test_key', secret: 'cs_test_secret' },
        webhookSecret: null,
      },
      { fetchImpl, lookup: publicLookup },
    )

    await client.systemStatus()

    expect(urls).toContain('https://shop.example.com/wp-json/wc/v3/system_status')
  })

  it('falls back to wc/v2 when the store does not expose v3', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/wp-json')) {
        return jsonResponse({ namespaces: ['wc/v2'] })
      }
      return jsonResponse({ site: { id: '20', title: 'V2 Store' }, settings: { currency_code: 'INR' } })
    }) as unknown as typeof fetch

    const client = new WooCommerceClient(
      {
        storeId: 'store-1',
        storeUrl: 'https://shop.example.com',
        credentials: { key: 'ck_test_key', secret: 'cs_test_secret' },
        webhookSecret: null,
      },
      { fetchImpl, lookup: publicLookup },
    )

    const data = await client.systemStatus()

    expect(urls).toContain('https://shop.example.com/wp-json/wc/v2/system_status')
    expect(data).toMatchObject({ site: { title: 'V2 Store' } })
  })

  it('includes the failing path and WooCommerce error code in not_found', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/wp-json')) return jsonResponse({ namespaces: ['wc/v3'] })
      return jsonResponse({ code: 'rest_no_route' }, 404)
    }) as unknown as typeof fetch

    const client = new WooCommerceClient(
      {
        storeId: 'store-1',
        storeUrl: 'https://shop.example.com',
        credentials: { key: 'ck_test_key', secret: 'cs_test_secret' },
        webhookSecret: null,
      },
      { fetchImpl, lookup: publicLookup },
    )

    await expect(client.systemStatus()).rejects.toMatchObject({
      code: 'not_found:/wp-json/wc/v3/system_status:rest_no_route',
    })
  })
})

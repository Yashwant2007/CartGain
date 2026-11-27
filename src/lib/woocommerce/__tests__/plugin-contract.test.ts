import fs from 'fs'
import path from 'path'

const pluginRoot = path.join(process.cwd(), 'plugins', 'cartgain-woocommerce')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8')
}

describe('WooCommerce plugin contract', () => {
  it('signs outbound requests over the exact raw body', () => {
    const source = read('includes/class-cartgain-wc-http.php')
    expect(source).toContain("$canonical = $timestamp . '.' . $body;")
    expect(source).not.toContain('$signature_path')
  })

  it('exposes signed health and remote credential revocation endpoints', () => {
    const source = read('includes/class-cartgain-wc-rest.php')
    expect(source).toContain("register_rest_route('cartgain/v1', '/credentials'")
    expect(source).toContain("'methods' => 'DELETE'")
    expect(source).toContain('cartgain_wc_signed_request_valid($request, $secret, $store_id)')
    expect(source).toContain("'ok' => true")
    expect(source).toContain("'status' => 'ok'")
    expect(source).toContain("'webhook' => $this->credentials->is_connected()")
    expect(source).toContain('wp_verify_nonce($nonce, \'cartgain_wc_revoke\')')
  })

  it('sends real cart identity and contact details with consent events', () => {
    const source = read('includes/class-cartgain-wc-tracking.php')
    expect(source).toContain('public function set_consent($input, $source, $identity = array())')
    expect(source).toContain("'cartId' => $cart_id")
    expect(source).toContain("'cartToken' => $cart_token")
    expect(source).toContain("'customerEmail'")
    expect(source).toContain("'customerPhone'")
    expect(source).toContain("'consent' => is_array($consent) ? $consent : array()")
  })

  it('sends the cart token and contact details from the store API script', () => {
    const source = read('assets/js/store-api.js')
    expect(source).toContain('cartToken: cartToken()')
    expect(source).toContain('customerEmail: contact.customerEmail')
    expect(source).toContain('customerPhone: contact.customerPhone')
  })

  it('keeps plugin version and compatibility metadata consistent', () => {
    const plugin = read('cartgain-woocommerce.php')
    const readme = read('readme.txt')
    expect(plugin).toContain('Version: 1.1.0')
    expect(plugin).toContain("define('CGW_VERSION', '1.1.0')")
    expect(plugin).toContain('WC tested up to: 11.3.1')
    expect(readme).toContain('Tested up to: 7.1.5')
    expect(readme).toContain('WC tested up to: 11.3.1')
    expect(readme).toContain('Stable tag: 1.1.0')
  })
})

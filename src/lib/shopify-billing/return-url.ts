/** Forward only Shopify's approval-return signal to the authenticated status API. */
export function subscriptionStatusApiPath(pageSearch: string): string {
  const params = new URLSearchParams(pageSearch)
  return params.get('billing') === 'success'
    ? '/api/subscription?billing=success'
    : '/api/subscription'
}
